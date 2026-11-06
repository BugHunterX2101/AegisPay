# Graph Report - AegisPay  (2026-11-06)

## Corpus Check
- 95 files · ~74,520 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 1053 nodes · 2386 edges · 50 communities (46 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1b8fce84`
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
- SLA Breach Void (FR-07)
- Verified Webhook Ingestion (FR-08)
- DB Package Manifest
- webhooks.test.ts
- db/src/orders.ts
- Core Package Manifest
- Gatekeeper Package Manifest
- disputes.test.ts
- vitest
- evidence-pdf.test.ts
- schemas.ts
- plan.ts
- Workspace Overrides
- payments/src/disputes.ts
- paypal-server.ts
- TS Project Config
- clock.ts
- rules.ts
- Postman Partner
- Decision SHA-256 Hash
- Testing and Verification Strategy
- client.ts
- Agent Boundary / Least Privilege
- harness.ts
- CLAUDE.md
- token-vault.test.ts
- TokenVault
- payments/src/orders.ts
- CI/CD pipeline (GitHub Actions, gitleaks, Playwright)
- Queryable
- DomainError
- authorizations.ts
- Page
- payments/src/refunds.ts
- pdf.ts
- Clock

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 62 edges
2. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
3. `withTx()` - 36 edges
4. `Hash-Chained Audit Log (FR-11)` - 31 edges
5. `Dispute Evidence Assembly` - 29 edges
6. `Verified Webhook Ingestion (FR-08)` - 29 edges
7. `Agent Boundary / Least Privilege` - 29 edges
8. `vitest` - 28 edges
9. `Authorization Hold (Orders v2 intent AUTHORIZE)` - 25 edges
10. `appendAudit()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Hash-Chained Audit Log (FR-11)` --semantically_similar_to--> `SQL migrations 0001-0004`  [INFERRED] [semantically similar]
  docs/spec/AegisPay — Product Requirements Document.md → docs/spec/AegisPay — Technical Documentation.md
- `AI_TOOLS.md and honesty/disclosure` --conceptually_related_to--> `Agent Boundary / Least Privilege`  [INFERRED]
  docs/spec/AegisPay — Technical Documentation.md → docs/spec/AegisPay — Product Requirements Document.md
- `OfflineInput` --references--> `Clock`  [EXTRACTED]
  packages/payments/src/webhooks/verify-offline.ts → packages/core/src/clock.ts
- `need()` --calls--> `DomainError`  [EXTRACTED]
  packages/payments/src/evidence/pdf.ts → packages/core/src/errors.ts
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

## Communities (50 total, 4 thin omitted)

### Community 0 - "Authorization Hold (Orders v2 intent AUTHORIZE)"
Cohesion: 0.08
Nodes (38): Authorization Hold (Orders v2 intent AUTHORIZE), Proof-Gated Capture (FR-06), PayPal Orders v2 API, SLA Breach Void (FR-07), AegisPay, Bet 3: Autonomous Dispute Defense, Bet 1: Deterministic Spend Safety, Bet 2: Proof-of-Fulfillment Settlement (+30 more)

### Community 1 - "Decision Record D1-D13"
Cohesion: 0.11
Nodes (34): AG Grid Enterprise Configuration, @paypal/agent-toolkit (read tools), apps/api (Fastify REST, SSE, webhook listener), apps/web (React + Vite UI), apps/worker (pg-boss consumers), CommandGrid / AuditDetailGrid, Agent Toolkit / AI SDK Compatibility Spike, Cost Through Judging (~$40) (+26 more)

### Community 2 - "Channel3 (sourcing catalog API/MCP)"
Cohesion: 0.09
Nodes (37): Channel3 (sourcing catalog API/MCP), Deterministic Mandate Gatekeeper (FR-03), Mandate, Proposal, Data Model (six tables), Deterministic Money Math, Evidence Bundle, FR-01 Mandate Builder (+29 more)

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
Cohesion: 0.19
Nodes (15): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, FR-09 Dispute Defense Agent, Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes, Defense Agent, Evidence Plan by Dispute Reason (+7 more)

### Community 11 - "core/src/index.ts"
Cohesion: 0.12
Nodes (21): CallOptions, CallResult, defaultDeps, describeFailure(), FailureInfo, header(), isNetworkError(), jitter() (+13 more)

### Community 12 - "TypeScript Base Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+7 more)

### Community 13 - "Hash-Chained Audit Log (FR-11)"
Cohesion: 0.08
Nodes (36): Hash-Chained Audit Log (FR-11), Order Lifecycle State Machine, appendAudit(tx, event) with advisory lock, Append-only Trigger and No TRUNCATE Grant, Postgres LISTEN/NOTIFY Feed, row_version Optimistic Locking, Table fulfillment, Table purchase_order (+28 more)

### Community 14 - "SLA Breach Void (FR-07)"
Cohesion: 0.18
Nodes (11): Day 1 Spike Questions, Demo Clock Offset (/api/demo/clock), Sandbox Dispute Pool, External Dependencies and Fallbacks, Gap Protection Polling (every 2 minutes), Judge Mode UX, Monitoring and /status Page, Render Blueprint render.yaml (+3 more)

### Community 15 - "Verified Webhook Ingestion (FR-08)"
Cohesion: 0.12
Nodes (25): Kill Switch, Verified Webhook Ingestion (FR-08), Webhook Events Handled, Session Cookie and CSRF Controls, Offline RSA-SHA256 + CRC32 Verification, Postback verify-webhook-signature, Secrets and Environment Variables, simulate-event Testing (+17 more)

### Community 16 - "DB Package Manifest"
Cohesion: 0.17
Nodes (12): dependencies, @aegis/core@workspace:*, pg@8.23.1, exports, ./testing, @aegis/core, name, private (+4 more)

### Community 17 - "webhooks.test.ts"
Cohesion: 0.08
Nodes (30): isSimulatedEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS, CertCache, checkCertUrl(), crc32Decimal(), HeaderBag (+22 more)

### Community 18 - "db/src/orders.ts"
Cohesion: 0.14
Nodes (16): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, OrderState, TERMINAL_STATES, OrderDbRow (+8 more)

### Community 19 - "Core Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, zod@4.6.7, exports, zod, name, private, type, version

### Community 20 - "Gatekeeper Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, @aegis/core@workspace:*, exports, @aegis/core, name, private, type, version

### Community 21 - "disputes.test.ts"
Cohesion: 0.17
Nodes (23): appendAudit(), getEvidenceBundle(), transition(), withTx(), add(), voidHold(), assertBundleIntegrity(), orderStateForOutcome() (+15 more)

### Community 22 - "vitest"
Cohesion: 0.05
Nodes (53): RFC-9562, ZERO_HASH, AUDIT_LOCK_KEY, AUDIT_NOTIFY_CHANNEL, auditHash(), AuditRow, ChainResult, NewAuditEvent (+45 more)

### Community 23 - "evidence-pdf.test.ts"
Cohesion: 0.22
Nodes (9): sha256Hex(), buildEvidenceBundle(), bundleSha256(), renderOne(), renderPdfs(), buildEvidenceInput(), FACTS, FULL (+1 more)

### Community 24 - "schemas.ts"
Cohesion: 0.11
Nodes (18): ApiError, ApiErrorSchema, CARRIERS, CreateMandateBody, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate (+10 more)

### Community 25 - "plan.ts"
Cohesion: 0.18
Nodes (12): clean(), DisputeReason, DocumentKind, EvidenceType, MAX_FILES, MAX_NOTES_CHARS, planEvidence(), PlannedEvidence (+4 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "payments/src/disputes.ts"
Cohesion: 0.15
Nodes (18): DisputeLink, DisputeRow, hasSubmittedBundle(), BuildResult, DisputeSync, evidenceAlreadySubmitted(), gateChecks(), GatheredFacts (+10 more)

### Community 28 - "paypal-server.ts"
Cohesion: 0.12
Nodes (13): ALLOWED_EVIDENCE_EXT, Auth, Cap, D(), Disp, Failure, MultipartPart, Ord (+5 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): ./tsconfig.base.json, exclude, extends, include

### Community 30 - "clock.ts"
Cohesion: 0.23
Nodes (5): addDays(), DAY_MS, FixedClock, OffsetClock, systemClock

### Community 31 - "rules.ts"
Cohesion: 0.07
Nodes (51): Money as bigint Minor Units, fast-check@^4.10.2, canonicalJson(), normalize(), Currency, Minor, minorFromString(), minorToString() (+43 more)

### Community 33 - "Decision SHA-256 Hash"
Cohesion: 0.40
Nodes (6): Order Drafter Agent, AMOUNT_MISMATCH Check, Decision SHA-256 Hash, evaluate(mandate, proposal, context) -> Decision, Mandate/Proposal/Context/Decision Types, Order Payload Built by Code

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.15
Nodes (17): Static and Compliance CI Checks, PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, Gatekeeper Tests (table, property, money, 100% branch coverage), PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests (+9 more)

### Community 35 - "client.ts"
Cohesion: 0.29
Nodes (12): Db, CallDeps, CreateContextOptions, createPayPalContext(), PayPalContext, sameOrigin(), assertSandboxBaseUrl(), loadPayPalConfig() (+4 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.12
Nodes (22): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Migrations and Demo Reset, Prompt and Safety Rules, Table audit_event (+14 more)

### Community 37 - "harness.ts"
Cohesion: 0.09
Nodes (21): getOrder(), toOrder(), stateOf(), HONOR_PERIOD_MS, advance(), delivered(), held(), orderState() (+13 more)

### Community 39 - "token-vault.test.ts"
Cohesion: 0.20
Nodes (5): OAuthServer, OAuthServerOptions, SeenRequest, startOAuthServer(), MutableClock

### Community 41 - "payments/src/orders.ts"
Cohesion: 0.24
Nodes (15): recordPayPalOrderId(), AuthorizedHold, authorizeHold(), buildOrderRequest(), cap(), CARRIERS, createHold(), getPayPalOrder() (+7 more)

### Community 42 - "CI/CD pipeline (GitHub Actions, gitleaks, Playwright)"
Cohesion: 0.17
Nodes (12): 29-day authorization validity and 3-day honor period, CI/CD pipeline (GitHub Actions, gitleaks, Playwright), Environment configuration (zod, fail fast), Feature flags (BRYNTUM, REAUTH, ELASTIC, POLL_FALLBACK), Judge Mode (demo reset, clock offset, sandbox buyer banner), Local development and sandbox setup, /paypal:doctor report, Reauthorization (P1, FEATURE_REAUTH) (+4 more)

### Community 43 - "Queryable"
Cohesion: 0.22
Nodes (7): DisputeSources, getDisputeSources(), SourcesDbRow, FulfillmentDbRow, FulfillmentRow, getFulfillment(), Queryable

### Community 44 - "DomainError"
Cohesion: 0.29
Nodes (6): DomainError, ErrorCode, HTTP_STATUS, fetchDispute(), parseDispute(), paypal()

### Community 45 - "authorizations.ts"
Cohesion: 0.27
Nodes (11): recordReauthorization(), capture(), getAuthorization(), isFinalClientError(), payments(), REAUTH_LEAD_MS, reauthDue(), reauthorize() (+3 more)

### Community 47 - "payments/src/refunds.ts"
Cohesion: 0.23
Nodes (10): getOrderBundle(), insertRefund(), listRefunds(), refundedMinor(), toRefund(), hasIssue(), KNOWN, payments() (+2 more)

### Community 48 - "pdf.ts"
Cohesion: 0.25
Nodes (6): A4, MAX_FILE_BYTES, MAX_TOTAL_BYTES, need(), Writer, WRITERS

### Community 49 - "Clock"
Cohesion: 0.33
Nodes (5): Clock, REFRESH_WINDOW_MS, Token, tokenResponse, TokenVaultOptions

## Knowledge Gaps
- **43 isolated node(s):** `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)`, `Journey B: SLA Breach (hold to void)` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 289 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision SHA-256 Hash`, `Decision Record D1-D13`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `Testing and Verification Strategy`, `Hash-Chained Audit Log (FR-11)`, `Verified Webhook Ingestion (FR-08)`, `rules.ts`?**
  _High betweenness centrality (0.309) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Deterministic Mandate Gatekeeper (FR-03)` (e.g. with `Proof-Gated Capture (FR-06)` and `money.ts`) actually correct?**
  _`Deterministic Mandate Gatekeeper (FR-03)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.07965860597439545 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `client.ts`, `harness.ts`, `Root Workspace Config`, `token-vault.test.ts`, `core/src/index.ts`, `DomainError`, `payments/src/refunds.ts`, `webhooks.test.ts`, `db/src/orders.ts`, `disputes.test.ts`, `evidence-pdf.test.ts`, `plan.ts`, `clock.ts`, `rules.ts`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Hash-Chained Audit Log (FR-11)` (e.g. with `SQL migrations 0001-0004` and `Evidence Plan by Dispute Reason`) actually correct?**
  _`Hash-Chained Audit Log (FR-11)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.11229946524064172 - nodes in this community are weakly interconnected._