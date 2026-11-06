# AegisPay — Technical Documentation

Nov 5, 2026 · @Vedit Agrawal

## Overview

**This is the engineer's reference for building, running and shipping AegisPay: what every file is for, how the pieces call each other, and the exact commands to get from an empty folder to a deployed, judge-ready sandbox app.** The PRD says *what* and *why*; the Technical Design Document says *how it should work*; this document says *where it lives and how to build it*.

AegisPay lets an SMB hand procurement to AI agents without handing them the wallet. Agents source suppliers through Channel3 and draft orders; a deterministic gatekeeper and a human approve; PayPal holds the funds with an Orders v2 authorization; capture happens only after delivery is recorded; disputes are answered with evidence assembled from a hash-chained audit log.

### Stack at a glance

| Layer | Choice | Version policy |
| --- | --- | --- |
| Language / runtime | TypeScript on Node.js 22 LTS | `engines.node: ">=22 <23"` |
| Package manager | pnpm workspaces | Pinned via `packageManager` field + Corepack |
| Web UI | React 19, Vite, AG Grid Enterprise 36.x, TanStack Query, Zustand | Exact versions in lockfile |
| Checkout | PayPal JS SDK v6 via `@paypal/paypal-js/sdk-v6` | Sandbox script only |
| API | Fastify, zod, `@fastify/cookie`, `@fastify/csrf-protection`, `@fastify/static`, `@fastify/rate-limit` | — |
| Payments | `@paypal/paypal-server-sdk` 2.5.0 (APIMatic-generated) + typed `fetch` client for Disputes/Webhooks | Pinned at 2.5.0 |
| Agents | Vercel AI SDK (`ai`) + one provider package, `@paypal/agent-toolkit/ai-sdk`, Channel3 REST | Major pinned after Day 1 compatibility spike |
| Jobs | pg-boss on Postgres | — |
| Data | Postgres 16 (Render) | Plain SQL migrations |
| Evidence PDFs | pdf-lib | — |
| Tests | Vitest, fast-check, Playwright | — |
| Hosting | Render Blueprint: web + worker + cron + Postgres | Paid instances (free tier unsuitable for judging) |
| Licence | Apache-2.0 | Root `LICENSE` |

### Document map

| If you need… | Go to |
| --- | --- |
| The big picture | Architecture, Runtime flows |
| Where to put code | File structure, Module reference |
| Table and column names | Data model |
| Endpoint contracts | API reference |
| To run it today | Local development and sandbox setup |
| To ship it | Build, deploy and CI/CD; Implementation checklist |

Conventions in this document: money is always integer minor units (`bigint` cents); every PayPal POST carries a `PayPal-Request-Id`; "sandbox" means `https://api-m.sandbox.paypal.com`.

## Architecture

**Three processes on Render share one Postgres database; agents run in the worker but cannot reach PayPal's money-moving endpoints, which only the `payments` package calls, behind the gatekeeper and a human approval.**

```mermaid
flowchart LR
  subgraph Client["Browser (untrusted)"]
    UI["React UI<br/>AG Grid Command Center<br/>Agent drawer · Evidence modal"]
    JSSDK["PayPal JS SDK v6<br/>approval pop-up"]
  end

  subgraph Render["Render — Hobby workspace"]
    subgraph API["aegispay-api (web)"]
      REST["Fastify REST<br/>zod · CSRF · rate limit"]
      SSE["SSE stream<br/>/api/stream"]
      WH["Webhook listener<br/>/webhooks/paypal"]
    end
    subgraph WORKER["aegispay-worker"]
      AG["Agents<br/>parser · sourcing · drafter · defense"]
      JOBS["Job handlers<br/>webhook.process · capture · void<br/>reauth · sla.watch · selfcheck"]
    end
    CRON["aegispay-nightly (cron)<br/>re-seed · dispute pool · chain verify"]
    subgraph PKG["Shared packages"]
      GATE["gatekeeper<br/>pure policy, no I/O"]
      PAY["payments<br/>Server SDK + REST client<br/>token vault · idempotency"]
      DBP["db<br/>queries · audit chain"]
    end
    PG[("Postgres 16<br/>state · pg-boss queue<br/>hash-chained audit log")]
  end

  subgraph External["External services"]
    PP["PayPal Sandbox<br/>Orders v2 · Payments v2<br/>Disputes v1 · Webhooks v1"]
    C3["Channel3<br/>/v1/search"]
    LLM["LLM provider<br/>tool calling"]
  end

  UI <-->|HTTPS JSON| REST
  SSE -->|events| UI
  UI --> JSSDK
  JSSDK <-->|buyer approval| PP
  REST --> GATE
  REST --> PAY
  REST --> DBP
  WH -->|insert raw event| DBP
  PP -->|webhooks| WH
  JOBS --> PAY
  JOBS --> DBP
  AG -->|read-only toolkit tools| PP
  AG --> C3
  AG --> LLM
  AG -->|proposals| GATE
  PAY -->|create · authorize · capture<br/>void · track · evidence| PP
  DBP --> PG
  CRON --> DBP
  PG -.->|LISTEN/NOTIFY| SSE

  classDef money fill:#e8f0fe,stroke:#1a73e8,stroke-width:2px
  class PAY money
```

### Trust boundaries

| Boundary | What crosses it | Control |
| --- | --- | --- |
| Browser → API | JSON commands, session cookie | CSRF token, zod validation, rate limits, same-origin |
| PayPal → API | Webhook POSTs | Stored raw, verified in worker (postback or offline RSA), resource re-fetched before any change |
| Worker agents → everything | Tool calls | Read-only toolkit actions; proposals only into the gatekeeper; lint rule forbids importing `payments` |
| API/worker → PayPal | Money movement | Only `packages/payments`; decision hash + human approval + proof gate; `PayPal-Request-Id` on every POST |
| Third-party text → LLM | Product titles, dispute messages | Delimited as data, never instructions; outputs zod-validated |

### Responsibilities by process

| Process | Owns | Never does |
| --- | --- | --- |
| `aegispay-api` | UI hosting, commands, order create/authorize after human click, webhook intake, SSE | Runs agents, captures funds |
| `aegispay-worker` | Agents, webhook processing, capture/void/reauth, timers, self-check | Serves HTTP |
| `aegispay-nightly` | Demo re-seed, dispute-pool upkeep, audit chain verification | Touches live demo rows mid-session (skips rows updated in last 30 min) |

## Runtime flows

**Three flows carry the product: hold-to-capture, webhook processing and dispute defense; all three converge on one guarded state machine.**

### 1. Mandate → hold → capture (golden path)

```mermaid
sequenceDiagram
  autonumber
  actor Op as Operator
  participant UI as Web UI
  participant API as aegispay-api
  participant W as aegispay-worker
  participant G as gatekeeper
  participant DB as Postgres
  participant C3 as Channel3
  participant PP as PayPal Sandbox

  Op->>UI: Type mandate in plain English
  UI->>API: POST /api/mandates/parse
  API->>W: job agent.parse
  W-->>UI: MandateDraft (via SSE)
  Op->>UI: Confirm mandate
  UI->>API: POST /api/mandates
  API->>DB: insert mandate (sha256)
  UI->>API: POST /api/mandates/:id/source
  API->>W: job agent.source
  W->>C3: POST /v1/search (max_price, InStock)
  C3-->>W: products + offers
  W->>DB: catalog_snapshot + proposals
  W->>G: evaluate(mandate, proposal, ctx)
  G-->>W: Decision (R1..R11, decisionSha256)
  W-->>UI: gate.decision events
  Op->>UI: Approve hold on passing proposal
  UI->>API: POST /api/proposals/:id/orders
  API->>DB: check decision pass + hash
  API->>PP: createOrder (intent AUTHORIZE, customId = mandate hash)
  PP-->>API: orderId
  API-->>UI: { orderId }
  UI->>PP: session.start() — buyer approves
  UI->>API: POST /api/orders/:id/authorize
  API->>PP: authorizeOrder
  PP-->>API: authorization id, expiry
  API->>DB: state HELD + audit
  Op->>UI: Mark shipped (carrier, tracking)
  UI->>API: POST /api/orders/:id/ship
  Op->>UI: Delivered (simulated)
  UI->>API: POST /api/orders/:id/deliver
  API->>W: job payment.capture
  W->>W: proof gate (tracking, delivered_at ≤ deliver_by, auth CREATED)
  W->>PP: captureAuthorizedPayment (PayPal-Request-Id)
  W->>PP: createOrderTracking (captureId)
  PP-->>API: webhook PAYMENT.CAPTURE.COMPLETED
  W->>DB: state SETTLED + audit + NOTIFY
```

