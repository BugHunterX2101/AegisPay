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

## 6. What is needed from the owner

1. A sandbox **buyer** login (or approve one order manually) so capture, refund and dispute flows can run against the real sandbox.
2. A **buyer-filed sandbox dispute** on that transaction, to settle the evidence items in section 3.
3. A **public HTTPS URL** for the webhook listener (a Render deploy) to verify signatures and delivery ids.
4. The Channel3 and LLM API keys.
5. **Rotate or revoke** the GitHub token and the PayPal sandbox secret that were pasted in chat, after the hackathon.
