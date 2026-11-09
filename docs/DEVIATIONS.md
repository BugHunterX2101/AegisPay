# Deviations from the spec, and what is still unconfirmed

Last verified: 2026-11-08. "Verified" means observed against the real PayPal sandbox
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
| Spelling of the provide-evidence link `rel` | Normalise `_` and `-`, so `provide_evidence` and `provide-evidence` both match. **Observed 2026-11-08:** the live sandbox spells action rels with an underscore (`accept_claim`, `provide_supporting_info` on PP-R-EVA-10196999), so the normalisation is needed | Submit refuses with "no provide-evidence link" and sends nothing |
| How `evidences[].documents` refers to uploaded files | Our best reading of the docs | PayPal rejects the POST with a 4xx; nothing is submitted |
| Whether the multipart `input` part's filename (`input.json`) is accepted | Sent as `application/json` with that filename. **Confirmed 2026-11-09** for `provide-supporting-info` (HTTP 200, see 5f); `provide-evidence` uses the same multipart builder but has not been sent live | Same 4xx |
| Shape of `refund_ids` on a dispute | Parsed defensively | Refund linkage on a dispute is not shown |
| Whether the id `simulate-event` returns is the id later delivered | Not relied upon | Only matters for delivery-id de-duplication tests |
| Refund 422 issue names | Only `INVALID_RESOURCE_ID` (404) is confirmed | A 422 would surface as a generic PayPal error |
| What PayPal answers to a second tracking POST for the same capture | The worker checks `pushed_to_paypal_at` first, so a repeat is only possible after a crash between PayPal's reply and our stamp | The retry gets a 4xx and the job fails visibly; tracking is already at PayPal |
| `tax_total` without item-level tax | **Confirmed**: accepted (HTTP 200, `PAYER_ACTION_REQUIRED`) | n/a |

## 4. Real-sandbox findings (verified)

- Token scopes include `disputes/create`, `disputes/read-seller`, `disputes/update-seller`, `payments/refund`.
- An order with a card payment source on `AUTHORIZE` returns 422 `PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING` (re-checked 2026-11-08; the India-region merchant has no card-processing feature to turn on).
- **Buyer approval without a buyer login (2026-11-08).** PayPal's own guest checkout ("Pay with Credit or Debit Card" on the `payer-action` page) approves an order for this merchant in headless Chromium, so `approved-hold.sandbox.test.ts` approves real holds without sandbox buyer credentials:
  - Fill the form as a US buyer with a real street address. PayPal sometimes opens an address modal anyway: "We can't verify your address" (more often with a made-up address such as "1 Main St") or "We've found a match for your address" (a standardized suggestion, seen with the real "2211 N 1st St"). The order stays unapproved until "Continue" is pressed in either modal, and the test handles both.
  - Card numbers:
    - `4111 1111 1111 1111` passes the form, but `/authorize` answers 422 `INSTRUMENT_DECLINED`. The app's typed `INSTRUMENT_DECLINED` handling was seen working live on it.
    - `5555 5555 5555 4444` and `4012 8888 8888 1881` are refused by the form ("We weren't able to add this card").
    - Fresh Luhn-valid Visa numbers on the `403203` prefix authorize (`201`, authorization `CREATED`).
- **Early reauthorization (2026-11-08).** A reauthorization inside the honor period returns 422 `REAUTHORIZATION_TOO_SOON`: "A reauthorization is only allowed once from Day 4 to Day 29 since the date of the original authorization." This matches `reauthDue` (3-day honor period, one reauthorization). The app surfaces it as `PAYPAL_ERROR` and records nothing, but the sweep never sends it, because `reauthDue` is false until the honor period ends.
- **Approved-hold flows run live (2026-11-08)** in `approved-hold.sandbox.test.ts`:
  - authorize: `HELD`, with the honor period and expiry taken from PayPal's own `create_time` / `expiration_time`, 29 days;
  - two concurrent captures: one PayPal capture, and both callers get the same id with no `CAPTURE_BLOCKED`;
  - void, then a repeat void: no change;
  - the audit hash chain verifies afterwards.
