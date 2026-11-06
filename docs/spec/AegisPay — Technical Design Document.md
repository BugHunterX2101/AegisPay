# AegisPay — Technical Design Document

Nov 5, 2026 · @Vedit Agrawal

## Summary

**AegisPay is one TypeScript monorepo deployed to Render as a web service, a background worker, a cron job and a Postgres database; AI agents run in the worker and can only propose, while a separate payment module is the sole caller of PayPal's money-moving endpoints.** This document specifies how to build every PRD requirement (FR-01 to FR-20) so a team can start coding on 6 Nov and pass the P0 gate on 9 Nov.

| Field | Value |
| --- | --- |
| Companion to | AegisPay — Product Requirements Document v1.0 (5 Nov 2026) |
| Status | Design v1.0 for the PayPal AI Hackathon 2026 build |
| Scope | P0 in full detail; P1 at interface level; P2 out of scope |
| Environment | PayPal Sandbox only (`https://api-m.sandbox.paypal.com`) |
| Deadline | 12 Nov 2026, 12:00 PM PST; judging 1–15 Dec 2026 |

### The decisions that matter most

1. **Money-moving calls live outside the agents.** Capture, void, reauthorize, refund and provide-evidence are plain server functions, reachable only after the gatekeeper passes and a human confirms. Agents get read and draft tools.
2. **Two PayPal libraries, each where it is strongest.** The Agent Toolkit gives agents scoped read tools; the APIMatic-generated PayPal Server SDK gives the payment module typed Orders and Payments calls, including authorize, capture, void and reauthorize.
3. **The database is the queue and the ledger.** One Postgres instance holds state, the job queue and the hash-chained audit log, removing Redis from the critical path.
4. **Webhooks are acknowledged first and processed second.** The listener stores the raw body and headers, returns 200, and a worker verifies and applies the event exactly once.
5. **Everything a judge sees is resettable.** A seed and reset routine rebuilds demo data and a pool of pre-staged disputes, so Judge Mode never depends on sandbox timing.

### Reading guide

Sections 2–4 set the shape of the system. Sections 5–9 are the core flows, in the order money moves. Sections 10–12 are the contracts between layers. Sections 13–15 cover what keeps it safe and running through judging.

## Design principles and key decisions

**Every decision below favors what a six-day team can make correct and keep running unattended over what scales furthest.** Where the hackathon and production would choose differently, the production choice is named so judges see it was considered.

### Principles

1. **Deterministic where money moves, probabilistic where it helps.** LLMs parse, rank and write; code decides and pays.
2. **Least privilege by construction.** A component that should not move money has no code path that can.
3. **Every external effect is idempotent and logged.** Each PayPal POST has a stable `PayPal-Request-Id`; each result lands in the audit log with PayPal's `debug_id`.
4. **One source of truth.** Postgres holds state, jobs and audit; the UI only renders what the server streams.
5. **Demo-proof.** Anything slow or flaky in sandbox is pre-staged, cached or simulated, and labelled as such on screen.

### Decision record

| # | Decision | Options considered | Chosen | Why |
| --- | --- | --- | --- | --- |
| D1 | Language and runtime | TypeScript/Node; Python/FastAPI | TypeScript on Node 22 LTS end to end | PayPal's Agent Toolkit, Server SDK and JS SDK v6 all ship TypeScript; one language for UI, server and agents; shared zod types |
| D2 | Repo shape | Separate repos; monorepo | pnpm workspace monorepo | Shared types between gatekeeper, server and UI; one README and LICENSE for Stage One |
| D3 | HTTP framework | Express; Fastify | Fastify | Built-in schema validation and raw-body access per route (needed for webhook CRC32) |
| D4 | Payment API access | Raw fetch; Agent Toolkit only; PayPal Server SDK | Server SDK for Orders/Payments; thin typed fetch client for Disputes and Webhooks | Toolkit lacks authorize/capture/void; Server SDK is typed and APIMatic-generated (counts toward that prize); Server SDK has no Disputes controller |
| D5 | Agent framework | OpenAI Agents SDK; LangChain; Vercel AI SDK | Vercel AI SDK with `@paypal/agent-toolkit/ai-sdk` | Toolkit ships a first-class AI SDK adapter; provider-agnostic, so the model can change without code changes |
| D6 | LLM | Any tool-calling model | Decided by team (open question); default to the most reliable structured-output model available to them | Only structured output and tool calling are required; no model-specific features |
| D7 | Job queue | Redis + BullMQ; Postgres queue | pg-boss on the same Postgres | One fewer service to keep alive through judging; transactional enqueue with state changes |
| D8 | Real-time to UI | WebSockets; polling; Server-Sent Events | SSE | One-way server → UI is all that is needed; works through Render's proxy; trivial reconnect |
| D9 | Grid | AG Grid Community; Enterprise | Enterprise (master-detail, row grouping, sparklines) | Depth of use is what the AG Grid prize judges; watermark risk managed with licence timing |
| D10 | PDF evidence | Headless browser; pdf-lib | pdf-lib | Pure JS, no Chromium on Render, deterministic output |
| D11 | Hosting | Vercel + Supabase; Render | Render (web, worker, cron, Postgres via Blueprint) | Sponsor prize; long-running worker; single `render.yaml` reproducible by judges |
| D12 | Multi-party payee model | Single merchant (sandbox); PayPal multiparty platform | Single sandbox merchant as platform/supplier payee | Multiparty requires partner onboarding; documented as production path |
| D13 | Webhook verification | Postback only; offline only; both | Postback for live events, offline RSA for simulator events | Doctor requires the postback call; simulator events cannot use postback |

### What is deliberately not built

No Redis, no microservices, no Kubernetes, no custom auth provider, no mobile layout, no production PayPal credentials. Operator "login" is a single shared demo session, because the product is judged in sandbox and real auth would add risk without adding score.

## System context and deployment

**Three Render services and one Postgres database run the whole product; the worker is the only process that runs agents or moves held money, and the API is the only process exposed to the internet.**

&#91;embedded content: System context · Render services and external dependencies\]

The browser loads the UI from the API and opens PayPal's checkout pop-up through the JS SDK; it never sees a secret. The API creates and authorizes orders after a human click and receives webhooks; the worker does everything asynchronous.

### External dependencies

| Dependency | Used for | If it fails | Fallback |
| --- | --- | --- | --- |
| PayPal Sandbox REST | Orders, Payments, Disputes, Webhooks, OAuth | Money loop stops | Retries with the same `PayPal-Request-Id`; status banner; demo video as proof |
| PayPal JS SDK v6 | Buyer approval pop-up | Cannot approve new holds | Pre-approved seed orders keep Journeys B and C working |
| PayPal webhooks | Async state | State lags | Worker also polls order/dispute state every 2 minutes for open items |
| Channel3 API | Sourcing, product snapshots | No new shortlists | 15-minute cache, then last-known shortlist (labelled cached) |
| LLM provider | Parsing, ranking, notes | No agent output | Form-only mandate entry; deterministic ranking by price; template notes |
| Render | Hosting | Everything | Uptime alerts; redeploy from Blueprint in minutes |

## Repository and module layout

**One pnpm workspace with three deployable apps and four shared packages; the `payments` package is the only code that imports PayPal write calls, and a lint rule enforces it.**

