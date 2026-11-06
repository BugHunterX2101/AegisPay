# Graph Report - AegisPay  (2026-11-06)

## Corpus Check
- 136 files · ~110,701 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 1418 nodes · 3790 edges · 69 communities (65 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 108 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `723c7140`
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
- src/mandates.ts
- plan.ts
- Workspace Overrides
- payments/src/disputes.ts
- harness.ts
- TS Project Config
- clock.ts
- rules.ts
- Postman Partner
- api/src/errors.ts
- Testing and Verification Strategy
- client.ts
- Agent Boundary / Least Privilege
- vitest
- CLAUDE.md
- Self-check Probes (FR-13)
- client.ts
- payments/src/orders.ts
- db/src/orders.ts
- Deviations from the spec, and what is still unconfirmed
- withTx
- webhook-events.ts
- jobs.ts
- Page
- 0004_supplier_profile.sql
- process.ts
- DomainError
- payments/src/refunds.ts
- worker.test.ts
- authorizations.ts
- pool.ts
- db/src/index.ts
- ingest.test.ts
- schemas.ts
- buildApp
- api.test.ts
- stream.ts
- webhook-signing.ts
- order-flow.test.ts
- jobs/package.json
- session.ts
- proposals.ts
- uuidv7
- suppliers.ts
- JobSender

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 101 edges
2. `withTx()` - 72 edges
3. `appendAudit()` - 47 edges
4. `getOrder()` - 44 edges
5. `transition()` - 44 edges
6. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
7. `vitest` - 40 edges
8. `authorizeHold()` - 33 edges
9. `Hash-Chained Audit Log (FR-11)` - 31 edges
10. `uuidv7()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Decisions the spec leaves open` --references--> `spentSoFar()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/src/mandates.ts
- `1. Deviations from the spec` --references--> `paypalCall()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/call.ts
- `5. Test coverage notes` --references--> `assertBundleIntegrity()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/disputes.ts
- `Webhook processing (decisions the spec leaves open)` --references--> `authorizeHold()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/orders.ts
- `2. Failure windows, and how each is closed` --references--> `refundCapture()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/refunds.ts

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

## Communities (69 total, 4 thin omitted)

### Community 0 - "Authorization Hold (Orders v2 intent AUTHORIZE)"
Cohesion: 0.06
Nodes (53): Authorization Hold (Orders v2 intent AUTHORIZE), Proof-Gated Capture (FR-06), Order Lifecycle State Machine, PayPal Orders v2 API, SLA Breach Void (FR-07), AegisPay, Bet 3: Autonomous Dispute Defense, Bet 1: Deterministic Spend Safety (+45 more)

### Community 1 - "Decision Record D1-D13"
Cohesion: 0.09
Nodes (40): AG Grid Enterprise Configuration, Sourcing Agent, @paypal/agent-toolkit (read tools), apps/api (Fastify REST, SSE, webhook listener), apps/web (React + Vite UI), apps/worker (pg-boss consumers), appendAudit(tx, event) with advisory lock, Static and Compliance CI Checks (+32 more)

### Community 2 - "Channel3 (sourcing catalog API/MCP)"
Cohesion: 0.08
Nodes (37): Channel3 (sourcing catalog API/MCP), Deterministic Mandate Gatekeeper (FR-03), Mandate, Proposal, Data Model (six tables), Deterministic Money Math, Evidence Bundle, FR-01 Mandate Builder (+29 more)

### Community 3 - "P0 Scope (FR-01 to FR-14)"
Cohesion: 0.09
Nodes (33): AegisPay - Product Requirements Document, AG Grid (sponsor), APIMatic (sponsor), Bryntum (sponsor), Build Plan to the Deadline (5-12 Nov), FR-10 Command Center Grid (AG Grid), FR-12 Judge Mode, FR-13 Self-Check Panel (+25 more)

### Community 4 - "Web Package Manifest"
Cohesion: 0.07
Nodes (36): dependencies, ag-grid-community@^36.3.0, ag-grid-enterprise@^36.3.0, ag-grid-react@^36.3.0, @paypal/paypal-js@^11.3.0, react@^19.3.1, react-dom@^19.3.1, @tanstack/react-query@^5.105.3 (+28 more)

### Community 5 - "API Package Manifest"
Cohesion: 0.08
Nodes (33): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, fastify@5.12.8, @fastify/cookie@11.1.5 (+25 more)

### Community 6 - "Root Workspace Config"
Cohesion: 0.05
Nodes (41): description, devDependencies, concurrently@^10.0.6, fast-check@^4.10.2, tsx@^4.23.15, @types/node@^26.6.6, @types/pg@^8.23.1, typescript@^7.0.2 (+33 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (24): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, pg-boss@12.38.0 (+16 more)

### Community 8 - "Agents Package Manifest"
Cohesion: 0.13
Nodes (20): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, ai@7.0.163, @ai-sdk/anthropic@4.0.97, @paypal/agent-toolkit@1.11.0, tslib@^2.9.1, zod@4.6.7 (+12 more)

### Community 9 - "Payments Package Manifest"
Cohesion: 0.15
Nodes (16): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, @paypal/paypal-server-sdk@2.5.0, pdf-lib@1.17.1, zod@4.6.7, exports (+8 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.14
Nodes (19): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, Elastic (partner, no prize), FR-09 Dispute Defense Agent, FR-17 Contract Clause Retrieval (P1), Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes (+11 more)

### Community 11 - "core/src/index.ts"
Cohesion: 0.10
Nodes (22): minorFromString(), minorToString(), usd, CallOptions, CallResult, defaultDeps, describeFailure(), FailureInfo (+14 more)

### Community 12 - "TypeScript Base Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+7 more)

### Community 13 - "Hash-Chained Audit Log (FR-11)"
Cohesion: 0.11
Nodes (28): Hash-Chained Audit Log (FR-11), Append-only Trigger and No TRUNCATE Grant, AegisPay Technical Documentation, AG Grid Command Center UI, AI_TOOLS.md and honesty/disclosure, Alerting rules, API endpoint reference, apps/api Fastify server (+20 more)

### Community 14 - "0001_init.sql"
Cohesion: 0.11
Nodes (23): audit_event, catalog_snapshot, dispute, evidence_bundle, fulfillment, mandate, proposal, purchase_order (+15 more)

### Community 15 - "Verified Webhook Ingestion (FR-08)"
Cohesion: 0.11
Nodes (25): Kill Switch, Verified Webhook Ingestion (FR-08), Webhook Events Handled, Session Cookie and CSRF Controls, Offline RSA-SHA256 + CRC32 Verification, Postback verify-webhook-signature, Secrets and Environment Variables, simulate-event Testing (+17 more)

### Community 16 - "DB Package Manifest"
Cohesion: 0.17
Nodes (12): dependencies, @aegis/core@workspace:*, pg@8.23.1, exports, ./testing, @aegis/core, name, private (+4 more)

### Community 17 - "webhooks.test.ts"
Cohesion: 0.11
Nodes (23): isSimulatedEvent(), simulateEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS, CertCache, checkCertUrl(), crc32Decimal() (+15 more)

### Community 18 - "refund-dispute.test.ts"
Cohesion: 0.19
Nodes (20): 2. Failure windows, and how each is closed, Worker (decisions the spec leaves open), acceptedEvidenceCall(), BundleDbRow, DisputeDbRow, DisputeUpsert, findOrderIdByCaptureId(), getDispute() (+12 more)

### Community 19 - "Core Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, zod@4.6.7, exports, zod, name, private, type, version

### Community 20 - "Gatekeeper Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, @aegis/core@workspace:*, exports, @aegis/core, name, private, type, version

### Community 21 - "disputes.test.ts"
Cohesion: 0.20
Nodes (10): getDisputeSources(), EvidenceBundleRow, buildEvidenceBundle(), orderStateForOutcome(), auditRows(), auditTypes(), built(), disputed() (+2 more)

### Community 22 - "db/src/index.ts"
Cohesion: 0.22
Nodes (12): main(), main(), jsonLog(), migrate(), MigrationResult, MIGRATIONS_DIR, sha(), closePool() (+4 more)

### Community 23 - "pdf.ts"
Cohesion: 0.21
Nodes (14): sha256Hex(), EvidenceFile, assertBundleIntegrity(), A4, bundleSha256(), MAX_FILE_BYTES, MAX_TOTAL_BYTES, need() (+6 more)

### Community 24 - "src/mandates.ts"
Cohesion: 0.15
Nodes (18): FixedClock, MandateDraft, BUDGET_COMMITTED_STATES, createMandate(), getMandate(), insertVersion(), listMandates(), MandateDbRow (+10 more)

### Community 25 - "plan.ts"
Cohesion: 0.13
Nodes (16): buildEvidenceInput(), clean(), DisputeReason, DocumentKind, EvidenceType, MAX_FILES, MAX_NOTES_CHARS, planEvidence() (+8 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "payments/src/disputes.ts"
Cohesion: 0.15
Nodes (18): DisputeLink, DisputeRow, hasSubmittedBundle(), BuildResult, DisputeSync, evidenceAlreadySubmitted(), gateChecks(), GatheredFacts (+10 more)

### Community 28 - "harness.ts"
Cohesion: 0.08
Nodes (24): CLIENT_ID, CLIENT_SECRET, Harness, OffsetClock, SeededOrder, startHarness(), OAuthServer, OAuthServerOptions (+16 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): ./tsconfig.base.json, exclude, extends, include

### Community 30 - "clock.ts"
Cohesion: 0.31
Nodes (4): addDays(), DAY_MS, OffsetClock, systemClock

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (43): Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS, computeTotal(), dateMs() (+35 more)

### Community 33 - "api/src/errors.ts"
Cohesion: 0.33
Nodes (7): installErrorHandling(), render(), Rendered, renderError(), ErrorCode, HTTP_STATUS, ApiError

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.13
Nodes (20): Order Drafter Agent, AMOUNT_MISMATCH Check, PayPal Sandbox Contract Tests (@sandbox), Decision SHA-256 Hash, Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, evaluate(mandate, proposal, context) -> Decision, Gatekeeper Tests (table, property, money, 100% branch coverage) (+12 more)

### Community 35 - "client.ts"
Cohesion: 0.24
Nodes (10): verifyChain(), assertSandboxBaseUrl(), loadPayPalConfig(), LOOPBACK, SANDBOX_BASE_URL, writesEnabled(), lower(), PayPalHttpError (+2 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.08
Nodes (31): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Eleven Corrections to Source Report, Source Strategy Report (Blueprint for Winning PayPal AI Hackathon 2026), Migrations and Demo Reset (+23 more)

### Community 37 - "vitest"
Cohesion: 0.16
Nodes (10): ZERO_HASH, createPool(), freshDb(), TEST_URL, TestDb, tamper(), cleanup, emptySchemaPool() (+2 more)

### Community 39 - "Self-check Probes (FR-13)"
Cohesion: 0.29
Nodes (7): Day 1 Spike Questions, Demo Clock Offset (/api/demo/clock), Sandbox Dispute Pool, External Dependencies and Fallbacks, Gap Protection Polling (every 2 minutes), Judge Mode UX, Judging-window Runbook

### Community 40 - "client.ts"
Cohesion: 0.12
Nodes (14): Clock, ShipmentInput, Db, CallDeps, CreateContextOptions, PayPalContext, PayPalConfig, REFRESH_WINDOW_MS (+6 more)

### Community 41 - "payments/src/orders.ts"
Cohesion: 0.13
Nodes (16): AuthorizedHold, buildOrderRequest(), cap(), CARRIERS, getPayPalOrder(), HoldCopy, HONOR_PERIOD_MS, invoiceIdFor() (+8 more)

### Community 42 - "db/src/orders.ts"
Cohesion: 0.13
Nodes (17): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, OrderState, TERMINAL_STATES, CreatedOrder (+9 more)

### Community 43 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.20
Nodes (9): 1. Deviations from the spec, 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 5. Test coverage notes, 6. What is needed from the owner, Decisions the spec leaves open, Deviations from the spec, and what is still unconfirmed, refund() (+1 more)

### Community 44 - "withTx"
Cohesion: 0.09
Nodes (32): advance(), awaitingApproval(), delivered(), held(), delivered(), held(), withTx(), add() (+24 more)

### Community 45 - "webhook-events.ts"
Cohesion: 0.13
Nodes (23): claimVerifiedWebhooks(), getWebhookEvent(), listUnverifiedWebhooks(), markWebhookProcessed(), markWebhookVerified(), recordWebhookEvent(), recordWebhookFailure(), SENSITIVE_HEADERS (+15 more)

### Community 46 - "jobs.ts"
Cohesion: 0.14
Nodes (29): classifyFailure(), ctxOf(), msg(), PERMANENT, PollResult, runCapture(), runPollOpen(), runReauthSweep() (+21 more)

### Community 47 - "Page"
Cohesion: 0.31
Nodes (3): Page, renderOne(), winAnsiSafe()

### Community 49 - "process.ts"
Cohesion: 0.19
Nodes (24): Webhook processing (decisions the spec leaves open), findOrderIdByPayPalRef(), processPendingWebhooks(), CAPTURE_REFUSED, captureIdFromLinks(), getCapture(), Json, mismatch() (+16 more)

### Community 50 - "DomainError"
Cohesion: 0.18
Nodes (28): registerMandateRoutes(), IdParams, ProposalOrderBody, registerOrderRoutes(), VoidBody, DomainError, appendAudit(), amendMandate() (+20 more)

### Community 51 - "payments/src/refunds.ts"
Cohesion: 0.21
Nodes (20): withAdvisoryLock(), getRefundRow(), insertRefund(), listPendingRefunds(), listRefunds(), RefundDbRow, refundedMinor(), RefundRow (+12 more)

### Community 52 - "worker.test.ts"
Cohesion: 0.13
Nodes (16): Log, WorkerHandle, WorkerOptions, logs, state(), jobKey, PAYLOAD, Uuid (+8 more)

### Community 53 - "authorizations.ts"
Cohesion: 0.34
Nodes (12): recordReauthorization(), getOrderBundle(), capture(), getAuthorization(), isFinalClientError(), payments(), reauthorize(), usable() (+4 more)

### Community 54 - "pool.ts"
Cohesion: 0.13
Nodes (16): AUDIT_LOCK_KEY, AuditRow, ChainResult, NewAuditEvent, DisputeSources, SourcesDbRow, FulfillmentDbRow, FulfillmentRow (+8 more)

### Community 55 - "db/src/index.ts"
Cohesion: 0.27
Nodes (10): BuildAppOptions, ApiDeps, Log, registerAuditRoutes(), AmendBody, IdParams, StatusBody, registerWebhooks() (+2 more)

### Community 56 - "ingest.test.ts"
Cohesion: 0.26
Nodes (13): canonicalJson(), normalize(), auditHash(), catalogQueryHash(), CatalogSnapshot, getCatalogSnapshot(), insertCatalogSnapshot(), requireIntactSnapshot() (+5 more)

### Community 57 - "schemas.ts"
Cohesion: 0.13
Nodes (14): ApiErrorSchema, CARRIERS, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate, IsoDateTime, MandateDraftSchema (+6 more)

### Community 58 - "buildApp"
Cohesion: 0.24
Nodes (5): buildApp(), StreamHub, toMessages(), listAuditAfter(), toAudit()

### Community 59 - "api.test.ts"
Cohesion: 0.21
Nodes (8): WEBHOOK_MAX_BYTES, draft(), Frame, held(), newMandate(), placed(), propose(), stateOf()

### Community 60 - "stream.ts"
Cohesion: 0.26
Nodes (10): jsonReplacer(), toJson(), frame(), Log, parseSeq(), registerStream(), SseMessage, StreamRouteOptions (+2 more)

### Community 61 - "webhook-signing.ts"
Cohesion: 0.18
Nodes (8): CERT_URL, makeCert(), referenceCrc32(), SignOptions, signWebhook(), TABLE, TestCert, signed()

### Community 62 - "order-flow.test.ts"
Cohesion: 0.29
Nodes (10): NewProposal, audits(), clock, count(), create(), draft(), held(), mandate() (+2 more)

### Community 63 - "jobs/package.json"
Cohesion: 0.22
Nodes (10): dependencies, pg-boss@12.38.0, zod@4.6.7, exports, pg-boss, zod, name, private (+2 more)

### Community 64 - "session.ts"
Cohesion: 0.25
Nodes (8): fastify, FastifyRequest, installSession(), OPEN, pathOf(), SAFE_METHODS, SESSION_COOKIE, SessionOptions

### Community 65 - "proposals.ts"
Cohesion: 0.31
Nodes (8): BundleDbRow, insertProposal(), listProposalsForMandate(), MandateRow, ProposalDbRow, ProposalRecord, ProposalRow, toProposal()

### Community 66 - "uuidv7"
Cohesion: 0.46
Nodes (6): RFC-9562, uuidv7(), insertOrder(), seedProposal(), newOrder(), settledOrder()

### Community 67 - "suppliers.ts"
Cohesion: 0.43
Nodes (7): getSupplierProfile(), listSupplierProfiles(), normalizeSupplierDomain(), SupplierDbRow, SupplierProfile, toProfile(), upsertSupplierProfile()

## Knowledge Gaps
- **43 isolated node(s):** `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)`, `Journey B: SLA Breach (hold to void)` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 361 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Testing and Verification Strategy`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `core/src/index.ts`, `Hash-Chained Audit Log (FR-11)`, `rules.ts`?**
  _High betweenness centrality (0.313) - this node is a cross-community bridge._
- **What connects `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.057329462989840346 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `Root Workspace Config`, `core/src/index.ts`, `webhooks.test.ts`, `refund-dispute.test.ts`, `disputes.test.ts`, `pdf.ts`, `src/mandates.ts`, `plan.ts`, `clock.ts`, `rules.ts`, `api/src/errors.ts`, `client.ts`, `client.ts`, `payments/src/orders.ts`, `db/src/orders.ts`, `withTx`, `jobs.ts`, `worker.test.ts`, `ingest.test.ts`, `api.test.ts`, `order-flow.test.ts`, `uuidv7`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.09230769230769231 - nodes in this community are weakly interconnected._
- **Why does `AegisPay Technical Design Document` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Testing and Verification Strategy`, `Agent Boundary / Least Privilege`, `Dispute Evidence Assembly`, `Hash-Chained Audit Log (FR-11)`, `Verified Webhook Ingestion (FR-08)`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `Channel3 (sourcing catalog API/MCP)` be split into smaller, more focused modules?**
  _Cohesion score 0.08258258258258258 - nodes in this community are weakly interconnected._