- `simulate-event` returns 202 with a `WH-` id, but the simulated event is **not** stored: `GET /v1/notifications/webhooks-events/{id}` returns 404 `INVALID_RESOURCE_ID`. A real public listener is needed to observe delivery.
- The same `PayPal-Request-Id` replays the same order.
- An unapproved order returns the issue `ORDER_NOT_APPROVED` on authorize.
- Provide-evidence to an unknown dispute and refund of an unknown capture both return 404 `RESOURCE_NOT_FOUND`. This says nothing about the multipart format.
- The Disputes API answers 200 with the "Customer disputes" add-on unticked. The list holds one dispute, PP-R-EVA-10196999 (see 5f), as of 2026-11-08.

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
- **Stream scope.** The SSE stream emits all seven events. `order.upsert` and `dispute.upsert` carry the entity's current state, re-read per batch. `gate.decision`, `webhook.verified`, `agent.step` and `mandate.draft` are immutable facts, one message per committed audit row (`PROPOSAL_GATED`, `WEBHOOK_VERIFIED`, `AGENT_STEP`, `MANDATE_DRAFTED`), so they replay from `Last-Event-ID` like the rest. `selfcheck.result` is ephemeral: no `id`, never replayed, published only when a probe run is fresh (not on a cache hit).
- **Webhook verification is audited.** `verifyPendingWebhooks` now appends a `WEBHOOK_VERIFIED` row (`actor system:webhooks`, payload `{eventType, method, ok, reason?}`) in the same transaction that marks the event verified, and only when the mark actually changed a row, so a re-verify adds nothing.
- **Agent steps are audited without raw text.** `AGENT_STEP` and `MANDATE_DRAFTED` rows hold the structured draft, the step summary and the prompt hash, never the owner's free text. `requestedBy` (a session id) is stored for the audit trail but stripped from every broadcast payload.
- **Judge-Mode clock is shared through the database.** `POST /api/demo/clock {offsetDays 0..60}` writes the offset to `demo_setting` (migration 0007) and a `DEMO_CLOCK_SET` audit row in one transaction, then moves the API's `OffsetClock`. The worker holds its own `OffsetClock` kept equal to the stored value by a 2 s poll (`watchClockOffset`; a failed poll keeps the last offset), so an SLA breach can be fast-forwarded across both processes. Only the app's "now" moves: the PayPal context, token vault and certificate cache stay on real time. The routes answer 403 `FORBIDDEN` when Judge Mode is off.
- **Demo reset never edits the audit chain.** `POST /api/demo/reset` empties the demo tables (evidence bundles, disputes, refunds, fulfillments, purchase orders, proposals, catalog snapshots, mandates), puts the clock back, and appends one `DEMO_RESET` row with the deleted counts, all in one transaction. `audit_event`, `webhook_event` and `supplier_profile` are untouched, so the chain still verifies and the reset is visible in it.
- **`GET /selfcheck` (and `/api/selfcheck`) is public and live.** Probes: database `select 1`, PayPal token, the registered webhook (`GET /v1/notifications/webhooks/{id}`, fails if no id is set), an Orders v2 `AUTHORIZE` create for 1.00 USD that is never approved (so nothing can be held or captured), and one live Channel3 search. The cheap probes are cached 60 s and the two that create something at PayPal or spend catalog credits 10 min; the route is limited to 6 calls a minute. The order probe goes through the same kill switch and audit trail as any write, so with writes disabled it reports `ok:false` instead of bypassing the switch.
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

## 5d. Web app decisions that differ from, or go beyond, the TDD

