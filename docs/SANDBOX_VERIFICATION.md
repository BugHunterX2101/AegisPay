# Sandbox verification

What has been observed against the real PayPal sandbox (`api-m.sandbox.paypal.com`), with IDs anyone holding the app's
sandbox credentials can look up again. Everything below was read back from PayPal on **2026-11-08** unless a row says
otherwise. Behaviour that is only covered by the local PayPal double is listed separately at the end.

## 1. One full buyer-approved run (2026-11-07)

A real sandbox buyer approved the hold in PayPal's window. The hosted demo then authorized it, recorded delivery, captured
it, and later received the buyer's dispute by signature-verified webhook.

| Step | PayPal ID | What PayPal reports now (GET, 2026-11-08) | `debug_id` of that GET |
|------|-----------|-------------------------------------------|------------------------|
| Orders v2 order, `intent: AUTHORIZE` | `1DD80013YX7168537` | `COMPLETED` | `f936231ba08ff` |
| Authorization | `9RT36463D57941302` | `CAPTURED`, 5.00 USD, created 2026-11-07T15:00:05Z, expires 2026-12-06T15:00:05Z (29 days) | `f35325754b180` |
| Capture | `6GK74474NS2133130` | `PENDING`, 5.00 USD, invoice `AEG-F91132100EFA`, related to the order and authorization above | `f6828879a9d83` |
| Dispute | `PP-R-EVA-10196999` | `UNDER_REVIEW`, stage `CHARGEBACK`, reason `MERCHANDISE_OR_SERVICE_NOT_RECEIVED`, 5.00 USD | `f233554f3a517` |

Webhook events PayPal recorded for that run (`GET /v1/notifications/webhooks-events`), oldest first:

| Event id | Type | Resource |
|----------|------|----------|
| `WH-4EY61669U1813252A-260106274F9644339` | `CHECKOUT.ORDER.APPROVED` | order `1DD80013YX7168537` |
| `WH-8H433715FA2373709-4KF197867R7520746` | `PAYMENT.AUTHORIZATION.CREATED` | authorization `9RT36463D57941302` |
| `WH-4A959798UM910113A-3HF687553D684414M` | `PAYMENT.CAPTURE.COMPLETED` | capture `6GK74474NS2133130` |
| `WH-1EP61326Y0827343X-4HN16665JU840235F` | `CUSTOMER.DISPUTE.CREATED` | dispute `PP-R-EVA-10196999` |
| `WH-4AS162527B055721C-39W06820019578422` | `CUSTOMER.DISPUTE.UPDATED` | dispute `PP-R-EVA-10196999` |
| `WH-4DC823228A238321C-04V82032BR720624H` | `CUSTOMER.DISPUTE.UPDATED` | dispute `PP-R-EVA-10196999` |

An earlier run the same day left `CHECKOUT.ORDER.APPROVED` (`30V02973E7085940M`), `PAYMENT.AUTHORIZATION.CREATED`
(`6J842683PV2011705`) and `PAYMENT.CAPTURE.COMPLETED` (`0S774420P47002122`) events as well.

The hosted demo's order rows for this run were later cleared by a Judge Mode reset. The audit chain was not touched: on
2026-11-08 `GET /api/audit/verify` on the hosted demo answered `ok: true` over 547 rows.

## 2. What the live dispute taught us

- PayPal moved the buyer's claim straight to `UNDER_REVIEW` / `CHARGEBACK`. The only actions it offers are `accept_claim`
  and `provide_supporting_info`, spelled with underscores. It offers no `provide_evidence` and no `require_evidence` link,
  so the sandbox-only status switch cannot be used on this case.
- AegisPay now answers such a case with `provide-supporting-info`, chosen from those live links (DEVIATIONS 5f).
  `accept_claim` is never called. The new path is covered by tests against the local double. It has **not** yet been sent
  to PayPal, because the disputed order no longer exists in the hosted ledger (see above).

## 3. Live checks added on 2026-11-08

