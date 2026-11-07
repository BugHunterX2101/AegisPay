# Graph Report - AegisPay  (2026-11-07)

## Corpus Check
- 188 files · ~138,083 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 1, .css 1)

## Summary
- 1802 nodes · 4791 edges · 82 communities (78 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 130 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3c013b87`
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
- test
- Core Package Manifest
- Gatekeeper Package Manifest
- payments/src/disputes.ts
- demo.test.ts
- pdf.ts
- src/mandates.ts
- plan.ts
- Workspace Overrides
- CI/CD pipeline (GitHub Actions, gitleaks, Playwright)
- harness.ts
- TS Project Config
- agents/test/agents.test.ts
- rules.ts
- Postman Partner
- api/src/errors.ts
- Testing and Verification Strategy
- webhooks.test.ts
- Agent Boundary / Least Privilege
- Self-check Probes (FR-13)
- CLAUDE.md
- 0007_demo_setting.sql
- client.ts
- payments/src/orders.ts
- worker.test.ts
- harness.ts
- App.tsx
- process.ts
- jobs.ts
- web/src/types.ts
- 0004_supplier_profile.sql
- authorizations.test.ts
- channel3.ts
- payments/src/refunds.ts
- app.ts
- sourcing.ts
- core/src/index.ts
- evidence-pdf.test.ts
- defense.ts
- schemas.ts
- Page
- api.test.ts
- stream.ts
- api/src/index.ts
- refunds.test.ts
- jobs/package.json
- harness.ts
- DomainError
- withTx
- Decision SHA-256 Hash
- authorizations.ts
- llm.ts
- order-state.test.ts
- services
- paypal-webhook.mjs
- ref_node_fs
- Deviations from the spec, and what is still unconfirmed
- db/src/orders.ts
- CommandGrid.tsx
- steps
- api-client.ts
- Clock
- PayPalApprove.tsx
- web/tsconfig.json

## God Nodes (most connected - your core abstractions)
1. `DomainError` - 115 edges
2. `withTx()` - 80 edges
3. `appendAudit()` - 54 edges
4. `getOrder()` - 47 edges
5. `vitest` - 46 edges
6. `transition()` - 44 edges
7. `Deterministic Mandate Gatekeeper (FR-03)` - 41 edges
8. `authorizeHold()` - 34 edges
9. `uuidv7()` - 33 edges
10. `Hash-Chained Audit Log (FR-11)` - 31 edges

## Surprising Connections (you probably didn't know these)
- `The five guarantees` --references--> `voidHold()`  [INFERRED]
  README.md → packages/payments/src/authorizations.ts
- `Security notes` --references--> `loadPayPalConfig()`  [INFERRED]
  README.md → packages/payments/src/config.ts
- `5c. Agent decisions that differ from, or go beyond, the TDD` --references--> `fetchDispute()`  [INFERRED]
  docs/DEVIATIONS.md → packages/payments/src/disputes.ts
- `Decisions the spec leaves open` --references--> `spentSoFar()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/src/mandates.ts
- `1. Deviations from the spec` --references--> `refund()`  [INFERRED]
  docs/DEVIATIONS.md → packages/db/test/refund-dispute.test.ts

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

## Communities (82 total, 4 thin omitted)

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
Cohesion: 0.06
Nodes (37): dependencies, ag-grid-community@^36.3.0, ag-grid-enterprise@^36.3.0, ag-grid-react@^36.3.0, @paypal/paypal-js@^11.3.0, react@^19.3.1, react-dom@^19.3.1, @tanstack/react-query@^5.105.3 (+29 more)

### Community 5 - "API Package Manifest"
Cohesion: 0.06
Nodes (46): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, fastify@5.12.8 (+38 more)

### Community 6 - "Root Workspace Config"
Cohesion: 0.05
Nodes (43): channel, description, devDependencies, concurrently@^10.0.6, fast-check@^4.10.2, @playwright/test@^1.65.0, tsx@^4.23.15, @types/node@^26.6.6 (+35 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.11
Nodes (24): dependencies, @aegis/agents@workspace:*, @aegis/core@workspace:*, @aegis/db@workspace:*, @aegis/gatekeeper@workspace:*, @aegis/jobs@workspace:*, @aegis/payments@workspace:*, pg-boss@12.38.0 (+16 more)

### Community 8 - "Agents Package Manifest"
Cohesion: 0.12
Nodes (22): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, ai@7.0.163, @ai-sdk/anthropic@4.0.97, @ai-sdk/groq@4.0.77, @paypal/agent-toolkit@1.11.0, tslib@^2.9.1 (+14 more)

### Community 9 - "Payments Package Manifest"
Cohesion: 0.15
Nodes (16): dependencies, @aegis/core@workspace:*, @aegis/db@workspace:*, buffer-crc32@1.0.0, pdf-lib@1.17.1, zod@4.6.7, exports, @aegis/core (+8 more)

### Community 10 - "Dispute Evidence Assembly"
Cohesion: 0.19
Nodes (15): Dispute Evidence Assembly, Dispute Reason to Evidence Mapping, FR-09 Dispute Defense Agent, Journey C: Dispute Defense, PayPal Disputes API (provide-evidence, require-evidence), Persona: Meera, Finance & Disputes, Defense Agent, Evidence Plan by Dispute Reason (+7 more)

### Community 11 - "core/src/index.ts"
Cohesion: 0.12
Nodes (21): 1. Deviations from the spec, CallOptions, CallResult, defaultDeps, describeFailure(), FailureInfo, header(), isNetworkError() (+13 more)

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
Cohesion: 0.11
Nodes (10): make(), noJobs, cfg, CERT_URL, makeCert(), SignOptions, TABLE, TestCert (+2 more)

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
Cohesion: 0.07
Nodes (59): bundleView(), DisputeParams, FileParams, humanName(), registerDisputeRoutes(), 2. Failure windows, and how each is closed, Worker (decisions the spec leaves open), getDisputeSources() (+51 more)

### Community 22 - "demo.test.ts"
Cohesion: 0.12
Nodes (12): main(), catalog, make(), noJobs, 5b. API decisions that differ from, or go beyond, the TDD, channel3FromEnv(), modelFromEnv(), OffsetClock (+4 more)

### Community 23 - "pdf.ts"
Cohesion: 0.22
Nodes (13): sha256Hex(), assertBundleIntegrity(), A4, bundleSha256(), MAX_FILE_BYTES, MAX_TOTAL_BYTES, need(), Writer (+5 more)

### Community 24 - "src/mandates.ts"
Cohesion: 0.11
Nodes (35): IdParams, isoDate(), registerAgentRoutes(), SourceBody, AmendBody, IdParams, registerMandateRoutes(), StatusBody (+27 more)

### Community 25 - "plan.ts"
Cohesion: 0.16
Nodes (14): GatheredFacts, RenderFacts, clean(), DisputeReason, DocumentKind, EvidenceFacts, EvidenceType, MAX_NOTES_CHARS (+6 more)

### Community 26 - "Workspace Overrides"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, minimumReleaseAgeExclude, overrides, tslib, packages

### Community 27 - "CI/CD pipeline (GitHub Actions, gitleaks, Playwright)"
Cohesion: 0.17
Nodes (12): 29-day authorization validity and 3-day honor period, CI/CD pipeline (GitHub Actions, gitleaks, Playwright), Environment configuration (zod, fail fast), Feature flags (BRYNTUM, REAUTH, ELASTIC, POLL_FALLBACK), Judge Mode (demo reset, clock offset, sandbox buyer banner), Local development and sandbox setup, /paypal:doctor report, Reauthorization (P1, FEATURE_REAUTH) (+4 more)

### Community 28 - "harness.ts"
Cohesion: 0.06
Nodes (29): REFRESH_WINDOW_MS, Token, tokenResponse, CLIENT_ID, CLIENT_SECRET, Harness, OffsetClock, SeededOrder (+21 more)

### Community 29 - "TS Project Config"
Cohesion: 0.40
Nodes (4): exclude, extends, include, ./tsconfig.base.json

### Community 30 - "agents/test/agents.test.ts"
Cohesion: 0.16
Nodes (15): figures(), ungroundedFigures(), checkParsed(), Dollars, ParsedMandate, ParsedMandateSchema, parseMandateText(), toDraft() (+7 more)

### Community 31 - "rules.ts"
Cohesion: 0.09
Nodes (44): Money as bigint Minor Units, Currency, Minor, evaluate(), finiteOrTag(), hashable(), AUTH_VALIDITY_DAYS, computeTotal() (+36 more)

### Community 33 - "api/src/errors.ts"
Cohesion: 0.48
Nodes (5): installErrorHandling(), render(), Rendered, renderError(), ApiError

### Community 34 - "Testing and Verification Strategy"
Cohesion: 0.15
Nodes (17): Static and Compliance CI Checks, PayPal Sandbox Contract Tests (@sandbox), Design Principles (deterministic money, least privilege, idempotent, one truth, demo-proof), Playwright End-to-End Journeys A/B/C, Gatekeeper Tests (table, property, money, 100% branch coverage), PayPal-Request-Id Idempotency, Journeys A, B, C, Negative and Failure Tests (+9 more)

### Community 35 - "webhooks.test.ts"
Cohesion: 0.10
Nodes (25): isSimulatedEvent(), CERT_HOSTS, CERT_PATH_PREFIX, CERT_TTL_MS, CertCache, checkCertUrl(), crc32Decimal(), HeaderBag (+17 more)

### Community 36 - "Agent Boundary / Least Privilege"
Cohesion: 0.12
Nodes (22): Agent Boundary / Least Privilege, Agent Worker (Vercel AI SDK + Agent Toolkit), PayPal Agent Toolkit, Three PayPal Access Paths (Toolkit, Server SDK, direct REST), Product Thesis: AI as orchestrator, not unbounded spender, Migrations and Demo Reset, Prompt and Safety Rules, Table audit_event (+14 more)

### Community 37 - "Self-check Probes (FR-13)"
Cohesion: 0.18
Nodes (11): Day 1 Spike Questions, Demo Clock Offset (/api/demo/clock), Sandbox Dispute Pool, External Dependencies and Fallbacks, Gap Protection Polling (every 2 minutes), Judge Mode UX, Monitoring and /status Page, Render Blueprint render.yaml (+3 more)

### Community 40 - "client.ts"
Cohesion: 0.16
Nodes (17): DomainError, Db, TestDb, CallDeps, CreateContextOptions, createPayPalContext(), PayPalContext, sameOrigin() (+9 more)

### Community 41 - "payments/src/orders.ts"
Cohesion: 0.17
Nodes (17): @paypal/paypal-server-sdk@2.5.0, AuthorizedHold, authorizeHold(), buildOrderRequest(), cap(), CARRIERS, getPayPalOrder(), HoldCopy (+9 more)

### Community 42 - "worker.test.ts"
Cohesion: 0.23
Nodes (11): Log, jobKey, PAYLOAD, Uuid, VoidJob, QUEUE, QUEUE_DEFS, QueueName (+3 more)

### Community 43 - "harness.ts"
Cohesion: 0.12
Nodes (9): CATALOG, draft(), Frame, inDays(), liveModel, make(), newMandate(), noJobs (+1 more)

### Community 44 - "App.tsx"
Cohesion: 0.24
Nodes (23): api(), ApiError, errorMessage(), getSession(), App(), Stream(), Toasts(), ActionsCell() (+15 more)

### Community 45 - "process.ts"
Cohesion: 0.06
Nodes (67): Webhook processing (decisions the spec leaves open), canonicalJson(), normalize(), catalogQueryHash(), CatalogSnapshot, getCatalogSnapshot(), insertCatalogSnapshot(), requireIntactSnapshot() (+59 more)

### Community 46 - "jobs.ts"
Cohesion: 0.12
Nodes (27): classifyFailure(), ctxOf(), msg(), PERMANENT, PollResult, runCapture(), runPollOpen(), runReauthSweep() (+19 more)

### Community 47 - "web/src/types.ts"
Cohesion: 0.16
Nodes (20): AgentDrawer(), headline(), LABEL, DisputeDetail, AppState, StreamStatus, Toast, AuditEvent (+12 more)

### Community 49 - "authorizations.test.ts"
Cohesion: 0.22
Nodes (6): REAUTH_LEAD_MS, advance(), delivered(), held(), orderState(), SeedOptions

### Community 50 - "channel3.ts"
Cohesion: 0.18
Nodes (13): assertChannel3Url(), CatalogOffer, CatalogProduct, CatalogSearch, CHANNEL3_BASE_URL, isLoopback(), OfferSchema, priceToMinor() (+5 more)

### Community 51 - "payments/src/refunds.ts"
Cohesion: 0.21
Nodes (20): withAdvisoryLock(), getRefundRow(), insertRefund(), listPendingRefunds(), listRefunds(), RefundDbRow, refundedMinor(), RefundRow (+12 more)

### Community 52 - "app.ts"
Cohesion: 0.18
Nodes (17): BuildAppOptions, ApiDeps, Log, registerAuditRoutes(), registerDemoRoutes(), registerWebhooks(), createSelfCheck(), Probe (+9 more)

### Community 53 - "sourcing.ts"
Cohesion: 0.21
Nodes (13): DraftedNotes, AgentStep, ParseResult, Candidate, compare(), MAX_CANDIDATES, money(), RationaleSchema (+5 more)

### Community 54 - "core/src/index.ts"
Cohesion: 0.16
Nodes (7): model, ErrorCode, HTTP_STATUS, ZERO_HASH, paypal(), fast-check, vitest

### Community 55 - "evidence-pdf.test.ts"
Cohesion: 0.22
Nodes (5): 5. Test coverage notes, renderPdfs(), FACTS, FULL, T0

### Community 56 - "defense.ts"
Cohesion: 0.24
Nodes (10): buildFacts(), day(), DefenseInput, draftEvidenceNotes(), Fact, factsText(), NOTES_LIMIT, NotesSchema (+2 more)

### Community 57 - "schemas.ts"
Cohesion: 0.12
Nodes (15): ApiErrorSchema, CARRIERS, CreateMandateBody, CurrencySchema, DemoClockBody, DisputeSubmitBody, IsoDate, IsoDateTime (+7 more)

### Community 58 - "Page"
Cohesion: 0.31
Nodes (3): Page, renderOne(), winAnsiSafe()

### Community 59 - "api.test.ts"
Cohesion: 0.22
Nodes (10): WEBHOOK_MAX_BYTES, draft(), Frame, held(), newMandate(), placed(), propose(), settledOrder() (+2 more)

### Community 60 - "stream.ts"
Cohesion: 0.13
Nodes (17): buildApp(), jsonReplacer(), toJson(), AuditMessage, factMessage(), frame(), Log, parseSeq() (+9 more)

### Community 61 - "api/src/index.ts"
Cohesion: 0.18
Nodes (16): main(), jsonLog(), migrate(), MigrationResult, MIGRATIONS_DIR, sha(), closePool(), createPool() (+8 more)

### Community 62 - "refunds.test.ts"
Cohesion: 0.32
Nodes (4): move(), pendingFull(), settled(), state()

### Community 63 - "jobs/package.json"
Cohesion: 0.22
Nodes (10): dependencies, pg-boss@12.38.0, zod@4.6.7, exports, pg-boss, zod, name, private (+2 more)

### Community 64 - "harness.ts"
Cohesion: 0.11
Nodes (20): awaitingApproval(), delivered(), held(), delivered(), held(), logs, state(), recordPayPalOrderId() (+12 more)

### Community 65 - "DomainError"
Cohesion: 0.17
Nodes (26): IdParams, ProposalOrderBody, registerOrderRoutes(), VoidBody, appendAudit(), cancelUnapprovedOrder(), createOrderFromProposal(), FULFILLMENT_SOURCE (+18 more)

### Community 66 - "withTx"
Cohesion: 0.29
Nodes (10): advance(), uuidv7(), insertOrder(), withTx(), seedProposal(), add(), tamper(), newOrder() (+2 more)

### Community 67 - "Decision SHA-256 Hash"
Cohesion: 0.40
Nodes (6): Order Drafter Agent, AMOUNT_MISMATCH Check, Decision SHA-256 Hash, evaluate(mandate, proposal, context) -> Decision, Mandate/Proposal/Context/Decision Types, Order Payload Built by Code

### Community 68 - "authorizations.ts"
Cohesion: 0.34
Nodes (12): recordReauthorization(), getOrderBundle(), capture(), getAuthorization(), isFinalClientError(), payments(), reauthorize(), usable() (+4 more)

### Community 69 - "llm.ts"
Cohesion: 0.22
Nodes (8): DEFAULT_GROQ_MODEL_ID, DEFAULT_MODEL_ID, generateStructured(), StructuredRun, DEFENSE_PROMPT, PARSER_PROMPT, promptHash(), RATIONALE_PROMPT

### Community 70 - "order-state.test.ts"
Cohesion: 0.31
Nodes (6): ALLOWED_TRANSITIONS, canTransition(), HELD_STATES, OPEN_STATES, ORDER_STATES, TERMINAL_STATES

### Community 71 - "services"
Cohesion: 0.09
Nodes (22): databases, databaseName, name, plan, user, fromDatabase, generateValue, key (+14 more)

### Community 72 - "paypal-webhook.mjs"
Cohesion: 0.33
Nodes (5): appUrl, base, EVENTS, headers, hook

### Community 73 - "ref_node_fs"
Cohesion: 0.25
Nodes (6): db, key, NAMES, owner, svc, wanted

### Community 74 - "Deviations from the spec, and what is still unconfirmed"
Cohesion: 0.10
Nodes (17): AI tools used, Inside the product (runtime), Used to build it, 3. Unconfirmed against the real sandbox, 4. Real-sandbox findings (verified), 5c. Agent decisions that differ from, or go beyond, the TDD, 5d. Web app decisions that differ from, or go beyond, the TDD, 6. What is needed from the owner (+9 more)

### Community 75 - "db/src/orders.ts"
Cohesion: 0.07
Nodes (34): OrderState, AUDIT_LOCK_KEY, AUDIT_NOTIFY_CHANNEL, auditHash(), AuditRow, ChainResult, NewAuditEvent, verifyChain() (+26 more)

### Community 76 - "CommandGrid.tsx"
Cohesion: 0.17
Nodes (19): CommandGrid(), DISPUTE_STATES, GateCell(), GridCtx, licenseKey, SlaCell(), sumMinor(), theme (+11 more)

### Community 77 - "steps"
Cohesion: 0.09
Nodes (21): APP_URL, E2E_BASE_URL, jobs, nightly, name, runs-on, steps, timeout-minutes (+13 more)

### Community 78 - "api-client.ts"
Cohesion: 0.16
Nodes (16): APP_URL, call(), openSession(), printSelfCheck(), ProbeResult, SelfCheckBody, Session, CLOSED (+8 more)

### Community 79 - "Clock"
Cohesion: 0.13
Nodes (12): WorkerDeps, WorkerHandle, WorkerOptions, addDays(), Clock, DAY_MS, FixedClock, systemClock (+4 more)

### Community 80 - "PayPalApprove.tsx"
Cohesion: 0.28
Nodes (9): GridDialogs(), CARRIERS, ShipDialog(), VoidDialog(), Modal(), OneTimeSession, Phase, money() (+1 more)

### Community 83 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

## Knowledge Gaps
- **44 isolated node(s):** `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json`, `paymentsController.refundCapturedPayment (P1) -> POST /v2/payments/captures/{id}/refund`, `Compliance and Honesty (no 'escrow' wording, AI disclosure)` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 528 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Deterministic Mandate Gatekeeper (FR-03)` connect `Channel3 (sourcing catalog API/MCP)` to `Authorization Hold (Orders v2 intent AUTHORIZE)`, `Decision Record D1-D13`, `Testing and Verification Strategy`, `Decision SHA-256 Hash`, `Agent Boundary / Least Privilege`, `P0 Scope (FR-01 to FR-14)`, `Hash-Chained Audit Log (FR-11)`, `Verified Webhook Ingestion (FR-08)`, `rules.ts`?**
  _High betweenness centrality (0.240) - this node is a cross-community bridge._
- **What connects `../../tsconfig.base.json`, `RFC-9562`, `./tsconfig.base.json` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authorization Hold (Orders v2 intent AUTHORIZE)` be split into smaller, more focused modules?**
  _Cohesion score 0.07965860597439545 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `core/src/index.ts` to `Root Workspace Config`, `core/src/index.ts`, `webhook-signing.ts`, `payments/src/disputes.ts`, `demo.test.ts`, `pdf.ts`, `src/mandates.ts`, `plan.ts`, `harness.ts`, `agents/test/agents.test.ts`, `rules.ts`, `webhooks.test.ts`, `client.ts`, `harness.ts`, `process.ts`, `jobs.ts`, `authorizations.test.ts`, `evidence-pdf.test.ts`, `api.test.ts`, `api/src/index.ts`, `refunds.test.ts`, `harness.ts`, `DomainError`, `withTx`, `order-state.test.ts`, `Clock`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Should `Decision Record D1-D13` be split into smaller, more focused modules?**
  _Cohesion score 0.11229946524064172 - nodes in this community are weakly interconnected._
- **Why does `DomainError` connect `client.ts` to `API Package Manifest`, `core/src/index.ts`, `payments/src/disputes.ts`, `pdf.ts`, `src/mandates.ts`, `plan.ts`, `harness.ts`, `agents/test/agents.test.ts`, `api/src/errors.ts`, `webhooks.test.ts`, `payments/src/orders.ts`, `process.ts`, `jobs.ts`, `authorizations.test.ts`, `channel3.ts`, `payments/src/refunds.ts`, `app.ts`, `core/src/index.ts`, `evidence-pdf.test.ts`, `Page`, `api/src/index.ts`, `refunds.test.ts`, `harness.ts`, `DomainError`, `withTx`, `authorizations.ts`, `llm.ts`, `db/src/orders.ts`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Should `Channel3 (sourcing catalog API/MCP)` be split into smaller, more focused modules?**
  _Cohesion score 0.08708708708708708 - nodes in this community are weakly interconnected._