- **Master/detail instead of row grouping.** AG Grid cannot combine master/detail with row grouping. The audit trail per order (with a live hash-chain badge from `/api/audit/verify`) is the more useful half, so the grid is master/detail and is not grouped by mandate.
- **AG Grid Enterprise has no production licence.** The key is read from the build-time variable `VITE_AG_GRID_LICENSE_KEY` and is never committed. Only an AG Grid evaluation key is available (evaluation use only, expires 7 December 2026); without a key the grid shows AG Grid's watermark. Everything works either way. A production deployment needs a purchased key.
- **One page, no client-side routes.** The API serves the built app as same-origin static files (`apps/api/public`), registered before the rate limiter so loading the page never spends a visitor's `/api` budget. There is deliberately no SPA fallback: an unknown path still gets the JSON 404.
- **API-only without a build.** A web root without `index.html` (a fresh clone before `pnpm build`) leaves the API serving only JSON. The Render build command runs `pnpm build`.
- **No sandbox buyer credentials are shown in Judge Mode.** None are held, so the banner says how to use PayPal's own sandbox buyer accounts instead of printing invented ones.
- **The self-check dialog has no "cached" tag** on probes; it shows the latest result and its time.

## 5e. Tooling decisions

- **Boundary lint uses ESLint core rules and the Babel parser, not `eslint-plugin-boundaries` or typescript-eslint.** TypeScript 7 no longer ships the JavaScript compiler API that typescript-eslint needs. `@babel/eslint-parser` (syntax plugins only, no transform) parses the TypeScript, and `no-restricted-imports` / `no-restricted-syntax` express the TDD dependency table, the no-clock rule for the gatekeeper and "PayPal POSTs only through payments". Static imports, `import type`, dynamic `import()` and `require()` are covered. `new Date(ms)` (formatting a passed-in value) is allowed in the gatekeeper; `Date.now()`, `new Date()` and `Date()` are not.
- **The config is `eslint.boundaries.config.mjs`, passed with `eslint -c`.** A repository hook blocks edits to `eslint.config.*`, so the owner chose a separate filename. A style config can still live in `eslint.config.mjs` later without colliding.
- **The rules are themselves tested.** `test/boundaries.test.ts` lints violating and allowed snippets through the real config (24 must be flagged, 10 must pass), so a rule that silently stops matching fails `pnpm test`.

## 5f. Observed live: the sandbox dispute never opened the seller-response stage

- **What happened.** A buyer-filed `MERCHANDISE_OR_SERVICE_NOT_RECEIVED` dispute (`PP-R-EVA-10196999`) arrived by a real, signature-verified `CUSTOMER.DISPUTE.CREATED` webhook and moved the order to `DISPUTED`. PayPal put it straight into `UNDER_REVIEW` / `CHARGEBACK` (channel `INTERNAL`) with no seller response due. The only action it offered was `provide_supporting_info`; it never offered `provide_evidence`.
- **What the product did.** The evidence bundle was built from the audit log, a named human read it and attested to its hash (`EVIDENCE_REVIEWED`), and the submit step then re-read the dispute from PayPal and refused with 409 `BAD_STATE` (`UNDER_REVIEW`, not `WAITING_FOR_SELLER_RESPONSE`). Nothing was sent to PayPal. This is the designed behaviour: `provide-evidence` is only called when PayPal's live answer says the seller's turn is open and the link is offered.
- **Decision (2026-11-07).** Not to add a `provide-supporting-info` path. It is a different PayPal write with a different payload that the TDD does not specify, and the attestation covered the `provide-evidence` flow. The submission step therefore stays unproven against PayPal's sandbox; it is covered by the payments tests against a local PayPal-shaped server (`packages/payments/test/disputes.test.ts`).
- **Reversed (2026-11-08).** PayPal's Disputes v1 reference says that while a CHARGEBACK, PRE_ARBITRATION or ARBITRATION dispute is `UNDER_REVIEW`, `provide-supporting-info` is the seller's only answer (`provide-evidence` exists only in `WAITING_FOR_SELLER_RESPONSE`). The live case still offers exactly `accept_claim` and `provide_supporting_info`, and no `require_evidence` link, so the sandbox-only status switch cannot be used on it. Refusing every time meant the product could never answer the most common sandbox outcome. What changed, and what did not:
  - The answer is chosen from PayPal's live links, never from the stage alone: `provide-evidence` when offered, otherwise `provide-supporting-info`. `accept_claim` is never called (it refunds the buyer; that is a human's call in PayPal).
  - The body follows PayPal's schema and its own sample: a multipart `input` part `{"notes": ...}` plus the same PDFs (`file1`...). The bundle's hashed `input` shape decides which endpoint it is for (`bundleTarget`), so a human's attestation to the hash also fixes which write it authorises. A bundle attested for one endpoint is refused if PayPal now offers the other ("draft again"), so a fresh review always covers what is sent.
  - Same guarantees as before: live GET immediately before the POST, row lock, no retry on a 5xx or network error (PayPal documents no idempotency key for dispute POSTs), crash-window recovery (`dispute_supporting_info` is recognised by `acceptedEvidenceCall`).
  - After a committed submission the dispute is read back from PayPal and what it now lists is audited (`EVIDENCE_READBACK`: counts of `evidences[]` / `supporting_info[]` before and after, status, stage, offered actions). A failed read-back never undoes a submission.
  - The order moves `DISPUTED -> EVIDENCE_SUBMITTED` either way, so PayPal's later outcome maps to `RESOLVED_WON/LOST`.
  - Tests: `disputes.test.ts` ("answering a dispute PayPal is reviewing"), against a PayPal double that now offers the live-observed links.