### 2. Webhook processing

```mermaid
sequenceDiagram
  participant PP as PayPal
  participant API as Webhook listener
  participant DB as Postgres
  participant W as Worker

  PP->>API: POST /webhooks/paypal (raw bytes + paypal-* headers)
  API->>DB: insert webhook_event ON CONFLICT DO NOTHING
  API->>DB: boss.send('webhook.process', singletonKey = eventId)
  API-->>PP: 200 OK (always)
  W->>DB: load raw_body + headers
  alt event came from our simulate-event call
    W->>W: offline RSA-SHA256 over id|time|WEBHOOK_ID|crc32
  else live event
    W->>PP: POST /v1/notifications/verify-webhook-signature
    PP-->>W: verification_status
  end
  alt verified
    W->>PP: GET resource (order / authorization / capture / dispute)
    W->>DB: guarded transition (state + row_version) + audit + NOTIFY
  else not verified
    W->>DB: verified = FAILED, audit only
  end
```

### 3. Dispute defense

```mermaid
sequenceDiagram
  actor Fin as Finance reviewer
  participant W as Worker
  participant PP as PayPal Disputes v1
  participant DB as Postgres
  participant UI as Web UI

  W->>PP: GET /v1/customer/disputes/{id}
  W->>DB: upsert dispute (reason, status, due date, links)
  W->>W: planEvidence(reason, facts)
  W->>W: Defense agent drafts notes (facts only, ≤ 2,000 chars)
  W->>DB: evidence_bundle (PDFs + input JSON + sha256)
  W-->>UI: dispute.upsert (amber row, countdown)
  Fin->>UI: Review bundle, tick attestation, Submit
  UI->>W: job dispute.submit
  W->>PP: GET dispute (provide_evidence link present?)
  W->>PP: POST /provide-evidence (multipart: input + file1..n)
  PP-->>W: 200
  W->>DB: submitted_at + audit
  PP-->>W: CUSTOMER.DISPUTE.RESOLVED (later)
```

### 4. Order state machine

```mermaid
stateDiagram-v2
  [*] --> GATED
  GATED --> REJECTED: any rule fails
  GATED --> AWAITING_APPROVAL: all rules pass
  AWAITING_APPROVAL --> HELD: buyer approves + authorizeOrder
  AWAITING_APPROVAL --> CANCELLED: buyer cancels
  HELD --> HELD: reauthorize (P1, honor period ending)
  HELD --> IN_TRANSIT: shipped + tracking stored
  HELD --> VOIDED: SLA breach / cancel + human confirm
  IN_TRANSIT --> DELIVERED: delivery recorded ≤ deliver_by
  IN_TRANSIT --> VOIDED: SLA breach + human confirm
  DELIVERED --> SETTLED: capture succeeds
  DELIVERED --> FAILED: capture declined (422)
  SETTLED --> DISPUTED: CUSTOMER.DISPUTE.CREATED
  SETTLED --> REFUNDED: refund issued
  DISPUTED --> EVIDENCE_SUBMITTED: provide-evidence 200
  EVIDENCE_SUBMITTED --> RESOLVED_WON: seller favour
  EVIDENCE_SUBMITTED --> RESOLVED_LOST: buyer favour
  DISPUTED --> REFUNDED: accept claim / refund
  REJECTED --> [*]
  VOIDED --> [*]
  RESOLVED_WON --> [*]
  RESOLVED_LOST --> [*]
  REFUNDED --> [*]
```

The allowed transitions above are encoded once in `packages/core/src/order-state.ts` as a `const` map; every transition function checks it, and a unit test asserts the map matches this diagram.

## File structure

**One pnpm workspace: three apps that deploy, five packages that hold the logic, and scripts that seed and operate the sandbox.** Every file below has one job; if a new file doesn't fit an existing folder's job, the design is drifting.

