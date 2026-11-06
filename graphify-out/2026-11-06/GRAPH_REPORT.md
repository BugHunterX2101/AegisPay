# Graph Report - AegisPay  (2026-11-06)

## Corpus Check
- 111 files · ~93,018 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 1231 nodes · 3044 edges · 58 communities (55 shown, 3 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 93 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a7fd8a56`
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
- db/src/index.ts
- pdf.ts
- mandates.ts
- plan.ts
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
- uuidv7
- CLAUDE.md
- proposals.ts
- Clock
- DomainError
- ingest.test.ts
- Deviations from the spec, and what is still unconfirmed
- harness.ts
- webhook-events.ts
- db/src/orders.ts
- Page
- 0004_supplier_profile.sql
- process.ts
- Queryable
- payments/src/refunds.ts
- schemas.ts
- authorizations.ts
- @aegis/payments package
- webhook-process.test.ts
- Demo journeys A (golden), B (breach), C (dispute)
- money.ts

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 86 edges
2. `withTx()` - 51 edges
3. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
4. `vitest` - 36 edges
5. `appendAudit()` - 36 edges
6. `transition()` - 31 edges
7. `Hash-Chained Audit Log (FR-11)` - 31 edges
8. `Dispute Evidence Assembly` - 29 edges
9. `Verified Webhook Ingestion (FR-08)` - 29 edges
10. `Agent Boundary / Least Privilege` - 29 edges

## Surprising Connections (you probably didn't know these)
- `1. Deviations from the spec` --references--> `refund()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/test/refund-dispute.test.ts
- `5. Test coverage notes` --references--> `assertBundleIntegrity()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/disputes.ts
- `2. Failure windows, and how each is closed` --references--> `submitEvidence()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/disputes.ts
- `5. Test coverage notes` --references--> `renderPdfs()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/evidence/pdf.ts
- `2. Failure windows, and how each is closed` --references--> `acceptedEvidenceCall()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/src/disputes.ts

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

## Communities (58 total, 3 thin omitted)

### Community 0 - "Authorization Hold (Orders v2 intent AUTHORIZE)"
Cohesion: 0.08
Nodes (40): Authorization Hold (Orders v2 intent AUTHORIZE), Proof-Gated Capture (FR-06), Order Lifecycle State Machine, PayPal Orders v2 API, SLA Breach Void (FR-07), AegisPay, Bet 3: Autonomous Dispute Defense, Bet 1: Deterministic Spend Safety (+32 more)

### Community 1 - "Decision Record D1-D13"
Cohesion: 0.08
Nodes (37): AG Grid Enterprise Configuration, @paypal/agent-toolkit (read tools), apps/api (Fastify REST, SSE, webhook listener), apps/web (React + Vite UI), apps/worker (pg-boss consumers), Static and Compliance CI Checks, CommandGrid / AuditDetailGrid, Agent Toolkit / AI SDK Compatibility Spike (+29 more)

### Community 2 - "Channel3 (sourcing catalog API/MCP)"
Cohesion: 0.10
Nodes (34): Channel3 (sourcing catalog API/MCP), Deterministic Mandate Gatekeeper (FR-03), Mandate, Proposal, Data Model (six tables), Deterministic Money Math, Evidence Bundle, FR-01 Mandate Builder (+26 more)

### Community 3 - "P0 Scope (FR-01 to FR-14)"
Cohesion: 0.07
Nodes (40): AegisPay - Product Requirements Document, AG Grid (sponsor), Agent Worker (Vercel AI SDK + Agent Toolkit), APIMatic (sponsor), Bryntum (sponsor), Build Plan to the Deadline (5-12 Nov), FR-05 Fulfillment Tracking, FR-10 Command Center Grid (AG Grid) (+32 more)

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
Nodes (18): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, @paypal/paypal-server-sdk@2.5.0, pdf-lib@1.17.1, zod@4.6.7, exports (+10 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.16
Nodes (18): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, Elastic (partner, no prize), FR-09 Dispute Defense Agent, FR-17 Contract Clause Retrieval (P1), Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes (+10 more)

### Community 11 - "core/src/index.ts"
Cohesion: 0.11
Nodes (22): 1. Deviations from the spec, Decisions the spec leaves open, spentSoFar(), CallOptions, CallResult, defaultDeps, describeFailure(), FailureInfo (+14 more)

### Community 12 - "TypeScript Base Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+7 more)

### Community 13 - "Hash-Chained Audit Log (FR-11)"
Cohesion: 0.09
Nodes (31): Hash-Chained Audit Log (FR-11), appendAudit(tx, event) with advisory lock, Append-only Trigger and No TRUNCATE Grant, Postgres LISTEN/NOTIFY Feed, AegisPay Technical Documentation, AG Grid Command Center UI, AI_TOOLS.md and honesty/disclosure, Alerting rules (+23 more)

### Community 14 - "0001_init.sql"
Cohesion: 0.11
Nodes (23): audit_event, catalog_snapshot, dispute, evidence_bundle, fulfillment, mandate, proposal, purchase_order (+15 more)

### Community 15 - "Verified Webhook Ingestion (FR-08)"
Cohesion: 0.10
Nodes (26): Kill Switch, Verified Webhook Ingestion (FR-08), Webhook Events Handled, Session Cookie and CSRF Controls, Offline RSA-SHA256 + CRC32 Verification, Postback verify-webhook-signature, Secrets and Environment Variables, simulate-event Testing (+18 more)

### Community 16 - "DB Package Manifest"
Cohesion: 0.17
Nodes (12): dependencies, @aegis/core@workspace:*, pg@8.23.1, exports, ./testing, @aegis/core, name, private (+4 more)

### Community 17 - "webhooks.test.ts"
Cohesion: 0.11
Nodes (22): WebhookPipeline, isSimulatedEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS, CertCache, checkCertUrl(), crc32Decimal() (+14 more)

### Community 18 - "refund-dispute.test.ts"
Cohesion: 0.18
Nodes (12): BundleDbRow, DisputeDbRow, DisputeUpsert, EvidenceBundleRow, EvidenceFile, findOrderIdByCaptureId(), latestEvidenceBundle(), markBundleReviewed() (+4 more)

### Community 19 - "Core Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, zod@4.6.7, exports, zod, name, private, type, version

### Community 20 - "Gatekeeper Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, @aegis/core@workspace:*, exports, @aegis/core, name, private, type, version

### Community 21 - "disputes.test.ts"
Cohesion: 0.19
Nodes (19): appendAudit(), getDispute(), getEvidenceBundle(), withTx(), add(), buildEvidenceBundle(), fetchDispute(), orderStateForOutcome() (+11 more)

### Community 22 - "db/src/index.ts"
Cohesion: 0.18
Nodes (11): migrate(), MigrationResult, MIGRATIONS_DIR, sha(), closePool(), createPool(), getPool(), PoolOptions (+3 more)

### Community 23 - "pdf.ts"
Cohesion: 0.22
Nodes (11): assertBundleIntegrity(), A4, bundleSha256(), MAX_FILE_BYTES, MAX_TOTAL_BYTES, need(), Writer, WRITERS (+3 more)

### Community 24 - "mandates.ts"
Cohesion: 0.17
Nodes (22): MandateDraft, amendMandate(), BUDGET_COMMITTED_STATES, createMandate(), getCurrentMandate(), getMandate(), insertVersion(), listMandates() (+14 more)

### Community 25 - "plan.ts"
Cohesion: 0.13
Nodes (16): buildEvidenceInput(), clean(), DisputeReason, DocumentKind, EvidenceType, MAX_FILES, MAX_NOTES_CHARS, planEvidence() (+8 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "payments/src/disputes.ts"
Cohesion: 0.15
Nodes (18): DisputeLink, DisputeRow, hasSubmittedBundle(), BuildResult, DisputeSync, evidenceAlreadySubmitted(), gateChecks(), GatheredFacts (+10 more)

### Community 28 - "paypal-server.ts"
Cohesion: 0.09
Nodes (14): OAuthServerOptions, SeenRequest, ALLOWED_EVIDENCE_EXT, Auth, Cap, D(), Disp, Failure (+6 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): ./tsconfig.base.json, exclude, extends, include

### Community 30 - "clock.ts"
Cohesion: 0.17
Nodes (7): addDays(), DAY_MS, FixedClock, OffsetClock, systemClock, ErrorCode, HTTP_STATUS

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (43): Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS, computeTotal(), dateMs() (+35 more)

### Community 33 - "webhook-signing.ts"
Cohesion: 0.15
Nodes (10): ev(), receiveSigned(), CERT_URL, makeCert(), referenceCrc32(), SignOptions, signWebhook(), TABLE (+2 more)

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.20
Nodes (14): PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, Gatekeeper Tests (table, property, money, 100% branch coverage), PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests, P0 Gate Manual Acceptance (+6 more)

### Community 35 - "client.ts"
Cohesion: 0.29
Nodes (12): Db, CallDeps, CreateContextOptions, createPayPalContext(), PayPalContext, sameOrigin(), assertSandboxBaseUrl(), loadPayPalConfig() (+4 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.11
Nodes (30): Agent Boundary / Least Privilege, Product Thesis: AI as orchestrator, not unbounded spender, Order Drafter Agent, Mandate Parser Agent, AMOUNT_MISMATCH Check, Decision SHA-256 Hash, Package Dependency Rules (eslint-plugin-boundaries), Evidence File Constraints and OAuth Scope update-seller (+22 more)

### Community 37 - "uuidv7"
Cohesion: 0.17
Nodes (17): RFC-9562, insertEvidenceBundle(), uuidv7(), insertOrder(), freshDb(), seedProposal(), TEST_URL, TestDb (+9 more)

### Community 39 - "proposals.ts"
Cohesion: 0.25
Nodes (10): BundleDbRow, getProposalRecord(), insertProposal(), listProposalsForMandate(), MandateRow, NewProposal, ProposalDbRow, ProposalRecord (+2 more)

### Community 40 - "Clock"
Cohesion: 0.13
Nodes (9): Clock, REFRESH_WINDOW_MS, Token, tokenResponse, TokenVault, TokenVaultOptions, OfflineInput, MutableClock (+1 more)

### Community 41 - "DomainError"
Cohesion: 0.13
Nodes (24): DomainError, verifyChain(), recordPayPalOrderId(), hasIssue(), parseDispute(), AuthorizedHold, authorizeHold(), buildOrderRequest() (+16 more)

### Community 42 - "ingest.test.ts"
Cohesion: 0.14
Nodes (21): canonicalJson(), normalize(), sha256Hex(), ZERO_HASH, AUDIT_LOCK_KEY, AUDIT_NOTIFY_CHANNEL, auditHash(), AuditRow (+13 more)

### Community 43 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.33
Nodes (5): 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 5. Test coverage notes, 6. What is needed from the owner, Deviations from the spec, and what is still unconfirmed

### Community 44 - "harness.ts"
Cohesion: 0.11
Nodes (21): transition(), paypalRequestId(), advance(), delivered(), held(), CLIENT_ID, CLIENT_SECRET, Harness (+13 more)

### Community 45 - "webhook-events.ts"
Cohesion: 0.15
Nodes (22): claimVerifiedWebhooks(), getWebhookEvent(), listUnverifiedWebhooks(), markWebhookProcessed(), markWebhookVerified(), recordWebhookEvent(), recordWebhookFailure(), SENSITIVE_HEADERS (+14 more)

### Community 46 - "db/src/orders.ts"
Cohesion: 0.15
Nodes (15): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, OrderState, TERMINAL_STATES, OrderDbRow (+7 more)

### Community 47 - "Page"
Cohesion: 0.27
Nodes (4): Page, renderOne(), renderPdfs(), winAnsiSafe()

### Community 49 - "process.ts"
Cohesion: 0.15
Nodes (29): findOrderIdByPayPalRef(), getOrder(), stateOf(), CAPTURE_REFUSED, captureIdFromLinks(), getCapture(), Json, mismatch() (+21 more)

### Community 50 - "Queryable"
Cohesion: 0.17
Nodes (13): DisputeSources, getDisputeSources(), SourcesDbRow, FulfillmentDbRow, FulfillmentRow, Queryable, getSupplierProfile(), listSupplierProfiles() (+5 more)

### Community 51 - "payments/src/refunds.ts"
Cohesion: 0.18
Nodes (23): 2. Failure windows, and how each is closed, acceptedEvidenceCall(), withAdvisoryLock(), getOrderBundle(), getRefundRow(), insertRefund(), listPendingRefunds(), listRefunds() (+15 more)

### Community 52 - "schemas.ts"
Cohesion: 0.11
Nodes (17): ApiError, ApiErrorSchema, CARRIERS, CreateMandateBody, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate (+9 more)

### Community 53 - "authorizations.ts"
Cohesion: 0.24
Nodes (13): getFulfillment(), recordReauthorization(), capture(), getAuthorization(), isFinalClientError(), payments(), REAUTH_LEAD_MS, reauthDue() (+5 more)

### Community 54 - "@aegis/payments package"
Cohesion: 0.14
Nodes (14): PayPal Agent Toolkit (scoped read-only actions), apps/worker pg-boss consumers, Evidence PDFs (pdf-lib) and defense notes, PayPal Disputes v1 API, PayPal Payments v2 (authorizations, captures), PayPal Server SDK 2.5.0 plus typed REST client, PayPal Webhooks v1, @aegis/agents package (+6 more)

### Community 55 - "webhook-process.test.ts"
Cohesion: 0.23
Nodes (6): SeedOptions, advance(), awaiting(), delivered(), held(), settled()

### Community 56 - "Demo journeys A (golden), B (breach), C (dispute)"
Cohesion: 0.25
Nodes (8): CI/CD pipeline (GitHub Actions, gitleaks, Playwright), Demo journeys A (golden), B (breach), C (dispute), P0 gate: Journeys A, B, C pass 3x on Render, /paypal:doctor report, Playwright PayPal pop-up testing, Submission tag and post-deadline freeze, Render Blueprint deployment, Secrets and log redaction controls

### Community 57 - "money.ts"
Cohesion: 0.47
Nodes (4): Money as bigint Minor Units, minorFromString(), minorToString(), usd

## Knowledge Gaps
- **43 isolated node(s):** `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)`, `Journey B: SLA Breach (hold to void)` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 323 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Testing and Verification Strategy`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `Dispute Evidence Assembly`, `Hash-Chained Audit Log (FR-11)`, `@aegis/payments package`, `money.ts`, `rules.ts`?**
  _High betweenness centrality (0.293) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Deterministic Mandate Gatekeeper (FR-03)` (e.g. with `Proof-Gated Capture (FR-06)` and `money.ts`) actually correct?**
  _`Deterministic Mandate Gatekeeper (FR-03)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.0782051282051282 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `uuidv7` to `client.ts`, `Root Workspace Config`, `Clock`, `DomainError`, `ingest.test.ts`, `core/src/index.ts`, `harness.ts`, `db/src/orders.ts`, `webhooks.test.ts`, `plan.ts`, `disputes.test.ts`, `db/src/index.ts`, `pdf.ts`, `mandates.ts`, `money.ts`, `webhook-process.test.ts`, `clock.ts`, `rules.ts`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.08408408408408409 - nodes in this community are weakly interconnected._
- **Why does `Agent Boundary / Least Privilege` connect `Agent Boundary / Least Privilege` to `Channel3 (sourcing catalog API/MCP)`, `P0 Scope (FR-01 to FR-14)`, `Testing and Verification Strategy`, `Dispute Evidence Assembly`, `Hash-Chained Audit Log (FR-11)`, `Verified Webhook Ingestion (FR-08)`, `@aegis/payments package`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._