- **Proven live (2026-11-09).** `dispute-supporting-info.sandbox.test.ts` answered PP-R-EVA-10196999 for real with no buyer login. It picks, from PayPal's live dispute list, an open dispute offering `provide_supporting_info` in a supporting-info stage, then rebuilds the order behind it in a fresh local ledger from PayPal's own records:
  - capture `6GK74474NS2133130`, its authorization and order;
  - item and amount (5.00 USD);
  - tracking number `AEGIS063607862`, which is on PayPal's tracker for that order.

  It then runs the product's own sync, build, review, submit and read-back against the sandbox.
  - **What PayPal answered.** HTTP 200 (debug id `f64330269d1dc`). The multipart shape (`input` part `{"notes": ...}` as `input.json`, plus `file1` = `fulfillment-record.pdf`) is accepted. The read-back shows `supporting_info[]` going 0 to 1 (`confirmed: true`). A separate GET shows the entry as `SUBMITTED_BY_SELLER` with our notes and the PDF. The dispute stays `UNDER_REVIEW` / `CHARGEBACK` and still offers `provide_supporting_info` and `accept_claim`.
  - **What it does not prove.** The ledger was rebuilt locally, not by the hosted demo's own flow. PayPal does not return a tracker's carrier, so the fixture says `OTHER`. Delivery is `SIMULATED`. The notes sent to PayPal say it is a contract test. `provide-evidence` (a dispute in `WAITING_FOR_SELLER_RESPONSE`) is still only covered by the local double. As of the run, PayPal had sent no webhook for the update.
  - **One answer per run.** PayPal keeps offering the action, so every run that reaches the POST adds another entry. The file therefore needs its own flag and is not part of a plain `pnpm test:sandbox`: `SANDBOX_WRITES=1 SANDBOX_DISPUTE_WRITES=1 pnpm vitest run -c vitest.sandbox.config.ts packages/payments/test/dispute-supporting-info.sandbox.test.ts`.

## 5g. Front-end redesign: decisions that go beyond the TDD