```
aegispay/
├── LICENSE                              Apache-2.0 — must render in GitHub "About" (Stage One)
├── README.md                            Pitch, live URL, Judge Mode creds, 90-s quickstart, PayPal API table
├── AI_TOOLS.md                          Which AI models/tools are used, for what, and what is deterministic
├── render.yaml                          Render Blueprint: web, worker, cron, Postgres, env group
├── package.json                         Root scripts (dev, build, test, lint); packageManager pin
├── pnpm-workspace.yaml                  apps/* and packages/*
├── pnpm-lock.yaml                       Exact dependency versions (frozen after P0 gate)
├── tsconfig.base.json                   Strict TS settings shared by all projects
├── eslint.config.js                     Lint + boundaries rule (agents cannot import payments)
├── .prettierrc                          Formatting
├── .env.example                         Every variable with a comment, no values
├── .gitignore                           Includes .env, coverage, dist, playwright-report
├── .nvmrc                               22
├── .github/
│   └── workflows/
│       ├── ci.yml                       typecheck · lint · unit/property tests · gitleaks · build
│       └── e2e.yml                      Manual/nightly Playwright run against the Render URL
├── docs/
│   ├── architecture.md                  Mermaid diagrams from this document
│   ├── paypal-doctor.md                 Committed /paypal:doctor full + security report
│   ├── judge-guide.md                   5-step walkthrough with screenshots
│   ├── decisions.md                     Decision record (D1–D13 from the design doc)
│   └── postman/
│       ├── aegispay.postman_collection.json
│       └── sandbox.postman_environment.json
│
├── apps/
│   ├── web/                             React UI (built to static files, served by api)
│   │   ├── index.html
│   │   ├── vite.config.ts               Dev proxy /api and /webhooks to :8080
│   │   ├── package.json
│   │   └── src/
│   │       ├── main.tsx                 Bootstraps React, registers AG Grid modules + licence
│   │       ├── App.tsx                  Layout: TopBar, MandateStrip, Workspace, Timeline, modals
│   │       ├── api/
│   │       │   ├── client.ts            fetch wrapper: CSRF header, zod-parsed responses, error shape
│   │       │   └── queries.ts           TanStack Query hooks (orders, audit, selfcheck)
│   │       ├── stream/
│   │       │   └── useStream.ts         EventSource + Last-Event-ID; dispatches to grid + store
│   │       ├── store/
│   │       │   └── ui.ts                Zustand: drawer steps, judge mode, selfcheck, toasts
│   │       ├── components/
│   │       │   ├── TopBar.tsx
│   │       │   ├── SelfCheckDot.tsx
│   │       │   ├── JudgeModeBanner.tsx  Sandbox buyer creds, 5-step progress, clock control
│   │       │   ├── MandateStrip.tsx     Free text → parsed chips → confirm
│   │       │   ├── AgentDrawer.tsx      Streaming agent steps
│   │       │   ├── PayPalApproveButton.tsx  JS SDK v6 session (createOrder → onApprove)
│   │       │   ├── EvidenceReviewModal.tsx  Bundle preview, attestation, submit
│   │       │   └── TimelinePanel.tsx    P1: Bryntum Gantt wrapper
│   │       ├── grid/
│   │       │   ├── CommandGrid.tsx      AG Grid: getRowId, masterDetail, grouping, status bar
│   │       │   ├── columns.ts           Column defs, value formatters (minor units → $)
│   │       │   ├── AuditDetailGrid.tsx  Detail rows: actor, endpoint, request id, debug_id, hash
│   │       │   └── renderers/
│   │       │       ├── StateChip.tsx
│   │       │       ├── GateBadge.tsx    Pass/fail with per-rule tooltip
│   │       │       ├── Countdown.tsx    Honor period / SLA / dispute due (one shared ticker)
│   │       │       ├── VerifyBadge.tsx  POSTBACK / OFFLINE / FAILED
│   │       │       └── RowActions.tsx   Approve hold · Ship · Deliver · Breach · Void · Evidence
│   │       └── styles/
│   │           └── theme.css            AG Grid theme params + app tokens
│   │
│   ├── api/                             Fastify server (Render web service)
│   │   ├── package.json
│   │   └── src/
│   │       ├── server.ts                Build app: plugins, routes, static UI, graceful shutdown
│   │       ├── config.ts                zod-parsed env (fails fast on missing vars)
│   │       ├── plugins/
│   │       │   ├── session.ts           Judge Mode session cookie
│   │       │   ├── csrf.ts              @fastify/csrf-protection
│   │       │   ├── rateLimit.ts         Per-route limits
│   │       │   ├── rawBody.ts           fastify-raw-body, Buffer, webhook route only
│   │       │   └── errors.ts            Maps domain errors → { error: { code, message, paypalDebugId } }
│   │       ├── routes/
│   │       │   ├── mandates.ts          parse, create, source
│   │       │   ├── orders.ts            list, audit, create (AUTHORIZE), authorize, ship, deliver, void
│   │       │   ├── disputes.ts          plan, submit
│   │       │   ├── demo.ts              reset, clock offset
│   │       │   ├── selfcheck.ts         probe results
│   │       │   ├── audit.ts             chain verify
│   │       │   ├── stream.ts            SSE: LISTEN aegis → replay from seq
│   │       │   ├── webhooks.ts          POST /webhooks/paypal (store + enqueue + 200)
│   │       │   └── health.ts            /healthz, /status
│   │       └── index.ts                 Entry: start server on PORT
│   │
│   └── worker/                          pg-boss consumers (Render background worker)
│       ├── package.json
│       └── src/
│           ├── index.ts                 Start boss, createQueue for each queue, register handlers, schedules
│           ├── queues.ts                Queue names + retry/expiry policy per queue
│           └── handlers/
│               ├── agentParse.ts        agent.parse → MandateDraft
│               ├── agentSource.ts       agent.source → snapshots, proposals, gate decisions
│               ├── webhookProcess.ts    verify → re-fetch → transition
│               ├── paymentCapture.ts    proof gate → capture → push tracking
│               ├── paymentVoid.ts
│               ├── paymentReauth.ts     P1
│               ├── slaWatch.ts          every minute: flag breaches
│               ├── pollOpen.ts          every 2 min: re-fetch open orders/disputes (webhook gap cover)
│               ├── disputeSync.ts       GET dispute → upsert → plan bundle
│               ├── disputeSubmit.ts     precondition check → multipart provide-evidence
│               └── selfcheck.ts         every 30 min: FR-13 probes
│
├── packages/
│   ├── core/                            Types and rules shared everywhere; zero I/O
│   │   └── src/
│   │       ├── money.ts                 Minor (bigint), parse/format USD, add/mul
│   │       ├── schemas.ts               zod: Mandate, Proposal, OrderRow, ApiError, SSE events
│   │       ├── order-state.ts           State enum + allowed-transition map
│   │       ├── canonical-json.ts        Stable stringify for hashing
│   │       ├── hash.ts                  sha256 helpers
│   │       └── errors.ts                DomainError codes (GATE_FAILED, AMOUNT_MISMATCH, …)
│   │
│   ├── gatekeeper/                      Pure policy engine (FR-03)
│   │   ├── src/
│   │   │   ├── evaluate.ts              evaluate(mandate, proposal, ctx) → Decision
│   │   │   ├── rules.ts                 R1–R11, one function each
│   │   │   └── types.ts
│   │   └── test/
│   │       ├── rules.test.ts            22 table cases
│   │       └── evaluate.property.test.ts  fast-check, 1,000 runs
│   │
│   ├── payments/                        ONLY package allowed to move money
│   │   ├── src/
│   │   │   ├── client.ts                Server SDK Client (Environment.Sandbox)
│   │   │   ├── token-vault.ts           client_credentials, Basic auth, single-flight refresh
│   │   │   ├── request-id.ts            Deterministic PayPal-Request-Id
│   │   │   ├── call.ts                  Wrapper: retries, debug_id capture, audit event
│   │   │   ├── orders.ts                createHold, authorizeHold, getOrder, pushTracking
│   │   │   ├── authorizations.ts        capture, void, reauthorize, getAuthorization
│   │   │   ├── refunds.ts               P1
│   │   │   ├── rest.ts                  Typed fetch for non-SDK APIs
│   │   │   ├── disputes.ts              get, list, provideEvidence (multipart), requireEvidence (sandbox)
│   │   │   ├── webhooks/
│   │   │   │   ├── verify-postback.ts   verify-webhook-signature
│   │   │   │   ├── verify-offline.ts    CRC32 + RSA-SHA256, cert allow-list + cache
│   │   │   │   └── simulate.ts          simulate-event (records event ids)
│   │   │   └── evidence/
│   │   │       ├── plan.ts              planEvidence(reason, facts)
│   │   │       └── pdf.ts               pdf-lib documents (mandate, fulfillment, snapshot, ledger)
│   │   └── test/
│   │       ├── verify-offline.test.ts
│   │       ├── plan.test.ts
│   │       └── sandbox.contract.test.ts  @sandbox: real PayPal calls
│   │
│   ├── agents/                          AI tasks; read-only toward PayPal
│   │   └── src/
│   │       ├── model.ts                 Provider + model from env (D6)
│   │       ├── toolkit.ts               PayPalAgentToolkit instances with scoped actions
│   │       ├── channel3.ts              search, product; cache; snapshot hashing
│   │       ├── prompts/                 Versioned prompt constants (parser, sourcing, drafter, defense)
│   │       ├── parse-mandate.ts
│   │       ├── source.ts
│   │       ├── draft-copy.ts
│   │       └── defense-notes.ts
│   │
│   └── db/
│       ├── migrations/
│       │   ├── 0001_init.sql            All tables from the Data model section
│       │   ├── 0002_audit_guard.sql     Append-only trigger, grants
│       │   └── 0003_indexes.sql
│       └── src/
│           ├── pool.ts                  pg Pool (DATABASE_URL, SSL on Render)
│           ├── migrate.ts               Runs migrations in order, records them
│           ├── audit.ts                 appendAudit(tx, event) with advisory lock + NOTIFY; verifyChain()
│           ├── orders.ts                Guarded transitions (state + row_version)
│           ├── mandates.ts · proposals.ts · disputes.ts · webhooks.ts · snapshots.ts
│           └── tx.ts                    withTransaction helper
│
├── scripts/
│   ├── seed.ts                          Products, one ACTIVE plan, supplier_profile, demo mandates; --reset
│   ├── seed-dispute-pool.ts             Captured small orders for dispute staging
│   ├── nightly.ts                       Cron entry: re-seed, pool upkeep, chain verify
│   ├── register-webhook.ts              Create/update webhook with explicit event list
│   ├── selfcheck.ts                     CLI version of the in-app probes
│   └── spike/                           Day 1 throwaway checks (O1–O6), deleted before submission
│
└── e2e/
    ├── playwright.config.ts             baseURL = deployed Render URL
    └── tests/
        ├── journey-a-golden.spec.ts     Includes the PayPal sandbox pop-up login
        ├── journey-b-breach.spec.ts
        └── journey-c-dispute.spec.ts
```

### Ownership by workstream

| Workstream | Folders | Suggested owner |
| --- | --- | --- |
| Money loop | `packages/payments`, `packages/db`, `apps/api/routes/{orders,webhooks}.ts`, worker payment handlers | Backend lead |
| Agents + gate | `packages/agents`, `packages/gatekeeper`, worker agent handlers | AI/backend |
| Command Center | `apps/web` | Frontend lead |
| Ops + proof | `render.yaml`, `scripts/`, `docs/`, `.github/`, `e2e/` | Whoever owns the video and submission |

## Module reference

**Each package exposes a small, typed surface; apps compose them and never reach into another package's internals.** Signatures below are the contract; implementations may add private helpers.