```
aegispay/
├─ LICENSE                      Apache-2.0 (visible in GitHub About)
├─ README.md                    pitch, live URL, Judge Mode creds, quickstart, API table
├─ render.yaml                  Blueprint: web, worker, cron, postgres
├─ .env.example                 every variable, no values
├─ docs/
│  ├─ paypal-doctor.md          committed /paypal:doctor full + security report
│  ├─ architecture.md           diagrams from this document
│  └─ postman/                  collection + sandbox environment (P1)
├─ apps/
│  ├─ web/                      React + Vite UI (served as static files by api)
│  ├─ api/                      Fastify: REST, SSE, webhook listener
│  └─ worker/                   pg-boss consumers: agents, webhooks, timers
├─ packages/
│  ├─ core/                     zod schemas, money (minor units), ids, errors
│  ├─ gatekeeper/               pure policy engine, zero I/O, 100% branch coverage
│  ├─ payments/                 PayPal Server SDK + REST client, token vault,
│  │                            idempotency, webhook verification, disputes
│  ├─ agents/                   AI SDK agents, tool scoping, prompts, Channel3 client
│  └─ db/                       migrations (SQL), queries, audit-chain helpers
└─ scripts/
   ├─ seed.ts                   products, ACTIVE plan, demo mandates, dispute pool
   ├─ register-webhook.ts       creates or updates the sandbox webhook
   └─ selfcheck.ts              same probes as the in-app panel (CLI)
```

### Dependency rules

| Package | May import | Must not import |
| --- | --- | --- |
| `core` | nothing internal | anything with I/O |
| `gatekeeper` | `core` | `payments`, `agents`, `db`, any network or clock (time is passed in) |
| `payments` | `core`, `db` | `agents` |
| `agents` | `core`, `db` (read), `@paypal/agent-toolkit` | `payments` write functions, `@paypal/paypal-server-sdk` |
| `apps/*` | any package | — |

Enforced with `eslint-plugin-boundaries` (or `dependency-cruiser`) in CI, so "agents cannot pay" is a checked property of the codebase, not a convention. The README links this rule as proof.

### Pinned key dependencies

| Package | Purpose | Notes |
| --- | --- | --- |
| `@paypal/paypal-server-sdk` | Orders v2, Payments v2 | APIMatic-generated; v2.x |
| `@paypal/agent-toolkit` | Agent read tools via `/ai-sdk` adapter | Apache-2.0 |
| `@paypal/paypal-js` | Loads JS SDK v6 (`/sdk-v6` entry) | Browser only |
| `ai` (Vercel AI SDK) + one provider package | Agents, structured output | Provider chosen by team |
| `ag-grid-react`, `ag-grid-enterprise` | Command Center | v36.x |
| `@bryntum/gantt` (P1) | Timeline | Trial package |
| `fastify`, `zod`, `pg`, `pg-boss`, `pdf-lib`, `buffer-crc32` | Server, validation, data, jobs, PDFs, webhook CRC | — |
| `vitest`, `fast-check`, `@playwright/test` | Tests | — |

Pin exact versions in the lockfile on day one; no upgrades after the P0 gate.

## Mandate gatekeeper

**The gatekeeper is a pure function `evaluate(mandate, proposal, context) → Decision` with no I/O, no clock and no LLM; every rule returns a named result so a rejection explains itself in the UI and in dispute evidence.** It covers FR-03 and is the single most important piece of code for both safety and the Technological Implementation score.

### Types

```ts
// packages/core/src/money.ts
export type Currency = 'USD';                 // sandbox demo is USD-only (see rule R4)
export type Minor = bigint;                   // integer cents; never floats

// packages/gatekeeper/src/types.ts
export interface Mandate {
  id: string; version: number; sha256: string;
  spec: { keywords: string[]; mustInclude?: string[]; mustExclude?: string[] };
  quantity: number;                           // integer >= 1
  unitCeiling: Minor; budget: Minor; currency: Currency;
  deliverBy: string;                          // ISO date
  minRating?: number;                         // 0..5
  allowedDomains?: string[];                  // supplier allow-list
  approvalThreshold: Minor;                   // above this, second approver (P1)
  expiresAt: string; status: 'ACTIVE' | 'PAUSED' | 'CLOSED';
}
export interface Proposal {
  mandateId: string; mandateVersion: number;
  productId: string; title: string; domain: string;
  unitPrice: Minor; currency: Currency; quantity: number;
  shipping: Minor; tax: Minor;
  etaDate: string; rating?: number; inStock: boolean;
  snapshotSha256: string;
}
export interface Context { now: string; spentSoFar: Minor; }
export type RuleId = 'R1'|'R2'|'R3'|'R4'|'R5'|'R6'|'R7'|'R8'|'R9'|'R10'|'R11';
export interface RuleResult { id: RuleId; pass: boolean; label: string; expected: string; actual: string }
export interface Decision { pass: boolean; results: RuleResult[]; total: Minor; decisionSha256: string }
```

### Rules (all evaluated, never short-circuited, so the UI shows the full checklist)

| Rule | Check | Fails when |
| --- | --- | --- |
| R1 | Mandate active and not expired | `status ≠ ACTIVE` or `now > expiresAt` |
| R2 | Proposal targets current mandate version | `mandateVersion ≠ mandate.version` |
| R3 | Unit price within ceiling | `unitPrice > unitCeiling` |
| R4 | Currency matches | `proposal.currency ≠ mandate.currency` |
| R5 | Quantity matches | `quantity ≠ mandate.quantity` |
| R6 | Total within remaining budget | `unitPrice×qty + shipping + tax > budget − spentSoFar` |
| R7 | Arrives on time | `etaDate > deliverBy` |
| R8 | Delivery window fits PayPal authorization validity | `deliverBy > now + 29 days` |
| R9 | Supplier allowed and rated | domain not in allow-list (if set) or `rating < minRating` |
| R10 | In stock | `inStock = false` |
| R11 | Spec match | any `mustInclude` term missing from title, or any `mustExclude` term present (case-insensitive, whole word) |

`pass = results.every(r => r.pass)`. The decision is hashed (`sha256` of canonical JSON of mandate hash + proposal + results) and stored; the payment module refuses to create an order unless it receives a decision hash that exists in the database with `pass = true` for the same proposal.

### Why R8 exists

