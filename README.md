# AegisPay

**Give procurement to AI agents without giving them the wallet.**

AegisPay is a control plane for small businesses that want AI agents to buy things for them. The agent finds and proposes a purchase. It never touches money. Money moves only through a PayPal Orders v2 `intent: AUTHORIZE` hold, and only after a person approves it and a deterministic gatekeeper (never an LLM) validates every proposal.

Built for the PayPal AI Hackathon 2026. Sandbox only: the server refuses to start against any non-sandbox PayPal host.

- Live demo: <https://aegispay-w12c.onrender.com> (Render free plan; the first request after idle takes about a minute to wake)
- Webhook endpoint: `POST /webhooks/paypal`

## The five guarantees

| # | Guarantee | Where it is enforced |
|---|-----------|----------------------|
| 1 | An agent proposal is checked by a pure, deterministic gatekeeper against the signed mandate (budget, vendor, category, per-order cap). No LLM is on that path. | `packages/gatekeeper` (100% branch coverage enforced in CI) |
| 2 | Money is only ever held, not spent: `createOrder` with `intent: AUTHORIZE`, then a human approves the hold at PayPal. | `packages/payments/src/orders.ts` |
| 3 | Capture fires only after delivery is recorded and the proof gate passes. Every failed condition is audited and nothing reaches PayPal. | `packages/payments/src/authorizations.ts` (`capture`) |
| 4 | An SLA breach proposes a void of the hold. A human confirms it. | `apps/worker/src/jobs.ts`, `packages/payments/src/authorizations.ts` (`voidHold`) |
| 5 | Disputes are answered with evidence drawn from a hash-chained audit log, attested by a human before submission. | `packages/payments/src/disputes.ts`, `packages/db/src/audit.ts` |

"Agents cannot pay" is also a checked property of the code: `pnpm lint` (run in CI, rules in `eslint.boundaries.config.mjs`) fails the build if `packages/agents` imports `@aegis/payments` or the PayPal server SDK, if `packages/payments` imports agents, if the gatekeeper imports anything but core or reads a clock, or if anything outside payments names a PayPal API host. `test/boundaries.test.ts` proves each rule fires on a violating snippet.

Every state change appends to an audit log whose rows are hash-chained, so tampering with history is detectable (`GET /api/audit/verify`, and the nightly job re-verifies the chain).

## PayPal APIs used

Orders, authorizations, captures and refunds go through `@paypal/paypal-server-sdk`. Disputes, webhook verification and event simulation use PayPal's REST API directly through one narrow client (`packages/payments/src/rest.ts`). The buyer approves the hold in the browser with the PayPal JS SDK v6 (`apps/web/src/components/PayPalApprove.tsx`), loaded with the public client id only.

| PayPal API | Used for | Code |
|------------|----------|------|
| Orders v2: create order (`intent: AUTHORIZE`) | Open the hold | `packages/payments/src/orders.ts` (`createHold`) |
| Orders v2: show order details | Read the buyer-approval status | `packages/payments/src/orders.ts` (`getPayPalOrder`) |
| Orders v2: authorize payment for order | Turn the approved order into an authorization | `packages/payments/src/orders.ts` (`authorizeHold`) |
| Orders v2: add tracking | Push carrier and tracking number | `packages/payments/src/orders.ts` (`pushTracking`) |
| Payments v2: show authorization details | Check the hold is still usable | `packages/payments/src/authorizations.ts` (`getAuthorization`) |
| Payments v2: capture authorized payment | Settle after the proof gate passes | `packages/payments/src/authorizations.ts` (`capture`) |
| Payments v2: void authorization | Release the hold on an SLA breach | `packages/payments/src/authorizations.ts` (`voidHold`) |
| Payments v2: reauthorize | Extend an aging hold | `packages/payments/src/authorizations.ts` (`reauthorize`) |
| Payments v2: refund captured payment, show refund | Refunds | `packages/payments/src/refunds.ts` |
| Payments v2: show captured payment | Reconcile on webhook | `packages/payments/src/webhooks/process.ts` |
| Webhooks: verify-webhook-signature, certificate download | Verify every delivery (online postback, plus an offline certificate check) | `packages/payments/src/webhooks/verify-postback.ts`, `verify-offline.ts` |
| Webhooks: simulate-event | Prove the webhook path against the live sandbox | `packages/payments/src/webhooks/simulate.ts` |
| Customer Disputes v1: show dispute, provide evidence | Dispute defense | `packages/payments/src/disputes.ts` |