### Dependency graph

```mermaid
flowchart TB
  web[apps/web] --> core
  api[apps/api] --> core & gatekeeper & payments & db
  worker[apps/worker] --> core & gatekeeper & payments & agents & db
  agents --> core & db
  payments --> core & db
  gatekeeper --> core
  db --> core
  agents -. "FORBIDDEN (lint-enforced)" .-> payments
```

### `@aegis/core`

```ts
export type Minor = bigint;
export const usd: { parse(s: string): Minor; format(m: Minor): string; toPayPal(m: Minor): string };
export const OrderState: readonly ['GATED','REJECTED','AWAITING_APPROVAL','CANCELLED','HELD','IN_TRANSIT',
  'DELIVERED','SETTLED','FAILED','VOIDED','DISPUTED','EVIDENCE_SUBMITTED','RESOLVED_WON','RESOLVED_LOST','REFUNDED'];
export function canTransition(from: OrderState, to: OrderState): boolean;
export const schemas: { Mandate, MandateDraft, Proposal, OrderRow, AuditEvent, SseEvent, ApiError };   // zod
export function canonicalJson(v: unknown): string;
export function sha256Hex(s: string | Uint8Array): string;
export class DomainError extends Error { code: ErrorCode; details?: unknown; paypalDebugId?: string }
```

### `@aegis/gatekeeper`

```ts
export function evaluate(m: Mandate, p: Proposal, ctx: { now: string; spentSoFar: Minor }): Decision;
// Decision = { pass: boolean; results: RuleResult[] /* R1..R11, always all */; total: Minor; decisionSha256: string }
```

No imports outside `@aegis/core`; no `Date.now()`, no `fetch`, no environment access.

### `@aegis/payments`

```ts
// orders.ts
export function createHold(o: { orderRowId: string; proposal: Proposal; mandate: Mandate; decision: Decision; copy: OrderCopy }):
  Promise<{ paypalOrderId: string }>;
export function authorizeHold(orderRowId: string, paypalOrderId: string):
  Promise<{ authorizationId: string; expiresAt: string; honorEndsAt: string; payerId: string }>;
export function pushTracking(paypalOrderId: string, captureId: string, t: { carrier: string; trackingNumber: string; items: TrackItem[] }): Promise<void>;
// authorizations.ts
export function capture(orderRowId: string, authorizationId: string, amount: Minor): Promise<{ captureId: string; status: string }>;
export function voidHold(orderRowId: string, authorizationId: string): Promise<void>;
export function reauthorize(orderRowId: string, authorizationId: string, attempt: number): Promise<{ authorizationId: string }>;
// disputes.ts
export function getDispute(id: string): Promise<PayPalDispute>;
export function provideEvidence(id: string, input: EvidenceInput, files: EvidenceFile[]): Promise<void>;   // multipart input + file1..n
export function requireEvidence(id: string, action: 'SELLER_EVIDENCE' | 'BUYER_EVIDENCE'): Promise<void>; // sandbox only
// webhooks/
export function verifyPostback(evt: StoredWebhook): Promise<boolean>;
export function verifyOffline(evt: StoredWebhook, webhookId: 'WEBHOOK_ID' | string): Promise<boolean>;
export function simulateEvent(type: string, url: string): Promise<{ eventId: string }>;
// evidence/
export function planEvidence(reason: DisputeReason, facts: EvidenceFacts): EvidencePlan | { blocked: string[] };
export function renderPdfs(plan: EvidencePlan, facts: EvidenceFacts): Promise<EvidenceFile[]>;
```

Every exported function that POSTs to PayPal goes through `call.ts`, which adds `PayPal-Request-Id`, retries per policy, extracts `debug_id` from errors, and writes an `audit_event` (actor `system:payments`). Kill switch: if `PAYPAL_WRITES_ENABLED !== 'true'`, write functions throw `WRITES_DISABLED` before any network call.

### `@aegis/agents`

```ts
export function parseMandate(text: string): Promise<MandateDraft>;
export function source(m: Mandate): Promise<{ snapshotId: string; proposals: Proposal[]; rationale: Record<string, string> }>;
export function draftOrderCopy(p: Proposal): Promise<OrderCopy>;          // description ≤ 127 chars
export function draftDefenseNotes(facts: EvidenceFacts, plan: EvidencePlan): Promise<string>; // ≤ 2,000 chars
```

Toolkit instances are created with `configuration.context.sandbox = true` and the narrowest `actions` per task (for example `{ products: { list: true } }` for sourcing, `{ disputes: { get: true }, orders: { get: true } }` for defense).

### `@aegis/db`

```ts
export function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
export function appendAudit(tx: Tx, e: NewAuditEvent): Promise<{ seq: bigint; hash: string }>; // advisory lock + pg_notify
export function verifyChain(): Promise<{ ok: true; head: string } | { ok: false; firstBadSeq: bigint }>;
export function transition(tx: Tx, orderId: string, from: OrderState[], to: OrderState, patch?: Partial<OrderRow>):
  Promise<'APPLIED' | 'ALREADY_THERE' | 'CONFLICT'>;
```

### Worker queues

| Queue | Producer | Policy | Retry |
| --- | --- | --- | --- |
| `agent.parse` | API | standard | 1 |
| `agent.source` | API | singleton per mandate | 2 |
| `webhook.process` | API listener | singletonKey = event id | 3, backoff |
| `payment.capture` | API deliver route | singleton per order | 3, backoff, same request ID |
| `payment.void` | API / sla.watch | singleton per order | 3 |
| `payment.reauth` (P1) | schedule | singleton per order | 2 |
| `dispute.sync` / `dispute.submit` | webhook / UI | singleton per dispute | 3 / 2 |
| `sla.watch`, `poll.open`, `selfcheck` | `boss.schedule` cron | singleton | 0 |

