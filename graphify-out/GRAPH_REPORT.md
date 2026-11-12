# Graph Report - AegisPay  (2026-11-12)

## Corpus Check
- 205 files · ~169,849 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 2044 nodes · 5404 edges · 87 communities (79 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 173 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e0799195`
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
- db/src/index.ts
- test
- Core Package Manifest
- Gatekeeper Package Manifest
- payments/src/disputes.ts
- AegisPay
- sourcing.ts
- src/mandates.ts
- DomainError
- Workspace Overrides
- harness.ts
- harness.ts
- TS Project Config
- holdScene.ts
- rules.ts
- Postman Partner
- webhook-process.test.ts
- Testing and Verification Strategy
- webhooks.test.ts
- Agent Boundary / Least Privilege
- createPlate
- CLAUDE.md
- 0007_demo_setting.sql
- routes/disputes.ts
- agents/test/agents.test.ts
- process.ts
- api/test/agents.test.ts
- TopBar.tsx
- webhook-process.test.ts
- DomainError
- web/src/types.ts
- 0004_supplier_profile.sql
- webhook-signing.ts
- pool.ts
- authorizations.ts
- pdf.ts
- payments/package.json
- paypal-server.ts
- payments/src/disputes.ts
- schemas.ts
- channel3.ts
- Page
- api.test.ts
- stream.ts
- disputes.test.ts
- client.ts
- jobs/package.json
- withTx
- Deviations from the spec, and what is still unconfirmed
- concurrently@^10.0.6
- dispute-supporting-info.sandbox.test.ts
- @aegis/payments package
- services
- @babel/core@8.1.0
- usd
- typescript@^7.0.2
- CommandGrid.tsx
- steps
- api-client.ts
- api
- order-state.test.ts
- web/tsconfig.json
- scripts
- vitest
- agents.ts
- webhook-pipeline.test.ts
- devDependencies
- eslint.boundaries.config.mjs
- @playwright/test
- API endpoint reference

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 119 edges
2. `withTx()` - 83 edges
3. `appendAudit()` - 55 edges
4. `vitest` - 50 edges
5. `getOrder()` - 49 edges
6. `transition()` - 47 edges
7. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
8. `authorizeHold()` - 38 edges
9. `uuidv7()` - 33 edges
10. `createHold()` - 33 edges

## Surprising Connections (you probably didn't know these)
- `Audit log` --references--> `verifyChain()`  [INFERRED]
  README.md → packages/db/src/audit.ts
- `4. Real-sandbox findings (verified)` --references--> `reauthDue()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/authorizations.ts
- `3. Live checks added on 2026-11-08` --references--> `paypalCall()`  [INFERRED]
  docs/SANDBOX_VERIFICATION.md → packages/payments/src/call.ts
- `Safety guarantees` --references--> `createHold()`  [INFERRED]
  README.md → packages/payments/src/orders.ts
- `5i. Correctness pass (2026-11-08): decisions that differ from the TDD` --references--> `useWallNow()`  [INFERRED]
  docs/DEVIATIONS.md → apps/web/src/format.ts

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

## Communities (87 total, 8 thin omitted)

### Community 0 - "Authorization Hold (Orders v2 intent AUTHORIZE)"
Cohesion: 0.08
Nodes (42): Authorization Hold (Orders v2 intent AUTHORIZE), Proof-Gated Capture (FR-06), Order Lifecycle State Machine, PayPal Orders v2 API, SLA Breach Void (FR-07), AegisPay, Bet 3: Autonomous Dispute Defense, Bet 1: Deterministic Spend Safety (+34 more)

### Community 1 - "Decision Record D1-D13"
Cohesion: 0.07
Nodes (48): AG Grid Enterprise Configuration, @paypal/agent-toolkit (read tools), apps/api (Fastify REST, SSE, webhook listener), apps/web (React + Vite UI), apps/worker (pg-boss consumers), Static and Compliance CI Checks, CommandGrid / AuditDetailGrid, Agent Toolkit / AI SDK Compatibility Spike (+40 more)

### Community 2 - "Channel3 (sourcing catalog API/MCP)"
Cohesion: 0.07
Nodes (43): Channel3 (sourcing catalog API/MCP), Deterministic Mandate Gatekeeper (FR-03), Mandate, Proposal, Data Model (six tables), Deterministic Money Math, Evidence Bundle, FR-01 Mandate Builder (+35 more)

### Community 3 - "P0 Scope (FR-01 to FR-14)"
Cohesion: 0.09
Nodes (33): AegisPay - Product Requirements Document, AG Grid (sponsor), APIMatic (sponsor), Bryntum (sponsor), Build Plan to the Deadline (5-12 Nov), FR-10 Command Center Grid (AG Grid), FR-12 Judge Mode, FR-13 Self-Check Panel (+25 more)

### Community 4 - "Web Package Manifest"
Cohesion: 0.04
Nodes (55): dependencies, ag-grid-community@^36.3.0, ag-grid-enterprise@^36.3.0, ag-grid-react@^36.3.0, @fontsource-variable/bodoni-moda@^5.3.0, @fontsource-variable/geist-mono@^5.3.0, @fontsource-variable/schibsted-grotesk@^5.3.0, gsap@^3.15.1 (+47 more)

### Community 5 - "API Package Manifest"
Cohesion: 0.06
Nodes (46): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, fastify@5.12.8 (+38 more)

### Community 6 - "package.json"
Cohesion: 0.17
Nodes (11): description, @types/pg@^8.23.1, engines, node, license, name, packageManager, private (+3 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (24): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, pg-boss@12.38.0 (+16 more)

### Community 8 - "Agents Package Manifest"
Cohesion: 0.12
Nodes (22): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, ai@7.0.163, @ai-sdk/anthropic@4.0.97, @ai-sdk/groq@4.0.77, @paypal/agent-toolkit@1.11.0, tslib@^2.9.1 (+14 more)

### Community 9 - "jobs.ts"
Cohesion: 0.13
Nodes (34): classifyFailure(), ctxOf(), msg(), PERMANENT, PollResult, runCapture(), runPollOpen(), runReauthSweep() (+26 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.16
Nodes (18): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, Elastic (partner, no prize), FR-09 Dispute Defense Agent, FR-17 Contract Clause Retrieval (P1), Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes (+10 more)

### Community 11 - "call.ts"
Cohesion: 0.12
Nodes (21): 1. Deviations from the spec, CallOptions, CallResult, defaultDeps, describeFailure(), FailureInfo, header(), isNetworkError() (+13 more)

### Community 12 - "TypeScript Base Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+7 more)

### Community 13 - "Hash-Chained Audit Log (FR-11)"
Cohesion: 0.15
Nodes (19): Hash-Chained Audit Log (FR-11), appendAudit(tx, event) with advisory lock, Append-only Trigger and No TRUNCATE Grant, Postgres LISTEN/NOTIFY Feed, Alerting rules, payments call.ts wrapper, Data model (nine tables), Data rules (bigint minor units, timestamptz, UUID v7) (+11 more)

### Community 14 - "0001_init.sql"
Cohesion: 0.10
Nodes (25): audit_event, catalog_snapshot, dispute, evidence_bundle, fulfillment, mandate, proposal, purchase_order (+17 more)

### Community 15 - "Verified Webhook Ingestion (FR-08)"
Cohesion: 0.10
Nodes (26): Kill Switch, Verified Webhook Ingestion (FR-08), Webhook Events Handled, Session Cookie and CSRF Controls, Offline RSA-SHA256 + CRC32 Verification, Postback verify-webhook-signature, Secrets and Environment Variables, simulate-event Testing (+18 more)

### Community 16 - "DB Package Manifest"
Cohesion: 0.17
Nodes (12): dependencies, @aegis/core@workspace:*, pg@8.23.1, exports, ./testing, @aegis/core, name, private (+4 more)

### Community 17 - "db/src/index.ts"
Cohesion: 0.16
Nodes (18): BuildAppOptions, ApiDeps, Log, registerAuditRoutes(), registerDemoRoutes(), registerWebhooks(), WEBHOOK_MAX_BYTES, createSelfCheck() (+10 more)

### Community 18 - "test"
Cohesion: 0.07
Nodes (29): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, TEST_DATABASE_URL, jobs, test, name, on (+21 more)

### Community 19 - "Core Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, zod@4.6.7, exports, zod, name, private, type, version

### Community 20 - "Gatekeeper Package Manifest"
Cohesion: 0.25
Nodes (8): dependencies, @aegis/core@workspace:*, exports, @aegis/core, name, private, type, version

### Community 21 - "payments/src/disputes.ts"
Cohesion: 0.10
Nodes (29): 5c. Agent decisions that differ from, or go beyond, the TDD, DisputeSources, getDisputeSources(), SourcesDbRow, DisputeLink, DisputeRow, findOrderIdByCaptureId(), hasSubmittedBundle() (+21 more)

### Community 22 - "AegisPay"
Cohesion: 0.05
Nodes (34): AI tools used, Inside the product (runtime), Used to build it, 1. One full buyer-approved run (2026-11-07), 1a. Approval through the product's own buttons (2026-11-12), 1b. Ship, deliver, capture, tracking and void through the UI (2026-11-12), 2. What the live dispute taught us, 3. Live checks added on 2026-11-08 (+26 more)

### Community 23 - "sourcing.ts"
Cohesion: 0.12
Nodes (22): CatalogProduct, DraftedNotes, AgentStep, DEFAULT_GROQ_MODEL_ID, DEFAULT_MODEL_ID, generateStructured(), StructuredRun, ParseResult (+14 more)

### Community 24 - "src/mandates.ts"
Cohesion: 0.18
Nodes (22): AmendBody, IdParams, registerMandateRoutes(), StatusBody, minorFromString(), MandateDraft, amendMandate(), BUDGET_COMMITTED_STATES (+14 more)

### Community 25 - "DomainError"
Cohesion: 0.11
Nodes (34): IdParams, ProposalOrderBody, registerOrderRoutes(), VoidBody, DomainError, OrderState, appendAudit(), cancelUnapprovedOrder() (+26 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "harness.ts"
Cohesion: 0.17
Nodes (19): Db, CallDeps, hasIssue(), CreateContextOptions, PayPalContext, assertSandboxBaseUrl(), BASE_URL_FOR, loadPayPalConfig() (+11 more)

### Community 28 - "harness.ts"
Cohesion: 0.07
Nodes (24): catalog, make(), noJobs, make(), noJobs, jobKey, PAYLOAD, Uuid (+16 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): exclude, extends, include, ./tsconfig.base.json

### Community 30 - "holdScene.ts"
Cohesion: 0.08
Nodes (32): feedPulse(), Hero(), RingsFallback(), StoreState, useHoldScene(), usePlate(), CHAPTERS, Lifecycle() (+24 more)

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (43): Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS, computeTotal(), dateMs() (+35 more)

### Community 33 - "webhook-process.test.ts"
Cohesion: 0.12
Nodes (16): auditHash(), verifyChain(), capture(), move(), settled(), seedFulfillment(), move(), pendingFull() (+8 more)

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.22
Nodes (13): PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests, P0 Gate Manual Acceptance, Payments Wrapper (token, request id, retries, debug_id, audit) (+5 more)

### Community 35 - "webhooks.test.ts"
Cohesion: 0.11
Nodes (22): Queryable, isSimulatedEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS, CertCache, checkCertUrl(), crc32Decimal() (+14 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.09
Nodes (30): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Eleven Corrections to Source Report, Source Strategy Report (Blueprint for Winning PayPal AI Hackathon 2026), Migrations and Demo Reset (+22 more)

### Community 37 - "createPlate"
Cohesion: 0.09
Nodes (25): createHoldScene(), drop(), frame(), move(), place(), render(), resize(), setShape() (+17 more)

### Community 40 - "routes/disputes.ts"
Cohesion: 0.17
Nodes (22): bundleView(), DisputeParams, FileParams, registerDisputeRoutes(), humanName(), 5f. Observed live: the sandbox dispute never opened the seller-response stage, acceptedEvidenceCall(), BundleDbRow (+14 more)

### Community 41 - "agents/test/agents.test.ts"
Cohesion: 0.11
Nodes (27): buildFacts(), day(), DefenseInput, draftEvidenceNotes(), Fact, factsText(), NOTES_LIMIT, NotesSchema (+19 more)

### Community 42 - "process.ts"
Cohesion: 0.18
Nodes (26): state(), findOrderIdByPayPalRef(), getOrder(), stateOf(), CAPTURE_REFUSED, captureIdFromLinks(), getCapture(), Json (+18 more)

### Community 43 - "api/test/agents.test.ts"
Cohesion: 0.14
Nodes (8): CATALOG, draft(), Frame, inDays(), liveModel, newMandate(), noJobs, sent

### Community 44 - "TopBar.tsx"
Cohesion: 0.15
Nodes (19): Footer(), Seal(), AgentToggle(), refreshSelfCheck(), SelfCheckDot(), STEP_LABELS, stepsDone(), ThemeToggle() (+11 more)

### Community 45 - "webhook-process.test.ts"
Cohesion: 0.18
Nodes (23): 2. Failure windows, and how each is closed, Worker (decisions the spec leaves open), withAdvisoryLock(), getRefundRow(), insertRefund(), listPendingRefunds(), listRefunds(), RefundDbRow (+15 more)

### Community 46 - "DomainError"
Cohesion: 0.08
Nodes (36): awaitingApproval(), held(), delivered(), held(), logs, state(), SCHEDULES, AuthorizedHold (+28 more)

### Community 47 - "web/src/types.ts"
Cohesion: 0.10
Nodes (32): AgentDrawer(), FeedEntry, headline(), LABEL, DisputeDetail, formatClock(), AppState, disputeFromHash() (+24 more)

### Community 49 - "webhook-signing.ts"
Cohesion: 0.22
Nodes (8): CERT_URL, makeCert(), referenceCrc32(), SignOptions, signWebhook(), TABLE, TestCert, signed()

### Community 50 - "pool.ts"
Cohesion: 0.11
Nodes (23): main(), main(), jsonLog(), 5b. API decisions that differ from, or go beyond, the TDD, modelFromEnv(), addDays(), DAY_MS, FixedClock (+15 more)

### Community 51 - "authorizations.ts"
Cohesion: 0.17
Nodes (17): getFulfillment(), recordReauthorization(), getOrderBundle(), captureLocked(), getAuthorization(), isFinalClientError(), payments(), REAUTH_AFTER_HONOR_MS (+9 more)

### Community 52 - "pdf.ts"
Cohesion: 0.19
Nodes (16): 5. Test coverage notes, sha256Hex(), EvidenceFile, assertBundleIntegrity(), A4, bundleSha256(), MAX_FILE_BYTES, MAX_TOTAL_BYTES (+8 more)

### Community 53 - "payments/package.json"
Cohesion: 0.14
Nodes (17): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, @paypal/paypal-server-sdk@2.5.0, pdf-lib@1.17.1, zod@4.6.7, exports (+9 more)

### Community 54 - "paypal-server.ts"
Cohesion: 0.13
Nodes (13): ALLOWED_EVIDENCE_EXT, Auth, Cap, D(), Disp, Failure, MultipartPart, Ord (+5 more)

### Community 55 - "payments/src/disputes.ts"
Cohesion: 0.10
Nodes (21): GatheredFacts, RenderFacts, buildEvidenceInput(), buildSupportingInfoInput(), checkedNotes(), clean(), DisputeReason, DocumentKind (+13 more)

### Community 56 - "schemas.ts"
Cohesion: 0.10
Nodes (17): ApiErrorSchema, CARRIERS, CreateMandateBody, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate, IsoDateTime (+9 more)

### Community 57 - "channel3.ts"
Cohesion: 0.17
Nodes (13): assertChannel3Url(), CatalogOffer, CatalogSearch, CHANNEL3_BASE_URL, channel3FromEnv(), isLoopback(), OfferSchema, priceToMinor() (+5 more)

### Community 59 - "api.test.ts"
Cohesion: 0.14
Nodes (17): installErrorHandling(), render(), Rendered, renderError(), draft(), Frame, held(), newMandate() (+9 more)

### Community 60 - "stream.ts"
Cohesion: 0.09
Nodes (23): buildApp(), jsonReplacer(), toJson(), AuditMessage, factMessage(), frame(), Log, parseSeq() (+15 more)

### Community 61 - "disputes.test.ts"
Cohesion: 0.22
Nodes (11): markBundleReviewed(), buildEvidenceBundle(), orderStateForOutcome(), reviewEvidenceBundle(), auditRows(), auditTypes(), built(), disputed() (+3 more)

### Community 62 - "client.ts"
Cohesion: 0.13
Nodes (7): Clock, ShipmentInput, TokenVault, TokenVaultOptions, OfflineInput, MutableClock, vault()

### Community 63 - "jobs/package.json"
Cohesion: 0.22
Nodes (10): dependencies, pg-boss@12.38.0, zod@4.6.7, exports, pg-boss, zod, name, private (+2 more)

### Community 64 - "withTx"
Cohesion: 0.25
Nodes (13): advance(), delivered(), withTx(), add(), audits(), clock, count(), create() (+5 more)

### Community 65 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.29
Nodes (7): 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 5d. Web app decisions that differ from, or go beyond, the TDD, 5e. Tooling decisions, 5g. Front-end redesign: decisions that go beyond the TDD, 6. What is needed from the owner, Deviations from the spec, and what is still unconfirmed

### Community 68 - "dispute-supporting-info.sandbox.test.ts"
Cohesion: 0.08
Nodes (15): RESULT_FILE, Target, APP, STATE, appUrl, base, EVENTS, headers (+7 more)

### Community 69 - "@aegis/payments package"
Cohesion: 0.14
Nodes (14): PayPal Agent Toolkit (scoped read-only actions), apps/worker pg-boss consumers, Evidence PDFs (pdf-lib) and defense notes, PayPal Disputes v1 API, PayPal Payments v2 (authorizations, captures), PayPal Server SDK 2.5.0 plus typed REST client, PayPal Webhooks v1, @aegis/agents package (+6 more)

### Community 71 - "services"
Cohesion: 0.09
Nodes (22): databases, databaseName, name, plan, user, fromDatabase, generateValue, key (+14 more)

### Community 74 - "usd"
Cohesion: 0.29
Nodes (4): fast-check@^4.10.2, model, usd, fast-check

### Community 76 - "CommandGrid.tsx"
Cohesion: 0.08
Nodes (37): DISPUTED, AuditDetail(), CommandGrid(), DEFAULT_COL_DEF, DISPUTE_STATES, GateCell(), GridCtx, isNarrow() (+29 more)

### Community 77 - "steps"
Cohesion: 0.09
Nodes (21): APP_URL, E2E_BASE_URL, jobs, nightly, name, runs-on, steps, timeout-minutes (+13 more)

### Community 78 - "api-client.ts"
Cohesion: 0.16
Nodes (16): APP_URL, call(), openSession(), printSelfCheck(), ProbeResult, SelfCheckBody, Session, CLOSED (+8 more)

### Community 80 - "api"
Cohesion: 0.17
Nodes (33): api(), ApiError, errorMessage(), getSession(), send(), App(), CommandGrid, Stream() (+25 more)

### Community 82 - "order-state.test.ts"
Cohesion: 0.31
Nodes (6): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, TERMINAL_STATES

### Community 83 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 84 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, dev, e2e, lint, migrate, nightly, register-webhook (+8 more)

### Community 85 - "vitest"
Cohesion: 0.10
Nodes (25): RFC-9562, ZERO_HASH, uuidv7(), migrate(), MigrationResult, MIGRATIONS_DIR, sha(), insertOrder() (+17 more)

### Community 86 - "agents.ts"
Cohesion: 0.29
Nodes (10): IdParams, isoDate(), registerAgentRoutes(), SourceBody, Decisions the spec leaves open, buildQuery(), lockMandate(), spentSoFar() (+2 more)

### Community 87 - "webhook-pipeline.test.ts"
Cohesion: 0.07
Nodes (51): Webhook processing (decisions the spec leaves open), canonicalJson(), normalize(), catalogQueryHash(), CatalogSnapshot, getCatalogSnapshot(), insertCatalogSnapshot(), requireIntactSnapshot() (+43 more)

### Community 89 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @babel/preset-react@8.0.1, @babel/preset-typescript@8.0.7, eslint@10.14.0, tsx@^4.23.15, @types/node@^26.6.6, vitest@^5.1.0, @vitest/coverage-v8@^5.1.0 (+6 more)

### Community 92 - "eslint.boundaries.config.mjs"
Cohesion: 0.29
Nodes (3): IGNORES, @babel/eslint-parser@8.0.7, @babel/eslint-parser

### Community 93 - "@playwright/test"
Cohesion: 0.40
Nodes (3): channel, @playwright/test@^1.65.0, @playwright/test

### Community 94 - "API endpoint reference"
Cohesion: 0.43
Nodes (7): AG Grid Command Center UI, API endpoint reference, apps/api Fastify server, apps/web React Command Center, API error codes, PayPal JS SDK v6, SSE event stream

## Knowledge Gaps
- **44 isolated node(s):** `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 608 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `@aegis/payments package`, `Dispute Evidence Assembly`, `Hash-Chained Audit Log (FR-11)`, `API endpoint reference`, `rules.ts`?**
  _High betweenness centrality (0.161) - this node is a cross-community bridge._
- **What connects `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.07665505226480836 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `Web Package Manifest`, `package.json`, `jobs.ts`, `call.ts`, `harness.ts`, `harness.ts`, `rules.ts`, `webhook-process.test.ts`, `webhooks.test.ts`, `agents/test/agents.test.ts`, `api/test/agents.test.ts`, `DomainError`, `pool.ts`, `authorizations.ts`, `pdf.ts`, `payments/src/disputes.ts`, `channel3.ts`, `api.test.ts`, `disputes.test.ts`, `withTx`, `dispute-supporting-info.sandbox.test.ts`, `usd`, `order-state.test.ts`, `webhook-pipeline.test.ts`, `devDependencies`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.07446808510638298 - nodes in this community are weakly interconnected._
- **Why does `5i. Correctness pass (2026-11-08): decisions that differ from the TDD` connect `jobs.ts` to `Deviations from the spec, and what is still unconfirmed`, `authorizations.ts`, `CommandGrid.tsx`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Should `Channel3 (sourcing catalog API/MCP)` be split into smaller, more focused modules?**
  _Cohesion score 0.07188160676532769 - nodes in this community are weakly interconnected._