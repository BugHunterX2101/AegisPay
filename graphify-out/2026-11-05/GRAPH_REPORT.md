# Graph Report - AegisPay  (2026-11-05)

## Corpus Check
- 82 files · ~58,673 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 914 nodes · 1911 edges · 37 communities (35 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 67 edges (avg confidence: 0.8)
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
- Kill Switch
- Ops, Judge Mode & Auth Window
- DB Package Manifest
- webhooks.test.ts
- db/src/orders.ts
- Core Package Manifest
- Gatekeeper Package Manifest
- db/src/index.ts
- migrate.test.ts
- pool.ts
- schemas.ts
- API endpoint reference
- Workspace Overrides
- vitest
- client.ts
- TS Project Config
- order-state.test.ts
- rules.ts
- Postman Partner
- Testing and Verification Strategy
- paypal-server.ts
- CLAUDE.md
- Agent Boundary / Least Privilege

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 41 edges
2. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
3. `Hash-Chained Audit Log (FR-11)` - 31 edges
4. `Dispute Evidence Assembly` - 29 edges
5. `Verified Webhook Ingestion (FR-08)` - 29 edges
6. `Agent Boundary / Least Privilege` - 29 edges
7. `Authorization Hold (Orders v2 intent AUTHORIZE)` - 25 edges
8. `vitest` - 23 edges
9. `withTx()` - 22 edges
10. `Order Lifecycle State Machine` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Hash-Chained Audit Log (FR-11)` --semantically_similar_to--> `SQL migrations 0001-0004`  [INFERRED] [semantically similar]
  docs/spec/AegisPay — Product Requirements Document.md → docs/spec/AegisPay — Technical Documentation.md
- `AI_TOOLS.md and honesty/disclosure` --conceptually_related_to--> `Agent Boundary / Least Privilege`  [INFERRED]
  docs/spec/AegisPay — Technical Documentation.md → docs/spec/AegisPay — Product Requirements Document.md
- `OfflineInput` --references--> `Clock`  [EXTRACTED]
  packages/payments/src/webhooks/verify-offline.ts → packages/core/src/clock.ts
- `tamper()` --calls--> `withTx()`  [EXTRACTED]
  packages/db/test/audit.test.ts → packages/db/src/pool.ts
- `SLA Breach Void (FR-07)` --depends_on--> `Demo Clock Offset (/api/demo/clock)`  [INFERRED]
  docs/spec/AegisPay — Product Requirements Document.md → docs/spec/AegisPay — Technical Design Document.md

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

## Communities (37 total, 2 thin omitted)

### Community 0 - "Authorization Hold (Orders v2 intent AUTHORIZE)"
Cohesion: 0.08
Nodes (36): Authorization Hold (Orders v2 intent AUTHORIZE), Proof-Gated Capture (FR-06), PayPal Orders v2 API, SLA Breach Void (FR-07), AegisPay, Bet 3: Autonomous Dispute Defense, Bet 1: Deterministic Spend Safety, Bet 2: Proof-of-Fulfillment Settlement (+28 more)

### Community 1 - "Decision Record D1-D13"
Cohesion: 0.12
Nodes (32): AG Grid Enterprise Configuration, @paypal/agent-toolkit (read tools), apps/api (Fastify REST, SSE, webhook listener), apps/web (React + Vite UI), apps/worker (pg-boss consumers), CommandGrid / AuditDetailGrid, Agent Toolkit / AI SDK Compatibility Spike, Cost Through Judging (~$40) (+24 more)

### Community 2 - "Channel3 (sourcing catalog API/MCP)"
Cohesion: 0.08
Nodes (40): Channel3 (sourcing catalog API/MCP), Deterministic Mandate Gatekeeper (FR-03), Mandate, Proposal, Data Model (six tables), Deterministic Money Math, Evidence Bundle, FR-01 Mandate Builder (+32 more)

### Community 3 - "P0 Scope (FR-01 to FR-14)"
Cohesion: 0.07
Nodes (39): AegisPay - Product Requirements Document, AG Grid (sponsor), APIMatic (sponsor), Bryntum (sponsor), Build Plan to the Deadline (5-12 Nov), Elastic (partner, no prize), FR-05 Fulfillment Tracking, FR-10 Command Center Grid (AG Grid) (+31 more)

### Community 4 - "Web Package Manifest"
Cohesion: 0.07
Nodes (36): dependencies, ag-grid-community@^36.3.0, ag-grid-enterprise@^36.3.0, ag-grid-react@^36.3.0, @paypal/paypal-js@^11.3.0, react@^19.3.1, react-dom@^19.3.1, @tanstack/react-query@^5.105.3 (+28 more)

### Community 5 - "API Package Manifest"
Cohesion: 0.08
Nodes (32): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/payments@workspace:*, fastify@5.12.8, @fastify/cookie@11.1.5, @fastify/csrf-protection@8.0.2 (+24 more)

### Community 6 - "Root Workspace Config"
Cohesion: 0.06
Nodes (39): description, devDependencies, concurrently@^10.0.6, tsx@^4.23.15, @types/node@^26.6.6, @types/pg@^8.23.1, typescript@^7.0.2, vitest@^5.1.0 (+31 more)

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
Cohesion: 0.10
Nodes (30): Dispute Evidence Assembly, Verified Webhook Ingestion (FR-08), Dispute Reason to Evidence Mapping, FR-09 Dispute Defense Agent, Journey C: Dispute Defense, Persona: Meera, Finance & Disputes, Webhook Events Handled, Defense Agent (+22 more)

### Community 11 - "DomainError"
Cohesion: 0.06
Nodes (71): DomainError, ErrorCode, HTTP_STATUS, appendAudit(), auditHash(), verifyChain(), getFulfillment(), recordPayPalOrderId() (+63 more)

### Community 12 - "TypeScript Base Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+7 more)

### Community 13 - "Hash-Chained Audit Log (FR-11)"
Cohesion: 0.09
Nodes (35): Hash-Chained Audit Log (FR-11), Order Lifecycle State Machine, appendAudit(tx, event) with advisory lock, Append-only Trigger and No TRUNCATE Grant, Postgres LISTEN/NOTIFY Feed, row_version Optimistic Locking, Table fulfillment, Table purchase_order (+27 more)

### Community 14 - "Kill Switch"
Cohesion: 0.11
Nodes (22): Kill Switch, Static and Compliance CI Checks, Session Cookie and CSRF Controls, Demo Clock Offset (/api/demo/clock), Sandbox Dispute Pool, Error Shape with paypalDebugId, Judge Mode UX, Monitoring and /status Page (+14 more)

### Community 15 - "Ops, Judge Mode & Auth Window"
Cohesion: 0.13
Nodes (15): 29-day authorization validity and 3-day honor period, CI/CD pipeline (GitHub Actions, gitleaks, Playwright), Environment configuration (zod, fail fast), Demo journeys A (golden), B (breach), C (dispute), Feature flags (BRYNTUM, REAUTH, ELASTIC, POLL_FALLBACK), Judge Mode (demo reset, clock offset, sandbox buyer banner), Local development and sandbox setup, P0 gate: Journeys A, B, C pass 3x on Render (+7 more)

### Community 16 - "DB Package Manifest"
Cohesion: 0.17
Nodes (12): dependencies, @aegis/core@workspace:*, pg@8.23.1, exports, ./testing, @aegis/core, name, private (+4 more)

### Community 17 - "webhooks.test.ts"
Cohesion: 0.08
Nodes (30): isSimulatedEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS, CertCache, checkCertUrl(), crc32Decimal(), HeaderBag (+22 more)

### Community 18 - "db/src/orders.ts"
Cohesion: 0.17
Nodes (14): OrderState, getOrder(), OrderDbRow, OrderPatch, OrderRow, PATCHABLE, toOrder(), TransitionResult (+6 more)

### Community 19 - "Core Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, zod@4.6.7, exports, zod, name, private, type, version

### Community 20 - "Gatekeeper Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, @aegis/core@workspace:*, exports, @aegis/core, name, private, type, version

### Community 21 - "db/src/index.ts"
Cohesion: 0.31
Nodes (6): RFC-9562, uuidv7(), insertOrder(), seedProposal(), TestDb, newOrder()

### Community 22 - "migrate.test.ts"
Cohesion: 0.23
Nodes (8): migrate(), MigrationResult, MIGRATIONS_DIR, sha(), createPool(), freshDb(), cleanup, emptySchemaPool()

### Community 23 - "pool.ts"
Cohesion: 0.15
Nodes (13): AUDIT_LOCK_KEY, AUDIT_NOTIFY_CHANNEL, AuditRow, ChainResult, NewAuditEvent, FulfillmentDbRow, FulfillmentRow, closePool() (+5 more)

### Community 24 - "schemas.ts"
Cohesion: 0.11
Nodes (18): ApiError, ApiErrorSchema, CARRIERS, CreateMandateBody, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate (+10 more)

### Community 25 - "API endpoint reference"
Cohesion: 0.43
Nodes (7): AG Grid Command Center UI, API endpoint reference, apps/api Fastify server, apps/web React Command Center, API error codes, PayPal JS SDK v6, SSE event stream

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "vitest"
Cohesion: 0.24
Nodes (6): sha256Hex(), ZERO_HASH, TEST_URL, tamper(), pg, vitest

### Community 28 - "client.ts"
Cohesion: 0.08
Nodes (25): addDays(), Clock, DAY_MS, FixedClock, OffsetClock, systemClock, Db, CallDeps (+17 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): ./tsconfig.base.json, exclude, extends, include

### Community 30 - "order-state.test.ts"
Cohesion: 0.31
Nodes (6): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, TERMINAL_STATES

### Community 31 - "rules.ts"
Cohesion: 0.07
Nodes (51): Money as bigint Minor Units, fast-check@^4.10.2, canonicalJson(), normalize(), Currency, Minor, minorFromString(), minorToString() (+43 more)

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.22
Nodes (13): PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests, P0 Gate Manual Acceptance, Payments Wrapper (token, request id, retries, debug_id, audit) (+5 more)

### Community 35 - "paypal-server.ts"
Cohesion: 0.10
Nodes (20): CLIENT_ID, CLIENT_SECRET, Harness, OffsetClock, SeededOrder, SeedOptions, startHarness(), OAuthServer (+12 more)

### Community 42 - "Agent Boundary / Least Privilege"
Cohesion: 0.11
Nodes (23): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, PayPal Disputes API (provide-evidence, require-evidence), Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Migrations and Demo Reset, Prompt and Safety Rules (+15 more)

## Knowledge Gaps
- **43 isolated node(s):** `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Bryntum (sponsor)`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 248 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `Dispute Evidence Assembly`, `Hash-Chained Audit Log (FR-11)`, `Kill Switch`, `API endpoint reference`, `rules.ts`?**
  _High betweenness centrality (0.338) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Deterministic Mandate Gatekeeper (FR-03)` (e.g. with `Proof-Gated Capture (FR-06)` and `money.ts`) actually correct?**
  _`Deterministic Mandate Gatekeeper (FR-03)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.08412698412698413 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `Root Workspace Config`, `DomainError`, `webhooks.test.ts`, `db/src/index.ts`, `migrate.test.ts`, `client.ts`, `order-state.test.ts`, `rules.ts`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Hash-Chained Audit Log (FR-11)` (e.g. with `SQL migrations 0001-0004` and `Evidence Plan by Dispute Reason`) actually correct?**
  _`Hash-Chained Audit Log (FR-11)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.12298387096774194 - nodes in this community are weakly interconnected._