- **Direction: "ledger and vault".** Paper-toned light mode, green-black dark mode, one vermilion accent. Brass means money on hold, teal and green verified, garnet blocked, slate released. Display type is Bodoni Moda, UI type Schibsted Grotesk, data Geist Mono, all self-hosted Fontsource variable fonts. Every status carries an icon and a label, never colour alone. Text contrast is WCAG AA in both themes (checked by script, including the status chips).
- **One 3D scene, one scroll moment, one ambient layer.** The hero is a three.js scene of the five money lanes, driven by live order state; the three.js chunk loads on demand and never blocks first paint. The "How a hold moves" section pins and steps through five chapters on a wide screen. Behind the page, a fixed ambient room (ledger ruling, two soft lights, paper grain) moves only with scroll and pointer. Nothing animates by itself. A pause control covers the scene, reduced motion gets the still version, and the ambient layer is hidden under forced colours.
- **Pinned section snaps one chapter at a time.** ScrollTrigger snap inertia is off, so a fast flick cannot skip a chapter. The ambient scroll triggers refresh after the pin so their range includes its spacer.
- **Dialogs are portaled to the body.** A dialog opened from the translucent top bar would otherwise be sized and stacked by the bar's backdrop filter.
- **Guideline audit.** The page was checked against the Vercel Web Interface Guidelines. Fixed: unlabeled mandate input, an accessible name that differed from its visible text, an unnamed table header, missing `name`/`autocomplete`/`spellCheck` on form fields, placeholder ellipses, `overscroll-behavior` on dialogs and the drawer, `translate="no"` on the brand name, and `dateTime` on feed times. Left as is on purpose: sentence-case buttons (the house voice), and the immediate "Cancel" on an order that has no hold yet.
- **Known limit.** The main script chunk is about 3.2 MB (914 KB gzipped), mostly AG Grid Enterprise. It is not split further.

## 5h. Review of the 2026-11-08 improvement list: what was built, what was not, and why

Each claim was checked against the code, PayPal's own documents (`commands/doctor.md` in github.com/paypal/AI-Toolkit, the Disputes v1 OpenAPI schema, the authorization docs) or a live sandbox call before deciding.

| Proposal | Decision | Evidence |
|---|---|---|
| Route dispute answers by HATEOAS links (INQUIRY vs CHARGEBACK) | **Built** | See 5f. Live dispute offers only `accept_claim` / `provide_supporting_info`. The `provide-supporting-info` answer was sent to it live on 2026-11-09 (HTTP 200, read back) |
| Read-back after submitting evidence | **Built** (`EVIDENCE_READBACK`) | Records what PayPal lists; it never claims more than that |
| `/paypal:doctor`: separate 422 `INSTRUMENT_DECLINED` | **Built** | `authorizeHold` maps it to `INSTRUMENT_DECLINED` (422), never retried, audited (`HOLD_INSTRUMENT_DECLINED`); the next authorize uses attempt n+1, so a new `PayPal-Request-Id` (the old one could replay the stored decline). Worker and webhook backstop treat it as "wait for the buyer". The dialog sends the buyer back to PayPal. Live: `declined.sandbox.test.ts` (sandbox `PayPal-Mock-Response` returns 422 with `details[].issue = INSTRUMENT_DECLINED`; it skips unless `PAYPAL_WRITES_ENABLED=true`, which `.env` leaves off, so run it with `PAYPAL_WRITES_ENABLED=true pnpm vitest run -c vitest.sandbox.config.ts packages/payments/test/declined.sandbox.test.ts`. Passed live 2026-11-08) |
| `/paypal:doctor`: `findEligibleMethods()` before rendering | **Built** | `PayPalApprove.tsx` |
| `/paypal:doctor`: `PAYPAL_ENVIRONMENT` switch | **Built** | `loadPayPalConfig` derives the base URL from it; only `sandbox` (or unset) loads, `live` stops the process. The browser's SDK environment and checkout host come from the session |
| Checkout brand, locale, shipping preference | **Built** | `brand_name: "AegisPay"` (the product is not an MCP server, so not "AegisPay MCP"), `locale: en-US`, `shipping_preference: GET_FROM_FILE`. Accepted live (HTTP 200) |
| AG Grid pinned foot row and CSV export | **Built** | Foot row = money held + captured (same figures as the strip). CSV includes PayPal order, authorization, capture ids and decision hash |
| v6 rules: `{ orderId }`, lowercase `data.orderId`, invoked promise to `start()`, `onError`/`onCancel`, `async` script | Already true | `start()` gets `Promise.resolve({ orderId })`; `onApprove` does not read `orderID`; the loader injects the script dynamically (async by default) |
| Retry 5xx with the same `PayPal-Request-Id`; 429 backoff; log every `debug_id` | Already true | `call.ts`: 1s/4s/10s and 10s/30s with jitter; `debug_id` on every `PAYPAL_CALL` audit row |
| Webhook: acknowledge fast, process async, dedupe `event_id` | Already true | Store-then-200; the worker verifies and processes; the event id is the key |
| Integer-cent pre-flight validator against `AMOUNT_MISMATCH`, SKU ≤ 127 | Already true | Money is `bigint` minor units end to end; totals recomputed and PayPal's echo checked; SKU and title capped at 127 |
| Hydrate from the capture response, not a re-fetch | Already true | `capture` uses the `return=representation` response |
| 115% over-capture, honor/expiry markers | Not needed | Capture is always exactly the authorized amount (`finalCapture: true`), and the proof gate checks the live authorization amount. The real ceiling is 115% **or** +$75, whichever is less. Honor end and expiry are stored and shown in the grid timer |
| Webhook-first dispute hydration | Already true | The live dispute arrived by a verified `CUSTOMER.DISPUTE.CREATED` webhook. A "simulated dispute" toggle was not added: the product does not show simulated PayPal state |
| `PayPal-Request-Id` on every POST | Partly, justified | Sent on every Orders/Payments write. PayPal documents no idempotency header for dispute POSTs, tracking, or webhook verification. Those are protected instead by row locks, the `pushed_to_paypal_at` stamp, and being read-only respectively, and are never blindly retried |
| Subscriptions lifecycle checks | Not applicable | The product has no subscription code. A feature was not added just to satisfy a checker |
| Three-way liability with Payouts-funded "agent-fault insurance" | Not built | The token has the payouts scope, but suppliers are not PayPal parties here (one payee: our sandbox merchant), so "make the merchant whole" has no real counterparty and would be simulated. A fault classifier would need ground truth the system does not have. The regulatory claims in the proposal could not be verified |
| Claims-ratio and expected-value pricing via Transaction Search | Not possible | The app's token has no `reporting/search` scope, and one dispute gives no meaningful ratio |
| WebAuthn co-signing, Bryntum timeline, in-browser chain recompute, red-team panel | Deferred | Scope versus the 12 Nov deadline. The hash chain is verified server-side (`/api/audit/verify`, nightly) |
| Inline quantity editing in the grid | Rejected | A quantity is part of the gated decision (its hash is attested). Editing it in the grid would bypass the gatekeeper |
| Shared demo state (one judge's reset clears another's data) | Known limit | `POST /api/demo/reset` and the demo clock are global (5b). The audit chain survives a reset. Nothing automated resets the hosted demo (the nightly workflow is read-only); `pnpm seed` and the Judge Mode reset button do, and one of them cleared the 2026-11-07 run's rows |

