# Deviations from the spec, and what is still unconfirmed

Last verified: 2026-11-06. "Verified" means observed against the real PayPal sandbox
(`pnpm test:sandbox`, plus the one-off probes noted below), not against our local PayPal double.

## 1. Deviations from the spec

| # | Deviation | Why | Where |
|---|-----------|-----|-------|
| D1 | A tenth table, `refund`. The spec lists nine. | A partial refund needs its own row (amount, PayPal refund id, status). Putting it on `order` cannot represent several partial refunds. | `packages/db/migrations`, `packages/db/src/refunds.ts` |
| D2 | A dispute that PayPal resolves **before we answer** leaves the order in `DISPUTED`. The spec has no `DISPUTED -> RESOLVED_*` edge. | We kept the spec's state machine. `RESOLVED_WON/LOST` would claim our evidence mattered when we sent none. The dispute row records PayPal's outcome and an audit row `DISPUTE_RESOLVED_WITHOUT_EVIDENCE` is written. | `packages/payments/src/disputes.ts`, `packages/core/src/order-state.ts` |
| D3 | Test files run **serially** (`fileParallelism: false`). | LISTEN/NOTIFY is per database, not per schema, so parallel files would see each other's notifications. Each file still gets its own schema. | `vitest.config.ts` |
| D4 | The provide-evidence POST is **not retried** on a 5xx or network error. 401 and 429 still are. | PayPal gives that endpoint no idempotency key, so a retry after an ambiguous failure could submit evidence twice. | `paypalCall` option `retryAmbiguous`, set by `paypalRest` |

### Decisions the spec leaves open

The spec names `spentSoFar` (rule R6) and mandate `version` (rule R2) but does not define them. These are our readings:

- **`spentSoFar`** is the sum of `amount_minor` for orders under the mandate (every version) in `AWAITING_APPROVAL`, `HELD`, `IN_TRANSIT`, `DELIVERED`, `SETTLED`, `DISPUTED`, `EVIDENCE_SUBMITTED` or `RESOLVED_WON`. `AWAITING_APPROVAL` counts so two proposals cannot be gated against the same unspent budget. `REFUNDED` and `RESOLVED_LOST` do not count: the money went back. `packages/db/src/mandates.ts` (`BUDGET_COMMITTED_STATES`).
- **Amending a mandate** inserts `version + 1` and never edits an old row. The new version inherits `PAUSED`; a `CLOSED` mandate cannot be amended. Changes to one mandate are serialised with an advisory lock, because a row lock on the old version does not stop two amenders colliding on the new primary key (tested; fails without the lock).
- **Defaults** when the draft omits them: `approvalThreshold` = the budget (no second approver is required), `expiresAt` = end of the delivery day, UTC.

## 2. Failure windows, and how each is closed

- **Concurrent refunds.** `refundCapture` and `reconcileRefund` take a session advisory lock on `refund:<orderRowId>`. The lock is not held across a transaction, so the network call does not pin a connection. PayPal's `REFUND_AMOUNT_EXCEEDED` stays as a backstop.
- **A PENDING refund.** It counts against the capture. `reconcileRefund` fetches the refund from PayPal and settles it: COMPLETED covering the whole capture moves the order to `REFUNDED`; FAILED or CANCELLED stop counting. Audited as `REFUND_STATUS_CHANGED`.
- **Crash between a successful evidence POST and the local commit.** The `PAYPAL_CALL` audit row is written in its own transaction, filed under the evidence bundle. On the next `submitEvidence`, `acceptedEvidenceCall` finds it, finishes locally and sends nothing (`EVIDENCE_SUBMIT_RECOVERED`).
- **Same crash window for a refund** is closed by the deterministic `PayPal-Request-Id` (`sha256(orderRowId:action:attempt)`); PayPal replays the same refund.

### Webhook processing (decisions the spec leaves open)