Every write carries a deterministic `PayPal-Request-Id` derived from the order and the action (`packages/payments/src/request-id.ts`), so a retry or two concurrent callers converge on one PayPal operation.

## How it is built

```
apps/api      Fastify 5 API. Serves the web app, the SSE stream, the webhook, and the Judge Mode demo routes.
apps/worker   pg-boss worker: SLA watch, capture, dispute sync, polling.
apps/web      React + Vite command center with AG Grid. `pnpm build` writes it into apps/api/public.
packages/core        Domain types, money as integer minor units (bigint), state machine, clocks.
packages/gatekeeper  The deterministic validator.
packages/db          Postgres access, migrations, the hash-chained audit log.
packages/payments    Everything that talks to PayPal.
packages/agents      Mandate parser, sourcing against a live catalog, dispute drafter (LLM calls).
packages/jobs        Queue names, payload schemas, sender.
```

- **Real, not simulated.** The catalog is live (Channel3). The language model is a hosted model. PayPal is the real sandbox. Tests run against a real Postgres and a PayPal contract server that checks request shapes. Where a value is a stand-in (for example the fulfilment source is recorded as `SIMULATED` because there is no real carrier integration), the audit log says so.
- **Live updates.** `GET /api/stream` is a Server-Sent Events stream (seven event types, plus `resync` and `Last-Event-ID` replay), so the grid updates as the worker works. Order and audit events are replayable; `selfcheck.result` is ephemeral.
- **Idempotent and concurrent-safe.** Order state changes are compare-and-set in Postgres; PayPal writes use deterministic request ids.

Decisions that differ from the technical design, and why, are recorded in [`docs/DEVIATIONS.md`](docs/DEVIATIONS.md).

## Judge Mode

The hosted demo runs with Judge Mode on. It lets you move the app's own clock forward to trip an SLA timer, and reset the demo data, without waiting days.

- `GET /api/demo/clock`, `POST /api/demo/clock`: read or move the app's clock. It moves only AegisPay's timers, never PayPal's.
- `POST /api/demo/reset`: clear demo state. The audit chain is kept, so history is still verifiable.

Set `JUDGE_MODE=false` to hide it (the routes then answer 403).

## 90-second quickstart (local)

Prerequisites: Node 24, pnpm 11, Docker, and a PayPal **sandbox** app (client id and secret).

```bash
git clone https://github.com/BugHunterX2101/AegisPay && cd AegisPay
pnpm install

# Local Postgres
docker run -d --name aegispay-pg -p 54329:5432 \
  -e POSTGRES_USER=aegis -e POSTGRES_PASSWORD=aegis -e POSTGRES_DB=aegis_test postgres:16

cp .env.example .env     # then fill in the sandbox keys; see the file's comments
pnpm build               # builds the web app into apps/api/public
pnpm start:api           # http://localhost:3000   (migrations run on start)
pnpm start:worker        # in a second terminal
```

Open <http://localhost:3000>. Without `pnpm build` the API still runs on its own (API only). Writes to PayPal stay off until you set `PAYPAL_WRITES_ENABLED=true`.

Useful commands:

```bash
pnpm test                 # full suite (needs the local Postgres)
pnpm typecheck
pnpm lint                 # architecture boundaries (agents cannot import payments; the gatekeeper stays pure)
pnpm selfcheck            # live dependency proof: database, PayPal, model, catalog
pnpm seed                 # real mandates, live catalog, sandbox holds
pnpm nightly              # self-check, audit-chain verify, open-dispute sync
pnpm register-webhook     # register the webhook with PayPal once the API has a public URL
node scripts/demo-order.mjs   # drive one order: mandate -> catalog -> gate -> hold -> capture
```

## Deploy

`render.yaml` documents the shape (one free web service running the API and the worker together, plus a free Postgres). Render has no API for Blueprints, so `node scripts/render-deploy.mjs` applies the same configuration through the Render REST API and is safe to re-run. It reads `RENDER_API_KEY` and the app keys from `.env`.

## Security notes

- Sandbox only. `loadPayPalConfig` refuses any other PayPal host.
- Secrets live in `.env` (gitignored) or the host's environment, never in the repo. The browser only ever receives the public PayPal client id.
- The API sits behind a signed session cookie and a CSRF token on every write; the webhook and `/healthz` are the only public routes besides the page and the self-check.
- Rotate the PayPal, language-model, catalog and Render keys when you are done with the demo.

## License

Apache-2.0. See [`LICENSE`](LICENSE). The AI tools used to build and run the product are listed in [`AI_TOOLS.md`](AI_TOOLS.md).
