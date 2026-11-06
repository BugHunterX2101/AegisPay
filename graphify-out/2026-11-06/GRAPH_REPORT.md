# Graph Report - AegisPay  (2026-11-05)

## Corpus Check
- 86 files · ~60,635 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .tsbuildinfo 1)

## Summary
- 945 nodes · 1985 edges · 49 communities (46 shown, 3 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 68 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Authorization Hold (Orders v2 intent AUTHORIZE)
- Decision Record D1-D13
- Channel3 (sourcing catalog API/MCP)
- P0 Scope (FR-01 to FR-14)
- Web Package Manifest
- API Package Manifest
- Root Workspace Config
- Worker Package Manifest
- Agents Package Manifest
- Payments Package Manifest
- Dispute Evidence Assembly
- DomainError
- TypeScript Base Config
- Hash-Chained Audit Log (FR-11)
- SLA Breach Void (FR-07)
- Verified Webhook Ingestion (FR-08)
- DB Package Manifest
- webhooks.test.ts
- db/src/orders.ts
- Core Package Manifest
- Gatekeeper Package Manifest
- db/test/orders.test.ts
- vitest
- audit.ts
- schemas.ts
- API endpoint reference
- Workspace Overrides
- refund-dispute.test.ts
- client.ts
- TS Project Config
- order-state.test.ts
- rules.ts
- Postman Partner
- Deterministic Mandate Gatekeeper (FR-03)
- Testing and Verification Strategy
- paypal-server.ts
- Agent Boundary / Least Privilege
- Clock
- CLAUDE.md
- Proof-Gated Capture (FR-06)
- Payment Service (only path to money-moving endpoints)
- clock.ts
- Must-have test cases T1-T12
- pool.ts
- @aegis/payments package
- TokenVault
- @paypal/agent-toolkit (read tools)
- refunds.ts
- AegisPay

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 41 edges
2. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
3. `Hash-Chained Audit Log (FR-11)` - 31 edges
4. `Dispute Evidence Assembly` - 29 edges
5. `Verified Webhook Ingestion (FR-08)` - 29 edges
6. `Agent Boundary / Least Privilege` - 29 edges
7. `withTx()` - 25 edges
8. `Authorization Hold (Orders v2 intent AUTHORIZE)` - 25 edges
9. `vitest` - 24 edges
10. `Proof-Gated Capture (FR-06)` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Hash-Chained Audit Log (FR-11)` --semantically_similar_to--> `SQL migrations 0001-0004`  [INFERRED] [semantically similar]
  docs/spec/AegisPay — Product Requirements Document.md → docs/spec/AegisPay — Technical Documentation.md
- `row_version Optimistic Locking` --semantically_similar_to--> `Hash-Chained Audit Log (FR-11)`  [INFERRED] [semantically similar]
  docs/spec/AegisPay — Technical Design Document.md → docs/spec/AegisPay — Product Requirements Document.md
- `AI_TOOLS.md and honesty/disclosure` --conceptually_related_to--> `Agent Boundary / Least Privilege`  [INFERRED]
  docs/spec/AegisPay — Technical Documentation.md → docs/spec/AegisPay — Product Requirements Document.md
- `refund()` --calls--> `uuidv7()`  [EXTRACTED]
  packages/db/test/refund-dispute.test.ts → packages/db/src/ids.ts
- `tamper()` --calls--> `withTx()`  [EXTRACTED]
  packages/db/test/audit.test.ts → packages/db/src/pool.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Webhook-to-Evidence Dispute Defense Flow** — concept_webhook_pipeline, docs_spec_aegispay_product_requirements_document_fr09_dispute_defense_agent, docs_spec_aegispay_product_requirements_document_dispute_reason_evidence_mapping, docs_spec_aegispay_product_requirements_document_evidence_bundle, concept_dispute_evidence [EXTRACTED 0.95]
- **Hold-to-capture money loop** — concept_gatekeeper, concept_auth_hold, concept_capture_gate, docs_spec_aegispay_technical_documentation_order_tracking, docs_spec_aegispay_technical_documentation_human_approval [EXTRACTED 0.95]
- **Authorize-Verify-Capture/Void Money Loop** — concept_gatekeeper, concept_auth_hold, concept_capture_gate, concept_sla_void, concept_order_state_machine [EXTRACTED 0.95]
- **Webhook store, verify, re-fetch, transition** — concept_webhook_pipeline, docs_spec_aegispay_technical_documentation_verify_postback, docs_spec_aegispay_technical_documentation_verify_offline, docs_spec_aegispay_technical_documentation_tbl_webhook_event, concept_order_state_machine [EXTRACTED 0.95]
- **Authorize-Hold-Capture-or-Void Money Loop** — concept_gatekeeper, docs_spec_aegispay_technical_design_document_order_payload, concept_auth_hold, concept_capture_gate, concept_sla_void [EXTRACTED 1.00]
- **Webhook Ingest, Verify, Re-fetch, Apply Flow** — docs_spec_aegispay_technical_design_document_webhook_listener, docs_spec_aegispay_technical_design_document_table_webhook_event, docs_spec_aegispay_technical_design_document_webhook_verification, docs_spec_aegispay_technical_design_document_webhook_processor, concept_order_state_machine [EXTRACTED 1.00]
- **Layered Agent Safety Controls** — concept_agent_boundary, concept_gatekeeper, concept_kill_switch, docs_spec_aegispay_product_requirements_document_prompt_injection_containment, docs_spec_aegispay_product_requirements_document_deterministic_money_math [INFERRED 0.85]
- **Agents-Cannot-Pay Enforcement Layers** — concept_agent_boundary, docs_spec_aegispay_technical_design_document_dependency_rules, concept_gatekeeper, docs_spec_aegispay_technical_design_document_decision_hash, concept_kill_switch [INFERRED 0.85]
- **Money-movement safety controls** — concept_agent_boundary, concept_kill_switch, docs_spec_aegispay_technical_documentation_call_wrapper, docs_spec_aegispay_technical_documentation_boundary_lint, docs_spec_aegispay_technical_documentation_idempotency [INFERRED 0.85]

## Communities (49 total, 3 thin omitted)

### Community 0 - "Authorization Hold (Orders v2 intent AUTHORIZE)"
Cohesion: 0.14
Nodes (20): Authorization Hold (Orders v2 intent AUTHORIZE), PayPal Orders v2 API, Compliance and Honesty (no 'escrow' wording, AI disclosure), FR-16 Auto-Reauthorize (P1), Journey A: Golden Path (mandate to capture), Operating Model: two-sided procurement platform, merchant of record in sandbox, PayPal Authorization Rules (29-day validity, 3-day honor, reauthorize), PayPal JS SDK v6 Checkout (+12 more)

### Community 1 - "Decision Record D1-D13"
Cohesion: 0.18
Nodes (20): AG Grid Enterprise Configuration, apps/api (Fastify REST, SSE, webhook listener), apps/web (React + Vite UI), apps/worker (pg-boss consumers), CommandGrid / AuditDetailGrid, Cost Through Judging (~$40), Decision Record D1-D13, Dispute Pipeline (ingest, sync, plan, draft, build, review, submit, track) (+12 more)

### Community 2 - "Channel3 (sourcing catalog API/MCP)"
Cohesion: 0.11
Nodes (26): Channel3 (sourcing catalog API/MCP), Mandate, Proposal, Data Model (six tables), Evidence Bundle, FR-01 Mandate Builder, FR-02 Sourcing Agent (read-only), PayPal Disputes API (provide-evidence, require-evidence) (+18 more)

### Community 3 - "P0 Scope (FR-01 to FR-14)"
Cohesion: 0.11
Nodes (26): AegisPay - Product Requirements Document, AG Grid (sponsor), Build Plan to the Deadline (5-12 Nov), FR-05 Fulfillment Tracking, FR-10 Command Center Grid (AG Grid), FR-12 Judge Mode, Hackathon Deadline (12 Nov 2026 12PM PST), Judging Stage One (pass/fail) (+18 more)

### Community 4 - "Web Package Manifest"
Cohesion: 0.07
Nodes (36): dependencies, ag-grid-community@^36.3.0, ag-grid-enterprise@^36.3.0, ag-grid-react@^36.3.0, @paypal/paypal-js@^11.3.0, react@^19.3.1, react-dom@^19.3.1, @tanstack/react-query@^5.105.3 (+28 more)

### Community 5 - "API Package Manifest"
Cohesion: 0.08
Nodes (32): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/payments@workspace:*, fastify@5.12.8, @fastify/cookie@11.1.5, @fastify/csrf-protection@8.0.2 (+24 more)

### Community 6 - "Root Workspace Config"
Cohesion: 0.05
Nodes (41): description, devDependencies, concurrently@^10.0.6, fast-check@^4.10.2, tsx@^4.23.15, @types/node@^26.6.6, @types/pg@^8.23.1, typescript@^7.0.2 (+33 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (22): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/payments@workspace:*, pg-boss@12.38.0, zod@4.6.7 (+14 more)

### Community 8 - "Agents Package Manifest"
Cohesion: 0.13
Nodes (20): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, ai@7.0.163, @ai-sdk/anthropic@4.0.97, @paypal/agent-toolkit@1.11.0, tslib@^2.9.1, zod@4.6.7 (+12 more)

### Community 9 - "Payments Package Manifest"
Cohesion: 0.14
Nodes (17): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, @paypal/paypal-server-sdk@2.5.0, pdf-lib@1.17.1, zod@4.6.7, exports (+9 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.20
Nodes (14): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, Elastic (partner, no prize), FR-09 Dispute Defense Agent, FR-17 Contract Clause Retrieval (P1), Journey C: Dispute Defense, Persona: Meera, Finance & Disputes, Traceability to PRD (FR-01..FR-20) (+6 more)

### Community 11 - "DomainError"
Cohesion: 0.06
Nodes (70): DomainError, appendAudit(), getFulfillment(), getOrder(), recordPayPalOrderId(), recordReauthorization(), toOrder(), transition() (+62 more)

### Community 12 - "TypeScript Base Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+7 more)

### Community 13 - "Hash-Chained Audit Log (FR-11)"
Cohesion: 0.15
Nodes (19): Hash-Chained Audit Log (FR-11), appendAudit(tx, event) with advisory lock, Append-only Trigger and No TRUNCATE Grant, Postgres LISTEN/NOTIFY Feed, Migrations and Demo Reset, Prompt and Safety Rules, Table audit_event, Alerting rules (+11 more)

### Community 14 - "SLA Breach Void (FR-07)"
Cohesion: 0.14
Nodes (16): SLA Breach Void (FR-07), Bryntum (sponsor), FR-15 Bryntum Timeline (P1), Journey B: SLA Breach (hold to void), Demo Clock Offset (/api/demo/clock), Sandbox Dispute Pool, Error Shape with paypalDebugId, Judge Mode UX (+8 more)

### Community 15 - "Verified Webhook Ingestion (FR-08)"
Cohesion: 0.10
Nodes (27): Kill Switch, Verified Webhook Ingestion (FR-08), Webhook Events Handled, Session Cookie and CSRF Controls, Offline RSA-SHA256 + CRC32 Verification, Postback verify-webhook-signature, Secrets and Environment Variables, simulate-event Testing (+19 more)

### Community 16 - "DB Package Manifest"
Cohesion: 0.17
Nodes (12): dependencies, @aegis/core@workspace:*, pg@8.23.1, exports, ./testing, @aegis/core, name, private (+4 more)

### Community 17 - "webhooks.test.ts"
Cohesion: 0.06
Nodes (35): Money as bigint Minor Units, ErrorCode, HTTP_STATUS, minorFromString(), minorToString(), usd, isSimulatedEvent(), CERT_HOSTS (+27 more)

### Community 18 - "db/src/orders.ts"
Cohesion: 0.15
Nodes (14): RFC-9562, OrderState, FulfillmentDbRow, FulfillmentRow, OrderDbRow, OrderPatch, OrderRow, PATCHABLE (+6 more)

### Community 19 - "Core Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, zod@4.6.7, exports, zod, name, private, type, version

### Community 20 - "Gatekeeper Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, @aegis/core@workspace:*, exports, @aegis/core, name, private, type, version

### Community 21 - "db/test/orders.test.ts"
Cohesion: 0.62
Nodes (6): uuidv7(), insertOrder(), seedProposal(), newOrder(), settledOrder(), seedGatedOrder()

### Community 22 - "vitest"
Cohesion: 0.20
Nodes (10): MIGRATIONS_DIR, createPool(), freshDb(), TEST_URL, TestDb, tamper(), cleanup, emptySchemaPool() (+2 more)

### Community 23 - "audit.ts"
Cohesion: 0.22
Nodes (9): sha256Hex(), ZERO_HASH, AUDIT_LOCK_KEY, AUDIT_NOTIFY_CHANNEL, auditHash(), AuditRow, ChainResult, NewAuditEvent (+1 more)

### Community 24 - "schemas.ts"
Cohesion: 0.11
Nodes (18): ApiError, ApiErrorSchema, CARRIERS, CreateMandateBody, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate (+10 more)

### Community 25 - "API endpoint reference"
Cohesion: 0.43
Nodes (7): AG Grid Command Center UI, API endpoint reference, apps/api Fastify server, apps/web React Command Center, API error codes, PayPal JS SDK v6, SSE event stream

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "refund-dispute.test.ts"
Cohesion: 0.16
Nodes (20): BundleDbRow, DisputeDbRow, DisputeLink, DisputeRow, DisputeUpsert, EvidenceBundleRow, EvidenceFile, findOrderIdByCaptureId() (+12 more)

### Community 28 - "client.ts"
Cohesion: 0.29
Nodes (12): Db, CallDeps, CreateContextOptions, createPayPalContext(), PayPalContext, sameOrigin(), assertSandboxBaseUrl(), loadPayPalConfig() (+4 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): ./tsconfig.base.json, exclude, extends, include

### Community 30 - "order-state.test.ts"
Cohesion: 0.31
Nodes (6): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, TERMINAL_STATES

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (45): canonicalJson(), normalize(), Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS (+37 more)

### Community 33 - "Deterministic Mandate Gatekeeper (FR-03)"
Cohesion: 0.16
Nodes (16): Deterministic Mandate Gatekeeper (FR-03), Deterministic Money Math, Prompt-Injection Containment, AMOUNT_MISMATCH Check, Decision SHA-256 Hash, evaluate(mandate, proposal, context) -> Decision, Gatekeeper Tests (table, property, money, 100% branch coverage), Mandate/Proposal/Context/Decision Types (+8 more)

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.17
Nodes (16): Static and Compliance CI Checks, PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests, P0 Gate Manual Acceptance (+8 more)

### Community 35 - "paypal-server.ts"
Cohesion: 0.10
Nodes (20): CLIENT_ID, CLIENT_SECRET, Harness, OffsetClock, SeededOrder, SeedOptions, startHarness(), OAuthServer (+12 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.24
Nodes (14): Agent Boundary / Least Privilege, Product Thesis: AI as orchestrator, not unbounded spender, Defense Agent, Order Drafter Agent, Mandate Parser Agent, Package Dependency Rules (eslint-plugin-boundaries), @paypal/paypal-server-sdk (APIMatic-generated), packages/agents (AI SDK agents, Channel3 client) (+6 more)

### Community 37 - "Clock"
Cohesion: 0.19
Nodes (8): Clock, REFRESH_WINDOW_MS, Token, tokenResponse, TokenVaultOptions, OfflineInput, MutableClock, vault()

### Community 39 - "Proof-Gated Capture (FR-06)"
Cohesion: 0.23
Nodes (12): Proof-Gated Capture (FR-06), Order Lifecycle State Machine, Non-Claims: not legal safety, delivery simulated, External Dependencies and Fallbacks, Gap Protection Polling (every 2 minutes), row_version Optimistic Locking, Table fulfillment, Table purchase_order (+4 more)

### Community 40 - "Payment Service (only path to money-moving endpoints)"
Cohesion: 0.20
Nodes (12): Agent Worker (Vercel AI SDK + Agent Toolkit), APIMatic (sponsor), FR-13 Self-Check Panel, FR-14 OAuth Token Vault, FR-18 Typed PayPal Clients via APIMatic (P1), Payment Service (only path to money-moving endpoints), PayPal Agent Toolkit, /paypal:doctor Checks (+4 more)

### Community 41 - "clock.ts"
Cohesion: 0.23
Nodes (5): addDays(), DAY_MS, FixedClock, OffsetClock, systemClock

### Community 42 - "Must-have test cases T1-T12"
Cohesion: 0.10
Nodes (21): AegisPay Technical Documentation, AI_TOOLS.md and honesty/disclosure, apps/worker pg-boss consumers, Three-process architecture on Render, CI/CD pipeline (GitHub Actions, gitleaks, Playwright), Definition of done, Demo journeys A (golden), B (breach), C (dispute), Implementation checklist (Day 1 to Day 6) (+13 more)

### Community 43 - "pool.ts"
Cohesion: 0.24
Nodes (7): migrate(), MigrationResult, sha(), closePool(), getPool(), PoolOptions, types

### Community 44 - "@aegis/payments package"
Cohesion: 0.18
Nodes (11): PayPal Agent Toolkit (scoped read-only actions), Evidence PDFs (pdf-lib) and defense notes, PayPal Disputes v1 API, PayPal Payments v2 (authorizations, captures), PayPal Server SDK 2.5.0 plus typed REST client, PayPal Webhooks v1, @aegis/agents package, @aegis/core package (+3 more)

### Community 46 - "@paypal/agent-toolkit (read tools)"
Cohesion: 0.31
Nodes (9): @paypal/agent-toolkit (read tools), Agent Toolkit / AI SDK Compatibility Spike, Day 1 Spike Questions, Evidence File Constraints and OAuth Scope update-seller, LLM Provider Choice (D6), Open Issues O1-O6, Pinned Key Dependencies, POST /v1/customer/disputes/{id}/provide-evidence (multipart) (+1 more)

### Community 47 - "refunds.ts"
Cohesion: 0.28
Nodes (8): Tx, insertRefund(), listRefunds(), RefundDbRow, refundedMinor(), RefundRow, RefundStatus, toRefund()

### Community 48 - "AegisPay"
Cohesion: 0.33
Nodes (6): AegisPay, Bet 3: Autonomous Dispute Defense, Bet 1: Deterministic Spend Safety, Bet 2: Proof-of-Fulfillment Settlement, Best Use of Agentic Commerce / PayPal + AI Prizes, Problem Statement: unsafe agent procurement

## Knowledge Gaps
- **43 isolated node(s):** `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)`, `Journey B: SLA Breach (hold to void)` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 257 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Deterministic Mandate Gatekeeper (FR-03)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Channel3 (sourcing catalog API/MCP)`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `Proof-Gated Capture (FR-06)`, `Payment Service (only path to money-moving endpoints)`, `Dispute Evidence Assembly`, `Must-have test cases T1-T12`, `@aegis/payments package`, `SLA Breach Void (FR-07)`, `AegisPay`, `webhooks.test.ts`, `API endpoint reference`, `rules.ts`?**
  _High betweenness centrality (0.337) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Deterministic Mandate Gatekeeper (FR-03)` (e.g. with `Proof-Gated Capture (FR-06)` and `money.ts`) actually correct?**
  _`Deterministic Mandate Gatekeeper (FR-03)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.14210526315789473 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `Clock`, `Root Workspace Config`, `clock.ts`, `DomainError`, `webhooks.test.ts`, `db/test/orders.test.ts`, `audit.ts`, `refund-dispute.test.ts`, `client.ts`, `order-state.test.ts`, `rules.ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Hash-Chained Audit Log (FR-11)` (e.g. with `SQL migrations 0001-0004` and `Evidence Plan by Dispute Reason`) actually correct?**
  _`Hash-Chained Audit Log (FR-11)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Channel3 (sourcing catalog API/MCP)` be split into smaller, more focused modules?**
  _Cohesion score 0.1076923076923077 - nodes in this community are weakly interconnected._