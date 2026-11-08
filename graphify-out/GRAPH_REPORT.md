# Graph Report - AegisPay  (2026-11-08)

## Corpus Check
- 202 files · ~156,408 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1982 nodes · 5213 edges · 94 communities (85 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 145 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `41f78ae1`
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
- vitest
- TypeScript Base Config
- Hash-Chained Audit Log (FR-11)
- 0001_init.sql
- Verified Webhook Ingestion (FR-08)
- DB Package Manifest
- api/src/index.ts
- test
- Core Package Manifest
- Gatekeeper Package Manifest
- payments/src/disputes.ts
- Sandbox verification
- worker.ts
- src/mandates.ts
- CI/CD pipeline (GitHub Actions, gitleaks, Playwright)
- Workspace Overrides
- uuidv7
- harness.ts
- TS Project Config
- holdScene.ts
- rules.ts
- Postman Partner
- createHoldScene
- Testing and Verification Strategy
- call.ts
- Agent Boundary / Least Privilege
- createPlate
- CLAUDE.md
- 0007_demo_setting.sql
- channel3.ts
- sourcing.ts
- process.ts
- harness.ts
- TopBar.tsx
- Self-check Probes (FR-13)
- webhook-process.test.ts
- web/src/types.ts
- 0004_supplier_profile.sql
- authorizations.ts
- payments/src/orders.ts
- payments/src/refunds.ts
- session.ts
- payments/package.json
- systemClock
- payments/src/disputes.ts
- AegisPay
- schemas.ts
- Page
- api.test.ts
- stream.ts
- db/src/index.ts
- TokenVault
- jobs/package.json
- disputes.test.ts
- pdf.ts
- suppliers.ts
- submitEvidence
- demo-order.mjs
- withTx
- render-deploy.mjs
- services
- Decision SHA-256 Hash
- views.ts
- Deviations from the spec, and what is still unconfirmed
- order-state.test.ts
- CommandGrid.tsx
- steps
- api-client.ts
- StreamHub
- api
- web/tsconfig.json
- scripts
- core/src/index.ts
- ingest.test.ts
- concurrently@^10.0.6
- devDependencies
- DomainError
- eslint.boundaries.config.mjs
- @playwright/test
- paypal-webhook.mjs
- routes/disputes.ts
- @babel/core@8.1.0
- typescript@^7.0.2

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 117 edges
2. `withTx()` - 81 edges
3. `appendAudit()` - 55 edges
4. `vitest` - 48 edges
5. `getOrder()` - 47 edges
6. `transition()` - 44 edges
7. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
8. `authorizeHold()` - 36 edges
9. `uuidv7()` - 33 edges
10. `useStore` - 32 edges

## Surprising Connections (you probably didn't know these)
- `Decisions the spec leaves open` --references--> `spentSoFar()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/src/mandates.ts
- `The five guarantees` --references--> `voidHold()`  [INFERRED]
  README.md → packages/payments/src/authorizations.ts
- `3. Live checks added on 2026-11-08` --references--> `paypalCall()`  [INFERRED]
  docs/SANDBOX_VERIFICATION.md → packages/payments/src/call.ts
- `Security notes` --references--> `loadPayPalConfig()`  [INFERRED]
  README.md → packages/payments/src/config.ts
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

## Communities (94 total, 9 thin omitted)

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
Nodes (11): description, @types/pg@^8.23.1, engines, node, license, name, packageManager, private (+3 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (24): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, pg-boss@12.38.0 (+16 more)

### Community 8 - "Agents Package Manifest"
Cohesion: 0.12
Nodes (22): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, ai@7.0.163, @ai-sdk/anthropic@4.0.97, @ai-sdk/groq@4.0.77, @paypal/agent-toolkit@1.11.0, tslib@^2.9.1 (+14 more)

### Community 9 - "jobs.ts"
Cohesion: 0.13
Nodes (33): classifyFailure(), ctxOf(), msg(), PERMANENT, PollResult, runCapture(), runPollOpen(), runReauthSweep() (+25 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.19
Nodes (15): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, FR-09 Dispute Defense Agent, Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes, Defense Agent, Evidence Plan by Dispute Reason (+7 more)

### Community 11 - "vitest"
Cohesion: 0.15
Nodes (22): Clock, ShipmentInput, Db, CallDeps, CreateContextOptions, createPayPalContext(), PayPalContext, sameOrigin() (+14 more)

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

### Community 17 - "api/src/index.ts"
Cohesion: 0.14
Nodes (19): main(), main(), jsonLog(), modelFromEnv(), OffsetClock, watchClockOffset(), migrate(), MigrationResult (+11 more)

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
Cohesion: 0.15
Nodes (18): DisputeLink, DisputeRow, hasSubmittedBundle(), BuildResult, DisputeResponse, DisputeSync, evidenceAlreadySubmitted(), gateChecks() (+10 more)

### Community 22 - "Sandbox verification"
Cohesion: 0.18
Nodes (8): AI tools used, Inside the product (runtime), Used to build it, 1. One full buyer-approved run (2026-11-07), 2. What the live dispute taught us, 3. Live checks added on 2026-11-08, 5. Covered only by the local PayPal double, Sandbox verification

### Community 23 - "worker.ts"
Cohesion: 0.22
Nodes (10): jobKey, PAYLOAD, Uuid, VoidJob, QUEUE, QUEUE_DEFS, QueueName, SCHEDULES (+2 more)

### Community 24 - "src/mandates.ts"
Cohesion: 0.13
Nodes (30): IdParams, isoDate(), registerAgentRoutes(), SourceBody, AmendBody, IdParams, registerMandateRoutes(), StatusBody (+22 more)

### Community 25 - "CI/CD pipeline (GitHub Actions, gitleaks, Playwright)"
Cohesion: 0.17
Nodes (12): 29-day authorization validity and 3-day honor period, CI/CD pipeline (GitHub Actions, gitleaks, Playwright), Environment configuration (zod, fail fast), Feature flags (BRYNTUM, REAUTH, ELASTIC, POLL_FALLBACK), Judge Mode (demo reset, clock offset, sandbox buyer banner), Local development and sandbox setup, /paypal:doctor report, Reauthorization (P1, FEATURE_REAUTH) (+4 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "uuidv7"
Cohesion: 0.18
Nodes (15): RFC-9562, uuidv7(), insertOrder(), freshDb(), seedProposal(), TEST_URL, TestDb, tamper() (+7 more)

### Community 28 - "harness.ts"
Cohesion: 0.07
Nodes (22): noJobs, logs, CLIENT_ID, CLIENT_SECRET, Harness, OffsetClock, SeededOrder, startHarness() (+14 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): exclude, extends, include, ./tsconfig.base.json

### Community 30 - "holdScene.ts"
Cohesion: 0.08
Nodes (31): gsap@^3.15.1, feedPulse(), Hero(), RingsFallback(), StoreState, useHoldScene(), usePlate(), CHAPTERS (+23 more)

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (43): Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS, computeTotal(), dateMs() (+35 more)

### Community 33 - "createHoldScene"
Cohesion: 0.30
Nodes (11): createHoldScene(), drop(), frame(), move(), place(), render(), resize(), setShape() (+3 more)

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.15
Nodes (17): Static and Compliance CI Checks, PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, Gatekeeper Tests (table, property, money, 100% branch coverage), PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests (+9 more)

### Community 35 - "call.ts"
Cohesion: 0.05
Nodes (50): 1. Deviations from the spec, Decisions the spec leaves open, CallOptions, CallResult, defaultDeps, describeFailure(), FailureInfo, header() (+42 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.12
Nodes (22): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Migrations and Demo Reset, Prompt and Safety Rules, Table audit_event (+14 more)

### Community 37 - "createPlate"
Cohesion: 0.14
Nodes (12): compile(), createPlate(), draw(), readTheme(), request(), sync(), tick(), hexRgb() (+4 more)

### Community 40 - "channel3.ts"
Cohesion: 0.13
Nodes (18): createSelfCheck(), Probe, ProbeName, SelfCheckResult, timed(), assertChannel3Url(), CatalogOffer, CatalogProduct (+10 more)

### Community 41 - "sourcing.ts"
Cohesion: 0.07
Nodes (46): buildFacts(), day(), DraftedNotes, draftEvidenceNotes(), Fact, factsText(), NOTES_LIMIT, NotesSchema (+38 more)

### Community 42 - "process.ts"
Cohesion: 0.21
Nodes (22): findOrderIdByPayPalRef(), CAPTURE_REFUSED, captureIdFromLinks(), getCapture(), Json, mismatch(), note(), obj() (+14 more)

### Community 43 - "harness.ts"
Cohesion: 0.13
Nodes (8): CATALOG, draft(), Frame, inDays(), liveModel, newMandate(), noJobs, sent

### Community 44 - "TopBar.tsx"
Cohesion: 0.14
Nodes (18): AgentDrawer(), headline(), LABEL, Footer(), Seal(), ThemeToggle(), formatClock(), apply() (+10 more)

### Community 45 - "Self-check Probes (FR-13)"
Cohesion: 0.18
Nodes (11): Day 1 Spike Questions, Demo Clock Offset (/api/demo/clock), Sandbox Dispute Pool, External Dependencies and Fallbacks, Gap Protection Polling (every 2 minutes), Judge Mode UX, Monitoring and /status Page, Render Blueprint render.yaml (+3 more)

### Community 46 - "webhook-process.test.ts"
Cohesion: 0.09
Nodes (32): claimVerifiedWebhooks(), getWebhookEvent(), listUnverifiedWebhooks(), markWebhookProcessed(), markWebhookVerified(), recordWebhookEvent(), recordWebhookFailure(), SENSITIVE_HEADERS (+24 more)

### Community 47 - "web/src/types.ts"
Cohesion: 0.11
Nodes (28): ApiError, send(), GridCtx, BundleView, DisputeDetail, Plan, CHECKOUT_HOST, OneTimeSession (+20 more)

### Community 49 - "authorizations.ts"
Cohesion: 0.34
Nodes (12): recordReauthorization(), getOrderBundle(), capture(), getAuthorization(), isFinalClientError(), payments(), reauthorize(), usable() (+4 more)

### Community 50 - "payments/src/orders.ts"
Cohesion: 0.08
Nodes (39): awaitingApproval(), held(), held(), verifyChain(), recordPayPalOrderId(), countAuditOfType(), REAUTH_LEAD_MS, AuthorizedHold (+31 more)

### Community 51 - "payments/src/refunds.ts"
Cohesion: 0.16
Nodes (23): 2. Failure windows, and how each is closed, Webhook processing (decisions the spec leaves open), Worker (decisions the spec leaves open), withAdvisoryLock(), getRefundRow(), insertRefund(), listPendingRefunds(), listRefunds() (+15 more)

### Community 52 - "session.ts"
Cohesion: 0.25
Nodes (8): fastify, FastifyRequest, installSession(), OPEN, pathOf(), SAFE_METHODS, SESSION_COOKIE, SessionOptions

### Community 53 - "payments/package.json"
Cohesion: 0.14
Nodes (18): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, @paypal/paypal-server-sdk@2.5.0, pdf-lib@1.17.1, zod@4.6.7, exports (+10 more)

### Community 54 - "systemClock"
Cohesion: 0.36
Nodes (4): addDays(), DAY_MS, FixedClock, systemClock

### Community 55 - "payments/src/disputes.ts"
Cohesion: 0.12
Nodes (18): buildEvidenceInput(), buildSupportingInfoInput(), checkedNotes(), clean(), DisputeReason, DocumentKind, EvidenceType, MAX_FILES (+10 more)

### Community 56 - "AegisPay"
Cohesion: 0.22
Nodes (9): 90-second quickstart (local), AegisPay, Deploy, How it is built, Judge Mode, License, Sandbox verification, Security notes (+1 more)

### Community 57 - "schemas.ts"
Cohesion: 0.14
Nodes (13): ApiErrorSchema, CARRIERS, CreateMandateBody, CurrencySchema, DemoClockBody, IsoDate, IsoDateTime, MandateSpecSchema (+5 more)

### Community 59 - "api.test.ts"
Cohesion: 0.20
Nodes (10): draft(), Frame, held(), newMandate(), placed(), propose(), settledOrder(), stateOf() (+2 more)

### Community 60 - "stream.ts"
Cohesion: 0.23
Nodes (10): jsonReplacer(), toJson(), AuditMessage, frame(), Log, parseSeq(), registerStream(), SseMessage (+2 more)

### Community 61 - "db/src/index.ts"
Cohesion: 0.11
Nodes (21): buildApp(), BuildAppOptions, ApiDeps, Log, registerAuditRoutes(), registerDemoRoutes(), registerWebhooks(), WEBHOOK_MAX_BYTES (+13 more)

### Community 62 - "TokenVault"
Cohesion: 0.09
Nodes (11): REFRESH_WINDOW_MS, Token, tokenResponse, TokenVault, TokenVaultOptions, OAuthServer, OAuthServerOptions, SeenRequest (+3 more)

### Community 63 - "jobs/package.json"
Cohesion: 0.22
Nodes (10): dependencies, pg-boss@12.38.0, zod@4.6.7, exports, pg-boss, zod, name, private (+2 more)

### Community 64 - "disputes.test.ts"
Cohesion: 0.24
Nodes (10): buildEvidenceBundle(), orderStateForOutcome(), reviewEvidenceBundle(), auditRows(), auditTypes(), built(), disputed(), reviewed() (+2 more)

### Community 65 - "pdf.ts"
Cohesion: 0.18
Nodes (14): 5. Test coverage notes, assertBundleIntegrity(), A4, bundleSha256(), MAX_FILE_BYTES, MAX_TOTAL_BYTES, need(), renderOne() (+6 more)

### Community 66 - "suppliers.ts"
Cohesion: 0.24
Nodes (10): FulfillmentDbRow, FulfillmentRow, Queryable, getSupplierProfile(), listSupplierProfiles(), normalizeSupplierDomain(), SupplierDbRow, SupplierProfile (+2 more)

### Community 67 - "submitEvidence"
Cohesion: 0.36
Nodes (8): 5f. Observed live: the sandbox dispute never opened the seller-response stage, acceptedEvidenceCall(), hasLink(), hasProvideEvidenceLink(), hasSupportingInfoLink(), norm(), offeredResponse(), submitEvidence()

### Community 69 - "withTx"
Cohesion: 0.23
Nodes (14): delivered(), withTx(), add(), audits(), clock, count(), create(), draft() (+6 more)

### Community 70 - "render-deploy.mjs"
Cohesion: 0.25
Nodes (6): db, key, NAMES, owner, svc, wanted

### Community 71 - "services"
Cohesion: 0.09
Nodes (22): databases, databaseName, name, plan, user, fromDatabase, generateValue, key (+14 more)

### Community 72 - "Decision SHA-256 Hash"
Cohesion: 0.40
Nodes (6): Order Drafter Agent, AMOUNT_MISMATCH Check, Decision SHA-256 Hash, evaluate(mandate, proposal, context) -> Decision, Mandate/Proposal/Context/Decision Types, Order Payload Built by Code

### Community 73 - "views.ts"
Cohesion: 0.27
Nodes (10): OrderState, OrderDbRow, AuditDbRow, getOrderGridRow(), GridDbRow, listAuditAfter(), listOrderGrid(), OrderGridRow (+2 more)

### Community 74 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.17
Nodes (11): 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 5c. Agent decisions that differ from, or go beyond, the TDD, 5d. Web app decisions that differ from, or go beyond, the TDD, 5e. Tooling decisions, 5g. Front-end redesign: decisions that go beyond the TDD, 5h. Review of the 2026-11-08 improvement list: what was built, what was not, and why, 6. What is needed from the owner (+3 more)

### Community 75 - "order-state.test.ts"
Cohesion: 0.31
Nodes (6): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, TERMINAL_STATES

### Community 76 - "CommandGrid.tsx"
Cohesion: 0.12
Nodes (30): DISPUTED, ActionsCell(), AuditDetail(), CommandGrid(), DISPUTE_STATES, GateCell(), isNarrow(), isOrder() (+22 more)

### Community 77 - "steps"
Cohesion: 0.09
Nodes (21): APP_URL, E2E_BASE_URL, jobs, nightly, name, runs-on, steps, timeout-minutes (+13 more)

### Community 78 - "api-client.ts"
Cohesion: 0.16
Nodes (16): APP_URL, call(), openSession(), printSelfCheck(), ProbeResult, SelfCheckBody, Session, CLOSED (+8 more)

### Community 79 - "StreamHub"
Cohesion: 0.24
Nodes (4): factMessage(), StreamHub, toMessages(), Tx

### Community 80 - "api"
Cohesion: 0.25
Nodes (27): api(), errorMessage(), getSession(), App(), CommandGrid, Stream(), Toasts(), Ambient() (+19 more)

### Community 83 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 84 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, dev, e2e, lint, migrate, nightly, register-webhook (+8 more)

### Community 85 - "core/src/index.ts"
Cohesion: 0.13
Nodes (14): installErrorHandling(), render(), Rendered, renderError(), Money as bigint Minor Units, fast-check@^4.10.2, CatalogSearch, model (+6 more)

### Community 86 - "ingest.test.ts"
Cohesion: 0.10
Nodes (29): canonicalJson(), normalize(), sha256Hex(), ZERO_HASH, AUDIT_LOCK_KEY, AUDIT_NOTIFY_CHANNEL, auditHash(), AuditRow (+21 more)

### Community 89 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @babel/preset-react@8.0.1, @babel/preset-typescript@8.0.7, eslint@10.14.0, tsx@^4.23.15, @types/node@^26.6.6, vitest@^5.1.0, @vitest/coverage-v8@^5.1.0 (+6 more)

### Community 90 - "DomainError"
Cohesion: 0.15
Nodes (29): IdParams, ProposalOrderBody, registerOrderRoutes(), VoidBody, state(), state(), DomainError, appendAudit() (+21 more)

### Community 92 - "eslint.boundaries.config.mjs"
Cohesion: 0.29
Nodes (3): IGNORES, @babel/eslint-parser@8.0.7, @babel/eslint-parser

### Community 93 - "@playwright/test"
Cohesion: 0.40
Nodes (3): channel, @playwright/test@^1.65.0, @playwright/test

### Community 95 - "paypal-webhook.mjs"
Cohesion: 0.33
Nodes (5): appUrl, base, EVENTS, headers, hook

### Community 96 - "routes/disputes.ts"
Cohesion: 0.10
Nodes (29): bundleView(), DisputeParams, FileParams, humanName(), registerDisputeRoutes(), DefenseInput, DisputeSubmitBody, DisputeSources (+21 more)

## Knowledge Gaps
- **44 isolated node(s):** `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 582 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `Web Package Manifest`, `package.json`, `jobs.ts`, `api/src/index.ts`, `uuidv7`, `harness.ts`, `rules.ts`, `call.ts`, `channel3.ts`, `sourcing.ts`, `harness.ts`, `webhook-process.test.ts`, `payments/src/orders.ts`, `systemClock`, `payments/src/disputes.ts`, `api.test.ts`, `db/src/index.ts`, `TokenVault`, `disputes.test.ts`, `pdf.ts`, `withTx`, `order-state.test.ts`, `core/src/index.ts`, `ingest.test.ts`, `devDependencies`?**
  _High betweenness centrality (0.212) - this node is a cross-community bridge._
- **What connects `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.07965860597439545 - nodes in this community are weakly interconnected._
- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Testing and Verification Strategy`, `P0 Scope (FR-01 to FR-14)`, `Agent Boundary / Least Privilege`, `Decision SHA-256 Hash`, `Hash-Chained Audit Log (FR-11)`, `Verified Webhook Ingestion (FR-08)`, `core/src/index.ts`, `rules.ts`?**
  _High betweenness centrality (0.210) - this node is a cross-community bridge._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.11229946524064172 - nodes in this community are weakly interconnected._
- **Why does `DomainError` connect `DomainError` to `jobs.ts`, `vitest`, `api/src/index.ts`, `payments/src/disputes.ts`, `src/mandates.ts`, `uuidv7`, `call.ts`, `channel3.ts`, `sourcing.ts`, `process.ts`, `webhook-process.test.ts`, `authorizations.ts`, `payments/src/orders.ts`, `payments/src/refunds.ts`, `session.ts`, `payments/src/disputes.ts`, `db/src/index.ts`, `TokenVault`, `disputes.test.ts`, `pdf.ts`, `suppliers.ts`, `submitEvidence`, `core/src/index.ts`, `ingest.test.ts`, `routes/disputes.ts`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `Channel3 (sourcing catalog API/MCP)` be split into smaller, more focused modules?**
  _Cohesion score 0.08708708708708708 - nodes in this community are weakly interconnected._