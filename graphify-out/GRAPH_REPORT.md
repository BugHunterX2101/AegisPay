# Graph Report - AegisPay  (2026-11-08)

## Corpus Check
- 200 files · ~149,750 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1951 nodes · 5108 edges · 92 communities (83 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 138 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b1f1768c`
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
- api/src/index.ts
- test
- Core Package Manifest
- Gatekeeper Package Manifest
- disputes.test.ts
- call.test.ts
- worker.ts
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
- agents/test/agents.test.ts
- process.ts
- harness.ts
- TopBar.tsx
- parser.ts
- webhook-process.test.ts
- web/src/types.ts
- 0004_supplier_profile.sql
- evidence-pdf.test.ts
- DomainError
- payments/src/refunds.ts
- boundaries.test.ts
- payments/package.json
- systemClock
- payments/src/disputes.ts
- sourcing.ts
- schemas.ts
- Page
- api.test.ts
- stream.ts
- demo.test.ts
- TokenVault
- jobs/package.json
- Self-check Probes (FR-13)
- pdf.ts
- suppliers.ts
- Queryable
- app.ts
- api/src/errors.ts
- ref_node_fs
- services
- webhook-events.ts
- session.ts
- Deviations from the spec, and what is still unconfirmed
- order-state.test.ts
- CommandGrid.tsx
- steps
- api-client.ts
- demo-order.mjs
- api
- AgentDrawer.tsx
- @babel/preset-react@8.0.1
- web/tsconfig.json
- scripts
- fast-check
- ingest.test.ts
- concurrently@^10.0.6
- proposals.ts
- devDependencies
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
- `5c. Agent decisions that differ from, or go beyond, the TDD` --references--> `fetchDispute()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/disputes.ts
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

## Communities (92 total, 9 thin omitted)

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
Cohesion: 0.06
Nodes (47): dependencies, ag-grid-community@^36.3.0, ag-grid-enterprise@^36.3.0, ag-grid-react@^36.3.0, @fontsource-variable/bodoni-moda@^5.3.0, @fontsource-variable/geist-mono@^5.3.0, @fontsource-variable/schibsted-grotesk@^5.3.0, @gsap/react@2.1.2 (+39 more)

### Community 5 - "API Package Manifest"
Cohesion: 0.07
Nodes (37): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, @fastify/cookie@11.1.5 (+29 more)

### Community 6 - "package.json"
Cohesion: 0.14
Nodes (13): description, @types/node@^26.6.6, @types/pg@^8.23.1, engines, node, license, name, packageManager (+5 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (24): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, pg-boss@12.38.0 (+16 more)

### Community 8 - "Agents Package Manifest"
Cohesion: 0.12
Nodes (22): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, ai@7.0.163, @ai-sdk/anthropic@4.0.97, @ai-sdk/groq@4.0.77, @paypal/agent-toolkit@1.11.0, tslib@^2.9.1 (+14 more)

### Community 9 - "jobs.ts"
Cohesion: 0.10
Nodes (44): classifyFailure(), ctxOf(), msg(), PERMANENT, PollResult, runCapture(), runPollOpen(), runReauthSweep() (+36 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.14
Nodes (19): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, Elastic (partner, no prize), FR-09 Dispute Defense Agent, FR-17 Contract Clause Retrieval (P1), Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes (+11 more)

### Community 11 - "call.ts"
Cohesion: 0.14
Nodes (21): ApiDeps, Log, Probe, ProbeName, SelfCheckResult, Channel3Config, Db, CallDeps (+13 more)

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
Cohesion: 0.16
Nodes (13): dependencies, @aegis/core@workspace:*, pg@8.23.1, exports, ./testing, @aegis/core, name, private (+5 more)

### Community 17 - "api/src/index.ts"
Cohesion: 0.15
Nodes (18): main(), main(), jsonLog(), 5b. API decisions that differ from, or go beyond, the TDD, channel3FromEnv(), OffsetClock, watchClockOffset(), migrate() (+10 more)

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
Cohesion: 0.10
Nodes (44): bundleView(), DisputeParams, FileParams, humanName(), registerDisputeRoutes(), getDisputeSources(), acceptedEvidenceCall(), BundleDbRow (+36 more)

### Community 22 - "call.test.ts"
Cohesion: 0.13
Nodes (14): CallOptions, defaultDeps, describeFailure(), FailureInfo, header(), isNetworkError(), jitter(), MAX_401_RETRIES (+6 more)

### Community 23 - "worker.ts"
Cohesion: 0.16
Nodes (14): WorkerDeps, Log, WorkerHandle, WorkerOptions, jobKey, PAYLOAD, Uuid, VoidJob (+6 more)

### Community 24 - "src/mandates.ts"
Cohesion: 0.12
Nodes (32): IdParams, isoDate(), registerAgentRoutes(), SourceBody, AmendBody, IdParams, registerMandateRoutes(), StatusBody (+24 more)

### Community 25 - "db/src/orders.ts"
Cohesion: 0.17
Nodes (14): OrderState, AUDIT_LOCK_KEY, AUDIT_NOTIFY_CHANNEL, auditHash(), AuditRow, ChainResult, NewAuditEvent, OrderDbRow (+6 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "withTx"
Cohesion: 0.09
Nodes (37): advance(), logs, state(), RFC-9562, verifyChain(), DisputeUpsert, uuidv7(), insertOrder() (+29 more)

### Community 28 - "paypal-server.ts"
Cohesion: 0.09
Nodes (16): OAuthServerOptions, SeenRequest, startOAuthServer(), ALLOWED_EVIDENCE_EXT, Auth, Cap, D(), Disp (+8 more)

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
Cohesion: 0.13
Nodes (20): Order Drafter Agent, AMOUNT_MISMATCH Check, PayPal Sandbox Contract Tests (@sandbox), Decision SHA-256 Hash, Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, evaluate(mandate, proposal, context) -> Decision, Gatekeeper Tests (table, property, money, 100% branch coverage) (+12 more)

### Community 35 - "webhooks.test.ts"
Cohesion: 0.08
Nodes (34): ProcessPass, VerifyPass, WEBHOOK_MAX_ATTEMPTS, WebhookOutcome, isSimulatedEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS (+26 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.08
Nodes (31): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Eleven Corrections to Source Report, Source Strategy Report (Blueprint for Winning PayPal AI Hackathon 2026), Migrations and Demo Reset (+23 more)

### Community 37 - "createPlate"
Cohesion: 0.14
Nodes (12): compile(), createPlate(), draw(), readTheme(), request(), sync(), tick(), hexRgb() (+4 more)

### Community 40 - "core/src/index.ts"
Cohesion: 0.17
Nodes (13): assertChannel3Url(), CatalogOffer, CHANNEL3_BASE_URL, isLoopback(), OfferSchema, priceToMinor(), ProductSchema, ResponseSchema (+5 more)

### Community 41 - "agents/test/agents.test.ts"
Cohesion: 0.15
Nodes (16): buildFacts(), day(), DefenseInput, draftEvidenceNotes(), Fact, factsText(), NOTES_LIMIT, NotesSchema (+8 more)

### Community 42 - "process.ts"
Cohesion: 0.14
Nodes (39): IdParams, ProposalOrderBody, registerOrderRoutes(), VoidBody, state(), DomainError, appendAudit(), cancelUnapprovedOrder() (+31 more)

### Community 43 - "harness.ts"
Cohesion: 0.13
Nodes (8): CATALOG, draft(), Frame, inDays(), liveModel, newMandate(), noJobs, sent

### Community 44 - "TopBar.tsx"
Cohesion: 0.14
Nodes (17): Footer(), Seal(), AgentToggle(), refreshSelfCheck(), SelfCheckDot(), ThemeToggle(), TopBar(), queryClient (+9 more)

### Community 45 - "parser.ts"
Cohesion: 0.15
Nodes (16): DraftedNotes, AgentStep, checkParsed(), Dollars, ParsedMandate, ParsedMandateSchema, parseMandateText(), ParseResult (+8 more)

### Community 46 - "webhook-process.test.ts"
Cohesion: 0.09
Nodes (22): 2. Failure windows, and how each is closed, Webhook processing (decisions the spec leaves open), Worker (decisions the spec leaves open), getWebhookEvent(), markWebhookVerified(), recordWebhookEvent(), processPendingWebhooks(), verifyPendingWebhooks() (+14 more)

### Community 47 - "web/src/types.ts"
Cohesion: 0.14
Nodes (21): BundleView, DisputeDetail, Plan, formatBytes(), AppState, StreamStatus, Toast, AuditEvent (+13 more)

### Community 49 - "evidence-pdf.test.ts"
Cohesion: 0.20
Nodes (6): GatheredFacts, RenderFacts, DocumentKind, FACTS, FULL, T0

### Community 50 - "DomainError"
Cohesion: 0.07
Nodes (39): awaitingApproval(), delivered(), held(), delivered(), held(), recordPayPalOrderId(), REAUTH_LEAD_MS, paypalCall() (+31 more)

### Community 51 - "payments/src/refunds.ts"
Cohesion: 0.15
Nodes (24): withAdvisoryLock(), getRefundRow(), insertRefund(), listPendingRefunds(), listRefunds(), RefundDbRow, refundedMinor(), RefundRow (+16 more)

### Community 52 - "boundaries.test.ts"
Cohesion: 0.14
Nodes (7): vite@^8.3.5, PRELOAD_FONTS, vite, allowed, eslint, root, violations

### Community 53 - "payments/package.json"
Cohesion: 0.14
Nodes (17): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, @paypal/paypal-server-sdk@2.5.0, pdf-lib@1.17.1, zod@4.6.7, exports (+9 more)

### Community 54 - "systemClock"
Cohesion: 0.36
Nodes (4): addDays(), DAY_MS, FixedClock, systemClock

### Community 55 - "payments/src/disputes.ts"
Cohesion: 0.18
Nodes (13): buildEvidenceInput(), clean(), DisputeReason, EvidenceFacts, EvidenceType, MAX_FILES, MAX_NOTES_CHARS, planEvidence() (+5 more)

### Community 56 - "sourcing.ts"
Cohesion: 0.12
Nodes (22): CatalogProduct, CatalogSearch, DEFAULT_GROQ_MODEL_ID, DEFAULT_MODEL_ID, generateStructured(), modelFromEnv(), StructuredRun, dataBlock() (+14 more)

### Community 57 - "schemas.ts"
Cohesion: 0.14
Nodes (13): ApiErrorSchema, CARRIERS, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate, IsoDateTime, MandateSpecSchema (+5 more)

### Community 59 - "api.test.ts"
Cohesion: 0.20
Nodes (11): registerWebhooks(), WEBHOOK_MAX_BYTES, draft(), Frame, held(), newMandate(), placed(), propose() (+3 more)

### Community 60 - "stream.ts"
Cohesion: 0.13
Nodes (14): AuditMessage, factMessage(), frame(), Log, parseSeq(), registerStream(), SseMessage, StreamHub (+6 more)

### Community 61 - "demo.test.ts"
Cohesion: 0.18
Nodes (10): fastify@5.12.8, registerDemoRoutes(), catalog, make(), noJobs, DEMO_TABLES, getClockOffsetMs(), resetDemo() (+2 more)

### Community 62 - "TokenVault"
Cohesion: 0.13
Nodes (9): Clock, REFRESH_WINDOW_MS, Token, tokenResponse, TokenVault, TokenVaultOptions, OffsetClock, MutableClock (+1 more)

### Community 63 - "jobs/package.json"
Cohesion: 0.22
Nodes (10): dependencies, pg-boss@12.38.0, zod@4.6.7, exports, pg-boss, zod, name, private (+2 more)

### Community 64 - "Self-check Probes (FR-13)"
Cohesion: 0.29
Nodes (7): Day 1 Spike Questions, Demo Clock Offset (/api/demo/clock), Sandbox Dispute Pool, External Dependencies and Fallbacks, Gap Protection Polling (every 2 minutes), Judge Mode UX, Judging-window Runbook

### Community 65 - "pdf.ts"
Cohesion: 0.16
Nodes (17): 5. Test coverage notes, sha256Hex(), ZERO_HASH, EvidenceFile, assertBundleIntegrity(), A4, bundleSha256(), MAX_FILE_BYTES (+9 more)

### Community 66 - "suppliers.ts"
Cohesion: 0.43
Nodes (7): getSupplierProfile(), listSupplierProfiles(), normalizeSupplierDomain(), SupplierDbRow, SupplierProfile, toProfile(), upsertSupplierProfile()

### Community 67 - "Queryable"
Cohesion: 0.21
Nodes (9): DisputeSources, SourcesDbRow, FulfillmentDbRow, FulfillmentRow, closePool(), getPool(), PoolOptions, Queryable (+1 more)

### Community 68 - "app.ts"
Cohesion: 0.23
Nodes (10): buildApp(), BuildAppOptions, jsonReplacer(), toJson(), registerAuditRoutes(), createSelfCheck(), timed(), make() (+2 more)

### Community 69 - "api/src/errors.ts"
Cohesion: 0.33
Nodes (7): installErrorHandling(), render(), Rendered, renderError(), ErrorCode, HTTP_STATUS, ApiError

### Community 70 - "ref_node_fs"
Cohesion: 0.12
Nodes (12): cfg, appUrl, base, EVENTS, headers, hook, db, key (+4 more)

### Community 71 - "services"
Cohesion: 0.09
Nodes (22): databases, databaseName, name, plan, user, fromDatabase, generateValue, key (+14 more)

### Community 72 - "webhook-events.ts"
Cohesion: 0.22
Nodes (10): claimVerifiedWebhooks(), listUnverifiedWebhooks(), markWebhookProcessed(), recordWebhookFailure(), SENSITIVE_HEADERS, storableHeaders(), toEvent(), WebhookDbRow (+2 more)

### Community 73 - "session.ts"
Cohesion: 0.25
Nodes (8): fastify, FastifyRequest, installSession(), OPEN, pathOf(), SAFE_METHODS, SESSION_COOKIE, SessionOptions

### Community 74 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.08
Nodes (22): AI tools used, Inside the product (runtime), Used to build it, 1. Deviations from the spec, 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 5c. Agent decisions that differ from, or go beyond, the TDD, 5d. Web app decisions that differ from, or go beyond, the TDD (+14 more)

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
Cohesion: 0.21
Nodes (28): api(), ApiError, errorMessage(), getSession(), send(), App(), CommandGrid, Stream() (+20 more)

### Community 81 - "AgentDrawer.tsx"
Cohesion: 0.60
Nodes (4): AgentDrawer(), headline(), LABEL, formatClock()

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
Cohesion: 0.16
Nodes (14): CreatedOrder, OrderPatch, OrderRow, PATCHABLE, PayPalRefs, TransitionResult, Tx, BundleDbRow (+6 more)

### Community 89 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @babel/core@8.1.0, @babel/preset-typescript@8.0.7, eslint@10.14.0, tsx@^4.23.15, typescript@^7.0.2, vitest@^5.1.0, @vitest/coverage-v8@^5.1.0 (+6 more)

### Community 92 - "eslint.boundaries.config.mjs"
Cohesion: 0.29
Nodes (3): IGNORES, @babel/eslint-parser@8.0.7, @babel/eslint-parser

### Community 93 - "@playwright/test"
Cohesion: 0.40
Nodes (3): channel, @playwright/test@^1.65.0, @playwright/test

## Knowledge Gaps
- **44 isolated node(s):** `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 572 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `withTx` to `package.json`, `jobs.ts`, `call.ts`, `api/src/index.ts`, `call.test.ts`, `src/mandates.ts`, `rules.ts`, `webhooks.test.ts`, `core/src/index.ts`, `agents/test/agents.test.ts`, `process.ts`, `harness.ts`, `webhook-process.test.ts`, `evidence-pdf.test.ts`, `DomainError`, `payments/src/refunds.ts`, `boundaries.test.ts`, `systemClock`, `payments/src/disputes.ts`, `sourcing.ts`, `api.test.ts`, `demo.test.ts`, `TokenVault`, `pdf.ts`, `app.ts`, `api/src/errors.ts`, `ref_node_fs`, `order-state.test.ts`, `fast-check`, `ingest.test.ts`, `devDependencies`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **What connects `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.057329462989840346 - nodes in this community are weakly interconnected._
- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Testing and Verification Strategy`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `core/src/index.ts`, `Hash-Chained Audit Log (FR-11)`, `rules.ts`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.09230769230769231 - nodes in this community are weakly interconnected._
- **Why does `fastify` connect `demo.test.ts` to `app.ts`, `api/src/errors.ts`, `API Package Manifest`, `session.ts`, `process.ts`, `harness.ts`, `disputes.test.ts`, `src/mandates.ts`, `api.test.ts`, `stream.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Should `Channel3 (sourcing catalog API/MCP)` be split into smaller, more focused modules?**
  _Cohesion score 0.08258258258258258 - nodes in this community are weakly interconnected._