- **Verify, then process.** `verifyPendingWebhooks` posts each stored event to PayPal's `verify-webhook-signature`; `processPendingWebhooks` only acts on `verified` events. Verification fails closed when no webhook id is configured, and a `FAILURE` verdict closes the event immediately. Transient verify errors retry up to `WEBHOOK_MAX_ATTEMPTS` (3), then the event is closed with a `WEBHOOK_GAVE_UP` audit row. Attempts are counted in `webhook_event.attempts` (migration `0006`).
- **Kill switch defers, never burns an attempt.** If `PAYPAL_WRITES_ENABLED` is off, an event that needs a PayPal write is left pending (`deferred`) instead of counting toward the give-up limit.
- **Webhooks never invent state.** Every handler moves an order only along an edge the state machine allows. A capture webhook for an order that is not `DELIVERED` writes `WEBHOOK_STATE_MISMATCH` and moves nothing. An event that matches no order is recorded as unlinked, not guessed at.
- **`CAPTURE.COMPLETED` settles `DELIVERED -> SETTLED`** and writes the `CAPTURED` audit type with `source: "WEBHOOK"`, so a webhook-observed capture is distinguishable from one we fired. `CAPTURE.DENIED` only fails a `DELIVERED` order.
- **`CHECKOUT.ORDER.APPROVED` / `AUTHORIZATION.CREATED` are a backstop** for the approve route: they run `authorizeHold` with no approver recorded (`approvedBy` null), since the buyer, not one of our users, approved.
- **Order lookup by PayPal reference** tries capture id, then authorization id, then PayPal order id (`findOrderIdByPayPalRef`), backed by indexes added in migration `0006`.

### Worker (decisions the spec leaves open)

