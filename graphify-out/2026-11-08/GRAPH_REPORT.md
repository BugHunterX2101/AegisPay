# Graph Report - AegisPay  (2026-11-08)

## Corpus Check
- 201 files · ~148,443 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1937 nodes · 5063 edges · 89 communities (84 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 138 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `13107be4`
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
- core/src/index.ts
- TypeScript Base Config
- Hash-Chained Audit Log (FR-11)
- 0001_init.sql
- Verified Webhook Ingestion (FR-08)
- DB Package Manifest
- db/src/index.ts
- test
- Core Package Manifest
- Gatekeeper Package Manifest
- disputes.test.ts
- app.ts
- webhook-pipeline.test.ts
- src/mandates.ts
- boundaries.test.ts
- Workspace Overrides
- appendAudit
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
- DomainError
- process.ts
- harness.ts
- TopBar.tsx
- worker.ts
- webhook-process.test.ts
- web/src/types.ts
- 0004_supplier_profile.sql
- payments/src/disputes.ts
- payments/src/orders.ts
- payments/src/refunds.ts
- uuidv7
- payments/package.json
- client.ts
- payments/src/disputes.ts
- sourcing.ts
- schemas.ts
- Page
- api.test.ts
- stream.ts
- withTx
- TokenVault
- jobs/package.json
- disputes.test.ts
- pdf.ts
- @aegis/payments package
- Queryable
- views.ts
- api/src/errors.ts
- withTx
- services
- paypal-webhook.mjs
- render-deploy.mjs
- Deviations from the spec, and what is still unconfirmed
- order-state.test.ts
- CommandGrid.tsx
- steps
- api-client.ts
- API endpoint reference
- api
- @babel/core@8.1.0
- web/tsconfig.json
- scripts
- ingest.test.ts
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

## Communities (89 total, 5 thin omitted)

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
Cohesion: 0.05
Nodes (51): dependencies, ag-grid-community@^36.3.0, ag-grid-enterprise@^36.3.0, ag-grid-react@^36.3.0, @fontsource-variable/bodoni-moda@^5.3.0, @fontsource-variable/geist-mono@^5.3.0, @fontsource-variable/schibsted-grotesk@^5.3.0, @gsap/react@2.1.2 (+43 more)

### Community 5 - "API Package Manifest"
Cohesion: 0.06
Nodes (46): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, fastify@5.12.8 (+38 more)

### Community 6 - "package.json"
Cohesion: 0.14
Nodes (13): description, @babel/preset-typescript@8.0.7, concurrently@^10.0.6, engines, node, license, name, packageManager (+5 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (24): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, pg-boss@12.38.0 (+16 more)

### Community 8 - "Agents Package Manifest"
Cohesion: 0.12
Nodes (22): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, ai@7.0.163, @ai-sdk/anthropic@4.0.97, @ai-sdk/groq@4.0.77, @paypal/agent-toolkit@1.11.0, tslib@^2.9.1 (+14 more)

### Community 9 - "jobs.ts"
Cohesion: 0.11
Nodes (33): classifyFailure(), ctxOf(), msg(), PERMANENT, PollResult, runCapture(), runPollOpen(), runReauthSweep() (+25 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.16
Nodes (18): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, Elastic (partner, no prize), FR-09 Dispute Defense Agent, FR-17 Contract Clause Retrieval (P1), Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes (+10 more)

### Community 11 - "core/src/index.ts"
Cohesion: 0.12
Nodes (20): CallOptions, CallResult, defaultDeps, describeFailure(), FailureInfo, header(), isNetworkError(), jitter() (+12 more)

### Community 12 - "TypeScript Base Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+7 more)

### Community 13 - "Hash-Chained Audit Log (FR-11)"
Cohesion: 0.15
Nodes (19): Hash-Chained Audit Log (FR-11), appendAudit(tx, event) with advisory lock, Append-only Trigger and No TRUNCATE Grant, Postgres LISTEN/NOTIFY Feed, Alerting rules, payments call.ts wrapper, Data model (nine tables), Data rules (bigint minor units, timestamptz, UUID v7) (+11 more)

### Community 14 - "0001_init.sql"
Cohesion: 0.11
Nodes (23): audit_event, catalog_snapshot, dispute, evidence_bundle, fulfillment, mandate, proposal, purchase_order (+15 more)

### Community 15 - "Verified Webhook Ingestion (FR-08)"
Cohesion: 0.10
Nodes (26): Kill Switch, Verified Webhook Ingestion (FR-08), Webhook Events Handled, Session Cookie and CSRF Controls, Offline RSA-SHA256 + CRC32 Verification, Postback verify-webhook-signature, Secrets and Environment Variables, simulate-event Testing (+18 more)

### Community 16 - "DB Package Manifest"
Cohesion: 0.17
Nodes (12): dependencies, @aegis/core@workspace:*, pg@8.23.1, exports, ./testing, @aegis/core, name, private (+4 more)

### Community 17 - "db/src/index.ts"
Cohesion: 0.11
Nodes (27): main(), main(), jsonLog(), RFC-9562, modelFromEnv(), AUDIT_LOCK_KEY, auditHash(), ChainResult (+19 more)

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
Cohesion: 0.15
Nodes (28): bundleView(), DisputeParams, FileParams, humanName(), registerDisputeRoutes(), getDisputeSources(), acceptedEvidenceCall(), BundleDbRow (+20 more)

### Community 22 - "app.ts"
Cohesion: 0.18
Nodes (13): BuildAppOptions, ApiDeps, Log, registerAuditRoutes(), registerWebhooks(), createSelfCheck(), Probe, ProbeName (+5 more)

### Community 23 - "webhook-pipeline.test.ts"
Cohesion: 0.17
Nodes (12): WEBHOOK_MAX_ATTEMPTS, cert, ev(), receiveSigned(), CERT_URL, makeCert(), referenceCrc32(), SignOptions (+4 more)

### Community 24 - "src/mandates.ts"
Cohesion: 0.10
Nodes (35): IdParams, isoDate(), registerAgentRoutes(), SourceBody, AmendBody, IdParams, registerMandateRoutes(), StatusBody (+27 more)

### Community 25 - "boundaries.test.ts"
Cohesion: 0.20
Nodes (6): eslint@10.14.0, eslint, allowed, eslint, root, violations

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "appendAudit"
Cohesion: 0.28
Nodes (16): IdParams, ProposalOrderBody, registerOrderRoutes(), VoidBody, appendAudit(), cancelUnapprovedOrder(), createOrderFromProposal(), FULFILLMENT_SOURCE (+8 more)

### Community 28 - "paypal-server.ts"
Cohesion: 0.06
Nodes (27): noJobs, CLIENT_ID, CLIENT_SECRET, Harness, OffsetClock, SeededOrder, startHarness(), OAuthServer (+19 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): exclude, extends, include, ./tsconfig.base.json

### Community 30 - "holdScene.ts"
Cohesion: 0.08
Nodes (32): gsap@^3.15.1, feedPulse(), Hero(), RingsFallback(), StoreState, useHoldScene(), usePlate(), CHAPTERS (+24 more)

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (43): Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS, computeTotal(), dateMs() (+35 more)

### Community 33 - "createHoldScene"
Cohesion: 0.27
Nodes (12): createHoldScene(), drop(), frame(), move(), place(), render(), resize(), setShape() (+4 more)

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.22
Nodes (13): PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests, P0 Gate Manual Acceptance, Payments Wrapper (token, request id, retries, debug_id, audit) (+5 more)

### Community 35 - "webhooks.test.ts"
Cohesion: 0.10
Nodes (26): ProcessPass, VerifyPass, WebhookOutcome, isSimulatedEvent(), simulateEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS (+18 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.09
Nodes (30): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Eleven Corrections to Source Report, Source Strategy Report (Blueprint for Winning PayPal AI Hackathon 2026), Migrations and Demo Reset (+22 more)

### Community 37 - "createPlate"
Cohesion: 0.15
Nodes (11): compile(), createPlate(), draw(), readTheme(), request(), sync(), tick(), hexRgb() (+3 more)

### Community 40 - "core/src/index.ts"
Cohesion: 0.17
Nodes (6): addDays(), FixedClock, systemClock, ZERO_HASH, fast-check, vitest

### Community 41 - "DomainError"
Cohesion: 0.30
Nodes (11): DomainError, getFulfillment(), recordReauthorization(), capture(), getAuthorization(), isFinalClientError(), payments(), reauthorize() (+3 more)

### Community 42 - "process.ts"
Cohesion: 0.20
Nodes (22): findOrderIdByPayPalRef(), CAPTURE_REFUSED, captureIdFromLinks(), getCapture(), Json, mismatch(), note(), obj() (+14 more)

### Community 43 - "harness.ts"
Cohesion: 0.13
Nodes (8): CATALOG, draft(), Frame, inDays(), liveModel, newMandate(), noJobs, sent

### Community 44 - "TopBar.tsx"
Cohesion: 0.19
Nodes (14): Footer(), Seal(), AgentToggle(), ThemeToggle(), TopBar(), apply(), initTheme(), listeners (+6 more)

### Community 45 - "worker.ts"
Cohesion: 0.13
Nodes (18): WorkerDeps, Log, WorkerHandle, WorkerOptions, delivered(), logs, state(), jobKey (+10 more)

### Community 46 - "webhook-process.test.ts"
Cohesion: 0.12
Nodes (18): claimVerifiedWebhooks(), getWebhookEvent(), listUnverifiedWebhooks(), markWebhookVerified(), recordWebhookEvent(), SENSITIVE_HEADERS, storableHeaders(), toEvent() (+10 more)

### Community 47 - "web/src/types.ts"
Cohesion: 0.15
Nodes (20): AgentDrawer(), headline(), LABEL, DisputeDetail, AppState, StreamStatus, Toast, AuditEvent (+12 more)

### Community 49 - "payments/src/disputes.ts"
Cohesion: 0.16
Nodes (17): DisputeLink, DisputeRow, hasSubmittedBundle(), BuildResult, DisputeSync, evidenceAlreadySubmitted(), fetchDispute(), gateChecks() (+9 more)

### Community 50 - "payments/src/orders.ts"
Cohesion: 0.09
Nodes (33): awaitingApproval(), held(), held(), recordPayPalOrderId(), REAUTH_LEAD_MS, voidHold(), AuthorizedHold, authorizeHold() (+25 more)

### Community 51 - "payments/src/refunds.ts"
Cohesion: 0.13
Nodes (28): 2. Failure windows, and how each is closed, Worker (decisions the spec leaves open), withAdvisoryLock(), getOrderBundle(), getRefundRow(), insertRefund(), listPendingRefunds(), listRefunds() (+20 more)

### Community 52 - "uuidv7"
Cohesion: 0.23
Nodes (12): uuidv7(), insertOrder(), listSlaBreaches(), OrderPatch, PATCHABLE, PayPalRefs, toOrder(), TransitionResult (+4 more)

### Community 53 - "payments/package.json"
Cohesion: 0.14
Nodes (17): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, @paypal/paypal-server-sdk@2.5.0, pdf-lib@1.17.1, zod@4.6.7, exports (+9 more)

### Community 54 - "client.ts"
Cohesion: 0.27
Nodes (12): CallDeps, CreateContextOptions, createPayPalContext(), PayPalContext, sameOrigin(), assertSandboxBaseUrl(), loadPayPalConfig(), LOOPBACK (+4 more)

### Community 55 - "payments/src/disputes.ts"
Cohesion: 0.11
Nodes (20): GatheredFacts, RenderFacts, buildEvidenceInput(), clean(), DisputeReason, DocumentKind, EvidenceFacts, EvidenceType (+12 more)

### Community 56 - "sourcing.ts"
Cohesion: 0.05
Nodes (62): assertChannel3Url(), CatalogOffer, CatalogProduct, CatalogSearch, CHANNEL3_BASE_URL, channel3FromEnv(), isLoopback(), OfferSchema (+54 more)

### Community 57 - "schemas.ts"
Cohesion: 0.14
Nodes (13): ApiErrorSchema, CARRIERS, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate, IsoDateTime, MandateSpecSchema (+5 more)

### Community 58 - "Page"
Cohesion: 0.31
Nodes (3): Page, renderOne(), winAnsiSafe()

### Community 59 - "api.test.ts"
Cohesion: 0.22
Nodes (10): WEBHOOK_MAX_BYTES, draft(), Frame, held(), newMandate(), placed(), propose(), settledOrder() (+2 more)

### Community 60 - "stream.ts"
Cohesion: 0.11
Nodes (19): buildApp(), jsonReplacer(), toJson(), AuditMessage, factMessage(), frame(), Log, parseSeq() (+11 more)

### Community 61 - "withTx"
Cohesion: 0.14
Nodes (14): registerDemoRoutes(), catalog, make(), noJobs, 5b. API decisions that differ from, or go beyond, the TDD, DAY_MS, OffsetClock, DEMO_TABLES (+6 more)

### Community 62 - "TokenVault"
Cohesion: 0.14
Nodes (8): Clock, REFRESH_WINDOW_MS, Token, tokenResponse, TokenVault, TokenVaultOptions, MutableClock, vault()

### Community 63 - "jobs/package.json"
Cohesion: 0.22
Nodes (10): dependencies, pg-boss@12.38.0, zod@4.6.7, exports, pg-boss, zod, name, private (+2 more)

### Community 64 - "disputes.test.ts"
Cohesion: 0.24
Nodes (9): EvidenceBundleRow, buildEvidenceBundle(), auditRows(), auditTypes(), built(), disputed(), move(), reviewed() (+1 more)

### Community 65 - "pdf.ts"
Cohesion: 0.21
Nodes (14): 5. Test coverage notes, sha256Hex(), assertBundleIntegrity(), A4, bundleSha256(), MAX_FILE_BYTES, MAX_TOTAL_BYTES, need() (+6 more)

### Community 66 - "@aegis/payments package"
Cohesion: 0.14
Nodes (14): PayPal Agent Toolkit (scoped read-only actions), apps/worker pg-boss consumers, Evidence PDFs (pdf-lib) and defense notes, PayPal Disputes v1 API, PayPal Payments v2 (authorizations, captures), PayPal Server SDK 2.5.0 plus typed REST client, PayPal Webhooks v1, @aegis/agents package (+6 more)

### Community 67 - "Queryable"
Cohesion: 0.18
Nodes (11): DisputeSources, SourcesDbRow, FulfillmentDbRow, FulfillmentRow, Queryable, listSupplierProfiles(), normalizeSupplierDomain(), SupplierDbRow (+3 more)

### Community 68 - "views.ts"
Cohesion: 0.23
Nodes (12): OrderState, AuditRow, OrderDbRow, AuditDbRow, getOrderGridRow(), GridDbRow, listAuditAfter(), listAuditForEntity() (+4 more)

### Community 69 - "api/src/errors.ts"
Cohesion: 0.33
Nodes (7): installErrorHandling(), render(), Rendered, renderError(), ErrorCode, HTTP_STATUS, ApiError

### Community 70 - "withTx"
Cohesion: 0.27
Nodes (11): createMandate(), NewProposal, audits(), clock, count(), create(), draft(), held() (+3 more)

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
Nodes (23): AI tools used, Inside the product (runtime), Used to build it, 1. Deviations from the spec, 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 5c. Agent decisions that differ from, or go beyond, the TDD, 5d. Web app decisions that differ from, or go beyond, the TDD (+15 more)

### Community 75 - "order-state.test.ts"
Cohesion: 0.31
Nodes (6): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, TERMINAL_STATES

### Community 76 - "CommandGrid.tsx"
Cohesion: 0.13
Nodes (25): AuditDetail(), CommandGrid(), DISPUTE_STATES, GateCell(), GridCtx, isNarrow(), licenseKey, NARROW (+17 more)

### Community 77 - "steps"
Cohesion: 0.09
Nodes (21): APP_URL, E2E_BASE_URL, jobs, nightly, name, runs-on, steps, timeout-minutes (+13 more)

### Community 78 - "api-client.ts"
Cohesion: 0.16
Nodes (16): APP_URL, call(), openSession(), printSelfCheck(), ProbeResult, SelfCheckBody, Session, CLOSED (+8 more)

### Community 79 - "API endpoint reference"
Cohesion: 0.43
Nodes (7): AG Grid Command Center UI, API endpoint reference, apps/api Fastify server, apps/web React Command Center, API error codes, PayPal JS SDK v6, SSE event stream

### Community 80 - "api"
Cohesion: 0.19
Nodes (29): api(), ApiError, errorMessage(), getSession(), App(), CommandGrid, Stream(), Toasts() (+21 more)

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
Cohesion: 0.23
Nodes (11): CreatedOrder, OrderRow, BundleDbRow, insertProposal(), listProposalsForMandate(), MandateRow, OrderBundle, ProposalDbRow (+3 more)

### Community 89 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, @babel/preset-react@8.0.1, fast-check@^4.10.2, tsx@^4.23.15, @types/node@^26.6.6, @types/pg@^8.23.1, typescript@^7.0.2, vitest@^5.1.0 (+7 more)

### Community 92 - "eslint.boundaries.config.mjs"
Cohesion: 0.29
Nodes (3): IGNORES, @babel/eslint-parser@8.0.7, @babel/eslint-parser

### Community 93 - "@playwright/test"
Cohesion: 0.40
Nodes (3): channel, @playwright/test@^1.65.0, @playwright/test

## Knowledge Gaps
- **44 isolated node(s):** `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 566 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `@aegis/payments package`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `Dispute Evidence Assembly`, `Hash-Chained Audit Log (FR-11)`, `API endpoint reference`, `rules.ts`?**
  _High betweenness centrality (0.206) - this node is a cross-community bridge._
- **What connects `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.07665505226480836 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `core/src/index.ts` to `package.json`, `jobs.ts`, `core/src/index.ts`, `db/src/index.ts`, `disputes.test.ts`, `webhook-pipeline.test.ts`, `src/mandates.ts`, `boundaries.test.ts`, `paypal-server.ts`, `rules.ts`, `webhooks.test.ts`, `DomainError`, `harness.ts`, `worker.ts`, `webhook-process.test.ts`, `payments/src/orders.ts`, `payments/src/refunds.ts`, `uuidv7`, `client.ts`, `payments/src/disputes.ts`, `sourcing.ts`, `api.test.ts`, `withTx`, `TokenVault`, `disputes.test.ts`, `pdf.ts`, `api/src/errors.ts`, `withTx`, `order-state.test.ts`, `ingest.test.ts`, `devDependencies`?**
  _High betweenness centrality (0.171) - this node is a cross-community bridge._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.07446808510638298 - nodes in this community are weakly interconnected._
- **Why does `fastify` connect `app.ts` to `api/src/errors.ts`, `API Package Manifest`, `api.test.ts`, `harness.ts`, `paypal-server.ts`, `disputes.test.ts`, `src/mandates.ts`, `appendAudit`, `stream.ts`, `withTx`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Should `Channel3 (sourcing catalog API/MCP)` be split into smaller, more focused modules?**
  _Cohesion score 0.07188160676532769 - nodes in this community are weakly interconnected._