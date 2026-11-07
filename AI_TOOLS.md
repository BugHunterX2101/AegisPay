# AI tools used

## Inside the product (runtime)

| Tool | What it does in AegisPay | Where |
|------|--------------------------|-------|
| Hosted language model: `openai/gpt-oss-120b` on Groq when `GROQ_API_KEY` is set, `claude-sonnet-5-5` when `ANTHROPIC_API_KEY` is set (`AEGIS_LLM_MODEL` overrides) | Parses a plain-English purchasing instruction into a structured mandate draft; drafts the dispute response from the audit-log evidence. The hosted demo runs on the Groq model. | `packages/agents/src/llm.ts`, `parser.ts`, `defense.ts` |
| Channel3 product catalog (`api.trychannel3.com`) | Live product search the sourcing agent proposes purchases from. | `packages/agents/src/channel3.ts`, `sourcing.ts` |

What the model is **not** allowed to do:

- It never decides whether money moves. Every proposal goes through the deterministic gatekeeper (`packages/gatekeeper`), which contains no model call.
- Its output is parsed against a schema and grounded against stored facts (`packages/agents/src/grounding.ts`) before anything uses it. Without a model key, the agent routes answer `503 AGENT_UNAVAILABLE` instead of inventing a result.
- A drafted dispute response is only submitted after a person attests to it.

Tests use the real hosted model whenever a key is present.

## Used to build it

- Claude Code (Anthropic) wrote most of the code, tests and documentation in this repository under the owner's direction. The owner chose the product, reviewed the decisions recorded in `docs/DEVIATIONS.md`, and supplied all credentials.
- graphify builds the code knowledge graph in `graphify-out/` that the assistant queried to navigate the codebase.