| Check | Result | `debug_id` |
|-------|--------|------------|
| Orders v2 create with `experience_context` `brand_name: "AegisPay"`, `locale: en-US`, `shipping_preference: GET_FROM_FILE` | HTTP 200, order `5N209687K04361848`, `PAYER_ACTION_REQUIRED` (never approved, nothing held) | `f201874922ae6` |
| Authorize that order with `PayPal-Mock-Response: {"mock_application_codes":"INSTRUMENT_DECLINED"}` | HTTP 422 `UNPROCESSABLE_ENTITY`, `details[].issue = INSTRUMENT_DECLINED` | `3fc230ceac4f5` |
| Authorize the same order without the mock | HTTP 422, `details[].issue = ORDER_NOT_APPROVED` (so the mock takes precedence) | `f1845408c76f7` |
| `packages/payments/test/declined.sandbox.test.ts`: the same decline through `paypalCall` | Passes: one attempt (not retried), `hasIssue(err, 'INSTRUMENT_DECLINED')` is true, a `debug_id` is carried | changes per run |
| OAuth token scopes | Include `disputes/read-seller`, `disputes/update-seller`, `payments/payouts`. No `reporting/search` (Transaction Search is not enabled for this app) | n/a |

Re-run the live suite with `pnpm test:sandbox`. The files that create orders run only with `PAYPAL_WRITES_ENABLED=true`.

## 4. `/paypal:doctor` (manual review against `commands/doctor.md`)

This is **not** output of the `/paypal:doctor` command. It is a line-by-line review of this repository against the 91
checks in [`commands/doctor.md`](https://github.com/paypal/AI-Toolkit/blob/main/commands/doctor.md), done on 2026-11-08.
To produce the real report, install PayPal's plugin in Claude Code (`/plugin install paypal@claude-plugins-official`,
then `/reload-plugins`) and run `/paypal:doctor full`.

| Category | Result | Notes |
|----------|--------|-------|
| Credentials & Security | Pass | Secret only in env; `.env` is gitignored; the browser receives the public client id only; no token is logged or stored client-side. `PAYPAL_ENVIRONMENT` exists |
| Authentication & Token Management | Pass, 1 justified warning | Token vault caches by `expires_in` and refreshes once on 401. HTTP Basic auth with `grant_type=client_credentials`. Every Orders/Payments POST carries a deterministic, per-operation `PayPal-Request-Id`. **Warning, justified:** dispute POSTs, tracking and `verify-webhook-signature` send none, because PayPal documents no idempotency header for them. They are guarded by row locks, the `pushed_to_paypal_at` stamp, and being read-only respectively, and are never blindly retried |
| Orders API & Checkout | Pass | `/v2/checkout/orders`, `intent: AUTHORIZE`, `currency_code` on every amount, server-side order creation, amount from the server, capture only after checking the authorization live. `INSTRUMENT_DECLINED` handled separately and never retried. `onError` and `onCancel` implemented |
| JS SDK Configuration (v6) | Pass | One loader, official `sandbox.paypal.com/web-sdk/v6/core` URL, injected dynamically (async). `findEligibleMethods()` before the button is enabled. `createPayPalOneTimePaymentSession()`, `start()` receives an invoked promise resolving to `{ orderId }`. No v5 API, no `data.orderID` |
| Pay Later / BNPL | Not applicable | Not used |
| Pay with Venmo | Not applicable | Not used |
| Subscriptions | Not applicable | No subscription code |
| Webhooks | Pass, 1 note | Online `verify-webhook-signature` plus an offline certificate check. Store, then 200 fast; processing is async. Event id is the idempotency key. HTTPS endpoint. Specific event types registered (no `*`). `PAYMENT.CAPTURE.COMPLETED` handled. **Note (INFO level):** the listener answers 200 to every payload it stored, and verification happens afterwards in the worker, so a bad signature never makes PayPal retry |
| Environment & Configuration | Pass | `PAYPAL_ENVIRONMENT` drives the base URL and the browser SDK environment; only `sandbox` loads, and no production host can be configured. `debug_id` on every PayPal audit row. 429 backoff (10 s, 30 s); 5xx retried with the same request id (1 s, 4 s, 10 s). HTTPS return/cancel URLs on the hosted deploy. CSRF token on every `/api` write |

Summary of this manual review: 0 critical · 1 warning (justified above) · 1 note.

## 5. Covered only by the local PayPal double

These paths are tested on every `pnpm test` against `packages/payments/test/paypal-server.ts`, which implements PayPal's
documented rules, but have not been seen against the real sandbox:

- `provide-evidence` and `provide-supporting-info` submissions, and the read-back after them.
- Refund `PENDING` -> `COMPLETED` settlement.
- A second tracking POST for the same capture.
