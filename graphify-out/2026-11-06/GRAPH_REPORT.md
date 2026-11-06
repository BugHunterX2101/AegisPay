# Graph Report - AegisPay  (2026-11-06)

## Corpus Check
- 100 files · ~80,805 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 1107 nodes · 2563 edges · 49 communities (45 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 85 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ecc9fc51`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- core/src/index.ts
- TypeScript Base Config
- Hash-Chained Audit Log (FR-11)
- 0001_init.sql
- Verified Webhook Ingestion (FR-08)
- DB Package Manifest
- webhooks.test.ts
- refund-dispute.test.ts
- Core Package Manifest
- Gatekeeper Package Manifest
- disputes.test.ts
- vitest
- P1 Scope (FR-15 to FR-20)
- schemas.ts
- evidence-pdf.test.ts
- Workspace Overrides
- payments/src/disputes.ts
- paypal-server.ts
- TS Project Config
- clock.ts
- rules.ts
- Postman Partner
- webhook-signing.ts
- Testing and Verification Strategy
- client.ts
- Agent Boundary / Least Privilege
- withTx
- CLAUDE.md
- API endpoint reference
- Clock
- payments/src/orders.ts
- CI/CD pipeline (GitHub Actions, gitleaks, Playwright)
- Deviations from the spec, and what is still unconfirmed
- errors.test.ts
- authorizations.ts
- money.ts
- payments/src/refunds.ts
- 0004_supplier_profile.sql

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 69 edges
2. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
3. `withTx()` - 37 edges
4. `vitest` - 32 edges
5. `Hash-Chained Audit Log (FR-11)` - 31 edges
6. `Dispute Evidence Assembly` - 29 edges
7. `Verified Webhook Ingestion (FR-08)` - 29 edges
8. `Agent Boundary / Least Privilege` - 29 edges
9. `Authorization Hold (Orders v2 intent AUTHORIZE)` - 25 edges
10. `appendAudit()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `1. Deviations from the spec` --references--> `refund()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/test/refund-dispute.test.ts
- `1. Deviations from the spec` --references--> `paypalCall()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/call.ts
- `2. Failure windows, and how each is closed` --references--> `refundCapture()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/refunds.ts
- `2. Failure windows, and how each is closed` --references--> `reconcileRefund()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/refunds.ts
- `1. Deviations from the spec` --references--> `paypalRest()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/rest.ts

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

## Communities (49 total, 4 thin omitted)

### Community 0 - "Authorization Hold (Orders v2 intent AUTHORIZE)"
Cohesion: 0.09
Nodes (35): Authorization Hold (Orders v2 intent AUTHORIZE), Proof-Gated Capture (FR-06), PayPal Orders v2 API, SLA Breach Void (FR-07), AegisPay, Bet 3: Autonomous Dispute Defense, Bet 1: Deterministic Spend Safety, Bet 2: Proof-of-Fulfillment Settlement (+27 more)

### Community 1 - "Decision Record D1-D13"
Cohesion: 0.06
Nodes (59): AG Grid Enterprise Configuration, Order Drafter Agent, @paypal/agent-toolkit (read tools), AMOUNT_MISMATCH Check, apps/api (Fastify REST, SSE, webhook listener), apps/web (React + Vite UI), apps/worker (pg-boss consumers), appendAudit(tx, event) with advisory lock (+51 more)

### Community 2 - "Channel3 (sourcing catalog API/MCP)"
Cohesion: 0.10
Nodes (33): Channel3 (sourcing catalog API/MCP), Deterministic Mandate Gatekeeper (FR-03), Mandate, Proposal, Data Model (six tables), Deterministic Money Math, Evidence Bundle, FR-01 Mandate Builder (+25 more)

### Community 3 - "P0 Scope (FR-01 to FR-14)"
Cohesion: 0.10
Nodes (30): AegisPay - Product Requirements Document, AG Grid (sponsor), Build Plan to the Deadline (5-12 Nov), FR-05 Fulfillment Tracking, FR-10 Command Center Grid (AG Grid), FR-12 Judge Mode, FR-13 Self-Check Panel, FR-14 OAuth Token Vault (+22 more)

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
Cohesion: 0.21
Nodes (14): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, FR-09 Dispute Defense Agent, Journey C: Dispute Defense, Persona: Meera, Finance & Disputes, Defense Agent, Evidence Plan by Dispute Reason, Table dispute (+6 more)

### Community 11 - "core/src/index.ts"
Cohesion: 0.14
Nodes (17): CallOptions, CallResult, defaultDeps, describeFailure(), FailureInfo, header(), isNetworkError(), jitter() (+9 more)

### Community 12 - "TypeScript Base Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+7 more)

### Community 13 - "Hash-Chained Audit Log (FR-11)"
Cohesion: 0.13
Nodes (23): Hash-Chained Audit Log (FR-11), Order Lifecycle State Machine, Append-only Trigger and No TRUNCATE Grant, row_version Optimistic Locking, Table fulfillment, Table purchase_order, AegisPay Technical Documentation, AI_TOOLS.md and honesty/disclosure (+15 more)

### Community 14 - "0001_init.sql"
Cohesion: 0.12
Nodes (21): audit_event, catalog_snapshot, dispute, evidence_bundle, fulfillment, mandate, proposal, purchase_order (+13 more)

### Community 15 - "Verified Webhook Ingestion (FR-08)"
Cohesion: 0.14
Nodes (20): Verified Webhook Ingestion (FR-08), Webhook Events Handled, Session Cookie and CSRF Controls, AegisPay Technical Design Document, External Dependencies and Fallbacks, Gap Protection Polling (every 2 minutes), Offline RSA-SHA256 + CRC32 Verification, Postback verify-webhook-signature (+12 more)

### Community 16 - "DB Package Manifest"
Cohesion: 0.17
Nodes (12): dependencies, @aegis/core@workspace:*, pg@8.23.1, exports, ./testing, @aegis/core, name, private (+4 more)

### Community 17 - "webhooks.test.ts"
Cohesion: 0.11
Nodes (23): verifyChain(), isSimulatedEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS, CertCache, checkCertUrl(), crc32Decimal() (+15 more)

### Community 18 - "refund-dispute.test.ts"
Cohesion: 0.17
Nodes (22): 2. Failure windows, and how each is closed, acceptedEvidenceCall(), BundleDbRow, DisputeDbRow, DisputeUpsert, findOrderIdByCaptureId(), getDispute(), getEvidenceBundle() (+14 more)

### Community 19 - "Core Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, zod@4.6.7, exports, zod, name, private, type, version

### Community 20 - "Gatekeeper Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, @aegis/core@workspace:*, exports, @aegis/core, name, private, type, version

### Community 21 - "disputes.test.ts"
Cohesion: 0.15
Nodes (15): transition(), advance(), delivered(), auditRows(), auditTypes(), built(), disputed(), move() (+7 more)

### Community 22 - "vitest"
Cohesion: 0.05
Nodes (45): RFC-9562, ZERO_HASH, ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, OrderState (+37 more)

### Community 23 - "P1 Scope (FR-15 to FR-20)"
Cohesion: 0.15
Nodes (14): Agent Worker (Vercel AI SDK + Agent Toolkit), APIMatic (sponsor), Bryntum (sponsor), Elastic (partner, no prize), FR-15 Bryntum Timeline (P1), FR-16 Auto-Reauthorize (P1), FR-17 Contract Clause Retrieval (P1), FR-18 Typed PayPal Clients via APIMatic (P1) (+6 more)

### Community 24 - "schemas.ts"
Cohesion: 0.11
Nodes (18): ApiError, ApiErrorSchema, CARRIERS, CreateMandateBody, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate (+10 more)

### Community 25 - "evidence-pdf.test.ts"
Cohesion: 0.09
Nodes (18): Page, winAnsiSafe(), clean(), DisputeReason, DocumentKind, EvidenceFacts, EvidenceType, MAX_FILES (+10 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "payments/src/disputes.ts"
Cohesion: 0.09
Nodes (41): 5. Test coverage notes, canonicalJson(), normalize(), sha256Hex(), auditHash(), getDisputeSources(), DisputeLink, DisputeRow (+33 more)

### Community 28 - "paypal-server.ts"
Cohesion: 0.08
Nodes (26): createPayPalContext(), sameOrigin(), CLIENT_ID, CLIENT_SECRET, Harness, OffsetClock, SeededOrder, startHarness() (+18 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): ./tsconfig.base.json, exclude, extends, include

### Community 30 - "clock.ts"
Cohesion: 0.18
Nodes (6): addDays(), DAY_MS, FixedClock, OffsetClock, systemClock, paypal()

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (43): Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS, computeTotal(), dateMs() (+35 more)

### Community 33 - "webhook-signing.ts"
Cohesion: 0.17
Nodes (8): CERT_URL, makeCert(), referenceCrc32(), SignOptions, signWebhook(), TABLE, TestCert, signed()

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.20
Nodes (14): PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, Gatekeeper Tests (table, property, money, 100% branch coverage), PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests, P0 Gate Manual Acceptance (+6 more)

### Community 35 - "client.ts"
Cohesion: 0.21
Nodes (15): Db, TestDb, CallDeps, CreateContextOptions, PayPalContext, assertSandboxBaseUrl(), loadPayPalConfig(), LOOPBACK (+7 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.10
Nodes (27): Agent Boundary / Least Privilege, Kill Switch, Product Thesis: AI as orchestrator, not unbounded spender, Secrets and Environment Variables, PayPal Agent Toolkit (scoped read-only actions), apps/worker pg-boss consumers, Three-process architecture on Render, Boundary lint rule (eslint-plugin-boundaries) (+19 more)

### Community 37 - "withTx"
Cohesion: 0.25
Nodes (14): uuidv7(), getOrder(), insertOrder(), toOrder(), withTx(), seedProposal(), add(), newOrder() (+6 more)

### Community 39 - "API endpoint reference"
Cohesion: 0.36
Nodes (8): AG Grid Command Center UI, API endpoint reference, apps/api Fastify server, apps/web React Command Center, API error codes, PayPal JS SDK v6, aegispay-api (web process), SSE event stream

### Community 40 - "Clock"
Cohesion: 0.13
Nodes (8): Clock, REFRESH_WINDOW_MS, Token, tokenResponse, TokenVault, TokenVaultOptions, MutableClock, vault()

### Community 41 - "payments/src/orders.ts"
Cohesion: 0.14
Nodes (22): DomainError, recordPayPalOrderId(), need(), AuthorizedHold, authorizeHold(), buildOrderRequest(), cap(), CARRIERS (+14 more)

### Community 42 - "CI/CD pipeline (GitHub Actions, gitleaks, Playwright)"
Cohesion: 0.13
Nodes (15): 29-day authorization validity and 3-day honor period, CI/CD pipeline (GitHub Actions, gitleaks, Playwright), Environment configuration (zod, fail fast), Demo journeys A (golden), B (breach), C (dispute), Feature flags (BRYNTUM, REAUTH, ELASTIC, POLL_FALLBACK), Judge Mode (demo reset, clock offset, sandbox buyer banner), Local development and sandbox setup, P0 gate: Journeys A, B, C pass 3x on Render (+7 more)

### Community 43 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.33
Nodes (5): 1. Deviations from the spec, 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 6. What is needed from the owner, Deviations from the spec, and what is still unconfirmed

### Community 45 - "authorizations.ts"
Cohesion: 0.17
Nodes (17): appendAudit(), getFulfillment(), recordReauthorization(), getOrderBundle(), capture(), getAuthorization(), isFinalClientError(), payments() (+9 more)

### Community 46 - "money.ts"
Cohesion: 0.47
Nodes (4): Money as bigint Minor Units, minorFromString(), minorToString(), usd

### Community 47 - "payments/src/refunds.ts"
Cohesion: 0.19
Nodes (21): withAdvisoryLock(), getRefundRow(), insertRefund(), listPendingRefunds(), listRefunds(), RefundDbRow, refundedMinor(), RefundRow (+13 more)

## Knowledge Gaps
- **43 isolated node(s):** `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)`, `Journey B: SLA Breach (hold to void)` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 298 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Testing and Verification Strategy`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `API endpoint reference`, `money.ts`, `Verified Webhook Ingestion (FR-08)`, `rules.ts`?**
  _High betweenness centrality (0.278) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Deterministic Mandate Gatekeeper (FR-03)` (e.g. with `Proof-Gated Capture (FR-06)` and `money.ts`) actually correct?**
  _`Deterministic Mandate Gatekeeper (FR-03)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.08739495798319327 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `client.ts`, `withTx`, `Root Workspace Config`, `Clock`, `payments/src/orders.ts`, `core/src/index.ts`, `errors.test.ts`, `authorizations.ts`, `money.ts`, `webhooks.test.ts`, `refund-dispute.test.ts`, `disputes.test.ts`, `evidence-pdf.test.ts`, `payments/src/disputes.ts`, `clock.ts`, `rules.ts`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Hash-Chained Audit Log (FR-11)` (e.g. with `SQL migrations 0001-0004` and `Evidence Plan by Dispute Reason`) actually correct?**
  _`Hash-Chained Audit Log (FR-11)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.05727644652250146 - nodes in this community are weakly interconnected._