## 5i. Correctness pass (2026-11-08): decisions that differ from the TDD

| Topic | TDD says | What the code does, and why |
|---|---|---|
| When to reauthorize | `now > honor_ends_at − 2 h` (TDD, Authorizations) | `now ≥ honor_ends_at + 10 min` and `now < auth_expires_at` (`reauthDue`, `REAUTH_AFTER_HONOR_MS`). PayPal accepts a reauthorization only on days 4 to 29 of an authorization, i.e. **after** the 3-day honor period ([reauthorize API](https://docs.paypal.ai/reference/api/rest/authorizations/reauthorize-authorized-payment), [authorization guide](https://developer.paypal.com/docs/checkout/standard/customize/authorization/)). Two hours before the end of honor, PayPal would reject it. The 10 minutes absorb clock skew between us and PayPal |
| Which clock decides reauthorization | Not stated | PayPal's real clock (`ctx.clock`), never the Judge Mode demo clock. Time travel moves SLAs and the breach sweep; it must not send a reauthorize call that PayPal will reject. The web tooltip for authorization expiry also counts on the wall clock (`useWallNow`) |
| How many times to reauthorize | Not stated | At most once. PayPal allows one reauthorization, on days 4 to 29, and the new authorization starts its own 3-day honor period. Without a cap, the sweep would ask again three days later and PayPal would refuse it on every pass until expiry. `reauthDue` returns false once `authorization_history` holds more than one id. `reauthorize` itself refuses a second one with `BAD_STATE` and does not call PayPal |
| Reauthorizing a hold already past its SLA | "SLA still open" | The sweep skips holds that `listSlaBreaches` reports. The SLA watch flags them (`SLA_BREACH_FLAGGED`) for a person to confirm a void (FR-07), so a reauthorization would only extend a hold that is about to be released |
| Polling resolved disputes | Not stated | `listOpenDisputeIds` skips disputes PayPal marked `RESOLVED`. The sync that recorded `RESOLVED` already applied any order transition, and a dispute resolved before evidence keeps its order `DISPUTED` by design (D2), so re-reading it every two minutes changed nothing. A reopened dispute still arrives by webhook |
| Concurrent captures of one order | One guarded transition | `capture` now runs under a session advisory lock per order (`capture:<orderRowId>`), so two capture clicks cannot both pass the proof gate and race to PayPal. No transaction is held across the PayPal call |
| Response headers | Not stated | Every response that goes through Fastify, including the page and its assets, carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`. The SSE stream (`/api/stream`) hijacks the reply and writes to the raw socket, so it skips the `onSend` hook. That is harmless: it serves no HTML. No `Cross-Origin-Opener-Policy`: the PayPal checkout popup needs `window.opener`. A full script CSP was not added; the PayPal SDK loads scripts and frames from several PayPal hosts that would have to be verified live first |
| `trustProxy: true` | Not stated | Kept. Render terminates TLS in front of the app, and the rate limiter keys on the client address it forwards. Narrowing it to a hop count needs Render's proxy depth confirmed on the live deploy |

## 6. What is needed from the owner

1. ~~A sandbox **buyer** login (or approve one order manually)~~ Done on 2026-11-07: order `1DD80013YX7168537` was buyer-approved, authorized (`9RT36463D57941302`) and captured (`6GK74474NS2133130`). IDs confirmed by GET at PayPal on 2026-11-08 ([SANDBOX_VERIFICATION.md](SANDBOX_VERIFICATION.md)).
2. ~~A **buyer-filed sandbox dispute**~~ Done: PP-R-EVA-10196999 (see 5f). The hosted demo's order rows were later cleared by a Judge Mode reset (the audit chain still verifies, 547 rows). The dispute itself stays open at PayPal, and on 2026-11-09 the supporting-info path was proven live against it (see 5f and item 6).
3. ~~A **public HTTPS URL** for the webhook listener~~ Done: the Render deploy; deliveries are signature-verified there.
4. ~~The Channel3 API key and an LLM key~~ Provided and verified live (`pnpm test:sandbox`). Without them the agent routes answer `AGENT_UNAVAILABLE` rather than inventing results. Please confirm the second pasted string was the Channel3 key.
5. **Rotate or revoke** the GitHub token, the PayPal sandbox secret and the Groq key that were pasted in chat, after the hackathon.
6. ~~To prove `provide-supporting-info` live~~ Done on 2026-11-09 without a buyer, against the still-open PP-R-EVA-10196999 (see 5f). Two things are left, and only these need a sandbox buyer account (optional):
   - The same answer sent through the hosted demo's own buttons, which needs a disputed order in the hosted ledger.
   - A `provide-evidence` answer, which needs a dispute that PayPal puts in `WAITING_FOR_SELLER_RESPONSE`.

   Steps: a new buyer-approved order on the hosted demo, then a buyer-filed dispute on it from the sandbox buyer account. Do not run `pnpm seed` or press "Reset demo" on the hosted demo until it has been answered.
7. ~~A sandbox **buyer** login for the 2026-11-08 correctness fixes~~ Not needed. They ran live on 2026-11-08 through PayPal's own guest checkout, with no buyer login: the concurrent capture lock, void, and PayPal's answer to an early reauthorization (see section 4). Run them with `SANDBOX_WRITES=1 pnpm test:sandbox`. `approved-hold.sandbox.test.ts` uses `PAYPAL_SANDBOX_BUYER_EMAIL` / `PAYPAL_SANDBOX_BUYER_PASSWORD` when they are in `.env`, and guest checkout otherwise. A buyer account is still needed for what is left of item 6, because only a buyer can file a dispute.
