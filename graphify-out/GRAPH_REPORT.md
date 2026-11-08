# Graph Report - AegisPay  (2026-11-08)

## Corpus Check
- 200 files · ~149,587 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1949 nodes · 5106 edges · 93 communities (83 shown, 10 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 138 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f893144a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Authorization Hold (Orders v2 intent AUTHORIZE)
- Decision Record D1-D13
- Channel3 (sourcing catalog API/MCP)
- P0 Scope (FR-01 to FR-14)
- Web Package Manifest
- API Package Manifest
- package.json
- Worker Package Manifest
- Agents Package Manifest
- jobs.ts
- Dispute Evidence Assembly
- call.ts
- TypeScript Base Config
- Hash-Chained Audit Log (FR-11)
- 0001_init.sql
- Verified Webhook Ingestion (FR-08)
- DB Package Manifest
- pool.ts
- test
- Core Package Manifest
- Gatekeeper Package Manifest
- disputes.test.ts
- call.test.ts
- jobs.test.ts
- src/mandates.ts
- db/src/orders.ts
- Workspace Overrides
- withTx
- paypal-server.ts
- TS Project Config
- holdScene.ts
- rules.ts
- Postman Partner
- createHoldScene
- Testing and Verification Strategy
- webhooks.test.ts
- Agent Boundary / Least Privilege
- createPlate
- CLAUDE.md
- 0007_demo_setting.sql
- core/src/index.ts
- api/src/index.ts
- process.ts
- harness.ts
- TopBar.tsx
- Deviations from the spec, and what is still unconfirmed
- webhook-process.test.ts
- web/src/types.ts
- 0004_supplier_profile.sql
- payments/src/disputes.ts
- DomainError
- payments/src/refunds.ts
- CI/CD pipeline (GitHub Actions, gitleaks, Playwright)
- payments/package.json
- api/src/index.ts
- payments/src/disputes.ts
- sourcing.ts
- schemas.ts
- Page
- api.test.ts
- stream.ts
- buildApp
- TokenVault
- jobs/package.json
- Self-check Probes (FR-13)
- pdf.ts
- suppliers.ts
- Queryable
- agents.ts
- api/src/errors.ts
- render-deploy.mjs
- services
- paypal-webhook.mjs
- session.ts
- Deviations from the spec, and what is still unconfirmed
- order-state.test.ts
- CommandGrid.tsx
- steps
- api-client.ts
- demo-order.mjs
- api
- Decision SHA-256 Hash
- @babel/preset-react@8.0.1
- web/tsconfig.json
- scripts
- @types/pg@^8.23.1
- ingest.test.ts
- typescript@^7.0.2
- proposals.ts
- devDependencies
- @vitest/coverage-v8@^5.1.0
- eslint.boundaries.config.mjs
- @playwright/test

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 115 edges
2. `withTx()` - 80 edges
3. `appendAudit()` - 54 edges
4. `vitest` - 47 edges
5. `getOrder()` - 47 edges
6. `transition()` - 44 edges
7. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
8. `authorizeHold()` - 34 edges
9. `uuidv7()` - 33 edges
10. `Hash-Chained Audit Log (FR-11)` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Decisions the spec leaves open` --references--> `spentSoFar()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/src/mandates.ts
- `The five guarantees` --references--> `voidHold()`  [INFERRED]
  README.md → packages/payments/src/authorizations.ts
- `Security notes` --references--> `loadPayPalConfig()`  [INFERRED]
  README.md → packages/payments/src/config.ts
- `Webhook processing (decisions the spec leaves open)` --references--> `findOrderIdByPayPalRef()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/src/orders.ts
- `5b. API decisions that differ from, or go beyond, the TDD` --references--> `JobSender`  [INFERRED]
  docs/DEVIATIONS.md → packages/jobs/src/send.ts

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

## Communities (93 total, 10 thin omitted)

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
Cohesion: 0.04
Nodes (54): dependencies, ag-grid-community@^36.3.0, ag-grid-enterprise@^36.3.0, ag-grid-react@^36.3.0, @fontsource-variable/bodoni-moda@^5.3.0, @fontsource-variable/geist-mono@^5.3.0, @fontsource-variable/schibsted-grotesk@^5.3.0, @gsap/react@2.1.2 (+46 more)

### Community 5 - "API Package Manifest"
Cohesion: 0.07
Nodes (38): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, fastify@5.12.8 (+30 more)

### Community 6 - "package.json"
Cohesion: 0.17
Nodes (11): description, @babel/core@8.1.0, engines, node, license, name, packageManager, private (+3 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (24): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, pg-boss@12.38.0 (+16 more)

### Community 8 - "Agents Package Manifest"
Cohesion: 0.12
Nodes (22): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, ai@7.0.163, @ai-sdk/anthropic@4.0.97, @ai-sdk/groq@4.0.77, @paypal/agent-toolkit@1.11.0, tslib@^2.9.1 (+14 more)

### Community 9 - "jobs.ts"
Cohesion: 0.10
Nodes (38): classifyFailure(), ctxOf(), msg(), PERMANENT, PollResult, runCapture(), runPollOpen(), runReauthSweep() (+30 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.19
Nodes (15): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, FR-09 Dispute Defense Agent, Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes, Defense Agent, Evidence Plan by Dispute Reason (+7 more)

### Community 11 - "call.ts"
Cohesion: 0.15
Nodes (21): ApiDeps, Log, Channel3Config, Clock, ShipmentInput, Db, CallDeps, CallOptions (+13 more)

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
Cohesion: 0.18
Nodes (11): dependencies, @aegis/core@workspace:*, exports, ./testing, @aegis/core, name, private, scripts (+3 more)

### Community 17 - "pool.ts"
Cohesion: 0.15
Nodes (17): main(), jsonLog(), RFC-9562, pg@8.23.1, migrate(), MigrationResult, MIGRATIONS_DIR, sha() (+9 more)

### Community 18 - "test"
Cohesion: 0.07
Nodes (29): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, TEST_DATABASE_URL, jobs, test, name, on (+21 more)

### Community 19 - "Core Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, zod@4.6.7, exports, zod, name, private, type, version

### Community 20 - "Gatekeeper Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, @aegis/core@workspace:*, exports, @aegis/core, name, private, type, version

### Community 21 - "disputes.test.ts"
Cohesion: 0.16
Nodes (27): bundleView(), DisputeParams, FileParams, humanName(), registerDisputeRoutes(), getDisputeSources(), BundleDbRow, DisputeDbRow (+19 more)

### Community 22 - "call.test.ts"
Cohesion: 0.12
Nodes (12): createSelfCheck(), Probe, ProbeName, SelfCheckResult, timed(), describeFailure(), header(), isNetworkError() (+4 more)

### Community 23 - "jobs.test.ts"
Cohesion: 0.08
Nodes (33): advance(), awaitingApproval(), cert, delivered(), state(), delivered(), held(), logs (+25 more)

### Community 24 - "src/mandates.ts"
Cohesion: 0.15
Nodes (21): AmendBody, IdParams, registerMandateRoutes(), StatusBody, CreateMandateBody, MandateDraft, BUDGET_COMMITTED_STATES, getCurrentMandate() (+13 more)

### Community 25 - "db/src/orders.ts"
Cohesion: 0.14
Nodes (15): OrderState, AUDIT_LOCK_KEY, auditHash(), AuditRow, ChainResult, NewAuditEvent, OrderDbRow, OrderPatch (+7 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "withTx"
Cohesion: 0.13
Nodes (38): IdParams, ProposalOrderBody, registerOrderRoutes(), VoidBody, runTrackingPush(), appendAudit(), uuidv7(), amendMandate() (+30 more)

### Community 28 - "paypal-server.ts"
Cohesion: 0.10
Nodes (15): OAuthServerOptions, SeenRequest, ALLOWED_EVIDENCE_EXT, Auth, Cap, D(), Disp, Failure (+7 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): exclude, extends, include, ./tsconfig.base.json

### Community 30 - "holdScene.ts"
Cohesion: 0.08
Nodes (34): gsap@^3.15.1, feedPulse(), Hero(), RingsFallback(), StoreState, useHoldScene(), usePlate(), CHAPTERS (+26 more)

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (43): Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS, computeTotal(), dateMs() (+35 more)

### Community 33 - "createHoldScene"
Cohesion: 0.30
Nodes (11): createHoldScene(), drop(), frame(), move(), place(), render(), resize(), setShape() (+3 more)

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.15
Nodes (17): Static and Compliance CI Checks, PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, Gatekeeper Tests (table, property, money, 100% branch coverage), PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests (+9 more)

### Community 35 - "webhooks.test.ts"
Cohesion: 0.08
Nodes (29): isSimulatedEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS, CertCache, checkCertUrl(), crc32Decimal(), HeaderBag (+21 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.12
Nodes (22): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Migrations and Demo Reset, Prompt and Safety Rules, Table audit_event (+14 more)

### Community 37 - "createPlate"
Cohesion: 0.14
Nodes (12): compile(), createPlate(), draw(), readTheme(), request(), sync(), tick(), hexRgb() (+4 more)

### Community 40 - "core/src/index.ts"
Cohesion: 0.22
Nodes (5): ErrorCode, HTTP_STATUS, ZERO_HASH, tamper(), vitest

### Community 41 - "api/src/index.ts"
Cohesion: 0.24
Nodes (12): main(), modelFromEnv(), createJobSender(), ensureQueues(), createPayPalContext(), sameOrigin(), assertSandboxBaseUrl(), loadPayPalConfig() (+4 more)

### Community 42 - "process.ts"
Cohesion: 0.21
Nodes (22): findOrderIdByPayPalRef(), CAPTURE_REFUSED, captureIdFromLinks(), getCapture(), Json, mismatch(), note(), obj() (+14 more)

### Community 43 - "harness.ts"
Cohesion: 0.10
Nodes (10): CATALOG, draft(), Frame, inDays(), liveModel, make(), newMandate(), noJobs (+2 more)

### Community 44 - "TopBar.tsx"
Cohesion: 0.24
Nodes (10): ThemeToggle(), apply(), initTheme(), listeners, media, pref, resolvedTheme(), setThemePref() (+2 more)

### Community 45 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.14
Nodes (14): 1. Deviations from the spec, 2. Failure windows, and how each is closed, 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 5d. Web app decisions that differ from, or go beyond, the TDD, 5e. Tooling decisions, 5f. Observed live: the sandbox dispute never opened the seller-response stage, 5g. Front-end redesign: decisions that go beyond the TDD (+6 more)

### Community 46 - "webhook-process.test.ts"
Cohesion: 0.09
Nodes (32): Webhook processing (decisions the spec leaves open), claimVerifiedWebhooks(), getWebhookEvent(), listUnverifiedWebhooks(), markWebhookProcessed(), markWebhookVerified(), recordWebhookEvent(), recordWebhookFailure() (+24 more)

### Community 47 - "web/src/types.ts"
Cohesion: 0.14
Nodes (22): AgentDrawer(), headline(), LABEL, DisputeDetail, formatClock(), AppState, StreamStatus, Toast (+14 more)

### Community 49 - "payments/src/disputes.ts"
Cohesion: 0.13
Nodes (20): 5c. Agent decisions that differ from, or go beyond, the TDD, DisputeLink, DisputeRow, hasSubmittedBundle(), BuildResult, DisputeSync, evidenceAlreadySubmitted(), fetchDispute() (+12 more)

### Community 50 - "DomainError"
Cohesion: 0.09
Nodes (46): held(), DomainError, verifyChain(), getFulfillment(), recordPayPalOrderId(), recordReauthorization(), getOrderBundle(), capture() (+38 more)

### Community 51 - "payments/src/refunds.ts"
Cohesion: 0.15
Nodes (23): withAdvisoryLock(), getRefundRow(), insertRefund(), listPendingRefunds(), listRefunds(), RefundDbRow, refundedMinor(), RefundRow (+15 more)

### Community 52 - "CI/CD pipeline (GitHub Actions, gitleaks, Playwright)"
Cohesion: 0.17
Nodes (12): 29-day authorization validity and 3-day honor period, CI/CD pipeline (GitHub Actions, gitleaks, Playwright), Environment configuration (zod, fail fast), Feature flags (BRYNTUM, REAUTH, ELASTIC, POLL_FALLBACK), Judge Mode (demo reset, clock offset, sandbox buyer banner), Local development and sandbox setup, /paypal:doctor report, Reauthorization (P1, FEATURE_REAUTH) (+4 more)

### Community 53 - "payments/package.json"
Cohesion: 0.15
Nodes (16): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, @paypal/paypal-server-sdk@2.5.0, pdf-lib@1.17.1, zod@4.6.7, exports (+8 more)

### Community 54 - "api/src/index.ts"
Cohesion: 0.16
Nodes (12): registerDemoRoutes(), 5b. API decisions that differ from, or go beyond, the TDD, addDays(), DAY_MS, FixedClock, OffsetClock, systemClock, DEMO_TABLES (+4 more)

### Community 55 - "payments/src/disputes.ts"
Cohesion: 0.12
Nodes (17): buildEvidenceInput(), clean(), DisputeReason, DocumentKind, EvidenceType, MAX_FILES, MAX_NOTES_CHARS, planEvidence() (+9 more)

### Community 56 - "sourcing.ts"
Cohesion: 0.05
Nodes (65): Money as bigint Minor Units, assertChannel3Url(), CatalogOffer, CatalogProduct, CatalogSearch, CHANNEL3_BASE_URL, channel3FromEnv(), isLoopback() (+57 more)

### Community 57 - "schemas.ts"
Cohesion: 0.14
Nodes (13): ApiErrorSchema, CARRIERS, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate, IsoDateTime, MandateSpecSchema (+5 more)

### Community 59 - "api.test.ts"
Cohesion: 0.20
Nodes (11): WEBHOOK_MAX_BYTES, draft(), Frame, held(), newMandate(), placed(), propose(), settledOrder() (+3 more)

### Community 60 - "stream.ts"
Cohesion: 0.11
Nodes (17): jsonReplacer(), toJson(), AuditMessage, factMessage(), frame(), Log, parseSeq(), registerStream() (+9 more)

### Community 61 - "buildApp"
Cohesion: 0.17
Nodes (10): buildApp(), BuildAppOptions, registerAuditRoutes(), registerWebhooks(), catalog, make(), noJobs, make() (+2 more)

### Community 62 - "TokenVault"
Cohesion: 0.12
Nodes (7): REFRESH_WINDOW_MS, Token, tokenResponse, TokenVault, TokenVaultOptions, MutableClock, vault()

### Community 63 - "jobs/package.json"
Cohesion: 0.22
Nodes (10): dependencies, pg-boss@12.38.0, zod@4.6.7, exports, pg-boss, zod, name, private (+2 more)

### Community 64 - "Self-check Probes (FR-13)"
Cohesion: 0.18
Nodes (11): Day 1 Spike Questions, Demo Clock Offset (/api/demo/clock), Sandbox Dispute Pool, External Dependencies and Fallbacks, Gap Protection Polling (every 2 minutes), Judge Mode UX, Monitoring and /status Page, Render Blueprint render.yaml (+3 more)

### Community 65 - "pdf.ts"
Cohesion: 0.19
Nodes (16): 5. Test coverage notes, sha256Hex(), EvidenceFile, assertBundleIntegrity(), A4, bundleSha256(), MAX_FILE_BYTES, MAX_TOTAL_BYTES (+8 more)

### Community 66 - "suppliers.ts"
Cohesion: 0.43
Nodes (7): getSupplierProfile(), listSupplierProfiles(), normalizeSupplierDomain(), SupplierDbRow, SupplierProfile, toProfile(), upsertSupplierProfile()

### Community 67 - "Queryable"
Cohesion: 0.25
Nodes (6): DisputeSources, SourcesDbRow, FulfillmentDbRow, FulfillmentRow, markTrackingPushed(), Queryable

### Community 68 - "agents.ts"
Cohesion: 0.33
Nodes (9): IdParams, isoDate(), registerAgentRoutes(), SourceBody, buildQuery(), lockMandate(), spentSoFar(), toGateMandate() (+1 more)

### Community 69 - "api/src/errors.ts"
Cohesion: 0.60
Nodes (5): installErrorHandling(), render(), Rendered, renderError(), ApiError

### Community 70 - "render-deploy.mjs"
Cohesion: 0.25
Nodes (6): db, key, NAMES, owner, svc, wanted

### Community 71 - "services"
Cohesion: 0.09
Nodes (22): databases, databaseName, name, plan, user, fromDatabase, generateValue, key (+14 more)

### Community 72 - "paypal-webhook.mjs"
Cohesion: 0.33
Nodes (5): appUrl, base, EVENTS, headers, hook

### Community 73 - "session.ts"
Cohesion: 0.25
Nodes (8): fastify, FastifyRequest, installSession(), OPEN, pathOf(), SAFE_METHODS, SESSION_COOKIE, SessionOptions

### Community 74 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.14
Nodes (11): AI tools used, Inside the product (runtime), Used to build it, 90-second quickstart (local), AegisPay, Deploy, How it is built, Judge Mode (+3 more)

### Community 75 - "order-state.test.ts"
Cohesion: 0.31
Nodes (6): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, TERMINAL_STATES

### Community 76 - "CommandGrid.tsx"
Cohesion: 0.12
Nodes (28): AuditDetail(), CommandGrid(), DISPUTE_STATES, GateCell(), GridCtx, isNarrow(), licenseKey, NARROW (+20 more)

### Community 77 - "steps"
Cohesion: 0.09
Nodes (21): APP_URL, E2E_BASE_URL, jobs, nightly, name, runs-on, steps, timeout-minutes (+13 more)

### Community 78 - "api-client.ts"
Cohesion: 0.16
Nodes (16): APP_URL, call(), openSession(), printSelfCheck(), ProbeResult, SelfCheckBody, Session, CLOSED (+8 more)

### Community 80 - "api"
Cohesion: 0.15
Nodes (37): api(), ApiError, errorMessage(), getSession(), send(), App(), CommandGrid, Stream() (+29 more)

### Community 81 - "Decision SHA-256 Hash"
Cohesion: 0.40
Nodes (6): Order Drafter Agent, AMOUNT_MISMATCH Check, Decision SHA-256 Hash, evaluate(mandate, proposal, context) -> Decision, Mandate/Proposal/Context/Decision Types, Order Payload Built by Code

### Community 83 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 84 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, dev, e2e, lint, migrate, nightly, register-webhook (+8 more)

### Community 86 - "ingest.test.ts"
Cohesion: 0.29
Nodes (12): canonicalJson(), normalize(), catalogQueryHash(), CatalogSnapshot, getCatalogSnapshot(), insertCatalogSnapshot(), requireIntactSnapshot(), SnapshotDbRow (+4 more)

### Community 88 - "proposals.ts"
Cohesion: 0.21
Nodes (11): CreatedOrder, OrderRow, BundleDbRow, listProposalsForMandate(), MandateRow, NewProposal, OrderBundle, ProposalDbRow (+3 more)

### Community 89 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @babel/preset-typescript@8.0.7, concurrently@^10.0.6, eslint@10.14.0, fast-check@^4.10.2, tsx@^4.23.15, @types/node@^26.6.6, vitest@^5.1.0 (+6 more)

### Community 92 - "eslint.boundaries.config.mjs"
Cohesion: 0.29
Nodes (3): IGNORES, @babel/eslint-parser@8.0.7, @babel/eslint-parser

### Community 93 - "@playwright/test"
Cohesion: 0.40
Nodes (3): channel, @playwright/test@^1.65.0, @playwright/test

## Knowledge Gaps
- **44 isolated node(s):** `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 570 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Testing and Verification Strategy`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `Hash-Chained Audit Log (FR-11)`, `Verified Webhook Ingestion (FR-08)`, `Decision SHA-256 Hash`, `sourcing.ts`, `rules.ts`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **What connects `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.07965860597439545 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `core/src/index.ts` to `Web Package Manifest`, `package.json`, `call.ts`, `pool.ts`, `disputes.test.ts`, `call.test.ts`, `jobs.test.ts`, `src/mandates.ts`, `withTx`, `rules.ts`, `webhooks.test.ts`, `api/src/index.ts`, `harness.ts`, `webhook-process.test.ts`, `DomainError`, `payments/src/refunds.ts`, `api/src/index.ts`, `payments/src/disputes.ts`, `sourcing.ts`, `api.test.ts`, `buildApp`, `TokenVault`, `pdf.ts`, `order-state.test.ts`, `ingest.test.ts`, `devDependencies`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.11229946524064172 - nodes in this community are weakly interconnected._
- **Why does `DomainError` connect `DomainError` to `jobs.ts`, `call.ts`, `pool.ts`, `disputes.test.ts`, `call.test.ts`, `jobs.test.ts`, `src/mandates.ts`, `db/src/orders.ts`, `withTx`, `webhooks.test.ts`, `core/src/index.ts`, `api/src/index.ts`, `process.ts`, `webhook-process.test.ts`, `payments/src/disputes.ts`, `payments/src/refunds.ts`, `api/src/index.ts`, `payments/src/disputes.ts`, `sourcing.ts`, `TokenVault`, `pdf.ts`, `suppliers.ts`, `agents.ts`, `api/src/errors.ts`, `session.ts`, `ingest.test.ts`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Should `Channel3 (sourcing catalog API/MCP)` be split into smaller, more focused modules?**
  _Cohesion score 0.08708708708708708 - nodes in this community are weakly interconnected._