- **SLA breach flags, it does not void.** `sla.watch` writes one `SLA_BREACH_FLAGGED` audit row per order (guarded by a per-order advisory lock, so overlapping runs cannot double-flag). Voiding releases money, and FR-07 has a human confirm it, so the void is a separate `payment.void` job the API enqueues with `confirmedBy`.
- **Failure classes.** A job failure is `deferred` (kill switch off: the job re-queues itself after `deferSeconds` and burns no retry), `permanent` (wrong state, proof gate, unknown carrier, malformed payload: the job completes, the audit log holds the reason) or `retry` (pg-boss retries with backoff). The payment queues use pg-boss's `stately` policy so a deferred job can re-queue while it is still the active one.
- **`poll.open` covers** AWAITING_APPROVAL (buyer approved but our `onApprove` was lost: authorize, but only after PayPal's own GET says `APPROVED`, and not within 2 minutes of the last change), HELD / IN_TRANSIT (PayPal voided it: record it; expired or captured outside our flow: alert once, move nothing) and open disputes. DELIVERED is not polled: `capture` settles the order itself, and a capture made behind our back raises `WEBHOOK_STATE_MISMATCH` through the webhook.
- **Tracking push** is its own queue (`tracking.push`), queued after a capture and by the webhook processor. It checks the capture id still belongs to the order, and stamps `fulfillment.pushed_to_paypal_at` in the same transaction as a `TRACKING_PUSHED` audit row.
- **`dispute.sync` / `dispute.submit` queues are deferred.** The webhook processor syncs inline and `poll.open` re-fetches; submitting evidence needs a human click and arrives with the API route.

## 3. Unconfirmed against the real sandbox

None of these can be settled without a buyer-approved transaction and a buyer-filed dispute (see section 6).

| Item | What we do today | How it fails if we guessed wrong |
|------|------------------|----------------------------------|
| Spelling of the provide-evidence link `rel` | Normalise `_` and `-`, so `provide_evidence` and `provide-evidence` both match | Submit refuses with "no provide-evidence link" and sends nothing |
| How `evidences[].documents` refers to uploaded files | Our best reading of the docs | PayPal rejects the POST with a 4xx; nothing is submitted |
| Whether the multipart `input` part's filename (`input.json`) is accepted | Sent as `application/json` with that filename | Same 4xx |
| Shape of `refund_ids` on a dispute | Parsed defensively | Refund linkage on a dispute is not shown |
| Whether the id `simulate-event` returns is the id later delivered | Not relied upon | Only matters for delivery-id de-duplication tests |
| Refund 422 issue names | Only `INVALID_RESOURCE_ID` (404) is confirmed | A 422 would surface as a generic PayPal error |
| What PayPal answers to a second tracking POST for the same capture | The worker checks `pushed_to_paypal_at` first, so a repeat is only possible after a crash between PayPal's reply and our stamp | The retry gets a 4xx and the job fails visibly; tracking is already at PayPal |
| `tax_total` without item-level tax | **Confirmed**: accepted (HTTP 200, `PAYER_ACTION_REQUIRED`) | n/a |

## 4. Real-sandbox findings (verified)

- Token scopes include `disputes/create`, `disputes/read-seller`, `disputes/update-seller`, `payments/refund`.
- An order with a card payment source on `AUTHORIZE` returns 422 `PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING`. There is no auto-approve path, so capture, refund and dispute flows need a sandbox buyer to approve in a browser.
- `simulate-event` returns 202 with a `WH-` id, but the simulated event is **not** stored: `GET /v1/notifications/webhooks-events/{id}` returns 404 `INVALID_RESOURCE_ID`. A real public listener is needed to observe delivery.
- The same `PayPal-Request-Id` replays the same order.
- An unapproved order returns the issue `ORDER_NOT_APPROVED` on authorize.
- Provide-evidence to an unknown dispute and refund of an unknown capture both return 404 `RESOURCE_NOT_FOUND`. This says nothing about the multipart format.
- The sandbox account has no disputes (list is empty).

## 5. Test coverage notes

- PDF per-file limit: `renderPdfs` is tested at and over 10 MB using incompressible content, and `assertBundleIntegrity` is unit-tested at 10 MB - 1, 10 MB and 10 MB + 1 (`bundle-integrity.test.ts`).
- The 50 MB per-call check **cannot be reached** while at most 3 files, each under 10 MB, are allowed (3 x 10 MB < 50 MB). It is kept as a backstop and a test asserts that arithmetic, so a future change to either limit fails loudly.
- The graph (`graphify-out`) indexes the SQL migrations when `tree_sitter_sql` is installed (`pip install tree-sitter-sql`).

## 5b. API decisions that differ from, or go beyond, the TDD

- **`@aegis/jobs` package.** Queue names, payload schemas and the `JobSender` moved out of the worker so the API can queue jobs without importing another app. Apps still never import each other.
- **Transactional outbox for delivery and void.** `/deliver` inserts the capture job, and `/void` the void job, in the same database transaction as the state change and audit row (pg-boss `db` option). The worker's poller does not look at DELIVERED orders, so a separately queued job could be lost by a crash between commit and enqueue.
- **Webhook listener "always 200" has one exception.** A failure to *store* the event returns 500 so PayPal redelivers; acknowledging an event we did not keep would lose it. A payload with no id or event type, or not JSON, gets 200 `{received:false}`. Failing to queue the nudge is not fatal: the stored event is swept every minute. The listener keeps the exact raw bytes (own scoped content-type parser, 1 MB limit); `fastify-raw-body` is unused.
- **Anonymous session, no login.** Judge Mode gives each visitor a signed HttpOnly `aegis_sid` cookie plus a CSRF double-submit token on every non-GET `/api` call. It is an identity for the audit log, not authentication; the app says it is a sandbox demo.
- **Order creation re-checks under the mandate lock** that the mandate version is current (R2, `DECISION_STALE`), ACTIVE and unexpired, and that `spent + amount <= budget` (R6, `GATE_FAILED`), so two simultaneous approvals cannot both spend the same budget.
- **`authorize` reads the PayPal order id from the database,** not from the client.
- **Repeat `/deliver`** on a DELIVERED order re-nudges the (singleton) capture job and returns `applied:false`; on an order already SETTLED it is refused with `BAD_STATE`.
- **Stream scope.** The SSE stream emits `order.upsert` and `dispute.upsert` only. `webhook.verified`, `gate.decision`, `agent.step`, `mandate.draft` and `selfcheck.result` arrive with the agents and selfcheck slices.
- **Judge-Mode clock.** The offset is held in one process today. Before the demo-clock route ships it must be persisted in the database so the worker sees the same clock.
- **Audit tamper test** switches off the append-only trigger inside a transaction to forge a row, then restores it; the table refuses `UPDATE` for every normal path.

## 5c. Agent decisions that differ from, or go beyond, the TDD

- **The agents package has no database access at all** (the TDD allowed read). Supplier lead time and facts are passed in by the caller, and the gate-and-persist step for proposals lives in the API. "Agents cannot write" is therefore true by construction as well as by lint.
- **Ranking is code, the model only phrases.** The TDD has the model rank the shortlist. Here the order is stock, then price, then rating, then id, always the same for the same input. The model writes one-line reasons, accepted only if every figure in them is in the facts; otherwise the template reason is used.
- **Grounding is mechanical.** Defense notes and shortlist reasons are checked by code: every number must appear in the fact list and every `[Fn]` citation must name a real fact. A failed check falls back to a template built from the facts (author `system:evidence-template`), never to an unchecked model answer. The mandate parser returns non-blocking warnings for any figure the owner never wrote.
- **The LLM provider is Groq (`openai/gpt-oss-120b`) when only `GROQ_API_KEY` is set**, Anthropic when `ANTHROPIC_API_KEY` is set (`AEGIS_LLM_MODEL` overrides either). The live tests (`pnpm test:sandbox`) found that strict JSON-schema mode needs every property present, so "not stated" is an empty list or `null`, converted to an absent field by code.
- **PayPal Agent Toolkit read tools are not wired in.** The agents already receive the same facts from our database, and `fetchDispute` covers the one read the worker needs. Compatibility question O1 is therefore not exercised; revisit only if time allows.
- **Channel3 has no shipping or tax fields.** Proposals record shipping and tax as 0 and say so in the rationale. Lead time comes from the seeded `supplier_profile` table (the slowest end of the range is used as the ETA) and is labelled simulated.
- **Where sourcing is persisted.** `POST /api/mandates/:id/source` searches Channel3 with the mandate's per-unit ceiling, shortlists, then in one transaction (under the mandate lock, against the mandate's *current* version and spent budget) stores a catalog snapshot, runs the deterministic gatekeeper, stores the proposal with its verdict, and writes a `PROPOSAL_GATED` audit row by `agent:sourcing`. Failing proposals are kept (with the rules they failed) rather than hidden. `POST /api/mandates/parse` returns a draft and saves nothing; the owner signs it through the ordinary create route. With no model or no catalog key both answer 503 `AGENT_UNAVAILABLE`.
- **Tests use the real model when a key exists.** The API agent tests load the gitignored `.env`, use the hosted model if `ANTHROPIC_API_KEY` or `GROQ_API_KEY` is set, and fall back to the AI SDK's scripted mock only when there is no key at all (fresh clone, CI). Their catalog is a real Channel3 client with an injected HTTP response so the prices the gate judges are fixed; the live catalog is exercised in `packages/agents/test/channel3.sandbox.test.ts`.

## 6. What is needed from the owner

1. A sandbox **buyer** login (or approve one order manually) so capture, refund and dispute flows can run against the real sandbox.
2. A **buyer-filed sandbox dispute** on that transaction, to settle the evidence items in section 3.
3. A **public HTTPS URL** for the webhook listener (a Render deploy) to verify signatures and delivery ids.
4. ~~The Channel3 API key and an LLM key~~ Provided and verified live (`pnpm test:sandbox`). Without them the agent routes answer `AGENT_UNAVAILABLE` rather than inventing results. Please confirm the second pasted string was the Channel3 key.
5. **Rotate or revoke** the GitHub token, the PayPal sandbox secret and the Groq key that were pasted in chat, after the hackathon.