PayPal authorizations are valid for 29 days with a 3-day honor period ([PayPal](https://developer.paypal.com/docs/checkout/standard/customize/authorization/)). A mandate that cannot be delivered inside 29 days cannot be safely held, so it is rejected before any PayPal call.

### Tests

- **Table tests:** one passing and one failing case per rule (22 cases), each asserting the exact `RuleResult`.
- **Property tests (fast-check):** 1,000 random mandate/proposal pairs; invariant: if `pass` then R3, R6 and R7 arithmetic holds when recomputed independently with plain numbers; and no `pass` with any failing rule.
- **Money tests:** amounts near limits (ceiling ± 1 cent), large quantities, zero shipping; bigint arithmetic only.
- Coverage gate in CI: 100% branches for `packages/gatekeeper`.

## Payment service

**`packages/payments` is the only module that calls PayPal's money-moving endpoints; every call goes through one wrapper that adds the token, a deterministic `PayPal-Request-Id`, retries, `debug_id` capture and an audit event.** It implements FR-04, FR-05, FR-06, FR-07, FR-14 and FR-16.

&#91;embedded content: Authorize → capture sequence, with the void branch\]

The hold is created and authorized by the API in response to human actions (steps 1–7); capture and void run in the worker, after a recorded delivery or an SLA breach. Tracking is pushed to PayPal only after capture, because Orders v2 tracking requires a `capture_id` ([PayPal](https://developer.paypal.com/api/orders-v2/track-orders/use)).

### SDK calls (verified against `@paypal/paypal-server-sdk` 2.5.0)

| Step | SDK method | REST endpoint |
| --- | --- | --- |
| Create hold | `ordersController.createOrder({ body, paypalRequestId, prefer })` | `POST /v2/checkout/orders` |
| Authorize after approval | `ordersController.authorizeOrder({ id, paypalRequestId })` | `POST /v2/checkout/orders/{id}/authorize` |
| Read | `ordersController.getOrder`, `paymentsController.getAuthorizedPayment` | `GET` order / authorization |
| Capture | `paymentsController.captureAuthorizedPayment({ authorizationId, paypalRequestId, body: { finalCapture: true } })` | `POST /v2/payments/authorizations/{id}/capture` |
| Void | `paymentsController.voidPayment({ authorizationId, paypalRequestId })` | `POST /v2/payments/authorizations/{id}/void` |
| Reauthorize (P1) | `paymentsController.reauthorizePayment({ authorizationId, paypalRequestId })` | `POST /v2/payments/authorizations/{id}/reauthorize` |
| Refund (P1) | `paymentsController.refundCapturedPayment({ captureId, paypalRequestId, body })` | `POST /v2/payments/captures/{id}/refund` |
| Tracking | `ordersController.createOrderTracking({ id, body: { captureId, trackingNumber, carrier, items } })` | `POST /v2/checkout/orders/{id}/track` |

The package's source headers state it is generated by APIMatic, and it has controllers for Orders, Payments, Subscriptions, Transaction Search, Vault and OAuth, but none for Disputes or Webhooks; those two use a small typed `fetch` client in the same package.

### Order payload

Built by code from the gated proposal, never by the LLM:

```ts
const body: OrderRequest = {
  intent: CheckoutPaymentIntent.Authorize,
  purchaseUnits: [{
    referenceId: proposal.id,
    customId: mandate.sha256,                    // 64 chars; ties PayPal record to the mandate
    invoiceId: `AEG-${order.shortId}`,
    description: copy.description.slice(0, 127), // LLM-written, length-capped
    amount: { currencyCode: 'USD', value: fmt(total),
      breakdown: { itemTotal: { currencyCode: 'USD', value: fmt(items) },
                   shipping: { currencyCode: 'USD', value: fmt(shipping) } } },
    items: [{ name: proposal.title.slice(0, 127), sku: proposal.productId,
              unitAmount: { currencyCode: 'USD', value: fmt(proposal.unitPrice) },
              quantity: String(proposal.quantity) }],
  }],
  paymentSource: { paypal: { experienceContext: {
    returnUrl: `${APP_URL}/approved`, cancelUrl: `${APP_URL}/cancelled`, userAction: 'CONTINUE' } } },
};
```

Before sending, the module recomputes the total from the proposal and asserts it equals the gate decision's total; any mismatch aborts with `AMOUNT_MISMATCH`.

### Token vault (FR-14)

- Server SDK manages its own client-credentials token; the thin REST client (Disputes, Webhooks, simulate) shares a vault: `{ token, expiresAt }` in memory, refreshed when < 15 minutes remain, using HTTP Basic auth and `grant_type=client_credentials` (doctor checks all three).
- Single-flight: concurrent callers await one in-progress refresh promise.
- On a `401`, invalidate once and retry once; a second `401` fails loudly and turns the self-check red.

### Idempotency

`PayPal-Request-Id = sha256(orderRowId + ':' + action + ':' + attempt)`, truncated to 64 hex characters, where `attempt` increments only on a deliberate new attempt (for example a reauthorization), never on a network retry. PayPal stores request IDs for 45 days on the payments endpoints (SDK documentation), so a retried capture returns the original result instead of capturing twice.

### Retry policy

| Response | Action |
| --- | --- |
| Network error, `500`, `502`, `503`, `504` | Retry up to 3 times, 1 s / 4 s / 10 s with jitter, same request ID |
| `429 RATE_LIMIT_REACHED` | Back off 10 s / 30 s, same request ID |
| `401` | Refresh token once, retry once |
| `422` (e.g. `INSTRUMENT_DECLINED`, `AUTHORIZATION_EXPIRED`) | No retry; mark row FAILED with `debug_id`; surface the issue name |
| `400`, `403`, `404` | No retry; FAILED; alert |

### Proof gate for capture

The capture job runs only if all hold, re-checked inside the job transaction: state is `DELIVERED`; a `fulfillment` row has carrier, tracking number and `delivered_at ≤ deliver_by`; current authorization status from PayPal is `CREATED` or `PENDING`; and the stored amount equals the gate total. Otherwise the job stops and writes the failed condition to the audit log.

### Void and reauthorize

- **Void:** triggered by the SLA watcher (§14) plus a human confirm, or by an operator cancel. Requires authorization not captured. Result VOIDED; audit records the SLA evidence.
- **Reauthorize (P1):** if `now > honor_ends_at − 2 h` and SLA still open, reauthorize; push the new ID onto `authorization_history`; later captures use the newest ID ([PayPal](https://developer.paypal.com/docs/checkout/standard/customize/authorization/)). Never past `auth_expires_at`.

## Webhook pipeline

**The listener does two things — store the exact bytes and return 200 — and the worker does everything else, including verification; state changes are always based on a fresh GET from PayPal, never on the event body alone.** This satisfies PayPal's requirement to return 2xx on every delivery (or face up to 25 retries over 3 days) and the doctor's warning against heavy work before responding ([PayPal](https://developer.paypal.com/api/rest/webhooks/rest), [doctor.md](https://github.com/paypal/AI-Toolkit/blob/main/commands/doctor.md)).

&#91;embedded content: Webhook pipeline · ingest, verify, re-fetch, apply\]

A failed verification is recorded and visible in the grid's verification column, but changes nothing.

### Listener (API)

```ts
app.post('/webhooks/paypal', { config: { rawBody: true }, bodyLimit: 1_048_576 }, async (req, reply) => {
  const raw = req.rawBody as Buffer;                 // exact bytes, needed for CRC32 and postback
  const eventId = JSON.parse(raw.toString('utf8')).id;
  const inserted = await db.query(
    `insert into webhook_event (event_id, event_type, raw_body, headers)
     values ($1, $2, $3, $4) on conflict (event_id) do nothing returning event_id`,
    [eventId, type, raw, pickPayPalHeaders(req.headers)]);
  if (inserted.rowCount) await boss.send('webhook.process', { eventId }, { singletonKey: eventId });
  return reply.code(200).send({ received: true });   // always 200, even for duplicates
});
```

Malformed JSON is still answered with 200 and logged, so PayPal does not retry garbage for three days.

### Processor (worker)

| Event | Re-fetch | Transition |
| --- | --- | --- |
| `CHECKOUT.ORDER.APPROVED` | `getOrder` | Backstop only: if the UI's `onApprove` never arrived, authorize now |
| `PAYMENT.AUTHORIZATION.CREATED` | `getAuthorizedPayment` | AWAITING\_APPROVAL → HELD (no-op if already HELD) |
| `PAYMENT.AUTHORIZATION.VOIDED` | `getAuthorizedPayment` | → VOIDED |
| `PAYMENT.CAPTURE.COMPLETED` | `getCapturedPayment` | DELIVERED → SETTLED; enqueue tracking push if not yet pushed |
| `PAYMENT.CAPTURE.DENIED` / `REFUNDED` | `getCapturedPayment` | → FAILED / REFUNDED |
| `CUSTOMER.DISPUTE.CREATED` / `UPDATED` / `RESOLVED` | `GET /v1/customer/disputes/{id}` | Upsert dispute; start or update defense (§9) |

Subscription is an explicit list of these event types — no wildcard — registered by `scripts/register-webhook.ts`.

### Ordering, retries and gaps

- Events can arrive out of order or twice; because transitions check the current state and `row_version`, applying them in any order converges to PayPal's real state.
- A processing failure retries the job (3 attempts, exponential backoff); the row keeps `error` for the status page.
- Gap protection: every 2 minutes the worker polls open orders and disputes (states HELD, IN\_TRANSIT, DELIVERED, DISPUTED) and applies the same re-fetch logic, so a lost webhook only delays an update.

### Testing with the simulator

`POST /v1/notifications/simulate-event` sends mock events for any registered type. The worker records the IDs it requests, verifies those offline with webhook ID `WEBHOOK_ID` (postback is not supported for mock events), and still re-fetches before acting — so a mock event referencing a non-existent order is safely ignored.

## Agent design

**There are four short-lived agent tasks, not one long chat: each runs as a job, gets only the tools it needs, returns a zod-validated object, and writes every step to the audit log.** None can call a function that moves money.

### Agent tasks

| Task | Trigger | Tools | Output (zod) | Max steps |
| --- | --- | --- | --- | --- |
| Mandate parser | Operator submits free text | none | `MandateDraft` (spec, qty, ceiling, budget, deliverBy, minRating, domains) | 1 |
| Sourcing | Mandate confirmed | `channel3_search`, `channel3_product`, `supplier_profile` (seeded), PayPal toolkit `list_products` (read) | `Shortlist` (≤ 5 ranked proposals + rationale per item) | 6 |
| Order drafter | Operator picks a passing proposal | none (deterministic builder does the payload; LLM writes the item description and `soft_descriptor` only) | `OrderCopy` | 1 |
| Defense | `CUSTOMER.DISPUTE.CREATED/UPDATED` | PayPal toolkit `get_dispute`, `get_order`; internal `get_evidence_facts` (read) | `EvidencePlan` (evidence type, facts used, notes draft ≤ 2,000 chars) | 4 |

### Implementation pattern

```ts
// packages/agents/src/sourcing.ts (shape, not final code)
const toolkit = new PayPalAgentToolkit({
  clientId, clientSecret,
  configuration: { context: { sandbox: true }, actions: { products: { list: true } } },
});
const { output, steps } = await generateText({
  model,                                   // provider chosen by team (D6)
  system: SOURCING_PROMPT,                 // versioned string, hash logged
  prompt: renderMandate(mandate),          // structured facts only
  tools: { ...toolkit.getTools(), channel3_search, channel3_product, supplier_profile },
  output: Output.object({ schema: Shortlist }),
  stopWhen: stepCountIs(6),
});
for (const p of output.items) await enqueue('gate.evaluate', { proposal: toProposal(p) });
```

Agent outputs never go to PayPal directly: proposals go to the gatekeeper; evidence plans go to a human; order copy is length-checked and inserted into a payload built by code.

### Channel3 integration

- `POST https://api.trychannel3.com/v1/search` with `x-api-key`; body `{ query, limit: 10, filters: { price: { max_price }, availability: ['InStock'], conditions: ['new'] }, config: { mode: 'default' } }`; `max_price` = unit ceiling in dollars ([Channel3 search](https://channel3.ai/docs/api-reference/v1/search.md)).
- Each product returns `offers[]` with `url`, `domain`, `price { price, currency }` and `availability`, plus `ratings`, `images` and `key_features`. One proposal = one product × one offer.
- The full response is stored as a snapshot (JSONB + SHA-256) because it becomes dispute evidence for "not as described".
- **ETA is not a Channel3 field.** Supplier lead time comes from a seeded `supplier_profile` table keyed by domain (default 3–7 days), and the UI labels it "simulated lead time". This keeps R7 honest.
- Responses cached 15 minutes per query hash; on error, Judge Mode falls back to the last cached shortlist, labelled "cached".

### Prompt and safety rules

1. System prompts are constants in code, versioned, and their hash is logged with each run.
2. Untrusted text (product titles, descriptions, dispute messages) is passed inside a delimited `data` block with an instruction that it is content, not instructions.
3. Agents see facts from the database, never raw secrets, tokens or full PayPal responses.
4. Every tool call and result is written to `audit_event` with actor `agent:<task>`.
5. If the structured output fails validation twice, the job fails visibly ("Agent could not produce a valid shortlist") rather than retrying silently.

### Compatibility spike (Day 1, 2 hours)

The Agent Toolkit's documented AI SDK examples use older SDK conventions (`maxSteps`, `LanguageModelV1`) ([InfoQ](https://www.infoq.com/news/2025/04/paypal-mcp-ai-toolkit)), while current AI SDK releases use `stopWhen` and `Output.object` and mark `generateObject` deprecated. On day one, verify that `toolkit.getTools()` works with the pinned `ai` version. If not, either pin the AI SDK major the toolkit supports, or wrap the few toolkit read calls (`get_order`, `get_dispute`, `list_products`) in native `tool()` definitions. Both keep the toolkit in the product.

## Dispute defense

**The dispute pipeline is driven by what PayPal says is allowed right now (the HATEOAS links on the dispute), never by assumed status; evidence is built by code from stored facts, and the LLM only writes the notes.** It covers FR-09 and the dispute half of Journey C.

### Pipeline

1. **Ingest:** a verified `CUSTOMER.DISPUTE.CREATED` or `UPDATED` event enqueues `dispute.sync` with the dispute ID.
2. **Sync:** `GET /v1/customer/disputes/{id}`; upsert `dispute` row with `reason`, `status`, `dispute_life_cycle_stage`, `seller_response_due_date`, `links[]`; match to an order via `disputed_transactions[].seller_transaction_id` = our capture ID.
3. **Plan:** a pure function `planEvidence(reason, facts)` returns the evidence type and required inputs from the table below; if a required fact is missing (for example no tracking), it returns `BLOCKED` with the missing item named.
4. **Draft:** the Defense agent writes `notes` from the fact list only (≤ 2,000 characters), citing each fact by key.
5. **Build:** code generates PDFs, assembles the JSON `input` part, and stores the full bundle (bytes + SHA-256) in `evidence_bundle` before sending anything.
6. **Review:** UI shows bundle preview; the reviewer ticks the attestation checkbox and confirms.
7. **Submit:** only if the latest GET still contains a link with `rel = provide_evidence` (PayPal's precondition is status `WAITING_FOR_SELLER_RESPONSE` plus that link). POST multipart; store response; refresh.
8. **Track:** `UPDATED`/`RESOLVED` events move the row to `EVIDENCE_SUBMITTED`, `RESOLVED_WON` or `RESOLVED_LOST`.

### Evidence plan by reason

| Reason | Evidence type | `evidence_info` | Documents |
| --- | --- | --- | --- |
| `MERCHANDISE_OR_SERVICE_NOT_RECEIVED` | `PROOF_OF_FULFILLMENT` | `tracking_info: [{ carrier_name, tracking_number }]` | Fulfillment record PDF |
| `UNAUTHORISED` | `PROOF_OF_FULFILLMENT` (+ second evidence `OTHER`) | tracking as above | Mandate + approval PDF (mandate hash, gate checklist, approver, PayPal payer approval time) |
| `MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED` | `OTHER` | — | Product snapshot PDF (Channel3 title, features, price, URL, captured time, hash) + mandate spec |
| `INCORRECT_AMOUNT`, `DUPLICATE_TRANSACTION` | `OTHER` (or `PROOF_OF_REFUND` if a refund exists) | `refund_ids` if refunded | Ledger extract PDF: one approval → one authorization → one capture |
| `CREDIT_NOT_PROCESSED` | `PROOF_OF_REFUND` | `refund_ids` | — |
| Anything else | `OTHER` | — | Full bundle; notes flag for manual review |

Mapping follows PayPal's reason/evidence reference ([PayPal](https://developer.paypal.com/disputes/reasons-evidence)).

### Request format

`POST /v1/customer/disputes/{id}/provide-evidence` as `multipart/form-data` with an `input` part (JSON, `type=application/json`) and file parts `file1`, `file2`…, as in PayPal's Disputes API guide ([PayPal](https://developer.paypal.com/platforms/disputes/handle-disputes/use-disputes-api)):

```json
{ "evidences": [ { "evidence_type": "PROOF_OF_FULFILLMENT",
    "evidence_info": { "tracking_info": [ { "carrier_name": "FEDEX", "tracking_number": "122533485" } ] },
    "notes": "Delivered 18 Nov 14:02 UTC. Order approved by buyer in PayPal on 15 Nov; mandate 7f3a… attached." } ] }
```

File constraints from PayPal: `.jpg`, `.jpeg`, `.gif`, `.png`, `.pdf`; each file under 10 MB; up to 50 MB per call ([PayPal](https://developer.paypal.com/platforms/disputes/reference/supported-file-types-sizes.md)). AegisPay generates text-only PDFs with pdf-lib (typically < 100 KB) and sends at most 3 files. Required OAuth scope: `https://uri.paypal.com/services/disputes/update-seller` (granted to standard sandbox REST apps; verified in the Day 1 spike).

### Sandbox staging (the dispute pool)

PayPal's sandbox rules shape this ([test and go live](https://developer.paypal.com/platforms/disputes/test-go-live)): a buyer cannot open two disputes on one transaction; actions appear a few minutes after creation; `require-evidence` with `SELLER_EVIDENCE` moves an `UNDER_REVIEW` dispute to `WAITING_FOR_SELLER_RESPONSE`, sandbox only.

- `scripts/seed.ts` creates 10 small captured orders (card-funded sandbox buyer, amounts $6–$9) with tracking.
- The team opens "item not received" cases on them from the sandbox buyer's Resolution Center (or via `POST /v1/customer/disputes` in sandbox, if the auth-assertion path works in the spike).
- A nightly cron checks the pool: disputes `UNDER_REVIEW` with a `require-evidence` link are moved to `WAITING_FOR_SELLER_RESPONSE`; when fewer than 3 usable disputes remain, it emails the team to top up.
- Judge Mode always picks the oldest usable dispute, so a judge's action never waits on sandbox latency.

### Day 1 spike questions

1. Which seeded path (Resolution Center case vs API-created dispute) reliably exposes `provide_evidence` within 10 minutes?
2. Does `CUSTOMER.DISPUTE.CREATED` fire to our webhook for Resolution Center cases in sandbox?
3. Does the default sandbox app token carry the disputes update scope?

## Data design

**Postgres 16 holds the nine tables below, a seeded supplier\_profile lookup, plus pg-boss's own schema; state changes and their audit events are written in one transaction, and the audit table is append-only at the database level.** Money is `bigint` minor units with a `char(3)` currency.

### Schema (abridged DDL)

```sql
create table mandate (
  id uuid primary key, version int not null, status text not null check (status in ('ACTIVE','PAUSED','CLOSED')),
  spec jsonb not null, quantity int not null check (quantity > 0),
  unit_ceiling_minor bigint not null, budget_minor bigint not null, currency char(3) not null,
  deliver_by date not null, min_rating numeric(2,1), allowed_domains text[],
  approval_threshold_minor bigint not null, expires_at timestamptz not null,
  sha256 char(64) not null, created_by text not null, created_at timestamptz default now(),
  unique (id, version));

create table catalog_snapshot (
  id uuid primary key, query_hash char(64), response jsonb not null, sha256 char(64) not null,
  fetched_at timestamptz not null);

create table proposal (
  id uuid primary key, mandate_id uuid not null, mandate_version int not null,
  snapshot_id uuid references catalog_snapshot, product_id text, offer_url text, domain text,
  title text, unit_price_minor bigint, quantity int, shipping_minor bigint, tax_minor bigint,
  eta date, rating numeric(2,1), in_stock boolean, rationale text,
  gate_pass boolean, gate_results jsonb, decision_sha256 char(64), created_at timestamptz default now(),
  foreign key (mandate_id, mandate_version) references mandate (id, version));

create table purchase_order (
  id uuid primary key, proposal_id uuid unique not null references proposal,
  state text not null, amount_minor bigint not null, currency char(3) not null,
  paypal_order_id text unique, authorization_id text, authorization_history text[] default '{}',
  capture_id text unique, auth_created_at timestamptz, honor_ends_at timestamptz, auth_expires_at timestamptz,
  approved_by text, approved_at timestamptz, payer_id text, row_version int not null default 0,
  updated_at timestamptz default now());

create table fulfillment (
  order_id uuid primary key references purchase_order, carrier text not null, tracking_number text not null,
  shipped_at timestamptz, delivered_at timestamptz, source text not null default 'SIMULATED',
  pushed_to_paypal_at timestamptz);

create table webhook_event (
  event_id text primary key,                 -- PayPal event id: idempotency key
  event_type text not null, raw_body bytea not null, headers jsonb not null,
  received_at timestamptz default now(), verified text check (verified in ('POSTBACK','OFFLINE','FAILED')),
  processed_at timestamptz, error text);

create table dispute (
  paypal_dispute_id text primary key, order_id uuid references purchase_order, reason text, status text,
  life_cycle_stage text, seller_response_due timestamptz, links jsonb, outcome text, updated_at timestamptz);

create table evidence_bundle (
  id uuid primary key, dispute_id text references dispute, plan jsonb not null, input_json jsonb not null,
  files jsonb not null,                       -- [{name, mime, sha256, bytes_base64}]
  sha256 char(64) not null, reviewed_by text, submitted_at timestamptz, paypal_response jsonb);

create table audit_event (
  seq bigserial primary key, ts timestamptz not null default clock_timestamp(),
  actor text not null, type text not null, entity text, entity_id text, payload jsonb not null,
  paypal_request_id text, paypal_debug_id text, prev_hash char(64) not null, hash char(64) not null);
```

Indexes: `purchase_order(state)`, `purchase_order(auth_expires_at)`, `dispute(status)`, `audit_event(entity, entity_id, seq)`, `webhook_event(processed_at) where processed_at is null`.

### Audit hash chain

- `hash = sha256(prev_hash || seq || ts || actor || type || canonical_json(payload))`, with `prev_hash` of the first row = 64 zeros.
- Rows are appended by one function `appendAudit(tx, event)` that takes `pg_advisory_xact_lock(42)` so concurrent writers cannot fork the chain.
- A trigger raises on `UPDATE` or `DELETE` of `audit_event`; the app's database role has no `TRUNCATE` grant.
- "Verify chain" (FR-11) recomputes all hashes in a streaming query and returns the first mismatching `seq`, or OK with the head hash; the head hash is shown in the UI and printed in dispute notes.
- Honest limit: the operator controls the database, so this is tamper-evident, not tamper-proof. Production would anchor the head hash externally (for example a daily signed timestamp).

### Concurrency

`purchase_order.row_version` gives optimistic locking: every state transition is `UPDATE … WHERE id = $1 AND state = $expected AND row_version = $v`, so a webhook and a user click racing on the same order cannot both apply. The loser re-reads and no-ops if the target state is already reached.

### Migrations and reset

Plain SQL files run by a small migrator in the Render pre-deploy command. `scripts/seed.ts --reset` truncates demo tables (except `audit_event`, which gets a `DEMO_RESET` marker event instead) and re-inserts seed data.

## API and real-time contract

**The UI talks to a small REST API and listens to one SSE stream; every mutating endpoint is a command that enqueues work or performs one guarded transition, and returns the new state.** All bodies are validated with the same zod schemas the UI imports from `packages/core`.

### REST endpoints

| Method & path | Purpose | Guard | Result |
| --- | --- | --- | --- |
| `POST /api/mandates/parse` | Free text → `MandateDraft` via parser agent | session | draft (not saved) |
| `POST /api/mandates` | Confirm and save mandate | session, zod | mandate with hash |
| `POST /api/mandates/:id/source` | Start sourcing job | mandate ACTIVE | `202` + job id |
| `GET /api/orders` | Grid rows (flattened view) | session | rows |
| `GET /api/orders/:id/audit` | Detail grid rows | session | audit events |
| `POST /api/proposals/:id/orders` | Create PayPal order (AUTHORIZE) for a passing proposal | gate pass + decision hash + human click + CSRF | `{ orderId }` for JS SDK |
| `POST /api/orders/:id/authorize` | Called from JS SDK `onApprove` | PayPal order status `APPROVED` | HELD row |
| `POST /api/orders/:id/ship` | Record carrier + tracking | state HELD | IN\_TRANSIT |
| `POST /api/orders/:id/deliver` | Simulated delivery event | state IN\_TRANSIT, SLA not passed | enqueues capture |
| `POST /api/orders/:id/void` | Void hold | state HELD/IN\_TRANSIT, human confirm | VOIDED |
| `POST /api/disputes/:id/plan` | Build evidence bundle | dispute synced | bundle preview |
| `POST /api/disputes/:id/submit` | File evidence | bundle reviewed + attestation + live `provide_evidence` link | submitted |
| `POST /api/demo/reset` / `POST /api/demo/clock` | Judge Mode reset; time-travel offset | Judge Mode on | ok |
| `GET /api/selfcheck` | FR-13 probes | none (read-only, rate-limited) | probe results |
| `GET /api/audit/verify` | FR-11 chain verification | session | OK + head hash, or first bad `seq` |
| `POST /webhooks/paypal` | PayPal webhook listener | raw body, size limit 1 MB | `200` always |
| `GET /healthz` | Liveness | none | `200` |

Capture is deliberately **not** an endpoint: it only happens inside the worker after a delivery event passes the proof gate (§6).

### Error shape

```json
{ "error": { "code": "GATE_FAILED", "message": "Unit price $192.00 exceeds ceiling $180.00",
  "details": [{ "rule": "R3", "expected": "<= 18000", "actual": "19200" }],
  "paypalDebugId": null, "requestId": "req_01J…" } }
```

PayPal failures surface `paypalDebugId` (PayPal's `debug_id`) so a judge or PayPal engineer can trace the call.

### SSE stream: `GET /api/stream`

One connection per browser tab; heartbeat comment every 15 s; client reconnects with `Last-Event-ID` and the server replays from `audit_event.seq`.

| Event | Payload | UI effect |
| --- | --- | --- |
| `order.upsert` | full grid row | `applyTransactionAsync({ update })` or `{ add }` with cell flash |
| `agent.step` | task, step n, tool, summary, latency | appends to agent drawer |
| `gate.decision` | proposal id, pass, rule results | updates shortlist badges |
| `webhook.verified` | event type, mode (POSTBACK/OFFLINE) | updates verification column |
| `dispute.upsert` | dispute row | amber row + countdown |
| `selfcheck.result` | probe list | top-bar status dot |

The stream is fed from Postgres `LISTEN/NOTIFY`: `appendAudit` issues `pg_notify('aegis', seq)` inside the same transaction, so the UI only ever shows committed state, and both the API and worker processes can publish.

## Frontend design

**A single-page React app whose grid is fed by SSE transactions, not refetches; the PayPal button is the only component that talks to a third party from the browser, and it only ever receives an order ID.**

### Stack and state

- React 19 + Vite + TypeScript; TanStack Query for initial loads; a small `useStream()` hook dispatches SSE events into the grid API and a Zustand store (drawer, self-check, Judge Mode).
- Served as static files by the Fastify API (same origin), so cookies are first-party and no CORS is needed.
- The client receives only `PAYPAL_CLIENT_ID` (public by design) and the AG Grid licence key.

### Component tree

```
<App>
 ├─ <TopBar> env badge · <SelfCheckDot> · <JudgeModeToggle> · <ResetDemo>
 ├─ <MandateStrip> free-text input → parsed chips → <ConfirmMandate>
 ├─ <Workspace>
 │   ├─ <CommandGrid>        AG Grid, master-detail → <AuditDetailGrid>
 │   │    cell renderers: <StateChip> <GateBadge> <Countdown> <VerifyBadge> <RowActions>
 │   └─ <AgentDrawer>        streaming steps per task
 ├─ <TimelinePanel>          P0: hidden; P1: Bryntum Gantt
 ├─ <PayPalApproveButton>    mounted per row on demand
 └─ <EvidenceReviewModal>    bundle preview, attestation, submit
```

### AG Grid configuration (v36.x Enterprise)

| Concern | Setting |
| --- | --- |
| Modules | `ModuleRegistry.registerModules([AllEnterpriseModule])`; `LicenseManager.setLicenseKey(key)` ([AG Grid](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise.md)) |
| Row identity | `getRowId: p => p.data.id` (required for transaction updates) |
| Live updates | `api.applyTransactionAsync({ add, update })`, batched by the grid; `enableCellChangeFlash: true` on money and state columns |
| Master-detail | `masterDetail: true`; `detailCellRendererParams.getDetailRowData` fetches `/api/orders/:id/audit` |
| Grouping | Row group by mandate, collapsed by default; status bar shows held / captured / voided totals via aggregation |
| Renderers | React cell renderers for state chips, countdowns (1 s tick from one shared timer, not per cell), verification badges, action buttons |
| P1 | Sparkline column for price history; integrated chart "spend by supplier"; AG Grid AI Toolkit for natural-language grid commands |

### PayPal JS SDK v6 button

Follows PayPal's v6 setup and migration guides ([set up](https://developer.paypal.com/sdk/js/set-up.md), [v4→v6](https://developer.paypal.com/v4-v6)):

```ts
import { loadCoreSdkScript } from '@paypal/paypal-js/sdk-v6';
const paypal = await loadCoreSdkScript({ environment: 'sandbox' });
const sdk = await paypal.createInstance({ clientId, components: ['paypal-payments'], pageType: 'checkout' });
const eligible = await sdk.findEligibleMethods({ currencyCode: 'USD' });
if (!eligible.isEligible('paypal')) return showUnavailable();
const session = sdk.createPayPalOneTimePaymentSession({
  onApprove: async ({ orderId }) => api.post(`/api/orders/${rowId}/authorize`, { orderId }),
  onCancel: () => toast('Approval cancelled — nothing was held'),
  onError: (e) => toast.error(`PayPal error: ${e.message}`),
});
button.onclick = () => session.start({ presentationMode: 'auto' }, createOrder()); // invoked Promise
// createOrder(): POST /api/proposals/:id/orders → returns { orderId }
```

Three details here are exactly what `/paypal:doctor` checks for v6: `createOrder` resolves to `{ orderId }` (not a bare string), `onApprove` reads `orderId`, and `session.start` receives an invoked Promise rather than a function reference ([doctor.md](https://github.com/paypal/AI-Toolkit/blob/main/commands/doctor.md)). PayPal's own migration page shows an async function in that position, so the doctor's rule is followed and the discrepancy is noted in the README. The `intent: AUTHORIZE` is set only in the server's order body.

### Judge Mode UX

- Banner with sandbox buyer email and password, copy buttons, and a 5-step progress checklist driven by audit events.
- Clock offset control (`+1 day`, `+SLA`) calls `/api/demo/clock`; the server applies the offset to SLA timers only, never to PayPal timestamps.
- Every simulated element (delivery events, supplier lead times, cached results) carries a small "simulated" or "cached" tag.

## Security design and threat model

**The assets worth attacking are the PayPal client secret, the ability to move held funds, and the integrity of the audit trail; each has at least two independent controls.** The model is scoped to a public demo URL in sandbox, which is still worth defending because judges and anyone else can reach it.

### Threats and controls (STRIDE)

| Threat | Example | Controls |
| --- | --- | --- |
| Spoofing | Forged webhook claims a capture or dispute | Postback verification for live events; offline RSA-SHA256 for simulator events; cert URL must be `https` on a `paypal.com` host before fetching; events re-read from PayPal (GET) before any state change |
| Spoofing | Visitor triggers approvals | Judge Mode session cookie (`HttpOnly`, `SameSite=Lax`, `Secure`); CSRF token on all POSTs; sandbox-only blast radius |
| Tampering | Agent or prompt injection alters amount or payee | Amount and payee built by code from the gated proposal; decision hash re-checked in the payment module; payee is the configured sandbox merchant only |
| Tampering | Audit rows edited to win a dispute | Append-only trigger, no UPDATE/DELETE grant, hash chain with visible head hash |
| Repudiation | "I never approved that" | Approval event stores user, timestamp, decision hash, PayPal order ID and payer ID from the authorize response |
| Information disclosure | Client secret or access token leaks | Secrets only in Render env vars; never sent to browser; log redaction for `Authorization`, `client_secret`, `access_token`; doctor security scan in CI |
| Information disclosure | Agent prompt exfiltrates data | Agents receive curated facts only; no secrets in prompts; outbound calls limited to the LLM provider, Channel3 and PayPal |
| Denial of service | Webhook flood or demo abuse | 1 MB body limit; per-IP rate limits on `/api/*` (60/min) and `/api/selfcheck` (6/min); job concurrency caps; Channel3 cache |
| Elevation of privilege | Agent calls capture/void | No such tool exists; `agents` package cannot import `payments` (lint-enforced); kill switch `PAYPAL_WRITES_ENABLED=false` |
| SSRF | Malicious `paypal-cert-url` header | Host allow-list, HTTPS only, no redirects followed, 5 s timeout, cert cached by URL |

### Secrets and configuration

| Variable | Where | Notes |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | server + browser | Public by design |
| `PAYPAL_CLIENT_SECRET` | server only | Render secret (`sync: false`) |
| `PAYPAL_WEBHOOK_ID` | server only | Needed for verification |
| `PAYPAL_ENV` | server | `sandbox`; switches base URL (doctor check) |
| `CHANNEL3_API_KEY`, `LLM_API_KEY` | worker | Render secrets |
| `AG_GRID_LICENSE_KEY` | browser | Licence keys are shipped to clients by design |
| `SESSION_SECRET`, `DATABASE_URL` | server, worker | `DATABASE_URL` from the Blueprint's database |
| `PAYPAL_WRITES_ENABLED` | server, worker | Kill switch, default `true` |

### Webhook verification algorithm (worker)

1. Load `raw_body` and headers from `webhook_event`; if `event_id` already processed, stop.
2. If `the event ID was returned by our own simulate-event call (recorded in a simulated_event list`), verify offline: message = `transmission_id|transmission_time|WEBHOOK_ID|crc32(raw_body)` (CRC32 unsigned, decimal), RSA-SHA256 verify against the cached certificate from `paypal-cert-url`.
3. Otherwise call `POST /v1/notifications/verify-webhook-signature` with the event posted exactly as received (PayPal warns that re-serialised JSON can fail) ([PayPal](https://developer.paypal.com/api/rest/webhooks/rest)); accept only `SUCCESS`.
4. On failure: mark `FAILED`, write an audit event, take no state action.
5. On success: re-fetch the referenced resource from PayPal and apply the transition from the fetched state, not the event body.

## Operations

**Run on paid Render instances from day one: free web services sleep after 15 minutes idle, free Postgres is deleted 30 days after creation, and workers and cron jobs have no free tier** ([Render free tier](https://render.com/docs/free)). A database created on 6 Nov on the free plan would expire around 6 Dec, in the middle of judging.

### Render Blueprint

```yaml
# render.yaml (syntax per Render's Blueprint spec)
services:
  - type: web
    name: aegispay-api
    runtime: node
    plan: 0.5c-512mb
    buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm build
    preDeployCommand: pnpm --filter db migrate
    startCommand: pnpm --filter api start
    healthCheckPath: /healthz
    envVars:
      - key: DATABASE_URL
        fromDatabase: { name: aegispay-db, property: connectionString }
      - { key: PAYPAL_CLIENT_ID, sync: false }
      - { key: PAYPAL_CLIENT_SECRET, sync: false }
      - { key: PAYPAL_WEBHOOK_ID, sync: false }
      - { key: PAYPAL_ENV, value: sandbox }
  - type: worker
    name: aegispay-worker
    runtime: node
    plan: 0.5c-512mb
    buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm build
    startCommand: pnpm --filter worker start
  - type: cron
    name: aegispay-nightly
    runtime: node
    schedule: '30 20 * * *'          # 20:30 UTC = 02:00 IST
    buildCommand: corepack enable && pnpm install --frozen-lockfile && pnpm build
    startCommand: pnpm tsx scripts/nightly.ts
databases:
  - name: aegispay-db
    plan: 0.1c-256mb
```

Shared env vars (secrets) go in an environment group referenced by all three services. Syntax follows the [Blueprint spec](https://render.com/docs/blueprint-spec).

### Cost through judging

| Item | Plan | Price |
| --- | --- | --- |
| Web service | 0.5 CPU / 512 MB | $7 / month |
| Background worker | 0.5 CPU / 512 MB | $7 / month (same tier as web) |
| Cron job | per minute run | \~$0.00016 / minute, cents per month |
| Postgres | 0.1 CPU / 256 MB, 1 GB | $6 / month |
| **Total** | Hobby workspace | **\~$20 / month, \~$40 through 31 Dec** |

Prices from [Render pricing](https://render.com/pricing); a Best Use of Render prize would be paid in Render credits.

### Scheduled work

| Job | Where | Schedule | Does |
| --- | --- | --- | --- |
| SLA watcher | worker (pg-boss) | every minute | Flags orders past `deliver_by` (with demo clock offset) for void confirmation |
| Honor-period reauth (P1) | worker | every 15 min | Reauthorizes holds whose honor period ends within 2 h and SLA is still open |
| Token refresh | worker + api | on demand, < 15 min left | Single-flight refresh per process |
| Self-check | worker | every 30 min | Runs FR-13 probes, stores result, alerts on red |
| Nightly | Render cron | 02:00 IST | Re-seed demo rows, top up dispute pool (§9), prune caches, verify audit chain |

### Monitoring

- External uptime check (any free monitor) on `/healthz` every 5 minutes and `/api/selfcheck` hourly, alerting the team by email.
- Structured JSON logs with `requestId`, `paypalRequestId`, `paypalDebugId`; secrets redacted.
- A `/status` page in the app shows last self-check, last webhook received, dispute-pool size and audit head hash — useful for judges and for the team.

### Judging-window runbook (1–15 Dec)

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Self-check token probe red | Secret rotated or app disabled | Re-check app in PayPal dashboard; update Render secret; redeploy |
| No webhooks for > 24 h | Webhook URL or ID changed | Run `scripts/register-webhook.ts`; update `PAYPAL_WEBHOOK_ID` |
| Dispute pool < 3 | Judges used them | Open new sandbox cases; nightly job moves them to seller response |
| Grid watermark appears | AG Grid trial key expired | Request a new key or extension; functionality is unaffected |
| Channel3 errors | Credits or rate limit | Cached shortlist fallback is automatic; top up key |

Infra keep-alive is fine after the deadline; feature changes are not.

## Testing and verification strategy

**Four layers of tests, each mapped to a PRD metric, and one rule: the P0 gate on 9 Nov is passed only by the end-to-end suite running against the deployed sandbox URL, not by local runs.**

| Layer | Tool | What it proves | PRD metric |
| --- | --- | --- | --- |
| Unit + property | Vitest, fast-check | Gatekeeper rules, money math, evidence planner, audit hashing, CRC32 message building | 0 mandate violations (PRD asks for 200 fuzzed proposals; suite runs 1,000) |
| Contract (PayPal sandbox) | Vitest against sandbox, tagged `@sandbox` | Create AUTHORIZE order, authorize, capture, void, reauthorize, refund, track; each with a repeated `PayPal-Request-Id` to prove idempotency | ≥ 7 API surfaces exercised live |
| Webhook | Simulator + live events | Offline verification passes for simulator; postback `SUCCESS` for live; duplicate event ID is ignored; tampered body fails | 100% verified, by mode |
| End-to-end | Playwright on the Render URL | Journeys A, B and C, including the PayPal approval pop-up with the sandbox buyer | 10/10 golden-path runs |

### Negative and failure tests

- **Gate refusal:** over-ceiling, over-budget, late ETA, out-of-stock and stale mandate version each produce the expected rule failure and no PayPal call (asserted via the HTTP mock recorder).
- **Token expiry:** force the cached token's expiry to now; next call refreshes once even under 20 concurrent requests (single-flight).
- **PayPal errors:** use the sandbox `PayPal-Mock-Response` negative-testing header, which the Server SDK exposes as `paypalMockResponse` ([SDK source](https://cdn.jsdelivr.net/npm/@paypal/paypal-server-sdk@2.3.0/src/controllers/paymentsController.ts)), to simulate capture declines and 500s; assert retry with the same request ID and a FAILED row with `debug_id`.
- **Races:** fire `PAYMENT.CAPTURE.COMPLETED` webhook and the capture job's own response concurrently; assert exactly one SETTLED transition and one audit event.
- **Dispute preconditions:** submission blocked when the `provide_evidence` link is absent; bundle with a missing tracking number returns `BLOCKED`.
- **Audit tampering:** manually update a row in a test database (bypassing the trigger as superuser); `GET /api/audit/verify` reports the exact `seq`.

### Static and compliance checks (CI on every push)

- Typecheck, ESLint (including the dependency boundary rule), Prettier.
- `gitleaks` secret scan.
- `/paypal:doctor security` run before each tag; `/paypal:doctor full` committed before submission.
- Licence check: `LICENSE` present at root; dependency licences compatible with Apache-2.0.

### Manual acceptance (P0 gate script)

1. Fresh incognito window → Judge Mode → complete Journey A without reading the README; time it (target < 5 min).
2. Journey B with the clock control; confirm the buyer's sandbox account shows the authorization voided.
3. Journey C on a pooled dispute; confirm PayPal's dispute shows the evidence and status changes.
4. Self-check all green; audit chain verifies.
5. Repeat 1–3 three times in a row; any failure resets the count.

## Open issues and sources

**Six questions must be answered by a Day 1 spike before the design is final; each has a fallback that keeps P0 on schedule.**

| # | Open issue | Resolve by | Fallback if the answer is "no" |
| --- | --- | --- | --- |
| O1 | Does `@paypal/agent-toolkit` `getTools()` work with the pinned Vercel AI SDK major? | 6 Nov | Pin the SDK major the toolkit supports, or wrap 3 toolkit read calls as native `tool()`s (§8) |
| O2 | Which sandbox path reliably yields a dispute with a `provide_evidence` link? | 6 Nov | Resolution Center cases opened by hand, moved with `require-evidence` (§9) |
| O3 | Do sandbox Resolution Center disputes emit `CUSTOMER.DISPUTE.*` to our webhook? | 7 Nov | Poll `GET /v1/customer/disputes` every minute and synthesize the same internal event |
| O4 | Does the default sandbox app token carry disputes and authorization scopes? | 6 Nov | Enable the features on the sandbox app in the developer dashboard; re-issue token |
| O5 | Is partial capture enabled on the sandbox business account? | 8 Nov | Full capture + refund the difference (FR-19) |
| O6 | Which LLM provider and model (D6)? | 6 Nov | Any model with reliable tool calling and structured output |

Also tracked: AG Grid trial-key timing versus the 15 Dec end of judging; a Channel3 API key with enough credits for judging traffic.

### Traceability to the PRD

| PRD requirement | Design section |
| --- | --- |
| FR-01 mandate builder, FR-02 sourcing | §8 Agents, §11 API |
| FR-03 gatekeeper | §5 |
| FR-04 authorization hold, FR-06 capture, FR-07 void, FR-14 token vault, FR-16 reauth | §6 Payment service |
| FR-05 tracking | §6, §10 `fulfillment` |
| FR-08 webhooks | §7, §13 |
| FR-09 dispute defense | §9 |
| FR-10 grid, FR-12 Judge Mode, FR-15 Bryntum | §12 |
| FR-11 audit log | §10 |
| FR-13 self-check | §11, §14 |
| FR-18 APIMatic | D4, §4 |

### Sources

Checked 5 Nov 2026.

- [PayPal: authorize and capture](https://developer.paypal.com/docs/checkout/standard/customize/authorization/)
- [PayPal Server SDK: capture authorized payment (TypeScript sample)](https://developer.paypal.com/sdk/payment/v2/authorizations-capture) and [`PaymentsController` source](https://cdn.jsdelivr.net/npm/@paypal/paypal-server-sdk@2.3.0/src/controllers/paymentsController.ts)
- [PayPal Orders v2 SDK reference (authorize, capture, track)](https://developer.paypal.com/sdk/orders/v2) and [add tracking guide](https://developer.paypal.com/api/orders-v2/track-orders/use)
- [PayPal JS SDK v6 set up](https://developer.paypal.com/sdk/js/set-up.md) and [v4 → v6 migration](https://developer.paypal.com/v4-v6)
- [PayPal webhooks: verification and retries](https://developer.paypal.com/api/rest/webhooks/rest)
- [PayPal Disputes API guide (provide-evidence example, statuses)](https://developer.paypal.com/platforms/disputes/handle-disputes/use-disputes-api), [reasons and evidence](https://developer.paypal.com/disputes/reasons-evidence), [test and go live](https://developer.paypal.com/platforms/disputes/test-go-live), [supported file types and sizes](https://developer.paypal.com/platforms/disputes/reference/supported-file-types-sizes.md)
- [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit) and [InfoQ on its AI SDK usage](https://www.infoq.com/news/2025/04/paypal-mcp-ai-toolkit)
- [PayPal AI-Toolkit `/paypal:doctor`](https://github.com/paypal/AI-Toolkit/blob/main/commands/doctor.md)
- [Channel3 search API](https://channel3.ai/docs/api-reference/v1/search.md)
- [AG Grid release notes (v36.1)](https://www.ag-grid.com/archive/36.1.0/whats-new/) and [Community vs Enterprise / licence](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise.md)
- [Render Blueprint spec](https://render.com/docs/blueprint-spec), [free tier limits](https://render.com/docs/free), [pricing](https://render.com/pricing)
