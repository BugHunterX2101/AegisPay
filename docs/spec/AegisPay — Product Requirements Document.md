# AegisPay — Product Requirements Document

Nov 5, 2026 · @Vedit Agrawal

## TL;DR

**AegisPay is a control plane that lets a small business hand procurement to AI agents without handing them the wallet.** An operator sets a mandate (budget, unit-price ceiling, delivery deadline, spec). Agents source suppliers, but money only moves through a PayPal authorization hold that a human approves and that is captured only when delivery is proven. If something goes wrong, the system assembles the evidence and answers the PayPal dispute for you.

The product is built for the PayPal AI Hackathon 2026. Submissions close **Thursday 12 Nov 2026, 12:00 PM PST (Fri 13 Nov, 01:30 IST)** — about 6.5 days from this draft. That is the single biggest constraint in this PRD: the source strategy report planned a 21-day build starting 22 Oct, so this document re-cuts scope into what can ship and be demoed reliably in one week.

**The three bets, in priority order:**

1. **Deterministic spend safety.** Agents propose; a pure-code mandate gatekeeper decides. Funds are only ever held with Orders v2 `intent: AUTHORIZE`, never captured on agent say-so.
2. **Proof-of-fulfillment settlement.** Capture fires only after the supplier's tracking is recorded and delivery is confirmed; the tracking is then pushed to PayPal against the capture. An SLA miss voids the authorization instead.
3. **Autonomous dispute defense.** When a dispute arrives by verified webhook, an agent maps the reason code to the evidence PayPal expects and files it, with a human confirm step.

| Field | Value |
| --- | --- |
| Product | AegisPay (working name from the strategy report: "AegisPay MCP") |
| Document type | Product Requirements Document, v1.0 |
| Source | *Strategic Intelligence and Architectural Blueprint for Winning the PayPal AI Hackathon 2026* (uploaded report), cross-checked against live sources on 5 Nov 2026 |
| Hard deadline | 12 Nov 2026, 12:00 PM PST — Devpost submission |
| Judging window | 1–15 Dec 2026 — the hosted demo must run unattended for 14 days |
| Primary prize targets | Grand Prize (1st–3rd), Best Use of Agentic Commerce / Best Use of PayPal + AI, Best Use of AG Grid |

**Key decision in this PRD:** ship a narrower, bulletproof P0 (authorize → verify → capture/void → dispute defense, with AG Grid and Channel3) and treat Bryntum, APIMatic and invoicing as P1 add-ons that only start once P0 passes its demo gate.

## Context and opportunity

