# Graph Report - AegisPay  (2026-11-06)

## Corpus Check
- 153 files · ~123,107 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 1555 nodes · 4183 edges · 72 communities (68 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 112 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `47329c56`
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
- webhook-signing.ts
- refund-dispute.test.ts
- Core Package Manifest
- Gatekeeper Package Manifest
- disputes.test.ts
- api/src/index.ts
- pdf.ts
- src/mandates.ts
- plan.ts
- Workspace Overrides
- payments/src/disputes.ts
- harness.ts
- TS Project Config
- sourcing.ts
- rules.ts
- Postman Partner
- ingest.test.ts
- Testing and Verification Strategy
- webhooks.test.ts
- Agent Boundary / Least Privilege
- CI/CD pipeline (GitHub Actions, gitleaks, Playwright)
- CLAUDE.md
- verify-offline.ts
- Clock
- DomainError
- order-state.test.ts
- db/src/index.ts
- transition
- webhook-events.ts
- jobs.ts
- Page
- 0004_supplier_profile.sql
- process.ts
- CertCache
- payments/src/refunds.ts
- worker.test.ts
- ref_node_fs
- dispute-sources.ts
- Decision SHA-256 Hash
- 1. Deviations from the spec
- schemas.ts
- api.test.ts
- stream.ts
- testing.ts
- order-flow.test.ts
- jobs/package.json
- order-flow.ts
- uuidv7
- suppliers.ts
- authorizations.ts
- holds.sandbox.test.ts
- systemClock
- ref_node_crypto
- Deviations from the spec, and what is still unconfirmed
- Day 1 Spike Questions

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 113 edges
2. `withTx()` - 75 edges
3. `appendAudit()` - 49 edges
4. `getOrder()` - 47 edges
5. `vitest` - 44 edges
6. `transition()` - 44 edges
7. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
8. `authorizeHold()` - 33 edges
9. `Hash-Chained Audit Log (FR-11)` - 31 edges
10. `uuidv7()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Decisions the spec leaves open` --references--> `spentSoFar()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/src/mandates.ts
- `Webhook processing (decisions the spec leaves open)` --references--> `findOrderIdByPayPalRef()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/src/orders.ts
- `5b. API decisions that differ from, or go beyond, the TDD` --references--> `JobSender`  [INFERRED]
  docs/DEVIATIONS.md → packages/jobs/src/send.ts
- `1. Deviations from the spec` --references--> `paypalCall()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/call.ts
- `5c. Agent decisions that differ from, or go beyond, the TDD` --references--> `fetchDispute()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/disputes.ts

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

## Communities (72 total, 4 thin omitted)

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
Cohesion: 0.06
Nodes (46): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, fastify@5.12.8 (+38 more)

### Community 6 - "Root Workspace Config"
Cohesion: 0.05
Nodes (41): description, devDependencies, concurrently@^10.0.6, fast-check@^4.10.2, tsx@^4.23.15, @types/node@^26.6.6, @types/pg@^8.23.1, typescript@^7.0.2 (+33 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (24): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, pg-boss@12.38.0 (+16 more)

### Community 8 - "Agents Package Manifest"
Cohesion: 0.12
Nodes (22): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, ai@7.0.163, @ai-sdk/anthropic@4.0.97, @ai-sdk/groq@4.0.77, @paypal/agent-toolkit@1.11.0, tslib@^2.9.1 (+14 more)

### Community 9 - "Payments Package Manifest"
Cohesion: 0.14
Nodes (18): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, @paypal/paypal-server-sdk@2.5.0, pdf-lib@1.17.1, zod@4.6.7, exports (+10 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.19
Nodes (15): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, FR-09 Dispute Defense Agent, Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes, Defense Agent, Evidence Plan by Dispute Reason (+7 more)

### Community 11 - "core/src/index.ts"
Cohesion: 0.15
Nodes (15): CallOptions, defaultDeps, describeFailure(), FailureInfo, header(), isNetworkError(), jitter(), MAX_401_RETRIES (+7 more)

### Community 12 - "TypeScript Base Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+7 more)

### Community 13 - "Hash-Chained Audit Log (FR-11)"
Cohesion: 0.08
Nodes (36): Hash-Chained Audit Log (FR-11), Order Lifecycle State Machine, appendAudit(tx, event) with advisory lock, Append-only Trigger and No TRUNCATE Grant, Postgres LISTEN/NOTIFY Feed, row_version Optimistic Locking, Table fulfillment, Table purchase_order (+28 more)

### Community 14 - "0001_init.sql"
Cohesion: 0.11
Nodes (23): audit_event, catalog_snapshot, dispute, evidence_bundle, fulfillment, mandate, proposal, purchase_order (+15 more)

### Community 15 - "Verified Webhook Ingestion (FR-08)"
Cohesion: 0.12
Nodes (25): Kill Switch, Verified Webhook Ingestion (FR-08), Webhook Events Handled, Session Cookie and CSRF Controls, Offline RSA-SHA256 + CRC32 Verification, Postback verify-webhook-signature, Secrets and Environment Variables, simulate-event Testing (+17 more)

### Community 16 - "DB Package Manifest"
Cohesion: 0.17
Nodes (12): dependencies, @aegis/core@workspace:*, pg@8.23.1, exports, ./testing, @aegis/core, name, private (+4 more)

### Community 17 - "webhook-signing.ts"
Cohesion: 0.25
Nodes (7): CERT_URL, referenceCrc32(), SignOptions, signWebhook(), TABLE, TestCert, signed()

### Community 18 - "refund-dispute.test.ts"
Cohesion: 0.28
Nodes (11): BundleDbRow, DisputeDbRow, DisputeUpsert, insertEvidenceBundle(), latestEvidenceBundle(), markBundleReviewed(), markBundleSubmitted(), toBundle() (+3 more)

### Community 19 - "Core Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, zod@4.6.7, exports, zod, name, private, type, version

### Community 20 - "Gatekeeper Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, @aegis/core@workspace:*, exports, @aegis/core, name, private, type, version

### Community 21 - "disputes.test.ts"
Cohesion: 0.17
Nodes (21): bundleView(), DisputeParams, FileParams, humanName(), registerDisputeRoutes(), getDisputeSources(), findOrderIdByCaptureId(), getDispute() (+13 more)

### Community 22 - "api/src/index.ts"
Cohesion: 0.32
Nodes (10): main(), main(), jsonLog(), channel3FromEnv(), modelFromEnv(), closePool(), createJobSender(), ensureQueues() (+2 more)

### Community 23 - "pdf.ts"
Cohesion: 0.16
Nodes (17): sha256Hex(), EvidenceBundleRow, EvidenceFile, assertBundleIntegrity(), A4, bundleSha256(), MAX_FILE_BYTES, MAX_TOTAL_BYTES (+9 more)

### Community 24 - "src/mandates.ts"
Cohesion: 0.15
Nodes (27): AmendBody, IdParams, registerMandateRoutes(), StatusBody, minorFromString(), MandateDraft, amendMandate(), BUDGET_COMMITTED_STATES (+19 more)

### Community 25 - "plan.ts"
Cohesion: 0.12
Nodes (16): GatheredFacts, RenderFacts, buildEvidenceInput(), clean(), DisputeReason, EvidenceFacts, EvidenceType, planEvidence() (+8 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "payments/src/disputes.ts"
Cohesion: 0.15
Nodes (18): 5c. Agent decisions that differ from, or go beyond, the TDD, DisputeLink, DisputeRow, hasSubmittedBundle(), BuildResult, DisputeSync, evidenceAlreadySubmitted(), fetchDispute() (+10 more)

### Community 28 - "harness.ts"
Cohesion: 0.09
Nodes (14): OAuthServerOptions, SeenRequest, ALLOWED_EVIDENCE_EXT, Auth, Cap, D(), Disp, Failure (+6 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): ./tsconfig.base.json, exclude, extends, include

### Community 30 - "sourcing.ts"
Cohesion: 0.05
Nodes (63): Money as bigint Minor Units, assertChannel3Url(), CatalogOffer, CatalogProduct, CatalogSearch, CHANNEL3_BASE_URL, isLoopback(), OfferSchema (+55 more)

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (43): Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS, computeTotal(), dateMs() (+35 more)

### Community 33 - "ingest.test.ts"
Cohesion: 0.22
Nodes (15): RFC-9562, canonicalJson(), normalize(), auditHash(), catalogQueryHash(), CatalogSnapshot, getCatalogSnapshot(), insertCatalogSnapshot() (+7 more)

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.15
Nodes (17): Static and Compliance CI Checks, PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, Gatekeeper Tests (table, property, money, 100% branch coverage), PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests (+9 more)

### Community 35 - "webhooks.test.ts"
Cohesion: 0.20
Nodes (11): isSimulatedEvent(), simulateEvent(), checkCertUrl(), parseWebhookHeaders(), verifyOffline(), PostbackInput, verifyPostback(), Verification (+3 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.12
Nodes (22): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Migrations and Demo Reset, Prompt and Safety Rules, Table audit_event (+14 more)

### Community 37 - "CI/CD pipeline (GitHub Actions, gitleaks, Playwright)"
Cohesion: 0.17
Nodes (12): 29-day authorization validity and 3-day honor period, CI/CD pipeline (GitHub Actions, gitleaks, Playwright), Environment configuration (zod, fail fast), Feature flags (BRYNTUM, REAUTH, ELASTIC, POLL_FALLBACK), Judge Mode (demo reset, clock offset, sandbox buyer banner), Local development and sandbox setup, /paypal:doctor report, Reauthorization (P1, FEATURE_REAUTH) (+4 more)

### Community 39 - "verify-offline.ts"
Cohesion: 0.20
Nodes (9): CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS, crc32Decimal(), HeaderBag, OfflineInput, OfflineResult, signedMessage() (+1 more)

### Community 40 - "Clock"
Cohesion: 0.18
Nodes (14): Clock, ShipmentInput, Db, CallDeps, CreateContextOptions, PayPalContext, PayPalConfig, REFRESH_WINDOW_MS (+6 more)

### Community 41 - "DomainError"
Cohesion: 0.13
Nodes (17): recordPayPalOrderId(), AuthorizedHold, buildOrderRequest(), cap(), CARRIERS, getPayPalOrder(), HoldCopy, HONOR_PERIOD_MS (+9 more)

### Community 42 - "order-state.test.ts"
Cohesion: 0.31
Nodes (6): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, TERMINAL_STATES

### Community 43 - "db/src/index.ts"
Cohesion: 0.11
Nodes (17): BuildAppOptions, ApiDeps, Log, registerAuditRoutes(), IdParams, ProposalOrderBody, VoidBody, registerWebhooks() (+9 more)

### Community 44 - "transition"
Cohesion: 0.12
Nodes (28): advance(), awaitingApproval(), delivered(), held(), delivered(), held(), logs, state() (+20 more)

### Community 45 - "webhook-events.ts"
Cohesion: 0.10
Nodes (29): Webhook processing (decisions the spec leaves open), claimVerifiedWebhooks(), getWebhookEvent(), listUnverifiedWebhooks(), markWebhookProcessed(), markWebhookVerified(), recordWebhookEvent(), recordWebhookFailure() (+21 more)

### Community 46 - "jobs.ts"
Cohesion: 0.12
Nodes (33): classifyFailure(), ctxOf(), msg(), PERMANENT, PollResult, runCapture(), runPollOpen(), runReauthSweep() (+25 more)

### Community 47 - "Page"
Cohesion: 0.31
Nodes (3): Page, renderOne(), winAnsiSafe()

### Community 49 - "process.ts"
Cohesion: 0.18
Nodes (30): registerOrderRoutes(), DomainError, appendAudit(), cancelUnapprovedOrder(), recordDelivery(), recordShipment(), findOrderIdByPayPalRef(), getOrder() (+22 more)

### Community 50 - "CertCache"
Cohesion: 0.18
Nodes (3): CertCache, VerifyEventInput, certs()

### Community 51 - "payments/src/refunds.ts"
Cohesion: 0.16
Nodes (22): withAdvisoryLock(), getRefundRow(), insertRefund(), listPendingRefunds(), listRefunds(), RefundDbRow, refundedMinor(), RefundRow (+14 more)

### Community 52 - "worker.test.ts"
Cohesion: 0.16
Nodes (11): 5b. API decisions that differ from, or go beyond, the TDD, jobKey, PAYLOAD, Uuid, VoidJob, QUEUE, QUEUE_DEFS, QueueName (+3 more)

### Community 53 - "ref_node_fs"
Cohesion: 0.11
Nodes (8): cfg, APP, STATE, appUrl, base, EVENTS, headers, hook

### Community 55 - "Decision SHA-256 Hash"
Cohesion: 0.40
Nodes (6): Order Drafter Agent, AMOUNT_MISMATCH Check, Decision SHA-256 Hash, evaluate(mandate, proposal, context) -> Decision, Mandate/Proposal/Context/Decision Types, Order Payload Built by Code

### Community 56 - "1. Deviations from the spec"
Cohesion: 0.67
Nodes (3): 1. Deviations from the spec, Decisions the spec leaves open, refund()

### Community 57 - "schemas.ts"
Cohesion: 0.10
Nodes (21): installErrorHandling(), render(), Rendered, renderError(), ErrorCode, HTTP_STATUS, ApiError, ApiErrorSchema (+13 more)

### Community 59 - "api.test.ts"
Cohesion: 0.10
Nodes (21): WEBHOOK_MAX_BYTES, draft(), Frame, held(), newMandate(), placed(), propose(), settledOrder() (+13 more)

### Community 60 - "stream.ts"
Cohesion: 0.11
Nodes (20): buildApp(), jsonReplacer(), toJson(), frame(), Log, parseSeq(), registerStream(), SseMessage (+12 more)

### Community 61 - "testing.ts"
Cohesion: 0.15
Nodes (15): migrate(), MigrationResult, MIGRATIONS_DIR, sha(), createPool(), getPool(), PoolOptions, types (+7 more)

### Community 62 - "order-flow.test.ts"
Cohesion: 0.16
Nodes (19): OrderState, OrderDbRow, AuditDbRow, getOrderGridRow(), GridDbRow, listAuditForEntity(), listOrderGrid(), OrderGridRow (+11 more)

### Community 63 - "jobs/package.json"
Cohesion: 0.22
Nodes (10): dependencies, pg-boss@12.38.0, zod@4.6.7, exports, pg-boss, zod, name, private (+2 more)

### Community 65 - "order-flow.ts"
Cohesion: 0.11
Nodes (22): systemClock, FulfillmentDbRow, FulfillmentRow, CreatedOrder, createOrderFromProposal(), FULFILLMENT_SOURCE, OrderPatch, OrderRow (+14 more)

### Community 66 - "uuidv7"
Cohesion: 0.24
Nodes (7): insertOrder(), seedProposal(), newOrder(), stateOf(), settledOrder(), paypal(), vitest

### Community 67 - "suppliers.ts"
Cohesion: 0.19
Nodes (14): IdParams, isoDate(), registerAgentRoutes(), SourceBody, lockMandate(), toGateMandate(), insertProposal(), getSupplierProfile() (+6 more)

### Community 68 - "authorizations.ts"
Cohesion: 0.30
Nodes (13): recordReauthorization(), getOrderBundle(), capture(), getAuthorization(), isFinalClientError(), payments(), REAUTH_LEAD_MS, reauthorize() (+5 more)

### Community 69 - "holds.sandbox.test.ts"
Cohesion: 0.21
Nodes (12): verifyChain(), CallResult, assertSandboxBaseUrl(), loadPayPalConfig(), LOOPBACK, SANDBOX_BASE_URL, writesEnabled(), lower() (+4 more)

### Community 71 - "systemClock"
Cohesion: 0.24
Nodes (4): addDays(), DAY_MS, FixedClock, OffsetClock

### Community 73 - "ref_node_crypto"
Cohesion: 0.18
Nodes (7): ZERO_HASH, db, key, NAMES, owner, svc, wanted

### Community 74 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.20
Nodes (9): 2. Failure windows, and how each is closed, 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 5. Test coverage notes, 6. What is needed from the owner, Deviations from the spec, and what is still unconfirmed, Worker (decisions the spec leaves open), acceptedEvidenceCall() (+1 more)

### Community 77 - "Day 1 Spike Questions"
Cohesion: 0.18
Nodes (11): Day 1 Spike Questions, Demo Clock Offset (/api/demo/clock), Sandbox Dispute Pool, External Dependencies and Fallbacks, Gap Protection Polling (every 2 minutes), Judge Mode UX, Monitoring and /status Page, Render Blueprint render.yaml (+3 more)

## Knowledge Gaps
- **43 isolated node(s):** `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)`, `Journey B: SLA Breach (hold to void)` (+38 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 417 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Testing and Verification Strategy`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `Hash-Chained Audit Log (FR-11)`, `Verified Webhook Ingestion (FR-08)`, `Decision SHA-256 Hash`, `sourcing.ts`, `rules.ts`?**
  _High betweenness centrality (0.298) - this node is a cross-community bridge._
- **What connects `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund` to the rest of the system?**
  _43 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.07965860597439545 - nodes in this community are weakly interconnected._
- **Why does `Agent Boundary / Least Privilege` connect `Agent Boundary / Least Privilege` to `Decision Record D1-D13`, `Channel3 (sourcing catalog API/MCP)`, `P0 Scope (FR-01 to FR-14)`, `Testing and Verification Strategy`, `Dispute Evidence Assembly`, `Hash-Chained Audit Log (FR-11)`, `Verified Webhook Ingestion (FR-08)`, `Decision SHA-256 Hash`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.11229946524064172 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `uuidv7` to `Root Workspace Config`, `core/src/index.ts`, `refund-dispute.test.ts`, `disputes.test.ts`, `pdf.ts`, `src/mandates.ts`, `plan.ts`, `sourcing.ts`, `rules.ts`, `ingest.test.ts`, `webhooks.test.ts`, `Clock`, `DomainError`, `order-state.test.ts`, `db/src/index.ts`, `transition`, `webhook-events.ts`, `jobs.ts`, `payments/src/refunds.ts`, `ref_node_fs`, `schemas.ts`, `api.test.ts`, `testing.ts`, `order-flow.test.ts`, `holds.sandbox.test.ts`, `systemClock`, `ref_node_crypto`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `Channel3 (sourcing catalog API/MCP)` be split into smaller, more focused modules?**
  _Cohesion score 0.08708708708708708 - nodes in this community are weakly interconnected._