pg-boss v10 and later require each queue to be created with `createQueue` before `send`/`work`, and `work` handlers receive an array of jobs ([pg-boss](https://timgit.github.io/pg-boss/api/queues)); `apps/worker/src/index.ts` creates all queues at startup.

## Data model

**Nine application tables plus a seeded lookup; `purchase_order` is the hub, `audit_event` is the append-only spine, and pg-boss keeps its own schema in the same database.** Full DDL lives in `packages/db/migrations/0001_init.sql` (abridged in the design doc §10).

```mermaid
erDiagram
  MANDATE ||--o{ PROPOSAL : "is evaluated against"
  CATALOG_SNAPSHOT ||--o{ PROPOSAL : "is sourced from"
  PROPOSAL ||--o| PURCHASE_ORDER : "becomes"
  PURCHASE_ORDER ||--o| FULFILLMENT : "is shipped as"
  PURCHASE_ORDER ||--o{ DISPUTE : "may receive"
  DISPUTE ||--o{ EVIDENCE_BUNDLE : "is answered by"
  SUPPLIER_PROFILE ||--o{ PROPOSAL : "provides lead time for"

  MANDATE {
    uuid id PK
    int version PK
    text status
    jsonb spec
    int quantity
    bigint unit_ceiling_minor
    bigint budget_minor
    char currency
    date deliver_by
    numeric min_rating
    text_array allowed_domains
    timestamptz expires_at
    char sha256
  }
  CATALOG_SNAPSHOT {
    uuid id PK
    char query_hash
    jsonb response
    char sha256
    timestamptz fetched_at
  }
  PROPOSAL {
    uuid id PK
    uuid mandate_id FK
    int mandate_version FK
    uuid snapshot_id FK
    text product_id
    text domain
    bigint unit_price_minor
    int quantity
    date eta
    boolean gate_pass
    jsonb gate_results
    char decision_sha256
  }
  PURCHASE_ORDER {
    uuid id PK
    uuid proposal_id FK
    text state
    bigint amount_minor
    text paypal_order_id UK
    text authorization_id
    text_array authorization_history
    text capture_id UK
    timestamptz honor_ends_at
    timestamptz auth_expires_at
    text approved_by
    int row_version
  }
  FULFILLMENT {
    uuid order_id PK, FK
    text carrier
    text tracking_number
    timestamptz delivered_at
    text source
    timestamptz pushed_to_paypal_at
  }
  DISPUTE {
    text paypal_dispute_id PK
    uuid order_id FK
    text reason
    text status
    text life_cycle_stage
    timestamptz seller_response_due
    jsonb links
    text outcome
  }
  EVIDENCE_BUNDLE {
    uuid id PK
    text dispute_id FK
    jsonb plan
    jsonb input_json
    jsonb files
    char sha256
    timestamptz submitted_at
  }
  WEBHOOK_EVENT {
    text event_id PK
    text event_type
    bytea raw_body
    jsonb headers
    text verified
    timestamptz processed_at
  }
  AUDIT_EVENT {
    bigserial seq PK
    timestamptz ts
    text actor
    text type
    text entity
    text entity_id
    jsonb payload
    text paypal_request_id
    text paypal_debug_id
    char prev_hash
    char hash
  }
  SUPPLIER_PROFILE {
    text domain PK
    int lead_time_min_days
    int lead_time_max_days
    numeric reliability
  }
```

`WEBHOOK_EVENT` and `AUDIT_EVENT` reference other rows by ID inside their payloads rather than by foreign keys, so they can never block a delete-and-reseed of demo data.

### Migrations

| File | Contents | Reversible |
| --- | --- | --- |
| `0001_init.sql` | All tables, check constraints, unique keys | Drop-all script for local only |
| `0002_audit_guard.sql` | `BEFORE UPDATE OR DELETE` trigger on `audit_event` raising an exception; revoke `TRUNCATE` from app role | No (by design) |
| `0003_indexes.sql` | `purchase_order(state)`, `(auth_expires_at)`, `dispute(status)`, `audit_event(entity, entity_id, seq)`, partial index on unprocessed webhooks | Yes |
| `0004_supplier_profile.sql` | Lookup table + seed rows for demo domains | Yes |

### Data rules

- Money: `bigint` minor units + `char(3)` currency; never `numeric` for amounts, never floats in code.
- Time: `timestamptz` everywhere; UI renders in the viewer's time zone; PayPal timestamps stored as received.
- IDs: UUID v7 for application rows (time-ordered); PayPal IDs stored as `text` with unique constraints.
- Retention: demo reset deletes demo rows but never `audit_event`; it appends a `DEMO_RESET` event instead.

## API reference

**Base URL is the Render web service (same origin as the UI); all `/api` routes take and return JSON validated by `@aegis/core` schemas, require the session cookie, and require `x-csrf-token` on POST.** Amounts in the API are strings of minor units (`"18000"` = $180.00) so bigints survive JSON.

### Endpoints

| Method | Path | Request body | Success response | Errors |
| --- | --- | --- | --- | --- |
| POST | `/api/mandates/parse` | `{ text: string (≤ 500) }` | `202 { jobId }`; draft arrives as SSE `mandate.draft` | `400 VALIDATION` |
| POST | `/api/mandates` | `MandateDraft` (confirmed) | `201 Mandate` (with `sha256`, `version: 1`) | `400`, `422 MANDATE_INVALID` |
| POST | `/api/mandates/:id/source` | `{}` | `202 { jobId }` | `409 MANDATE_NOT_ACTIVE` |
| GET | `/api/orders` | — | `200 OrderRow[]` | — |
| GET | `/api/orders/:id/audit` | — | `200 AuditEvent[]` | `404` |
| POST | `/api/proposals/:id/orders` | `{ decisionSha256 }` | `201 { orderId: string /* PayPal order id */ }` | `409 GATE_FAILED`, `409 DECISION_STALE`, `502 PAYPAL_ERROR` |
| POST | `/api/orders/:id/authorize` | `{ orderId }` | `200 OrderRow` (state HELD) | `409 ORDER_NOT_APPROVED`, `502` |
| POST | `/api/orders/:id/ship` | `{ carrier: ShipmentCarrier, trackingNumber: string }` | `200 OrderRow` (IN\_TRANSIT) | `409 BAD_STATE`, `400 CARRIER_UNKNOWN` |
| POST | `/api/orders/:id/deliver` | `{ deliveredAt?: string }` | `202 { jobId }` (capture queued) | `409 SLA_PASSED`, `409 BAD_STATE` |
| POST | `/api/orders/:id/void` | `{ reason: 'SLA_BREACH' \| 'CANCEL', confirm: true }` | `202 { jobId }` | `409 ALREADY_CAPTURED` |
| POST | `/api/disputes/:id/plan` | `{}` | `200 EvidenceBundlePreview` | `409 EVIDENCE_BLOCKED { missing[] }` |
| POST | `/api/disputes/:id/submit` | `{ bundleId, attest: true }` | `202 { jobId }` | `409 EVIDENCE_NOT_ALLOWED` (no `provide_evidence` link) |
| POST | `/api/demo/reset` | `{}` | `200 { ok: true }` | `403` if Judge Mode off |
| POST | `/api/demo/clock` | `{ offsetMinutes: number }` | `200 { offsetMinutes }` | `403` |
| GET | `/api/selfcheck` | — | `200 { probes: Probe[], checkedAt }` | `429` |
| GET | `/api/audit/verify` | — | `200 { ok, head }` or `{ ok: false, firstBadSeq }` | — |
| GET | `/api/stream` | — | `text/event-stream` | — |
| POST | `/webhooks/paypal` | PayPal event (raw) | `200 { received: true }` always | never non-2xx |
| GET | `/healthz` · `/status` | — | `200` | — |

### Core response shapes

```ts
type OrderRow = {
  id: string; mandateId: string; supplier: string; item: string; qty: number;
  unitPriceMinor: string; amountMinor: string; currency: 'USD';
  state: OrderState; gatePass: boolean; gateFailures: string[];
  paypalOrderId?: string; authorizationId?: string; captureId?: string;
  honorEndsAt?: string; authExpiresAt?: string; deliverBy: string;
  webhookVerification?: 'POSTBACK' | 'OFFLINE' | 'FAILED';
  dispute?: { id: string; reason: string; status: string; dueAt?: string };
  updatedAt: string;
};
type Probe = { name: 'token' | 'order' | 'webhook' | 'plan' | 'channel3' | 'db'; ok: boolean; ms: number; debugId?: string; detail?: string };
```

### SSE events

Each event is `id: <audit seq>`, `event: <type>`, `data: <json>`; heartbeat `: ping` every 15 s.

| `event` | `data` |
| --- | --- |
| `order.upsert` | `OrderRow` |
| `mandate.draft` | `MandateDraft` |
| `agent.step` | `{ task, step, tool?, summary, ms }` |
| `gate.decision` | `{ proposalId, pass, results: RuleResult[] }` |
| `webhook.verified` | `{ eventId, type, mode }` |
| `dispute.upsert` | `{ id, orderId, reason, status, dueAt }` |
| `selfcheck.result` | `{ probes: Probe[] }` |

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION` | 400 | Body failed zod schema |
| `GATE_FAILED` | 409 | Proposal did not pass every rule; `details` lists rules |
| `DECISION_STALE` | 409 | Mandate version changed since the decision |
| `AMOUNT_MISMATCH` | 409 | Recomputed total ≠ gate total; nothing sent to PayPal |
| `BAD_STATE` | 409 | Transition not allowed from current state |
| `SLA_PASSED` | 409 | Delivery recorded after `deliver_by`; void instead |
| `EVIDENCE_BLOCKED` / `EVIDENCE_NOT_ALLOWED` | 409 | Missing facts / PayPal not accepting evidence now |
| `WRITES_DISABLED` | 503 | Kill switch on |
| `PAYPAL_ERROR` | 502 | PayPal returned an error; `paypalDebugId` and PayPal `name` included |

## Configuration

**All configuration comes from environment variables, parsed once at startup by a zod schema in each app's `config.ts`; a missing or malformed variable stops the process with a clear message instead of failing at the first PayPal call.**

### Environment variables

| Variable | Used by | Required | Example / default | Notes |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | all | yes | `production` |  |
| `PORT` | api | Render sets | `8080` locally |  |
| `APP_URL` | api, worker | yes | `https://aegispay.onrender.com` | Used for PayPal return/cancel URLs (HTTPS) |
| `DATABASE_URL` | all | yes | from Blueprint | SSL required on Render |
| `PAYPAL_ENV` | api, worker | yes | `sandbox` | Selects base URL and SDK `Environment` |
| `PAYPAL_CLIENT_ID` | api, worker, web | yes | `A...` | Public; injected into the HTML at serve time |
| `PAYPAL_CLIENT_SECRET` | api, worker | yes | secret | Never logged; Render `sync: false` |
| `PAYPAL_WEBHOOK_ID` | worker | yes | `8PT...` | From `register-webhook.ts` output |
| `PAYPAL_WRITES_ENABLED` | api, worker | no | `true` | Kill switch for every money-moving call |
| `CHANNEL3_API_KEY` | worker | yes | secret | `x-api-key` header |
| `LLM_PROVIDER` / `LLM_MODEL` / `LLM_API_KEY` | worker | yes | team's choice | Read by `packages/agents/src/model.ts` |
| `AG_GRID_LICENSE_KEY` | web | no | key | Without it, Enterprise shows a watermark |
| `BRYNTUM_LICENSE` | web | no (P1) | — | Trial build shows a watermark |
| `SESSION_SECRET` | api | yes | 32+ random bytes | Signs the session cookie |
| `JUDGE_MODE` | api | no | `true` | Enables demo reset, clock control and banner |
| `SANDBOX_BUYER_EMAIL` / `SANDBOX_BUYER_PASSWORD` | api | Judge Mode | sandbox personal account | Shown on the banner; sandbox only |
| `ALERT_EMAIL` | worker, cron | no | team inbox | Self-check and pool alerts |
| `LOG_LEVEL` | all | no | `info` | `debug` locally |

### Feature flags

| Flag | Default | Effect |
| --- | --- | --- |
| `FEATURE_BRYNTUM` | `false` | Shows the Bryntum timeline panel (P1) |
| `FEATURE_REAUTH` | `false` | Enables the honor-period reauthorize schedule (P1) |
| `FEATURE_ELASTIC` | `false` | Contract clause retrieval for evidence (P1) |
| `FEATURE_POLL_FALLBACK` | `true` | 2-minute re-fetch of open orders/disputes |

### `.env.example` (committed)

```bash
NODE_ENV=development
PORT=8080
APP_URL=http://localhost:8080
DATABASE_URL=postgres://aegis:aegis@localhost:5432/aegis
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_WRITES_ENABLED=true
CHANNEL3_API_KEY=
LLM_PROVIDER=
LLM_MODEL=
LLM_API_KEY=
AG_GRID_LICENSE_KEY=
SESSION_SECRET=
JUDGE_MODE=true
SANDBOX_BUYER_EMAIL=
SANDBOX_BUYER_PASSWORD=
```

`.env` is git-ignored (a `/paypal:doctor` critical check), and `gitleaks` runs in CI to catch accidental commits.

## Local development and sandbox setup

**From a clean machine to a working local loop takes about 30 minutes; the only thing that cannot run purely locally is PayPal webhook delivery, which needs a public HTTPS URL (a tunnel, or the Render deployment).** PayPal requires listeners on HTTPS port 443 ([PayPal](https://developer.paypal.com/api/rest/webhooks/rest)).

### 1. Prerequisites

- Node.js 22 LTS (`nvm use` reads `.nvmrc`), Corepack enabled for pnpm.
- Docker (for local Postgres) or a local Postgres 16.
- A PayPal Developer account (free) with sandbox access; a Channel3 API key; an LLM API key.
- Optional: a tunnel tool (for example `cloudflared` or `ngrok`) to receive webhooks locally.

### 2. PayPal sandbox (once per team)

1. In the PayPal Developer Dashboard, open **Sandbox → Accounts**: keep the default Business account (the platform/supplier payee) and create two Personal accounts (buyers) with a **credit card funding source** (needed for chargeback-type disputes in sandbox).
2. **Apps & Credentials → Create App** (sandbox, Merchant type) linked to the Business account; copy Client ID and Secret.
3. Note the Personal account emails/passwords for Judge Mode.
4. After deploying (or starting a tunnel), run `pnpm tsx scripts/register-webhook.ts` to register the explicit event list and print `PAYPAL_WEBHOOK_ID`.

### 3. Clone, install, run

```bash
git clone https://github.com/<team>/aegispay && cd aegispay
nvm use && corepack enable
pnpm install
cp .env.example .env            # fill PayPal, Channel3, LLM, SESSION_SECRET

docker run -d --name aegis-pg -e POSTGRES_USER=aegis -e POSTGRES_PASSWORD=aegis \
  -e POSTGRES_DB=aegis -p 5432:5432 postgres:16

pnpm --filter db migrate
pnpm tsx scripts/seed.ts --reset   # products, ACTIVE plan, supplier profiles, demo mandates
pnpm dev                           # web :5173 (proxy) + api :8080 + worker, via turbo/concurrently
```

Open `http://localhost:5173`, toggle Judge Mode, and run Journey A. The PayPal pop-up uses the sandbox Personal account.

### 4. Webhooks locally (optional)

```bash
cloudflared tunnel --url http://localhost:8080      # prints https://<random>.trycloudflare.com
APP_URL=https://<random>.trycloudflare.com pnpm tsx scripts/register-webhook.ts --dev
# put the printed id in .env as PAYPAL_WEBHOOK_ID and restart the worker
pnpm tsx scripts/selfcheck.ts                        # token, $1 order, webhook config, ACTIVE plan
```

To test verification without real payments, use the simulator path: `pnpm tsx scripts/selfcheck.ts --simulate PAYMENT.CAPTURE.COMPLETED`.

### 5. Dispute pool (sandbox)

1. `pnpm tsx scripts/seed-dispute-pool.ts --count 10` creates small captured orders ($6–$9) paid by the sandbox buyer and prints their transaction IDs.
2. Log in to the sandbox site as the buyer and open "item not received" cases on several of them (or use the sandbox create-dispute API if the Day 1 spike confirms it).
3. Wait a few minutes, then run `pnpm tsx scripts/nightly.ts --pool-only` to sync disputes and move `UNDER_REVIEW` ones to `WAITING_FOR_SELLER_RESPONSE` via the sandbox-only `require-evidence` endpoint ([PayPal](https://developer.paypal.com/platforms/disputes/test-go-live)).
4. Note: a buyer cannot open two disputes on one transaction, so the pool must be topped up with new orders as judges use it.

### 6. Useful scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Runs web, api, worker with watch |
| `pnpm test` | Unit + property tests |
| `pnpm test:sandbox` | Contract tests against PayPal sandbox (needs creds) |
| `pnpm e2e` | Playwright against `E2E_BASE_URL` |
| `pnpm lint` / `pnpm typecheck` | Static checks incl. boundary rule |
| `pnpm tsx scripts/seed.ts --reset` | Reset demo data |
| `pnpm tsx scripts/selfcheck.ts` | Same probes as the in-app panel |

## Build, deploy and CI/CD

**`main` is always deployable: every push runs CI, Render auto-deploys `main` from the Blueprint with migrations in the pre-deploy step, and the submission is a git tag that is never moved.**

```mermaid
flowchart LR
  A[Push / PR] --> B[GitHub Actions ci.yml]
  B --> B1[typecheck + lint + boundaries]
  B --> B2[unit + property tests]
  B --> B3[gitleaks]
  B --> B4[build all workspaces]
  B1 & B2 & B3 & B4 --> C{all green?}
  C -- no --> X[block merge]
  C -- yes --> D[merge to main]
  D --> E[Render auto-deploy]
  E --> E1["build: pnpm install --frozen-lockfile, pnpm build"]
  E1 --> E2[preDeploy: migrate]
  E2 --> E3["start api + worker, health check /healthz"]
  E3 --> F[e2e.yml: Playwright vs Render URL]
  F --> G{Journeys A, B, C pass?}
  G -- yes --> H[tag submission-v1.0.0]
  G -- no --> I[fix forward on main]
```

### CI workflow (`.github/workflows/ci.yml`, abridged)

```yaml
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: aegis, POSTGRES_PASSWORD: aegis, POSTGRES_DB: aegis }
        ports: ['5432:5432']
    env:
      DATABASE_URL: postgres://aegis:aegis@localhost:5432/aegis
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: corepack enable && pnpm install --frozen-lockfile
      - run: pnpm typecheck && pnpm lint
      - run: pnpm --filter db migrate && pnpm test -- --coverage
      - uses: gitleaks/gitleaks-action@v2
      - run: pnpm build
```

Sandbox contract tests (`pnpm test:sandbox`) and Playwright (`e2e.yml`) run on manual dispatch and nightly, using repository secrets, so a PayPal sandbox hiccup never blocks a merge.

### Render deployment

| Step | Detail |
| --- | --- |
| Blueprint | `render.yaml` at repo root defines `aegispay-api` (web), `aegispay-worker` (worker), `aegispay-nightly` (cron) and `aegispay-db` (Postgres) ([Blueprint spec](https://render.com/docs/blueprint-spec)) |
| Plans | Paid instances: free web services sleep after 15 min, free Postgres expires after 30 days, workers/cron have no free tier ([Render](https://render.com/docs/free)) |
| Secrets | Entered once in the dashboard (`sync: false`) or via an environment group shared by all three services |
| Migrations | `preDeployCommand` runs `pnpm --filter db migrate`; a failed migration aborts the deploy |
| Health | Web health check on `/healthz`; worker writes a heartbeat row every minute shown on `/status` |
| Static UI | `apps/web` build output copied into `apps/api/public` and served by `@fastify/static` |

### Release and freeze

1. Before 11 Nov submission: run `/paypal:doctor full` and `security`, commit `docs/paypal-doctor.md`, tag `submission-v1.0.0`, link the tag in Devpost.
2. After the deadline: only infra keep-alive changes (secret rotation, plan, webhook re-registration); no feature commits.

## Engineering conventions

**Five rules matter more than style: money is bigint, PayPal writes go through `call.ts`, transitions go through `transition()`, every external effect writes an audit event, and nothing in `agents` can move money.** Everything else is enforced by Prettier and ESLint.

### Code rules

| Area | Rule | Enforced by |
| --- | --- | --- |
| Types | `strict: true`, `noUncheckedIndexedAccess`, no `any` outside generated code | tsconfig, ESLint |
| Money | `Minor = bigint`; convert to PayPal strings only in `usd.toPayPal`; never `Number` for amounts | ESLint `no-restricted-syntax` on `parseFloat` in payments/gatekeeper |
| Boundaries | `agents` must not import `payments` or `@paypal/paypal-server-sdk`; `gatekeeper` imports only `core` | `eslint-plugin-boundaries` |
| Time | No `Date.now()` in `gatekeeper`; elsewhere use `clock.now()` so Judge Mode offsets apply to SLA logic only | Code review + lint |
| Errors | Throw `DomainError(code)`; never return error strings; include `paypalDebugId` when PayPal is involved | Type of error handler |
| PayPal POSTs | Only through `payments/src/call.ts` (request ID, retries, audit) | Lint: direct `fetch` to `paypal.com` forbidden outside `payments` |
| State | Only `db.transition()` changes `purchase_order.state` | SQL review; unit test that grep finds no other `update purchase_order set state` |
| Logging | JSON logs via pino; redact `authorization`, `client_secret`, `access_token`, `password` | Logger config + test |
| Prompts | Prompts are constants in `agents/src/prompts/`, versioned, hash logged per run | Review |
| Secrets | Never in code, tests, fixtures or screenshots | gitleaks, doctor security |

### Naming

- Files: `kebab-case.ts` in packages; `PascalCase.tsx` for React components.
- Queues: `noun.verb` (`payment.capture`, `dispute.submit`).
- Audit event types: `SCREAMING_SNAKE` (`HOLD_CREATED`, `CAPTURE_SUCCEEDED`, `WEBHOOK_VERIFIED`, `GATE_DECISION`).
- Env vars: `SCREAMING_SNAKE`, prefixed by provider (`PAYPAL_`, `CHANNEL3_`, `LLM_`).

### Git workflow

- Trunk-based: short branches (`feat/`, `fix/`, `chore/`), PR with at least one reviewer, squash merge.
- Conventional commit messages; the PR template has a checkbox "does this touch money movement?" that requires the payments owner's review.
- No force-push to `main`; the submission tag is immutable.

## Testing guide

**Fast tests run on every push with PayPal mocked at the HTTP layer; real sandbox and browser tests run nightly and before the P0 gate, because only they prove the judge-facing loop works.**

| Suite | Location | Command | Runs | Target |
| --- | --- | --- | --- | --- |
| Unit | `packages/*/test/*.test.ts` | `pnpm test` | every push | gatekeeper 100% branches; payments ≥ 85% lines |
| Property | `*.property.test.ts` | `pnpm test` | every push | 1,000 runs, 0 violations |
| Integration (DB) | `apps/*/test/*.int.test.ts` | `pnpm test` (CI Postgres) | every push | Transitions, audit chain, webhook de-dupe |
| Contract (sandbox) | `packages/payments/test/sandbox.contract.test.ts` | `pnpm test:sandbox` | nightly + manual | create → authorize → capture; void; idempotent repeat |
| E2E | `e2e/tests/*.spec.ts` | `pnpm e2e` | nightly + before gate | Journeys A, B, C on the Render URL |

### Mocking strategy

- The PayPal Server SDK sends requests through an Axios adapter (`@apimatic/axios-client-adapter`), so its calls are mocked with `nock` (which intercepts Node's `http` module); the `fetch`-based REST client and Channel3 are mocked with Undici's `MockAgent`. Fixtures are recorded real sandbox responses with IDs scrubbed.
- The mock recorder asserts *which* endpoints were called: for example a `GATE_FAILED` path must record zero PayPal POSTs.
- LLM calls use a fake model returning fixed structured outputs; one test feeds a prompt-injection string in a product title and asserts the sourcing output is still schema-valid and no write tool exists in the tool list.

### Must-have test cases

| # | Case | Assertion |
| --- | --- | --- |
| T1 | Unit price 1 cent over ceiling | R3 fails, no order created |
| T2 | Capture retried after network error | Same `PayPal-Request-Id`; one capture in sandbox |
| T3 | Duplicate webhook event | One `webhook_event` row; one transition |
| T4 | Tampered webhook body | Verification FAILED; state unchanged |
| T5 | Simulator event | Verified offline with `WEBHOOK_ID`; postback not called |
| T6 | Capture webhook races capture job | Exactly one SETTLED transition |
| T7 | SLA passes before delivery | Delivery endpoint returns `SLA_PASSED`; void path available |
| T8 | Dispute without `provide_evidence` link | Submit returns `EVIDENCE_NOT_ALLOWED` |
| T9 | INR dispute with tracking | Plan = `PROOF_OF_FULFILLMENT` with `tracking_info` |
| T10 | Audit row edited (superuser) | `verify` returns that `seq` |
| T11 | Token expired | One refresh under 20 concurrent calls |
| T12 | Kill switch off | Every write throws `WRITES_DISABLED` before network |

### Playwright and the PayPal pop-up

- The approval opens a PayPal-hosted window; tests use `context.waitForEvent('page')`, log in with the sandbox buyer from secrets, approve, and wait for the grid row to show HELD via SSE.
- Sandbox UI can change; keep selectors in one helper (`e2e/tests/paypal-popup.ts`) and fail with a screenshot artifact.
- E2E never runs against production credentials; `PAYPAL_ENV` must equal `sandbox` or the suite aborts.

## Observability and troubleshooting

**Every request, job and PayPal call carries three IDs — our `requestId`, the `PayPal-Request-Id` we sent, and PayPal's `debug_id` — so any failure seen in the grid can be traced to a log line and to PayPal support in one step.**

### What is recorded where

| Signal | Where | Retention |
| --- | --- | --- |
| Structured logs (pino JSON) | Render log stream per service | Render's log retention |
| Business events | `audit_event` (hash-chained) | Permanent |
| Raw webhooks | `webhook_event` (`raw_body`, headers, verification mode, error) | Permanent for the event |
| Job status | pg-boss tables | pg-boss retention defaults |
| Health | `/healthz` (liveness), `/status` (self-check, last webhook, worker heartbeat, pool size, audit head) | Live |

### Status page fields

`last_selfcheck_at` and per-probe result · `last_webhook_at` and type · `worker_heartbeat_at` · `dispute_pool_usable` · `audit_head_hash` · `paypal_writes_enabled` · build commit SHA.

### Troubleshooting

| Symptom | Check | Fix |
| --- | --- | --- |
| `401` from PayPal | Self-check token probe; `PAYPAL_CLIENT_ID/SECRET` | Re-copy credentials from the sandbox app; restart services |
| Webhooks not arriving | `/status` last webhook; PayPal dashboard webhook event list | Re-run `register-webhook.ts`; confirm HTTPS URL; update `PAYPAL_WEBHOOK_ID` |
| Webhook verification FAILED for live events | `webhook_event.headers`, raw body intact? | Ensure the route keeps the raw Buffer (`fastify-raw-body` with `encoding: false`, `runFirst: true`) and the postback sends the event exactly as received |
| Simulator events fail offline check | Event ID recorded by `simulate.ts`? | Verify with `WEBHOOK_ID`, CRC32 unsigned decimal over raw bytes |
| Capture `422 AUTHORIZATION_EXPIRED` | `honor_ends_at`, `auth_expires_at` | Reauthorize inside 29 days (P1), else void and re-approve |
| Capture `422` other | PayPal `name` + `debug_id` in the row | Read the issue; do not retry the same instrument |
| Grid not updating | Browser devtools EventSource; `/api/stream` heartbeat | Check `LISTEN aegis` connection; SSE reconnects with `Last-Event-ID` |
| Dispute cannot be answered | Dispute `links` lacks `provide_evidence` | Wait or move it with sandbox `require-evidence`; use another pooled dispute |
| Agent job fails | `agent.step` events; job error | Check `LLM_*` vars and provider status; Judge Mode falls back to cached shortlist |
| AG Grid watermark | Licence key present and unexpired? | Set `AG_GRID_LICENSE_KEY`; redeploy web |
| Render deploy fails at pre-deploy | Migration output | Fix SQL; migrations are forward-only on Render |

### Alerting

The worker emails `ALERT_EMAIL` when: any self-check probe is red twice in a row; the dispute pool drops below 3; the audit chain fails verification; no webhook has arrived for 24 hours during 1–15 Dec. An external uptime monitor covers the case where the worker itself is down.

## Implementation checklist and definition of done

**Work top to bottom; a box is ticked only when its code is merged to `main`, deployed to Render, and its test passes there.** Dates follow the PRD build plan (IST).

### Day 1 — Thu 5 / Fri 6 Nov: foundation and spikes

- [ ] Repo scaffold per File structure; `LICENSE`, `.env.example`, CI green on an empty build
- [ ] Render Blueprint deployed on paid plans; `/healthz` live on the public URL
- [ ] Sandbox accounts and app created; credentials in Render; webhook registered
- [ ] Spike O1: agent toolkit + pinned AI SDK version compatible (or wrapper decided)
- [ ] Spike O2/O3: sandbox dispute path yields `provide_evidence`; dispute webhooks arrive
- [ ] Spike O4: token has authorization and disputes scopes
- [ ] Migrations 0001–0004 applied; `seed.ts --reset` works

### Day 2–3 — 6–8 Nov: money loop

- [ ] `token-vault.ts`, `request-id.ts`, `call.ts` with retries and audit
- [ ] `createHold` / `authorizeHold` + JS SDK v6 button → HELD row
- [ ] `capture` with proof gate, then `pushTracking`; `voidHold`
- [ ] Webhook listener + `webhook.process` (postback + offline + re-fetch)
- [ ] `appendAudit` with hash chain + NOTIFY; `verifyChain`
- [ ] Contract tests T2, T3, T5 green against sandbox

### Day 3–4 — 7–9 Nov: agents, gate, grid, disputes

- [ ] Gatekeeper R1–R11 with table + property tests (100% branches)
- [ ] Channel3 client with snapshot hashing and cache; sourcing agent → proposals → decisions
- [ ] Mandate parser agent and MandateStrip UI
- [ ] CommandGrid: SSE transactions, master-detail audit, renderers, actions
- [ ] Evidence planner, PDF rendering, `provideEvidence` multipart; EvidenceReviewModal
- [ ] Dispute pool seeded (≥ 5 usable); Judge Mode banner, reset, clock control
- [ ] **P0 gate:** Journeys A, B, C pass 3× in a row on the Render URL

### Day 5 — 10 Nov: P1 (only if the gate passed)

- [ ] Bryntum timeline with drag-to-breach → void prompt
- [ ] Reauthorize schedule (`FEATURE_REAUTH`)
- [ ] Typed Disputes client generated with APIMatic; README section on APIMatic usage
- [ ] Postman collection + environment in `docs/postman`

### Day 5–6 — 10–11 Nov: hardening and submission

- [ ] `/paypal:doctor full` and `security`: 0 critical; report committed
- [ ] README: pitch, live URL, Judge Mode creds, quickstart, architecture (Mermaid), PayPal API table with file paths, AI tools statement
- [ ] Uptime monitor + alert email; nightly cron verified
- [ ] Video recorded (2:40–2:55), public on YouTube
- [ ] Devpost submitted; tag `submission-v1.0.0`; logged-out check of submission page and video

### Definition of done (per feature)

| Criterion | Applies to |
| --- | --- |
| Typed, linted, boundary rule passes | All code |
| Unit tests for logic; property tests for gatekeeper and money | Packages |
| Writes an `audit_event` for every external effect, with `paypal_debug_id` where relevant | Payments, webhooks, agents |
| Works on the deployed URL in Judge Mode, not just locally | Every user-visible feature |
| No secret in code, logs, fixtures, screenshots | All |
| Documented in README if a judge would look for it | PayPal integrations, sponsor tools, AI usage |

## Sources

Checked 5 Nov 2026. Companion documents: *AegisPay — Product Requirements Document* and *AegisPay — Technical Design Document*. SDK method names were read directly from the published `@paypal/paypal-server-sdk` 2.5.0 package type definitions.

- [PayPal: authorize and capture (29-day validity, 3-day honor period)](https://developer.paypal.com/docs/checkout/standard/customize/authorization/)
- [PayPal Orders v2 SDK reference](https://developer.paypal.com/sdk/orders/v2) and [add tracking (requires captured order)](https://developer.paypal.com/api/orders-v2/track-orders/use)
- [PayPal Server SDK: capture authorized payment sample](https://developer.paypal.com/sdk/payment/v2/authorizations-capture)
- [PayPal JS SDK v6 set up](https://developer.paypal.com/sdk/js/set-up.md) and [v4 → v6 migration](https://developer.paypal.com/v4-v6)
- [PayPal webhooks: verification, simulator, retries](https://developer.paypal.com/api/rest/webhooks/rest)
- [PayPal Disputes API guide](https://developer.paypal.com/platforms/disputes/handle-disputes/use-disputes-api), [test and go live](https://developer.paypal.com/platforms/disputes/test-go-live), [supported file types and sizes](https://developer.paypal.com/platforms/disputes/reference/supported-file-types-sizes.md)
- [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit) and [`/paypal:doctor`](https://github.com/paypal/AI-Toolkit/blob/main/commands/doctor.md)
- [Channel3 search API](https://channel3.ai/docs/api-reference/v1/search.md)
- [pg-boss queues API](https://timgit.github.io/pg-boss/api/queues)
- [fastify-raw-body](https://github.com/Eomm/fastify-raw-body)
- [AG Grid release notes v36.1](https://www.ag-grid.com/archive/36.1.0/whats-new/) and [licensing](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise.md)
- [Render Blueprint spec](https://render.com/docs/blueprint-spec), [free tier limits](https://render.com/docs/free), [pricing](https://render.com/pricing)
