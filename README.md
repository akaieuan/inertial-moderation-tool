# aur

Multimodal content moderation for federated and centralized platforms. **Structured signals, not verdicts.** Local-first by default, cloud-by-choice, audit-able by design.

`aur` is two things in one monorepo:

1. **`@aur/*` toolkit** — reusable agent orchestration, persistence, policy, and HITL primitives. Sibling to [`eval-kit`](https://github.com/akaieuan/eval-kit) and [`HITL-KIT`](https://github.com/akaieuan/HITL-KIT).
2. **`aur-app`** — Electron + React + Tailwind reference dashboard for moderators, built on HITL-KIT primitives.

## Why

Federated platforms (Mastodon, Bluesky, Lemmy) have basically no shared moderation infrastructure. Centralized platforms have moderation, but it's opaque and locks teams into vendor verdicts.

Most importantly, federated moderators distrust commercial AI for good reasons — they often left centralized platforms specifically to escape it. Pushing every post through a remote LLM is a non-starter for that audience.

`aur` is the **routing, policy, and audit layer** that lets a moderator compose heuristics, local models, and (optionally) cloud LLMs in a single pipeline — with explicit cost/privacy tradeoffs and proof of which model saw what. Every instance picks its own point on the cost ↔ capability ↔ privacy curve; the toolkit doesn't impose one.

## The agent tiers

| Tier | Where it runs | Strengths | Privacy |
|---|---|---|---|
| **0. Heuristic** | In-process JS (regex, perceptual hash) | Spam-link detection, known-bad image matching | Total |
| **1. Local in-process** | `@huggingface/transformers` WASM | Toxicity classification, NER, Whisper transcription | Total |
| **2. Local server** | Ollama (`localhost:11434`) | Better text + vision than Tier 1 | Total |
| **3. Cloud** | Anthropic / OpenAI / Google APIs | High-quality video, subtle/coded text, multi-step reasoning | Up to operator |

**Default install ships Tier 0 + Tier 1 enabled.** Tier 2 is detected at boot — works if Ollama is running, gracefully skipped otherwise. Tier 3 is in a separate `@aur/agents-cloud` package — federated operators who don't want it can not install it.

This is honest about the capability gap: small local models miss subtle threats and can't reason over video. Operators who want quality on those cases enable cloud agents per-rule, with budgets and explicit allow-lists. The audit log records which model saw which event so a federated mod can prove "no remote API touched this instance" if that's the bar they need to meet.

## Architecture

```
Connectors → Gateway (Hono ingest) → Worker (orchestrator + agents)
          → Aggregator (max-confidence collision) → @aur/policy (per-instance YAML)
          → Review queues (quick / deep / escalation)
          → aur-app (HITL-KIT) → Action dispatcher + hash-chained audit log
                              → @aur/eval (calibration vs gold sets)
```

## Layout

```
apps/
  gateway/           Hono ingest + webhook SDK
  worker/            Orchestrator runtime; persists through @aur/db
  aur-app/           Electron dashboard
packages/
  schemas/           @aur/schemas — Zod contracts (lingua franca)
  core/              @aur/core — orchestrator + BaseAgent
  agents/            @aur/agents-{text,vision,video,audio,identity,context}
  policy/            @aur/policy — YAML loader + structured-rule evaluator
  connectors/        @aur/connectors-{activitypub,atproto,lemmy,sdk-webhook}
  db/                @aur/db — Drizzle + Postgres + pgvector + hash-chained audit
  eval/              @aur/eval — wraps @eval-kit/core
  sdk/               @aur/sdk — public SDK
  registry/          @aur/registry — shadcn-compatible UI primitives on HITL-KIT
config/
  policies/          per-instance YAML (default included)
  evals/             gold sets, suites
```

## Quick start (no Docker, no API keys)

Requires Node ≥20 and pnpm 10.

```bash
pnpm install
pnpm build
```

Three terminals:

```bash
pnpm --filter @aur/worker dev      # ~30s first run while toxic-bert downloads (~250MB)
pnpm --filter @aur/gateway dev
pnpm seed                          # 10 hand-crafted events; populates the queue
```

Then launch the dashboard:

```bash
pnpm --filter @aur/aur-app dev
```

The Queue tab polls the worker every few seconds. Click a row to see the post text + per-agent traces. Approve/Remove commits a `ReviewDecision` and writes a hash-chained audit entry.

For real Postgres persistence (instead of in-memory pglite), set `DATABASE_URL` and run `pnpm db:up && pnpm db:migrate`.

## Status

Pre-alpha. Month 1 of a 3-month roadmap. The kernel (schemas, db, orchestrator, policy, gateway, worker, dashboard, audit) is real and tested; the agent and connector roster is sparse — text toxicity (transformers.js) + URL regex are the only working classifiers. Vision, video, audio, identity, context, and all four connectors are scaffolded stubs. Real ML happens here next.

## License

MIT
