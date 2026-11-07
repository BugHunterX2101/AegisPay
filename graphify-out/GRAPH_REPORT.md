# Graph Report - AegisPay  (2026-11-08)

## Corpus Check
- 199 files · ~145,530 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1912 nodes · 5027 edges · 93 communities (85 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 135 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `677578a5`
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
- Payments Package Manifest
- Dispute Evidence Assembly
- core/src/index.ts
- TypeScript Base Config
- Hash-Chained Audit Log (FR-11)
- 0001_init.sql
- Verified Webhook Ingestion (FR-08)
- DB Package Manifest
- harness.ts
- test
- Core Package Manifest
- Gatekeeper Package Manifest
- disputes.test.ts
- db/src/index.ts
- pdf.ts
- src/mandates.ts
- plan.ts
- Workspace Overrides
- CI/CD pipeline (GitHub Actions, gitleaks, Playwright)
- paypal-server.ts
- TS Project Config
- holdScene.ts
- rules.ts
- Postman Partner
- createHoldScene
- Testing and Verification Strategy
- webhooks.test.ts
- Agent Boundary / Least Privilege
- Self-check Probes (FR-13)
- CLAUDE.md
- 0007_demo_setting.sql
- client.ts
- payments/src/orders.ts
- process.ts
- harness.ts
- TopBar.tsx
- webhook-pipeline.test.ts
- jobs.ts
- web/src/types.ts
- 0004_supplier_profile.sql
- src/audit.ts
- channel3.ts
- payments/src/refunds.ts
- agents.ts
- sourcing.ts
- core/src/index.ts
- payments/src/disputes.ts
- defense.ts
- schemas.ts
- Page
- api.test.ts
- stream.ts
- api/src/index.ts
- TokenVault
- jobs/package.json
- transition
- DomainError
- vitest
- Decision SHA-256 Hash
- evidence-pdf.test.ts
- parser.ts
- withTx
- services
- paypal-webhook.mjs
- render-deploy.mjs
- Deviations from the spec, and what is still unconfirmed
- order-state.test.ts
- CommandGrid.tsx
- steps
- api-client.ts
- fast-check
- api
- db/src/disputes.ts
- suppliers.ts
- web/tsconfig.json
- scripts
- @babel/preset-react@8.0.1
- ingest.test.ts
- webhook-events.ts
- db/src/orders.ts
- devDependencies
- concurrently@^10.0.6
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
- `5b. API decisions that differ from, or go beyond, the TDD` --references--> `watchClockOffset()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/src/demo.ts

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

## Communities (93 total, 8 thin omitted)

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
Nodes (52): dependencies, ag-grid-community@^36.3.0, ag-grid-enterprise@^36.3.0, ag-grid-react@^36.3.0, @fontsource-variable/bodoni-moda@^5.3.0, @fontsource-variable/geist-mono@^5.3.0, @fontsource-variable/schibsted-grotesk@^5.3.0, @paypal/paypal-js@^11.3.0 (+44 more)

### Community 5 - "API Package Manifest"
Cohesion: 0.06
Nodes (46): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, fastify@5.12.8 (+38 more)

### Community 6 - "package.json"
Cohesion: 0.14
Nodes (13): description, @types/node@^26.6.6, @types/pg@^8.23.1, engines, node, license, name, packageManager (+5 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (24): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, pg-boss@12.38.0 (+16 more)

### Community 8 - "Agents Package Manifest"
Cohesion: 0.12
Nodes (22): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, ai@7.0.163, @ai-sdk/anthropic@4.0.97, @ai-sdk/groq@4.0.77, @paypal/agent-toolkit@1.11.0, tslib@^2.9.1 (+14 more)

### Community 9 - "Payments Package Manifest"
Cohesion: 0.15
Nodes (16): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, @paypal/paypal-server-sdk@2.5.0, pdf-lib@1.17.1, zod@4.6.7, exports (+8 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.19
Nodes (15): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, FR-09 Dispute Defense Agent, Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes, Defense Agent, Evidence Plan by Dispute Reason (+7 more)

### Community 11 - "core/src/index.ts"
Cohesion: 0.13
Nodes (16): CallOptions, CallResult, defaultDeps, describeFailure(), FailureInfo, header(), isNetworkError(), jitter() (+8 more)

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

### Community 17 - "harness.ts"
Cohesion: 0.07
Nodes (16): make(), noJobs, logs, state(), RFC-9562, ZERO_HASH, CLIENT_ID, CLIENT_SECRET (+8 more)

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
Cohesion: 0.13
Nodes (29): bundleView(), DisputeParams, FileParams, humanName(), registerDisputeRoutes(), 2. Failure windows, and how each is closed, Worker (decisions the spec leaves open), getDisputeSources() (+21 more)

### Community 22 - "db/src/index.ts"
Cohesion: 0.10
Nodes (26): buildApp(), BuildAppOptions, ApiDeps, Log, registerAuditRoutes(), registerDemoRoutes(), registerWebhooks(), WEBHOOK_MAX_BYTES (+18 more)

### Community 23 - "pdf.ts"
Cohesion: 0.20
Nodes (15): 5. Test coverage notes, sha256Hex(), assertBundleIntegrity(), A4, bundleSha256(), MAX_FILE_BYTES, MAX_TOTAL_BYTES, need() (+7 more)

### Community 24 - "src/mandates.ts"
Cohesion: 0.15
Nodes (26): AmendBody, IdParams, registerMandateRoutes(), StatusBody, minorFromString(), MandateDraft, amendMandate(), BUDGET_COMMITTED_STATES (+18 more)

### Community 25 - "plan.ts"
Cohesion: 0.18
Nodes (13): buildEvidenceInput(), clean(), DisputeReason, DocumentKind, EvidenceType, MAX_FILES, MAX_NOTES_CHARS, planEvidence() (+5 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "CI/CD pipeline (GitHub Actions, gitleaks, Playwright)"
Cohesion: 0.17
Nodes (12): 29-day authorization validity and 3-day honor period, CI/CD pipeline (GitHub Actions, gitleaks, Playwright), Environment configuration (zod, fail fast), Feature flags (BRYNTUM, REAUTH, ELASTIC, POLL_FALLBACK), Judge Mode (demo reset, clock offset, sandbox buyer banner), Local development and sandbox setup, /paypal:doctor report, Reauthorization (P1, FEATURE_REAUTH) (+4 more)

### Community 28 - "paypal-server.ts"
Cohesion: 0.12
Nodes (13): ALLOWED_EVIDENCE_EXT, Auth, Cap, D(), Disp, Failure, MultipartPart, Ord (+5 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): exclude, extends, include, ./tsconfig.base.json

### Community 30 - "holdScene.ts"
Cohesion: 0.11
Nodes (20): gsap@^3.15.1, @gsap/react@2.1.2, CHAPTERS, Lifecycle(), num(), dur, ease, prefersReducedMotion() (+12 more)

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (44): Money as bigint Minor Units, Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS, computeTotal() (+36 more)

### Community 33 - "createHoldScene"
Cohesion: 0.30
Nodes (11): createHoldScene(), drop(), frame(), move(), place(), render(), resize(), setShape() (+3 more)

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.15
Nodes (17): Static and Compliance CI Checks, PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, Gatekeeper Tests (table, property, money, 100% branch coverage), PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests (+9 more)

### Community 35 - "webhooks.test.ts"
Cohesion: 0.08
Nodes (32): isSimulatedEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS, CertCache, checkCertUrl(), crc32Decimal(), HeaderBag (+24 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.12
Nodes (22): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Migrations and Demo Reset, Prompt and Safety Rules, Table audit_event (+14 more)

### Community 37 - "Self-check Probes (FR-13)"
Cohesion: 0.18
Nodes (11): Day 1 Spike Questions, Demo Clock Offset (/api/demo/clock), Sandbox Dispute Pool, External Dependencies and Fallbacks, Gap Protection Polling (every 2 minutes), Judge Mode UX, Monitoring and /status Page, Render Blueprint render.yaml (+3 more)

### Community 40 - "client.ts"
Cohesion: 0.21
Nodes (15): Db, CallDeps, CreateContextOptions, PayPalContext, sameOrigin(), assertSandboxBaseUrl(), loadPayPalConfig(), LOOPBACK (+7 more)

### Community 41 - "payments/src/orders.ts"
Cohesion: 0.09
Nodes (39): awaitingApproval(), recordPayPalOrderId(), recordReauthorization(), getOrderBundle(), capture(), getAuthorization(), isFinalClientError(), payments() (+31 more)

### Community 42 - "process.ts"
Cohesion: 0.20
Nodes (25): findOrderIdByPayPalRef(), transition(), getRefundRow(), reconcileRefund(), CAPTURE_REFUSED, captureIdFromLinks(), getCapture(), Json (+17 more)

### Community 43 - "harness.ts"
Cohesion: 0.14
Nodes (8): CATALOG, draft(), Frame, inDays(), liveModel, newMandate(), noJobs, sent

### Community 44 - "TopBar.tsx"
Cohesion: 0.18
Nodes (16): Footer(), Seal(), AgentToggle(), refreshSelfCheck(), SelfCheckDot(), ThemeToggle(), TopBar(), apply() (+8 more)

### Community 45 - "webhook-pipeline.test.ts"
Cohesion: 0.27
Nodes (10): Webhook processing (decisions the spec leaves open), markWebhookProcessed(), recordWebhookFailure(), ProcessPass, processPendingWebhooks(), VerifyPass, verifyPendingWebhooks(), WEBHOOK_MAX_ATTEMPTS (+2 more)

### Community 46 - "jobs.ts"
Cohesion: 0.08
Nodes (40): classifyFailure(), ctxOf(), msg(), PERMANENT, PollResult, runCapture(), runPollOpen(), runReauthSweep() (+32 more)

### Community 47 - "web/src/types.ts"
Cohesion: 0.15
Nodes (21): AgentDrawer(), headline(), LABEL, BundleView, DisputeDetail, Plan, AppState, StreamStatus (+13 more)

### Community 49 - "src/audit.ts"
Cohesion: 0.19
Nodes (12): OrderState, AUDIT_LOCK_KEY, AUDIT_NOTIFY_CHANNEL, auditHash(), AuditRow, ChainResult, NewAuditEvent, AuditDbRow (+4 more)

### Community 50 - "channel3.ts"
Cohesion: 0.19
Nodes (11): assertChannel3Url(), CatalogOffer, CHANNEL3_BASE_URL, isLoopback(), OfferSchema, priceToMinor(), ProductSchema, ResponseSchema (+3 more)

### Community 51 - "payments/src/refunds.ts"
Cohesion: 0.17
Nodes (17): withAdvisoryLock(), insertRefund(), listPendingRefunds(), RefundDbRow, refundedMinor(), RefundRow, RefundStatus, settleRefund() (+9 more)

### Community 52 - "agents.ts"
Cohesion: 0.39
Nodes (7): IdParams, isoDate(), registerAgentRoutes(), SourceBody, buildQuery(), toGateMandate(), insertProposal()

### Community 53 - "sourcing.ts"
Cohesion: 0.19
Nodes (14): CatalogProduct, DraftedNotes, AgentStep, ParseResult, Candidate, compare(), MAX_CANDIDATES, money() (+6 more)

### Community 54 - "core/src/index.ts"
Cohesion: 0.24
Nodes (6): CatalogSearch, modelFromEnv(), model, ErrorCode, HTTP_STATUS, usd

### Community 55 - "payments/src/disputes.ts"
Cohesion: 0.15
Nodes (17): DisputeLink, DisputeRow, hasSubmittedBundle(), BuildResult, DisputeSync, evidenceAlreadySubmitted(), gateChecks(), GatheredFacts (+9 more)

### Community 56 - "defense.ts"
Cohesion: 0.15
Nodes (16): buildFacts(), day(), DefenseInput, draftEvidenceNotes(), Fact, factsText(), NOTES_LIMIT, NotesSchema (+8 more)

### Community 57 - "schemas.ts"
Cohesion: 0.12
Nodes (15): ApiErrorSchema, CARRIERS, CreateMandateBody, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate, IsoDateTime (+7 more)

### Community 59 - "api.test.ts"
Cohesion: 0.18
Nodes (14): installErrorHandling(), render(), Rendered, renderError(), draft(), Frame, held(), newMandate() (+6 more)

### Community 60 - "stream.ts"
Cohesion: 0.12
Nodes (15): jsonReplacer(), toJson(), AuditMessage, factMessage(), frame(), Log, parseSeq(), registerStream() (+7 more)

### Community 61 - "api/src/index.ts"
Cohesion: 0.13
Nodes (21): main(), main(), jsonLog(), channel3FromEnv(), OffsetClock, watchClockOffset(), migrate(), MigrationResult (+13 more)

### Community 62 - "TokenVault"
Cohesion: 0.08
Nodes (17): addDays(), Clock, DAY_MS, FixedClock, systemClock, ShipmentInput, REFRESH_WINDOW_MS, Token (+9 more)

### Community 63 - "jobs/package.json"
Cohesion: 0.22
Nodes (10): dependencies, pg-boss@12.38.0, zod@4.6.7, exports, pg-boss, zod, name, private (+2 more)

### Community 64 - "transition"
Cohesion: 0.11
Nodes (18): advance(), delivered(), held(), delivered(), held(), seedFulfillment(), seedGatedOrder(), move() (+10 more)

### Community 65 - "DomainError"
Cohesion: 0.19
Nodes (22): IdParams, ProposalOrderBody, registerOrderRoutes(), VoidBody, runTrackingPush(), DomainError, appendAudit(), cancelUnapprovedOrder() (+14 more)

### Community 66 - "vitest"
Cohesion: 0.16
Nodes (17): insertEvidenceBundle(), uuidv7(), insertOrder(), freshDb(), seedProposal(), TEST_URL, TestDb, tamper() (+9 more)

### Community 67 - "Decision SHA-256 Hash"
Cohesion: 0.40
Nodes (6): Order Drafter Agent, AMOUNT_MISMATCH Check, Decision SHA-256 Hash, evaluate(mandate, proposal, context) -> Decision, Mandate/Proposal/Context/Decision Types, Order Payload Built by Code

### Community 68 - "evidence-pdf.test.ts"
Cohesion: 0.25
Nodes (4): FACTS, FULL, T0, pdf-lib

### Community 69 - "parser.ts"
Cohesion: 0.15
Nodes (17): DEFAULT_GROQ_MODEL_ID, DEFAULT_MODEL_ID, generateStructured(), StructuredRun, checkParsed(), Dollars, ParsedMandate, ParsedMandateSchema (+9 more)

### Community 70 - "withTx"
Cohesion: 0.28
Nodes (12): withTx(), add(), audits(), clock, count(), create(), draft(), held() (+4 more)

### Community 71 - "services"
Cohesion: 0.09
Nodes (22): databases, databaseName, name, plan, user, fromDatabase, generateValue, key (+14 more)

### Community 72 - "paypal-webhook.mjs"
Cohesion: 0.33
Nodes (5): appUrl, base, EVENTS, headers, hook

### Community 73 - "render-deploy.mjs"
Cohesion: 0.25
Nodes (6): db, key, NAMES, owner, svc, wanted

### Community 74 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.08
Nodes (21): AI tools used, Inside the product (runtime), Used to build it, 1. Deviations from the spec, 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 5c. Agent decisions that differ from, or go beyond, the TDD, 5d. Web app decisions that differ from, or go beyond, the TDD (+13 more)

### Community 75 - "order-state.test.ts"
Cohesion: 0.31
Nodes (6): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, TERMINAL_STATES

### Community 76 - "CommandGrid.tsx"
Cohesion: 0.08
Nodes (35): AuditDetail(), DISPUTE_STATES, GateCell(), GridCtx, licenseKey, SlaCell(), theme, Hero() (+27 more)

### Community 77 - "steps"
Cohesion: 0.09
Nodes (21): APP_URL, E2E_BASE_URL, jobs, nightly, name, runs-on, steps, timeout-minutes (+13 more)

### Community 78 - "api-client.ts"
Cohesion: 0.16
Nodes (16): APP_URL, call(), openSession(), printSelfCheck(), ProbeResult, SelfCheckBody, Session, CLOSED (+8 more)

### Community 80 - "api"
Cohesion: 0.23
Nodes (26): api(), ApiError, errorMessage(), getSession(), App(), Stream(), Toasts(), Ambient() (+18 more)

### Community 81 - "db/src/disputes.ts"
Cohesion: 0.20
Nodes (11): BundleDbRow, DisputeDbRow, DisputeUpsert, EvidenceBundleRow, EvidenceFile, findOrderIdByCaptureId(), listDisputes(), markBundleReviewed() (+3 more)

### Community 82 - "suppliers.ts"
Cohesion: 0.43
Nodes (7): getSupplierProfile(), listSupplierProfiles(), normalizeSupplierDomain(), SupplierDbRow, SupplierProfile, toProfile(), upsertSupplierProfile()

### Community 83 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 84 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, dev, e2e, lint, migrate, nightly, register-webhook (+8 more)

### Community 86 - "ingest.test.ts"
Cohesion: 0.29
Nodes (12): canonicalJson(), normalize(), catalogQueryHash(), CatalogSnapshot, getCatalogSnapshot(), insertCatalogSnapshot(), requireIntactSnapshot(), SnapshotDbRow (+4 more)

### Community 87 - "webhook-events.ts"
Cohesion: 0.21
Nodes (13): claimVerifiedWebhooks(), getWebhookEvent(), listUnverifiedWebhooks(), markWebhookVerified(), recordWebhookEvent(), SENSITIVE_HEADERS, storableHeaders(), toEvent() (+5 more)

### Community 88 - "db/src/orders.ts"
Cohesion: 0.11
Nodes (19): DisputeSources, SourcesDbRow, CreatedOrder, listSlaBreaches(), OrderDbRow, OrderPatch, OrderRow, PATCHABLE (+11 more)

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 555 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Testing and Verification Strategy`, `Decision SHA-256 Hash`, `Agent Boundary / Least Privilege`, `P0 Scope (FR-01 to FR-14)`, `Hash-Chained Audit Log (FR-11)`, `Verified Webhook Ingestion (FR-08)`, `rules.ts`?**
  _High betweenness centrality (0.210) - this node is a cross-community bridge._
- **What connects `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.07965860597439545 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `Web Package Manifest`, `package.json`, `core/src/index.ts`, `harness.ts`, `disputes.test.ts`, `db/src/index.ts`, `pdf.ts`, `plan.ts`, `rules.ts`, `webhooks.test.ts`, `client.ts`, `payments/src/orders.ts`, `harness.ts`, `webhook-pipeline.test.ts`, `jobs.ts`, `channel3.ts`, `core/src/index.ts`, `defense.ts`, `api.test.ts`, `api/src/index.ts`, `TokenVault`, `transition`, `DomainError`, `evidence-pdf.test.ts`, `withTx`, `order-state.test.ts`, `fast-check`, `ingest.test.ts`, `devDependencies`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.11229946524064172 - nodes in this community are weakly interconnected._
- **Why does `DomainError` connect `DomainError` to `API Package Manifest`, `core/src/index.ts`, `disputes.test.ts`, `db/src/index.ts`, `pdf.ts`, `src/mandates.ts`, `plan.ts`, `webhooks.test.ts`, `client.ts`, `payments/src/orders.ts`, `process.ts`, `webhook-pipeline.test.ts`, `jobs.ts`, `channel3.ts`, `payments/src/refunds.ts`, `agents.ts`, `core/src/index.ts`, `payments/src/disputes.ts`, `defense.ts`, `api.test.ts`, `api/src/index.ts`, `TokenVault`, `transition`, `vitest`, `evidence-pdf.test.ts`, `parser.ts`, `suppliers.ts`, `ingest.test.ts`, `db/src/orders.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `Channel3 (sourcing catalog API/MCP)` be split into smaller, more focused modules?**
  _Cohesion score 0.08708708708708708 - nodes in this community are weakly interconnected._