**There are no tracks, so problem choice and depth of PayPal integration decide the result.** The only hard rule is that the project integrates the PayPal Developer Platform (sandbox) and meaningfully uses AI, with PayPal integration central ([rules](https://paypalaihackathon.devpost.com/rules)). Registration now stands at **28,867** participants, up from the 17,481 quoted in the report ([overview](https://paypalaihackathon.devpost.com/)).

### How judging works

- **Stage One (pass/fail):** fits the theme and reasonably applies the required PayPal APIs/SDKs.
- **Stage Two:** five equally weighted criteria — Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation.
- **Tie-breaks cascade in that order.** Technological Implementation is compared first, then Design, and so on; judges vote only if every criterion ties.
- **Stacking:** one Grand Prize + one Sponsor Prize, or one Honorable Mention + one Sponsor Prize. So the realistic ceiling is $12,000 + $5,000.
- **Judges may change and may use automated AI-driven analysis.** The rules say so explicitly, which makes a clean, self-explaining repository more valuable, not less.

### Prize map relevant to AegisPay

| Prize | Award | What it takes for AegisPay | Fit |
| --- | --- | --- | --- |
| Grand Prize 1st / 2nd / 3rd | $12,000 / $8,000 / $5,000 | Top composite score across all five criteria | Primary |
| Best Use of Agentic Commerce | $5,000 | Agents that safely transact end-to-end on PayPal | Primary |
| Best Use of PayPal + AI | $5,000 | Depth of PayPal surfaces driven by AI | Primary |
| Most Impactful | $5,000 | Credible real problem for a real audience | Strong |
| Best Demo Delivery | $5,000 | A clear, working end-to-end video | Strong |
| Best Use of AG Grid (1st / 2nd / 3rd ×3) | $5,000 / $2,000 / $1,000 | AG Grid as the operating surface, not a static table | Primary sponsor target |
| Best Use of Channel3 | $1,500 (1 winner) | Real calls to the Channel3 API or MCP server | Secondary |
| Best Use of Bryntum (×3) | $1,000 | Interactive timeline / scheduling | P1 |
| Best Use of APIMatic (×3) | $1,000 + 6-month subscription | Generated SDK used in the product | P1 |
| Best Use of Render (1st–3rd) | $1,000 / $750 / $500 credits | Hosted on Render | Free to qualify |

Elastic, Postman, KERNEL, Astropods and Zapier are listed partner tools but carry **no prize of their own**. Their only value is technical depth and goodwill with the judges who represent them.

### The judging panel

Thirteen judges are listed on the overview page: six from PayPal and seven from partners. The PayPal group splits into Developer Advocates (Jo Franchetti, Eddie Jaoude, Marco Podien) and engineering/product (Karthik Ravi, Software Engineer; Himraj Singh, Engineering Manager; Nathaniel Olson, Senior Product Manager). Partners: Sylwia Vargas (AG Grid), Ameer Hassan (APIMatic), Mats Bryntse (Bryntum), Ignacio Valdez Bicard (Channel3), Carly Richmond (Elastic), Pooja Mistry (Postman), Shifra Williams (Render).

What each group is likely to look for is inference, not stated policy. A reasonable read: DevRel judges reward repo hygiene, setup in minutes and a crisp video; engineering judges reward correct auth, webhook verification and failure handling; the PM rewards a credible business problem aligned with PayPal's agentic-commerce direction; sponsor judges reward deep, non-decorative use of their tool.

## Problem statement and product thesis

**Businesses want agents to buy for them, but nobody can yet say who authorized an agent's purchase, who pays for its mistakes, or who answers the chargeback.** AegisPay answers all three inside the PayPal rail.

### Why now

- **Consumer in-chat checkout stalled.** OpenAI launched Instant Checkout in ChatGPT on 29 Sep 2025 and by March 2026 had moved to a discovery-and-redirect model; reporting puts merchant uptake at roughly a dozen to \~30 Shopify merchants before the pullback ([FinTech Law](https://fintechlaw.ai/blog/agentic-commerce-protocol-instant-checkout-payments-risk), [Shopifreaks](https://www.shopifreaks.com/openai-scales-back-its-integrated-commerce-plans/)).
- **The liability chain is the unsolved part.** Legal analysis frames three open questions that protocols like ACP leave open: did the customer authorize this specific purchase, who bears the cost of agent error, and which regulated party is of record for refunds and disputes ([FinTech Law](https://fintechlaw.ai/blog/agentic-commerce-protocol-instant-checkout-payments-risk)).
- **Error rates become dispute floods at scale.** The same analysis notes that at 700M+ weekly ChatGPT users, a 1% agent error rate would mean a chargeback flood.
- **Regulators are moving.** The FTC proposed a policy statement on AI accuracy and manipulation on 1 Jul 2026 (comments closed 31 Jul); Senator Warner circulated the AI AGENT Act discussion draft on 29 Jun 2026, not yet formally introduced.
- **PayPal is positioning as the trust layer.** PayPal names consent, trusted identity, reliable payments and fraud protection as the core requirements of agentic commerce, and says merchants will need to support multiple protocols ([PayPal newsroom](https://newsroom.paypal-corp.com/2026-01-22-Making-Sense-of-the-AI-Shopping-Protocol-Moment)).

### Problem statement

> Small and mid-sized businesses want to delegate recurring procurement, supplier price sourcing and supplier settlement to AI agents, but cannot do so safely. Today's agentic flows lack three things: **deterministic pre-spend mandate enforcement**, **settlement gated on verified fulfillment**, and **automatic dispute evidence**. When an agent orders against bad catalog data, or a supplier misses its delivery window, the business loses working capital and spends hours assembling evidence across spreadsheets, inboxes and the PayPal Resolution Center.

### Product thesis

AI should act as an **orchestrator and evidence-gatherer**, not as an unbounded spender. Every money movement is (1) pre-checked by code, not by a model, (2) approved by a human, (3) held rather than captured, and (4) leaves a tamper-evident trail that doubles as dispute evidence. This is a B2B/SMB procurement product deliberately, because the consumer chat-to-checkout space is crowded in this hackathon (the report counts several "PayPilot" / "CartPilot" style entries) and is exactly where the liability problem bites hardest.

### What we are explicitly not claiming

- AegisPay does not make agent purchases legally safe on its own; it produces the authorization record and audit trail that a legal framework would need.
- "Proof-of-fulfillment" in the hackathon is sandbox-simulated: tracking numbers are real API calls, but delivery events are simulated.

## Target users and personas

**The buyer is an SMB operations lead who already pays suppliers through PayPal and loses hours to sourcing, chasing deliveries and fighting disputes.** The hackathon judge is a second, equally important "user" who must understand and verify the product in under three minutes.

| Persona | Who they are | Job to be done | Pain today | What AegisPay gives them |
| --- | --- | --- | --- | --- |
| **Priya, Ops Manager** (primary) | Runs procurement for a 3-location café group; restocks equipment and consumables monthly | "Restock what we need, within budget, from suppliers who actually deliver on time" | Compares prices across tabs, pays up front, chases late shipments, loses money on non-delivery | Mandates the agent must obey; funds held until delivery; one grid showing every order's state |
| **Arjun, Owner / Approver** | Signs off spend above a threshold | "Never be surprised by a charge" | Discovers overspend after the fact | Human approval on every authorization; hard caps enforced in code, not by a prompt |
| **Meera, Finance & Disputes** | Handles reconciliation and PayPal cases part-time | "Win the disputes we should win, refund fast when we're wrong" | Hunts for tracking numbers, contracts and screenshots when a case opens | Evidence bundle auto-assembled per reason code; one click to file |
| **Supplier (counterparty)** | A seller fulfilling the order | Get paid promptly when they deliver | Payment uncertainty with new buyers | Funds are authorized up front, so delivery is low-risk for them |
| **Hackathon judge** | PayPal DevRel, engineering, product or sponsor | Verify it works, see real PayPal depth, judge impact | 28k+ entrants; limited time per project | A guided Judge Mode, a 3-minute video, a self-check panel and a README that maps every claim to code |

### Primary scenario used throughout this PRD

Priya's mandate: *"Source 50 commercial burr grinders at ≤ $180/unit, total ≤ $9,000, delivered by 25 Nov, from suppliers rated ≥ 4.0."* The agent shortlists offers, the gatekeeper validates, Arjun approves a PayPal authorization hold, the supplier ships, tracking is bound, delivery is confirmed and funds are captured. In the failure branch the SLA is missed and the hold is voided; in the dispute branch a buyer opens a not-received case and AegisPay files proof of fulfillment.

Sandbox note: demo amounts will be scaled down (for example $18 per unit) to stay well inside sandbox account balances and to use the dispute simulation amount bands.

## Goals, non-goals and success metrics

**Success means one thing in this window: a judge can run the full authorize → verify → capture/void → dispute loop on a live URL in December, and it works first time.**

### Product goals

1. **Zero unapproved spend.** No PayPal money movement happens without passing the deterministic gatekeeper and a recorded human approval.
2. **Settlement follows proof.** Capture happens only after a supplier tracking record exists in AegisPay and delivery is confirmed; SLA breach triggers void.
3. **Disputes answered in minutes, not hours.** Evidence matched to PayPal's reason-to-evidence rules is assembled automatically.
4. **Everything is auditable.** Every agent step, gate decision, API call (with `debug_id`) and webhook is in an append-only, hash-chained log.

### Hackathon goals

1. Pass Stage One with zero compliance risk (license, public repo, video < 3:00, working demo).
2. Score highest on **Technological Implementation**, the first tie-breaker, through breadth and correctness of PayPal integration.
3. Qualify cleanly for **Best Use of AG Grid** and **Best Use of Channel3**; add Bryntum / APIMatic only if P0 is done.
4. Stay up and correct, unattended, for the full 1–15 Dec judging window.

### Non-goals (for this submission)

- Real-money production use, KYC, multi-tenant onboarding or billing.
- Real carrier integrations; delivery confirmation is simulated in sandbox.
- A general-purpose shopping chatbot or consumer checkout.
- Fully autonomous capture without human approval.
- Native ChatGPT App / ACP or Google UCP checkout surfaces (described as future direction only).
- Mobile app; desktop web only.

### Success metrics

| Metric | Target at submission | How measured |
| --- | --- | --- |
| Golden-path demo success | 10/10 consecutive clean runs on the deployed URL | Scripted Judge Mode run log |
| Mandate violations reaching PayPal | 0 across 200 fuzzed proposals | Gatekeeper property tests |
| Distinct PayPal API surfaces exercised live | ≥ 7 (OAuth, Orders, Payments auth/capture/void, Refunds, Shipment Tracking, Disputes, Webhooks) | API call log grouped by endpoint |
| `/paypal:doctor full` result | 0 critical, ≤ 2 warnings (each justified in README) | Report committed to repo |
| Webhook verification | 100% of live events verified by postback; 100% of simulator events verified offline | Audit log column |
| Dispute evidence time | < 60 s from `CUSTOMER.DISPUTE.CREATED` to evidence ready for review | Timestamps in audit log |
| Time for a judge to first "wow" | < 60 s from opening the URL | Dry runs with 3 people who haven't seen it |
| Uptime during judging | 100% of hourly health checks green, 1–15 Dec | External uptime monitor |
| Video length | 2:40–2:55 | YouTube |

## Scope and functional requirements

**P0 is the full money loop with real PayPal calls; nothing in P1 starts until every P0 acceptance test passes on the deployed URL.** P0 is sized for roughly four build days; P1 for the remaining slack.

### Operating model (resolves a gap in the source report)

The report mixes a buyer-side story (an SMB procuring) with seller-side PayPal APIs (creating orders, adding tracking, answering disputes). PayPal's REST APIs are called by the **payee**, so AegisPay is framed as a **two-sided procurement platform that is merchant of record in sandbox**:

- **Buyer side (Priya, Arjun):** sets mandates, approves authorization holds through PayPal checkout as the payer, is protected because funds are captured only on proof of delivery.
- **Seller side (supplier, settled via the platform):** is protected because the platform holds a signed mandate, a human approval record and tracking, which together answer an "unauthorised" or "not received" dispute.
- **Sandbox mapping:** one sandbox Business account = the platform/supplier payee; one or more sandbox Personal accounts = the SMB buyer. Production would move to PayPal's multiparty platform model with a payee per supplier — out of scope here and stated as such.

### P0 — must ship (the demo depends on it)

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| FR-01 | **Mandate builder.** Operator creates a mandate: item spec, quantity, unit-price ceiling, total budget, currency, deliver-by date, minimum supplier rating, allowed suppliers (optional), approval threshold. | Form validates types and ranges; mandate saved with version and SHA-256 hash; natural-language entry ("50 grinders under $180 by 25 Nov") is parsed by the LLM into the same structured form, shown for confirmation before save. |
| FR-02 | **Sourcing agent (read-only).** Searches Channel3 for offers matching the spec; returns a ranked shortlist with price, retailer, availability, product URL and a stored snapshot. | ≥ 1 real Channel3 call per mandate visible in the audit log; each candidate stores the raw response hash; agent has no access to any PayPal write tool. |
| FR-03 | **Deterministic mandate gatekeeper.** Pure TypeScript policy function decides whether a proposed purchase may proceed. Never an LLM. | Rejects if unit price > ceiling, total > budget, currency mismatch, ETA > deliver-by, rating < minimum, supplier not allowed, or mandate expired; returns machine-readable reasons; 100% branch coverage; property test of 200 random proposals shows 0 false passes. |
| FR-04 | **Human approval + authorization hold.** Approved proposal creates an Orders v2 order with `intent: AUTHORIZE`, item breakdown from Channel3 data, and `custom_id` = mandate hash; buyer approves via PayPal JS SDK v6; server authorizes the order. | Order shows status `COMPLETED` with an authorization in `CREATED` state; authorization ID, expiry and honor-period end stored; every POST carries a unique `PayPal-Request-Id`. |
| FR-05 | **Fulfillment tracking.** On "supplier shipped", record carrier + tracking number in AegisPay's fulfillment record (PayPal only accepts tracking on captured orders, so it cannot be pushed while the funds are only authorized). | Tracking stored with carrier enum validated against PayPal's carrier list; after capture it is posted to PayPal with the capture ID and read back via `get_shipment_tracking` / order details; row status moves to `IN_TRANSIT`. |
| FR-06 | **Proof-gated capture.** When delivery is confirmed (simulated carrier event) inside the SLA, capture the authorization. | Capture returns 201 and status `COMPLETED`; never fires without a tracking record; idempotent on retry; `PAYMENT.CAPTURE.COMPLETED` webhook reconciles the row. |
| FR-07 | **SLA breach → void.** If deliver-by passes with no confirmed delivery, void the authorization (after a human confirm in P0). | Void returns success; authorization status `VOIDED`; buyer never charged; event logged with reason. |
| FR-08 | **Verified webhook ingestion.** Receive PayPal webhooks on HTTPS, verify, de-duplicate by event ID, return 2xx fast, process async. | Live events verified by `POST /v1/notifications/verify-webhook-signature`; simulator events verified offline with webhook ID `WEBHOOK_ID`; duplicate event IDs ignored; response < 500 ms. |
| FR-09 | **Dispute defense agent.** On `CUSTOMER.DISPUTE.CREATED`, fetch the dispute, map reason → allowed evidence, assemble the evidence bundle, draft notes, and submit via `provide-evidence` after operator confirms. | Submission only when status is `WAITING_FOR_SELLER_RESPONSE` and the `provide_evidence` link is present; evidence type matches the reason table in §9; `CUSTOMER.DISPUTE.UPDATED` reflected in the grid. |
| FR-10 | **Command Center grid (AG Grid).** One row per mandate/order with live updates; master-detail shows the audit trail; action cells for Approve, Mark Shipped, Confirm Delivery, Simulate SLA Breach, Review Evidence. | Webhook-driven rows update in place with cell flash (no full re-render); detail grid lists every tool call with timestamp, actor, endpoint, `debug_id`, result. |
| FR-11 | **Hash-chained audit log.** Append-only record of every agent message, gate decision, approval, API call and webhook. | Each entry stores `prev_hash`; a "Verify chain" button re-computes and shows OK; any edit breaks the chain visibly. |
| FR-12 | **Judge Mode.** A guided, resettable demo path with seeded data and sandbox buyer credentials shown on screen. | A first-time user completes the golden path in < 5 minutes without reading the README; "Reset demo" restores seed state in < 30 s. |
| FR-13 | **Self-check panel.** In-app health panel running the same probes as `/paypal:doctor`: token, $1.00 order create, webhook config, active subscription plan, Channel3 reachability. | All checks green on the deployed URL; panel shows timestamps and `debug_id`s. |
| FR-14 | **OAuth token vault.** Client-credentials token cached with `expires_in`, refreshed before expiry, credentials only on the server via HTTP Basic auth. | No token or secret in client bundle, logs or storage; forced-expiry test recovers without user-visible error. |

### P1 — should ship if P0 passes by Day 5

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| FR-15 | **Bryntum timeline.** Gantt/scheduler lane per order: authorization honor period (3 days), authorization validity (29 days), shipping window, deliver-by SLA, dispute response due date. | Dragging the delivery bar past the SLA prompts "void authorization?" and, on confirm, calls FR-07; grid and timeline stay in sync. |
| FR-16 | **Auto-reauthorize.** If delivery is still inside SLA but the 3-day honor period is ending, reauthorize. | New authorization ID stored and used for capture; old ID marked superseded. |
| FR-17 | **Contract clause retrieval (Elastic).** Index a supplier contract PDF; dispute notes and invoice notes cite clause and page. | Each citation links to the stored chunk; retrieval latency < 1 s on the demo index. |
| FR-18 | **Typed PayPal clients via APIMatic.** Use the APIMatic-generated PayPal Server SDK for Orders/Payments and generate a typed Disputes client from PayPal's OpenAPI spec. | All Orders/Payments calls go through the typed SDK; README documents how APIMatic tooling (including the PayPal Context Plugin) was used. |
| FR-19 | **Partial refunds on short shipment.** If delivered quantity < ordered, capture the full amount then refund the difference (or partial capture if enabled). | Refund ID linked to the row and available as `PROOF_OF_REFUND` evidence. |
| FR-20 | **Postman collection.** Public collection covering every backend endpoint with a sandbox environment. | A judge can run the golden path from Postman alone. |

### P2 — stretch or roadmap only

- FR-21 Supplier invoicing via Invoicing v2 with contract-quoted notes for B2B suppliers who invoice instead of checkout.
- FR-22 Recurring replenishment via Subscriptions v1 (requires handling `BILLING.SUBSCRIPTION.*` webhooks to keep the doctor check clean).
- FR-23 KERNEL cloud-browser verification of supplier pages before approval.
- FR-24 Agentic checkout surfaces (ChatGPT App via ACP, Google UCP) as additional mandate entry points.
- FR-25 Multiparty platform model with per-supplier payees and platform fees.

## Core user journeys and demo script

**Three journeys cover the whole product: the golden path, the SLA breach, and the dispute.** The video shows all three in under three minutes by pre-staging the slow parts.

### Journey A — Golden path (mandate → capture)

1. Priya types the mandate in plain English; the LLM fills the structured form; she confirms. Mandate hash appears.
2. Sourcing agent queries Channel3; a shortlist of 3–5 offers appears in the grid with price sparkline and "within mandate" badges.
3. Agent proposes the best bundle; the gatekeeper shows a green checklist (price, budget, ETA, rating, currency).
4. Arjun clicks **Approve hold**; PayPal checkout opens; he logs in as the sandbox buyer and approves.
5. Server authorizes; the row flips to **HELD** with the authorization amount and honor-period countdown.
6. Supplier marks shipped; tracking is recorded against the hold; row shows **IN TRANSIT**.
7. Simulated carrier event "delivered"; capture fires and the tracking is posted to the PayPal order against the capture ID; `PAYMENT.CAPTURE.COMPLETED` arrives and is verified; row flashes **SETTLED**.

### Journey B — SLA breach (hold → void)

1. An order is held; the deliver-by date passes (time-travel control in Judge Mode, or drag on the Bryntum timeline in P1).
2. Gatekeeper flags breach; the operator confirms **Void hold**.
3. Authorization is voided; the buyer's funds are released; audit log records the reason and SLA evidence.

### Journey C — Dispute defense

1. A pre-staged settled order has a buyer-opened "not received" case in sandbox; it is moved to `WAITING_FOR_SELLER_RESPONSE` with the sandbox require-evidence endpoint.
2. `CUSTOMER.DISPUTE.CREATED` / `UPDATED` webhook arrives, verified; the row turns amber with a countdown to `seller_response_due_date`.
3. Defense agent maps reason → `PROOF_OF_FULFILLMENT`, pulls tracking info, attaches the signed mandate PDF, approval record and Channel3 snapshot, and drafts notes.
4. Meera reviews the bundle side by side and clicks **File evidence**; PayPal accepts; the row shows **EVIDENCE SUBMITTED**.

### 180-second video script

| Time | On screen | Voiceover (summary) |
| --- | --- | --- |
| 0:00–0:15 | Cold open: an agent overspends in a generic chatbot (mock), then cut to AegisPay grid | "Agents can shop. Nobody can prove who authorized the purchase, or who pays when it goes wrong." |
| 0:15–0:35 | Mandate typed in English → structured form → hash | "In AegisPay, the operator sets a mandate. It's enforced by code, not by a prompt." |
| 0:35–1:00 | Channel3 shortlist; gatekeeper rejects one over-budget offer in red, passes another | "The sourcing agent searches 100M+ products via Channel3 but has no ability to pay." |
| 1:00–1:25 | PayPal checkout approval → row turns HELD with countdown | "Money is held with a PayPal authorization, never captured on the agent's word." |
| 1:25–1:50 | Tracking bound → delivered → capture → webhook verified badge | "Capture fires only when delivery is proven. Every webhook is cryptographically verified." |
| 1:50–2:10 | SLA breach on another row → void | "Miss the SLA and the hold is voided. The buyer is never charged." |
| 2:10–2:40 | Dispute arrives → evidence bundle assembled → filed | "When a dispute lands, AegisPay files the exact evidence PayPal asks for, in seconds." |
| 2:40–2:55 | Self-check panel all green; architecture card; URL | "Seven PayPal APIs, verified end to end. Try it live." |

Recording rules: 1080p, real deployed URL, no copyrighted music, no third-party logos beyond the tools actually used, captions burned in, public on YouTube.

## System architecture

**AI agents can read, search and draft, but every money movement goes through one server path guarded by deterministic code and a human.** That single design choice is what makes the product safe and what the engineering judges will probe.

&#91;embedded content: AegisPay architecture · agents, gate, human, payment service\]

The agent worker never holds a PayPal write tool for capture, void or evidence; it hands a proposal to the gatekeeper, a human approves, and only the payment service talks to PayPal's money-moving endpoints.

### Components

| Component | Technology | Responsibility |
| --- | --- | --- |
| Command Center | React + TypeScript (Vite), AG Grid Enterprise, Bryntum (P1), PayPal JS SDK v6 | Mandate entry, approvals, live ledger, evidence review, Judge Mode |
| API server | Node 20 + TypeScript (Fastify), zod schemas | REST for the UI, server-sent events for live grid updates, CSRF protection |
| Agent worker | Vercel AI SDK with `@paypal/agent-toolkit/ai-sdk`, Channel3 client, any tool-calling LLM | Sourcing, order drafting and evidence drafting; one toolkit instance per agent with its own `configuration.actions` |
| Mandate gatekeeper | Pure TypeScript module, no I/O | Deterministic accept/reject with reasons; property-tested |
| Payment service | `@paypal/paypal-server-sdk` (APIMatic-generated) + thin REST client for Disputes/Webhooks | Authorize, capture, void, reauthorize, refunds, provide-evidence; token vault; idempotency; retries |
| Webhook listener | Raw-body route on the API server | 2xx ack, enqueue, verify (postback or offline), de-dupe, dispatch |
| Jobs | Postgres-backed queue (e.g. pg-boss) on the worker; Render cron | Webhook processing, SLA timers, honor-period reauth, nightly re-seed |
| Data | Render Postgres | System of record and hash-chained audit log |
| Docs & testing | Vitest + fast-check, Postman collection, `/paypal:doctor` report | Proof for judges |

### Order lifecycle

&#91;embedded content: Order lifecycle · states and transitions\]

Only two transitions move money: Held → Settled through capture, and Held/In transit → Voided through void; both require a recorded proof or human confirm.

## PayPal integration specification

**The PayPal Agent Toolkit does not cover the authorize-capture-void loop, so AegisPay combines three access paths: the Agent Toolkit for agent-facing tools, the APIMatic-generated PayPal Server SDK for payments, and direct REST for disputes and webhooks.** This is the most important technical correction to the source report, which has the agent "capture" with `pay_order`.

The toolkit exposes `create_order`, `get_order` and `pay_order` for orders, `create_refund` / `get_refund`, shipment tracking create/get/update, `list_disputes` / `get_dispute` / `accept_dispute_claim`, catalog, subscriptions, invoicing and reporting tools — but no authorize, authorization capture, void or reauthorize, and no provide-evidence ([agent-toolkit](https://github.com/paypal/agent-toolkit)). Tool access is limited per agent by the `configuration.actions` object passed when each toolkit instance is created.

### API surface

| Capability | Endpoint | Access path | Called by | Priority |
| --- | --- | --- | --- | --- |
| OAuth token | `POST /v1/oauth2/token` (client\_credentials, HTTP Basic) | Token vault | Server only | P0 |
| Create order (AUTHORIZE) | `POST /v2/checkout/orders` | Server SDK (wrapped as custom tool) | Escrow agent, after gatekeeper | P0 |
| Authorize approved order | `POST /v2/checkout/orders/{id}/authorize` | Server SDK | Server, on buyer approval | P0 |
| Get order / authorization | `GET /v2/checkout/orders/{id}`, `GET /v2/payments/authorizations/{id}` | Toolkit `get_order` / Server SDK | All agents (read) | P0 |
| Add tracking (only after capture; needs capture\_id) | `POST /v2/checkout/orders/{id}/track` or toolkit shipment tracking | Toolkit | Fulfillment agent | P0 |
| Capture authorization | `POST /v2/payments/authorizations/{id}/capture` | Server SDK | Server, only after proof gate | P0 |
| Void authorization | `POST /v2/payments/authorizations/{id}/void` | Server SDK | Server, after human confirm | P0 |
| Reauthorize | `POST /v2/payments/authorizations/{id}/reauthorize` | Server SDK | Scheduler | P1 |
| Refund capture | `POST /v2/payments/captures/{id}/refund` | Toolkit `create_refund` | Defense agent, human confirm | P1 |
| List / get disputes | `GET /v1/customer/disputes`, `GET /v1/customer/disputes/{id}` | Toolkit | Defense agent | P0 |
| Provide evidence | `POST /v1/customer/disputes/{id}/provide-evidence` (multipart) | Direct REST (typed client in P1) | Server, after human confirm | P0 |
| Make offer / accept claim | `POST .../make-offer`, `POST .../accept-claim` | Direct REST / toolkit `accept_dispute_claim` | Defense agent suggests, human confirms | P1 |
| Sandbox dispute staging | `POST .../require-evidence` (`SELLER_EVIDENCE`), `POST .../adjudicate` | Direct REST, sandbox only | Seed script, Judge Mode | P0 |
| Verify webhook | `POST /v1/notifications/verify-webhook-signature` | Direct REST | Webhook listener | P0 |
| Simulate webhook | `POST /v1/notifications/simulate-event` | Direct REST | Tests, Judge Mode | P0 |
| List transactions | `GET /v1/reporting/transactions` | Toolkit `list_transactions` | Reconciliation view | P1 |
| Subscription plans | `GET /v1/billing/plans` | Toolkit | Self-check probe only (one seeded ACTIVE plan) | P0 |

### Authorization rules the product must respect

Per PayPal's authorize-and-capture guide ([docs](https://developer.paypal.com/docs/checkout/standard/customize/authorization/)):

- An authorization is valid for **29 days**; the **honor period is 3 days**, and PayPal recommends capturing inside it.
- After the honor period, the authorization can be reauthorized within the 29 days; each reauthorization returns a **new authorization ID** that later captures must use.
- Capture may be the full amount or less; partial captures for PayPal payments must be enabled on the account; capture can go up to 115% of the original or $75 more, whichever is less.
- Every request carries a `PayPal-Request-Id` so an interrupted call is not duplicated.

Product consequence: deliver-by windows longer than 3 days require FR-16 auto-reauthorize; windows beyond 29 days are rejected by the gatekeeper.

### Webhook events handled

| Event | Action |
| --- | --- |
| `CHECKOUT.ORDER.APPROVED` | Mark approved; server authorizes |
| `PAYMENT.AUTHORIZATION.CREATED` | Row → HELD; start honor-period timer |
| `PAYMENT.AUTHORIZATION.VOIDED` | Row → VOIDED |
| `PAYMENT.CAPTURE.COMPLETED` | Row → SETTLED (required by the doctor check) |
| `PAYMENT.CAPTURE.DENIED` / `REFUNDED` | Row → FAILED / REFUNDED |
| `CUSTOMER.DISPUTE.CREATED` | Start defense workflow |
| `CUSTOMER.DISPUTE.UPDATED` | Refresh dispute state and due date |
| `CUSTOMER.DISPUTE.RESOLVED` | Record outcome |

Verification follows PayPal's webhook guide ([docs](https://developer.paypal.com/api/rest/webhooks/rest)): the signed string is `transmission_id|transmission_time|webhook_id|crc32`, with the CRC32 computed in decimal over the **raw** body; postback verification needs the event posted exactly as received; simulator events use webhook ID `WEBHOOK_ID` and cannot be verified by postback; the listener must return 2xx on HTTPS, or PayPal retries up to 25 times over 3 days.

### Dispute reason → evidence mapping

From PayPal's reason/evidence reference ([docs](https://developer.paypal.com/disputes/reasons-evidence)). AegisPay's default is the first row for each reason; refunds always need a human confirm.

| Reason | AegisPay default evidence | Content assembled |
| --- | --- | --- |
| `MERCHANDISE_OR_SERVICE_NOT_RECEIVED` | `PROOF_OF_FULFILLMENT` | `tracking_info` (carrier, number) + delivery event + notes |
| `UNAUTHORISED` | `PROOF_OF_FULFILLMENT` + `OTHER` | Tracking, plus signed mandate, human approval record and buyer PayPal approval timestamp as documents |
| `MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED` | `OTHER` | Channel3 product snapshot, item URL, spec in the mandate, contract clause (P1) |
| `INCORRECT_AMOUNT` | `PROOF_OF_REFUND` or `OTHER` | Refund ID for the difference, or mandate price + approval proving the amount |
| `DUPLICATE_TRANSACTION` | `PROOF_OF_REFUND` or `OTHER` | Refund ID, or audit log showing one approval → one capture |
| `CREDIT_NOT_PROCESSED` | `PROOF_OF_REFUND` | Refund ID |

Sandbox constraints that shape the demo ([test and go live](https://developer.paypal.com/platforms/disputes/test-go-live)): actions become available a few minutes after a dispute is created; a buyer cannot open a second dispute on the same transaction; `OTHER` is recommended for internal tests; require-evidence and adjudicate are sandbox-only. So Judge Mode keeps a **pool of pre-seeded transactions and disputes** rather than creating them live.

## Security, reliability and compliance requirements

**The build must pass PayPal's own `/paypal:doctor` checklist with zero critical findings, and stay correct with nobody watching for 14 days.** The doctor command in PayPal's AI-Toolkit is effectively a public checklist of what PayPal engineers consider a correct integration ([doctor.md](https://github.com/paypal/AI-Toolkit/blob/main/commands/doctor.md)).

### Doctor checks AegisPay must satisfy

| Area | Requirement (from doctor.md) | AegisPay implementation |
| --- | --- | --- |
| Credentials | No secret in non-env files or frontend; `.env` in `.gitignore`; no token in logs or browser storage | Secrets only in Render env vars; client gets the client ID only; log redaction middleware |
| Token | Cache honoring `expires_in`; refresh; `client_credentials` via HTTP Basic | Token vault refreshes at < 15 min remaining; single-flight lock so concurrent calls don't stampede |
| Idempotency | `PayPal-Request-Id` on every POST, unique per logical operation | Derived from `mandate_id + action + attempt`; retries reuse the same ID |
| Orders | `intent` and `currency_code` always set; check order status before capture; server-side order creation | Enforced by typed builders; capture path reads authorization status first |
| JS SDK v6 | Async core script; `createOrder` returns `{ orderId }`; `onApprove` uses `data.orderId`; `onError` and `onCancel` handled | Single checkout component reviewed against the v6 checklist |
| Webhooks | Call verify-webhook-signature; HTTPS; return 200 fast; idempotent on event ID; handle `PAYMENT.CAPTURE.COMPLETED`; no wildcard subscription | Listener verifies, enqueues, returns 200; explicit event list in §9 |
| Environment | Base URL switched by an env flag; log `debug_id`; back off on 429; retry 500 with the same idempotency key; HTTPS return/cancel URLs; CSRF protection on order creation | Shared HTTP client handles all of these centrally |
| Live probes | Token valid; $1.00 order creates; webhook verification present; an `ACTIVE` subscription plan exists | Seed script creates one product + one ACTIVE plan; FR-13 runs the same probes in-app |

### Agent safety

- **Least privilege per agent.** The sourcing agent's toolkit instance enables read/catalog actions only; the escrow agent can create orders but **no agent can call capture, void or provide-evidence** — those are server functions behind the gatekeeper and a human confirm. Note: all toolkit instances share one sandbox app's credentials, so isolation is enforced by tool configuration and server code, not by separate OAuth scopes (a correction to the report's "mathematically incapable" claim).
- **Prompt-injection containment.** Channel3 product text and dispute messages are treated as untrusted data; they never reach a prompt that can trigger a write tool without passing the gatekeeper.
- **Deterministic money math.** Amounts are integer minor units in code; LLM output is parsed into a schema and re-validated; no LLM-computed totals reach PayPal.
- **Kill switch.** One env flag disables all PayPal write calls, returning the app to read-only.

### Reliability for the 1–15 Dec judging window

- Render paid instance (no cold-start spin-down) for the web service and worker; managed Postgres; external uptime monitor hitting `/healthz` and `/selfcheck` hourly.
- Daily scheduled job re-seeds Judge Mode data, tops up the dispute pool and re-runs the self-check; alerts by email on failure.
- Sandbox credentials and webhook ID stored as env vars; webhook re-registration script in the repo.
- Graceful degradation: if Channel3 or the LLM is down, Judge Mode falls back to cached shortlists and canned agent output, clearly labeled "cached", so the PayPal loop is still demonstrable.
- Code freeze at submission; any post-deadline change limited to infra keep-alive, in line with the rules.

### Compliance and honesty

- Use "authorization hold" and "fulfillment-gated capture", not "escrow", in UI copy; PayPal authorizations are not a licensed escrow service.
- Sandbox only; no real personal data; demo personas are fictional.
- AI disclosure in the README and Devpost description: which model, which tasks it performs, and which decisions are deterministic code.

## Data model and audit evidence bundle

**Six tables carry the product; the audit log is the one that wins disputes.** Postgres is the system of record; money is stored as integer minor units plus ISO currency.

| Entity | Key fields | Notes |
| --- | --- | --- |
| `mandate` | id, version, spec (json), qty, unit\_ceiling\_minor, budget\_minor, currency, deliver\_by, min\_rating, allowed\_suppliers\[\], approval\_threshold\_minor, status, sha256, created\_by | Immutable once approved; edits create a new version and hash |
| `proposal` | id, mandate\_id, channel3\_product\_id, retailer, unit\_price\_minor, qty, eta, rating, snapshot\_ref, snapshot\_sha256, gate\_result (json), gate\_reasons\[\] | One per candidate the agent proposes; rejected ones are kept for the audit story |
| `order` | id, mandate\_id, proposal\_id, paypal\_order\_id, authorization\_id (current), authorization\_ids\[\] (history), capture\_id, auth\_expires\_at, honor\_ends\_at, state, amount\_minor, payer\_id | `state` follows the lifecycle below |
| `fulfillment` | order\_id, carrier, tracking\_number, shipped\_at, delivered\_at, source (simulated), pushed\_to\_paypal\_at | Exists before capture; pushed to PayPal after capture |
| `dispute` | paypal\_dispute\_id, order\_id, reason, status, life\_cycle\_stage, seller\_response\_due, evidence\_bundle\_id, outcome | Synced from webhooks + GET |
| `audit_event` | seq, ts, actor (agent/human/system/paypal), type, payload (json), paypal\_debug\_id, request\_id, prev\_hash, hash | Append-only; `hash = sha256(prev_hash + canonical_json(payload))` |

### Order lifecycle

`DRAFT → GATED (pass/fail) → AWAITING_APPROVAL → HELD → IN_TRANSIT → DELIVERED → SETTLED`, with exits `HELD/IN_TRANSIT → VOIDED` on SLA breach or cancel, `HELD → REAUTHORIZED → HELD` when the honor period ends (P1), and `SETTLED → DISPUTED → EVIDENCE_SUBMITTED → RESOLVED_WON | RESOLVED_LOST | REFUNDED`. The architecture section draws this as a state diagram.

### Evidence bundle

A bundle is generated per dispute and stored before anything is sent to PayPal. Contents depend on the reason (§9) but the full set is:

| Artifact | Source | Format sent to PayPal |
| --- | --- | --- |
| Signed mandate (spec, limits, hash, approver, timestamp) | `mandate` + `audit_event` | PDF in `documents` |
| Gate decision (each check and its value) | `proposal.gate_result` | Included in the mandate PDF |
| Human approval record + PayPal payer approval time | `audit_event`, order details | PDF + notes |
| Product snapshot (title, spec, price, URL at time of purchase) | Channel3 response, hashed | PDF in `documents` |
| Tracking and delivery event | `fulfillment` | `evidence_info.tracking_info` |
| Refund ID (where applicable) | PayPal refund | `evidence_info.refund_ids` |
| Contract clause excerpt (P1) | Elastic index | Quoted in notes + PDF |
| Audit chain digest (first/last hash, verification result) | `audit_event` | Line in notes |

Notes are drafted by the LLM from the bundle, limited to facts present in it, and shown to the human for edit before submission. File types and sizes follow PayPal's supported-files page; the PDF generator keeps each file small and the count to what the reason requires.

## UX and UI specification

**One screen, three panes: the grid is where work happens, the agent drawer shows what the AI is doing, the timeline shows what is about to expire.** No chat-first layout; natural language is an input method, not the interface.

### Layout (desktop, ≥ 1280 px)

| Region | Content | Behavior |
| --- | --- | --- |
| Top bar | Product name, environment badge "PayPal Sandbox", Judge Mode toggle, Self-check status dot, Reset demo | Self-check dot is green/amber/red; click opens FR-13 panel |
| Mandate strip | Natural-language input + parsed mandate chips (qty, ceiling, budget, deliver-by, rating) | Chips are editable; "Confirm mandate" hashes and saves |
| Main: Command Center grid (AG Grid) | One row per order; master-detail per row | See column spec below |
| Right drawer: Agent activity | Streaming steps per agent (Sourcing, Escrow, Fulfillment, Defense) with tool name, input summary, result, latency | Each step links to its audit event; write actions show a lock icon until a human confirms |
| Bottom: Timeline | P0: compact per-row countdown bars inside the grid. P1: Bryntum Gantt with honor period, auth expiry, ship window, SLA, dispute due date | Dragging past SLA prompts void (P1) |
| Modal: Evidence review | Left: dispute details and reason; right: bundle preview (PDF thumbnails, tracking, notes draft) | "File evidence" disabled until the reviewer ticks "I've checked these facts" |

### Grid columns

Order ref · Supplier (from Channel3) · Item · Qty · Unit price with 30-day price sparkline (P1) · Mandate check (pass/fail badge, tooltip lists each rule) · Authorized · Captured · State chip · Honor-period / SLA countdown · Webhook verification (Offline ✓ / Postback ✓) · Dispute status · Actions.

Detail grid (master-detail): timestamp, actor, step, tool / endpoint, `PayPal-Request-Id`, `debug_id`, result, hash.

### AG Grid capabilities used (sized for the sponsor prize)

- **P0:** transaction updates (`applyTransactionAsync`) driven by server-sent events, cell flash on change, custom cell renderers (state chips, countdowns, action buttons), master-detail, row grouping by mandate, status bar with totals held / captured / voided.
- **P1:** sparklines for price history; integrated charts for spend by supplier; AG Grid's AI Toolkit for natural-language grid commands ("show held orders expiring today"), which pairs naturally with the product's AI story.
- Enterprise features need a license key to remove the watermark; see Risks for the trial-length issue.

### State and copy rules

| State | Chip color | Primary action |
| --- | --- | --- |
| GATED – fail | Red | View reasons |
| AWAITING\_APPROVAL | Blue | Approve hold |
| HELD | Amber | Mark shipped / Void |
| IN\_TRANSIT | Amber | Confirm delivery / Simulate breach |
| SETTLED | Green | View receipt |
| VOIDED | Grey | — |
| DISPUTED | Red | Review evidence |

Copy is plain and specific: "Hold $900.00 — capture only on delivery by 25 Nov", never "escrow". Every irreversible action shows amount, counterparty and what happens next, with a confirm.

### Judge Mode

- Banner with sandbox buyer email and password (sandbox only), a "Start guided demo" button, and a 5-step checklist that ticks as the judge progresses.
- Time-travel control to jump the clock past an SLA without waiting.
- A pre-staged disputed order so the dispute journey never depends on PayPal's sandbox delay.
- Accessible: keyboard navigation in the grid, color plus text on every status, contrast AA.

## Sponsor and partner integration plan

**Integrate sponsors where they carry real product weight, in order of prize value per hour of work: AG Grid, Render, Channel3, then Bryntum and APIMatic.** Only one sponsor prize can be won, so extra sponsors are insurance and judge goodwill, not additive cash.

| Partner | Role in AegisPay | What makes it "real" to that judge | Prize | Priority | Est. effort |
| --- | --- | --- | --- | --- | --- |
| **AG Grid** | The Command Center itself | Live transaction updates from webhooks, master-detail audit trail, custom action renderers; P1 AI Toolkit for natural-language grid control | $5k / $2k / $1k ×3 | P0 | 1.5 days |
| **Render** | Hosting: web service, background worker, Postgres, cron | Blueprint (`render.yaml`) in repo; worker runs agents; cron re-seeds Judge Mode; no cold starts during judging. Render's hackathon pitch is agent orchestration with Render Workflows — use it for the fulfillment/defense jobs if time allows | $1k / $750 / $500 credits | P0 | 0.5 day |
| **Channel3** | Sourcing and price-benchmark data; product snapshot used as dispute evidence | Real API or MCP calls per mandate, results flowing into PayPal order line items and into evidence | $1.5k | P0 | 0.5 day |
| **Bryntum** | Timeline of holds, honor periods, SLAs and dispute deadlines | Bidirectional: drag-to-breach triggers void; PayPal events move bars | $1k ×3 | P1 | 1 day |
| **APIMatic** | Typed PayPal access | PayPal Server SDK (generated by APIMatic) for all Orders/Payments calls; PayPal Context Plugin used while building, documented in README; optional generated Disputes client | $1k + subscription ×3 | P1 (SDK use is P0 by default) | 0.5 day |
| **Elastic** | Contract clause retrieval for SNAD evidence and invoice notes | Hybrid search over a supplier contract with cited chunks | None | P1 | 0.75 day |
| **Postman** | Public API collection for judges | Collection + environment linked in README | None | P1 | 0.25 day |
| KERNEL, Astropods, Zapier | Not used in P0/P1 | — | None | P2 | — |

Verified facts for this plan:

- The PayPal Server SDK is generated by APIMatic: its TypeScript source headers say so, and its `PaymentsController` exposes capture, void and reauthorize for authorizations ([npm source](https://cdn.jsdelivr.net/npm/@paypal/paypal-server-sdk@2.3.0/src/controllers/paymentsController.ts)). So using it for the payment loop is both the right engineering choice and a genuine APIMatic integration.
- APIMatic's PayPal Context Plugin is an MCP server giving coding agents current SDK context ([PayPal blog](https://developer.paypal.com/community/blog/A%20New%20Context%20Plugin%20for%20AI-Assisted%20Coding%20with%20PayPal%20SDKs)).
- Channel3 offers an MCP server and API; it describes itself as catalog-only (search, lookup, get product) and accepts an API key via `x-api-key` or bearer header ([Channel3 docs](https://docs.trychannel3.com/ucp/quickstart.md)). The report's promo code `PAYPAL-HACKATHON-2026` comes from a third-party article and does not appear on the Devpost resources page; confirm it on the PayPal Discord before relying on it.
- AG Grid Enterprise runs without a key but shows a watermark; a 30-day trial key removes it ([AG Grid](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise.md)).

## Build plan to the deadline

**Build the PayPal money loop first and the AI second; if P0 isn't green by the end of 9 Nov, P1 is dropped and the remaining days go to polish and reliability.** Backend and frontend run in parallel from 7 Nov.

&#91;embedded content: Build plan · 5–12 Nov 2026\]

The gate on 9 Nov decides whether any sponsor add-ons are built; the final day is reserved for the video and a submission a full day early.

### Exit criteria per milestone

1. **Setup (5 Nov):** sandbox business + 2 personal accounts (card-funded), app credentials, webhook registered, repo with LICENSE, Render blueprint deploying a hello-world, Channel3 key, AG Grid and Bryntum trial packages installed.
2. **Money loop (by 8 Nov):** from a script, create AUTHORIZE order → approve as buyer → authorize → capture → add tracking; and a second order → void. Webhooks verified both ways. Token vault passes a forced-expiry test.
3. **Agents (by 8 Nov):** mandate parsing, Channel3 shortlist, gatekeeper with property tests; agents wired to the server via proposals only.
4. **Command Center (by 9 Nov):** grid live-updates from SSE; master-detail audit trail; all action buttons work; Judge Mode banner.
5. **Dispute defense (by 9 Nov):** 5+ pre-seeded disputed transactions; one moved to `WAITING_FOR_SELLER_RESPONSE`; evidence bundle generated and filed successfully once end-to-end.
6. **P0 gate (9 Nov):** golden path, SLA breach and dispute journeys each pass 3 times in a row on the deployed URL.
7. **P1 (10 Nov, only if gate passed):** Bryntum timeline first (highest prize count), then typed Disputes client via APIMatic, then Elastic clause retrieval, then Postman.
8. **Hardening (10–11 Nov):** `/paypal:doctor full` and `security` clean; README; uptime monitor; daily re-seed cron.
9. **Video and submit (11 Nov):** record, edit to 2:50, publish, submit on Devpost, then verify the public submission page and video playback logged-out.

After submission: keep the deployment and cron healthy through 15 Dec; no feature changes.

## Risks, report corrections and mitigations

**The report's strategy holds up, but eleven of its technical and factual claims were wrong or unverifiable; building on them would have broken the demo.** Each correction below is already reflected in the requirements above.

### Corrections to the source report

| # | Report claim | What the sources show | Impact on PRD |
| --- | --- | --- | --- |
| 1 | Agent captures held funds with `pay_order` | Agent Toolkit has no authorize, authorization-capture, void or reauthorize tools | Payment loop runs on Payments v2 via the Server SDK (§9) |
| 2 | Tracking is bound to the order before capture | Orders v2 tracking only works on captured orders and needs `capture_id` | Tracking held in AegisPay, pushed after capture (FR-05/06) |
| 3 | Sub-agents are "mathematically incapable" of paying via OAuth scopes | Isolation comes from per-instance `configuration.actions`; all instances share one app's credentials | Money-moving calls removed from agents entirely; server-only behind gate + human |
| 4 | Webhook route returns 400 on bad signature and verifies by postback before replying | PayPal asks for 2xx on every delivery; doctor warns on heavy work before 200 | Ack 200 immediately, verify and process in the worker, drop unverified events with a log |
| 5 | Evidence upload sends mandate JSON labelled `application/pdf` | Would be rejected or meaningless as evidence | Generate real PDFs (§11) |
| 6 | Sandbox dispute state changed by passing `SELLER_EVIDENCE` | Correct value, but via the sandbox-only `require-evidence` endpoint; actions lag a few minutes; no duplicate disputes per transaction | Pre-seeded dispute pool in Judge Mode |
| 7 | \~17,481 registrants | 28,867 on the overview page today | Competition is \~65% larger; polish and clarity matter more |
| 8 | Mandatory "AI tools statement" | Rules require describing the AI tool in the text description; overview asks for a list of tools used | Covered by a tools table in README and Devpost text |
| 9 | Detailed judge "evaluative bias" per person | Inference only; rules say the panel may change and may use automated AI analysis | Treated as hypotheses; README written for both humans and AI reviewers |
| 10 | 21-day build from 22 Oct | Today is 5 Nov; \~6.5 days remain | Scope re-cut into P0/P1/P2 (§6, §14) |
| 11 | Stats such as "6.5% rise in converted purchases", competitor project details, Channel3 promo code | Not verifiable from primary sources in this review | Not used in the pitch or video; confirm the promo code on Discord |

### Delivery risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Sandbox dispute creation is slow or flaky during the demo | High | High | Pre-staged disputes; daily top-up job; cached replay of the dispute step labelled as such |
| AG Grid 30-day trial key expires mid-judging (a key requested 6 Nov lapses \~6 Dec) | High | Medium | Request the key on 11–12 Nov (lasts to \~11 Dec) and ask AG Grid on Discord for a key covering 15 Dec; watermark is cosmetic, functionality remains |
| P0 not finished by Day 4 | Medium | High | Hard scope gate; P1 sponsor work only starts after the P0 acceptance run |
| Partial capture not enabled on the sandbox account | Medium | Low | Full capture then refund difference (FR-19) |
| Honor period (3 days) vs. demo pacing | Low | Medium | Demo uses minutes-long SLAs; FR-16 handles real timelines |
| LLM misparses a mandate or proposes off-spec items | Medium | Low | Human confirms parsed mandate; gatekeeper rejects; rejections shown as a feature |
| Channel3 rate limits or outage | Low | Medium | API key, response cache, cached shortlist fallback |
| Render cold starts or sleep during judging | Medium | High | Paid instances, uptime monitor, cron keep-alive |
| PayPal sandbox outage during a judge's visit | Low | High | Status banner explaining sandbox status; video remains the backup proof |
| Video runs over 3:00 | Low | High | Script timed to 2:50; final export checked |
| Using a protected brand in the video or UI | Low | Medium | Only partner logos for tools actually used; no third-party music |

## Submission checklist and open questions

**Submit by 11 Nov evening IST, a full day before the 12 Nov 12:00 PM PST cutoff, so Devpost upload issues can't cost the entry.**

### Stage One compliance

- [ ] Public GitHub repo with all source, assets and setup instructions
- [ ] `LICENSE` (Apache-2.0 or MIT) at repo root, visible in the GitHub About sidebar
- [ ] Working hosted URL on Render, plus local setup instructions that work from a clean clone
- [ ] Demo video under 3:00, public on YouTube, shows the app running, no copyrighted music or unlicensed trademarks
- [ ] Devpost text description covering features, AI usage (model, tasks, which decisions are deterministic) and a list of every tool used and how
- [ ] Sandbox only: no live credentials anywhere in the repo or history

### Technical proof for judges

- [ ] `/paypal:doctor full` and `security` run; report committed as `docs/paypal-doctor.md`; 0 critical
- [ ] README opens with: one-line pitch, live URL, Judge Mode credentials, 90-second quickstart, architecture diagram, "PayPal APIs used" table with file paths
- [ ] Self-check panel green on the deployed URL
- [ ] Postman collection linked (P1)
- [ ] Seed script, webhook registration script and `render.yaml` in repo

### Judging-window readiness (1–15 Dec)

- [ ] Paid Render instances; uptime monitor and email alerts on
- [ ] Daily re-seed and dispute-pool top-up cron verified for 3 consecutive days before 1 Dec
- [ ] AG Grid license key valid through 15 Dec (or watermark accepted)
- [ ] No code changes after submission beyond what the rules allow

### Open questions

- [ ] Team composition and roles — who owns backend, frontend, video?
- [ ] Which LLM provider and model for the agents (any provider is allowed; cost and tool-calling reliability decide)?
- [ ] Is `PAYPAL-HACKATHON-2026` a real Channel3 credit code? Ask on the PayPal Discord.
- [ ] Can AG Grid issue a hackathon license that covers the judging window?
- [ ] Is partial capture enabled on the sandbox business account?
- [ ] Final product name: keep "AegisPay" or drop "MCP" from the name, since MCP is one transport rather than the product?

## Sources

Checked on 5 Nov 2026. Source report: *Strategic Intelligence and Architectural Blueprint for Winning the PayPal AI Hackathon 2026* (uploaded).

- [PayPal AI Hackathon — overview](https://paypalaihackathon.devpost.com/) and [official rules](https://paypalaihackathon.devpost.com/rules) and [resources](https://paypalaihackathon.devpost.com/resources)
- [PayPal Agent Toolkit (GitHub)](https://github.com/paypal/agent-toolkit)
- [PayPal AI-Toolkit `/paypal:doctor` command](https://github.com/paypal/AI-Toolkit/blob/main/commands/doctor.md)
- [PayPal: authorize and capture](https://developer.paypal.com/docs/checkout/standard/customize/authorization/)
- [PayPal: add tracking with Orders v2](https://developer.paypal.com/api/orders-v2/track-orders/use)
- [PayPal: webhooks integration and verification](https://developer.paypal.com/api/rest/webhooks/rest)
- [PayPal: dispute reasons and evidence](https://developer.paypal.com/disputes/reasons-evidence)
- [PayPal: disputes test and go live](https://developer.paypal.com/platforms/disputes/test-go-live)
- [PayPal Server SDK `PaymentsController` source (APIMatic-generated)](https://cdn.jsdelivr.net/npm/@paypal/paypal-server-sdk@2.3.0/src/controllers/paymentsController.ts)
- [PayPal blog: APIMatic Context Plugin for PayPal SDKs](https://developer.paypal.com/community/blog/A%20New%20Context%20Plugin%20for%20AI-Assisted%20Coding%20with%20PayPal%20SDKs)
- [PayPal blog: hackathon announcement and partners](https://developer.paypal.com/community/blog/PayPal_AI_Hackathon)
- [PayPal newsroom: Making sense of the AI shopping protocol moment](https://newsroom.paypal-corp.com/2026-01-22-Making-Sense-of-the-AI-Shopping-Protocol-Moment)
- [FinTech Law: ACP Instant Checkout payment rail risk](https://fintechlaw.ai/blog/agentic-commerce-protocol-instant-checkout-payments-risk)
- [Shopifreaks: OpenAI scales back integrated commerce](https://www.shopifreaks.com/openai-scales-back-its-integrated-commerce-plans/)
- [Channel3 UCP quickstart](https://docs.trychannel3.com/ucp/quickstart.md) and [Channel3 MCP overview](https://docs.trychannel3.com/mcp-overview)
- [AG Grid: Community vs Enterprise and trial licence](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise.md)
