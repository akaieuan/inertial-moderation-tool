# aur

**Open-source AI content moderation with human-in-the-loop review.** Multimodal across text, image, video, and audio. Built for federated platforms (Mastodon, Bluesky, Lemmy) and centralized ones (Discord, Slack, custom apps). Compose any agent stack — heuristics, local models, cloud LLMs — under one auditable pipeline that keeps humans in authority.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](#)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](#)
[![Status](https://img.shields.io/badge/status-pre--alpha-red.svg)](#)

> **Status — pre-alpha (month 1 of 3).** The kernel is real and tested. The agent and connector roster is sparse. APIs will change.

`aur` is two things in one monorepo:

1. **`@aur/*` toolkit** — orchestration, persistence, policy, and HITL primitives. Sibling to [`eval-kit`](https://github.com/akaieuan/eval-kit) and [`HITL-KIT`](https://github.com/akaieuan/HITL-KIT).
2. **`aur-app`** — Electron + React + Tailwind reference dashboard for moderators, built on HITL-KIT.

---

## Why aur exists

Online platforms have an AI-moderation problem and a human-trust problem at the same time:

- **Federated platforms** (Mastodon, Bluesky, Lemmy) have a real, expensive moderation crisis and almost no shared infrastructure. Admins burn out triaging spam, brigading, hate speech, and worse on duct-taped tooling. Each instance reinvents the wheel — and most of them flat-out distrust commercial AI, often *because* they left centralized platforms to escape it.
- **Centralized platforms** (Discord communities, corporate Slack, B2B tools) have moderation, but it's opaque, vendor-locked, and routes every post through a remote LLM whether the operator wants it or not. Reviewers can't see *why* the AI flagged something, can't tune it, and can't prove their decisions to legal/compliance.

The pattern is the same in both worlds: an AI makes a black-box call, a human ends up rubber-stamping it (or fighting it), and nobody can audit what actually happened.

**aur is the human-in-the-loop AI moderation layer that fixes both.** It treats the AI as a decomposed *signal generator*, not a verdict-maker:

- Agents emit *typed structured signals* (probability + confidence + evidence pointers), not "remove this post"
- A per-instance policy engine turns signals into routing decisions (queue.quick, queue.deep, escalate)
- Reviewers see the signals, the agent's reasoning trace, and the policy rule that fired — then they decide
- Every decision and signal lands in a hash-chained audit log; tampering is detectable, compliance is provable

And because moderators have wildly different privacy budgets, aur lets them compose:

- **Heuristics** — regex, perceptual hash matching, blocklists. Zero cost, zero data leaves the machine.
- **Small local models** — toxicity classifiers, NER, Whisper, NSFW detectors running in-process. Total privacy, modest capability.
- **Local server models** — richer vision-language models running on the operator's own box (via Ollama). Better quality, still local.
- **Cloud LLMs** — Anthropic, Google, OpenAI. Opt-in per rule, with budget caps. The only tier where data leaves the machine — and it's logged when it does.

…in a single auditable pipeline. The audit log records which model saw which event, so a federated mod can prove "no remote API touched my instance over the last 30 days" — not as a promise, as a hash-chained artifact.

Same toolkit, different points on the curve. A 200-user fediverse instance with no budget runs heuristics + local models only. A corporate Slack admin enables cloud agents for everything. Both flow through the same code, the same dashboard, the same review queue.

---

## Architecture

```
                ┌─────────────┐
   Connectors ─▶│   Gateway   │  Hono ingest. Normalizes platform payloads
                │   (Hono)    │  into ContentEvents. Owns media download
                └──────┬──────┘  + perceptual hashing.
                       │
                       ▼
                ┌─────────────┐
                │   Worker    │  Orchestrator runtime. Fans out to agents
                │             │  matching event.modalities. Aggregates
                │             │  signals (max-confidence on collision).
                └──────┬──────┘
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐    Tier 0 (heuristic)
  │  text-   │  │  phash-  │  │   ...    │    Tier 1 (transformers.js WASM)
  │  regex   │  │ similar  │  │ vision-  │    Tier 2 (Ollama @ :11434)
  │          │  │          │  │  ollama  │    Tier 3 (Anthropic / OpenAI)
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       └─────────────┼─────────────┘
                     ▼
              ┌─────────────┐
              │ Aggregator  │  StructuredSignal: channels record + entities
              └──────┬──────┘  + agentsRun + agentsFailed + latencyMs
                     ▼
              ┌─────────────┐
              │ @aur/policy │  Per-instance YAML rules over signal.
              │  evaluator  │  Emits PolicyAction (queue.quick / queue.deep
              └──────┬──────┘  / escalate / auto-allow / auto-remove).
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
  ┌──────────┐            ┌──────────┐
  │ReviewItem│  ◀─────────│ aur-app  │  Reviewer commits ReviewDecision.
  │ (queue)  │            │ (Electron│  Decision + signalFeedback flow
  └────┬─────┘            │ + HITL)  │  back into the eval harness.
       │                  └──────────┘
       ▼
  ┌─────────────┐
  │   @aur/db   │  Hash-chained audit log: every state transition writes one
  │ (Postgres + │  entry per instance. prevHash → hash linkage; tamper-detectable.
  │  pgvector)  │
  └─────────────┘
```

Every box has a corresponding `@aur/*` package. Every cross-package shape is a Zod schema in `@aur/schemas` — when you add a new agent or signal type, the contract change happens there first.

---

## Choose your tier

`aur` doesn't pick for you. The four tiers compose in any combination, configured per-instance.

| Tier | Where it runs | Install | Best at | Privacy |
|---|---|---|---|---|
| **0. Heuristic** | In-process JS | nothing | URL spam, known-bad image phash, blocklists | Total — no model, no network |
| **1. Local WASM** | `@huggingface/transformers` ONNX runtime | nothing — model auto-downloads to `~/.cache/huggingface/hub` | Text toxicity, NER, image NSFW, Whisper transcription | Total — local-only after first download |
| **2. Local server** | Ollama daemon at `localhost:11434` | `brew install ollama && ollama pull llama3.2-vision` | Better text reasoning, multimodal vision-language | Total |
| **3. Cloud** | Anthropic / OpenAI / Google APIs | `@aur/agents-cloud` package (separate, opt-in) + API key | Subtle / coded text, video temporal reasoning, multi-event context | Up to operator |

### Honest capability matrix

| Modality | Tier 0 | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| Text spam | full | full | full | full |
| Text toxicity | blocklist only | ~70% | ~75% | ~90% |
| Audio | none | Whisper transcribe → text classify (~70%) | same | same + better acoustic |
| Image NSFW | phash known-bad only | ~70% on obvious | ~80% | ~85% |
| Image: minor / intent / adversarial | none | poor | medium | ~80% |
| Video temporal reasoning | phash on keyframes only | frame-by-frame at best | frame-by-frame | ~75% with multi-frame context |
| Cross-event ("is this brigading?") | none | none | none | only Tier 3 |

Local-first is not a magic bullet. **For high-stakes content (minor detection, video understanding, coordinated attacks), cloud is currently the only adequate tier.** The point of aur isn't to replace cloud — it's to make the routing legible and the data flow auditable.

---

## Quick start (no Docker, no API keys)

Requires Node ≥20 and pnpm 10.

```bash
git clone https://github.com/akaieuan/aur-moderation-tool aur
cd aur
pnpm install
pnpm build
```

Three terminals:

```bash
# 1. Worker — orchestrator + in-memory pglite. First boot downloads
#    toxic-bert (~250MB) to ~/.cache/huggingface/hub. ~30s one-time.
pnpm --filter @aur/worker dev

# 2. Gateway — HTTP ingest on :4000
pnpm --filter @aur/gateway dev

# 3. Seed 10 hand-crafted events through the full pipeline
pnpm seed
```

Output should look like:

```
01 clean post                           →  auto-allow            [default]
02 url spam                             →  queue.quick           [spam-link]   {spam-link-presence=0.80}
03 mild insult                          →  queue.quick           [toxicity]    {toxic=0.98, insult=0.93}
04 stronger toxic                       →  queue.quick           [toxicity]    {toxic=0.98, insult=0.92}
05 threat                               →  auto-allow            [default]     {toxic=0.50}
06 hate-adjacent broad insult           →  queue.quick           [toxicity]    {toxic=0.98, insult=0.85}
07 obscene profanity                    →  queue.quick           [toxicity]    {toxic=1.00, obscene=0.99}
...
```

Note event #5: toxic-bert misses the threat at 0.50 probability. **This is the demonstrated local-vs-cloud capability gap** — Tier 3 (Claude / Gemini) catches it; the small local classifier doesn't. Built-in evidence that cloud-opt-in matters for high-stakes content.

Then the dashboard:

```bash
pnpm --filter @aur/aur-app dev
```

The Queue tab pulls live data from the worker, lets you expand each item to see post text + per-agent traces, and approve/remove commits a `ReviewDecision` with a hash-chained audit entry.

For real Postgres persistence:

```bash
pnpm db:up && pnpm db:migrate
DATABASE_URL=postgres://aur:aur@localhost:5432/aur pnpm --filter @aur/worker dev
```

---

## What's actually working today

Be honest about pre-alpha state.

| Component | Status |
|---|---|
| `@aur/schemas` | Real. 8 Zod schemas (ContentEvent, StructuredSignal, AgentTrace, ReviewItem, ReviewDecision, Policy, AuditEntry, supporting unions). |
| `@aur/core` | Real. BaseAgent + TraceCollector + InMemoryOrchestrator + max-confidence aggregator. |
| `@aur/db` | Real. 8 tables (7 schema-mirrored + event_embeddings). 41 hermetic integration tests. Hash-chained audit with tamper detection. pglite dev factory + postgres-js prod. |
| `@aur/policy` | Real. YAML loader + structured AST evaluator. First-match wins; per-instance versioning. |
| `apps/gateway` | Real. Hono ingest, normalizes payloads, forwards to worker. |
| `apps/worker` | Real. Orchestrator runtime, persists through `@aur/db`, evaluates policy, creates review items, audits every step. |
| `apps/aur-app` | Real. Electron + React + Tailwind v4 + HITL-KIT. Queue + Eval views. |
| `text-regex` (Tier 0 agent) | Real. URL detection. |
| `text-toxicity-local` (Tier 1 agent) | Real. `@huggingface/transformers` running `Xenova/toxic-bert`. ~50ms/event after warmup. |
| `vision-*`, `video-*`, `audio-*`, `identity-*`, `context-*` agents | Stubbed. Empty `analyze()` returning `[]`. |
| `connectors-{activitypub,atproto,lemmy,sdk-webhook}` | Stubbed. |
| `@aur/agents-cloud` (Tier 3) | Not yet a package. Planned. |
| `@aur/eval` wrapping `@eval-kit/core` | Stubbed. UI primitives are wired in `aur-app`'s Eval tab. |

---

## Project layout

```
apps/
  gateway/              Hono :4000 — ingest + normalize
  worker/               Hono :4001 — orchestrate + persist + audit
  aur-app/              Electron dashboard (HITL-KIT primitives)
packages/
  schemas/              @aur/schemas         — Zod contracts
  core/                 @aur/core            — BaseAgent, orchestrator, aggregator
  agents/
    text/               @aur/agents-text     — text-regex, text-toxicity-local
    vision/             @aur/agents-vision   — (stub)
    video/              @aur/agents-video    — (stub)
    audio/              @aur/agents-audio    — (stub)
    identity/           @aur/agents-identity — (stub)
    context/            @aur/agents-context  — (stub)
  connectors/
    activitypub/        @aur/connectors-activitypub  — (stub)
    atproto/            @aur/connectors-atproto      — (stub)
    lemmy/              @aur/connectors-lemmy        — (stub)
    sdk-webhook/        @aur/connectors-sdk-webhook  — (stub)
  policy/               @aur/policy          — YAML loader + AST evaluator
  db/                   @aur/db              — Drizzle + Postgres + pgvector + hash-chained audit
  eval/                 @aur/eval            — wraps @eval-kit/core (stub)
  sdk/                  @aur/sdk             — public SDK surface (stub)
  registry/             @aur/registry        — shadcn-compatible UI primitives (stub)
config/
  policies/
    default.yaml        Default policy (toxicity + spam-link rules)
  evals/                Gold sets, suites (empty)
scripts/
  seed.mjs              10 hand-crafted events through gateway → worker
  smoke.mjs             Single-event smoke test
docker-compose.yml      Postgres + pgvector for prod-shape persistence
```

---

## Build your own agent

A new agent is a class extending `BaseAgent`:

```ts
import { BaseAgent, type AgentContext } from "@aur/core";
import type { ContentEvent, Modality, SignalChannel } from "@aur/schemas";

export class MyAgent extends BaseAgent {
  readonly name = "my-agent";
  readonly modalities: readonly Modality[] = ["text"];
  readonly model = "my-model-v0";

  override shouldRun(event: ContentEvent): boolean {
    // optional gate — default = any modality overlap
    return Boolean(event.text);
  }

  protected override async analyze(
    event: ContentEvent,
    ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    ctx.trace.thought("looking for X in text");

    const score = await someClassifier(event.text!);
    if (score < 0.5) return []; // absence is meaningful

    return [
      {
        channel: "my-signal",
        probability: score,
        emittedBy: this.name,
        confidence: 0.7,
        evidence: [{ kind: "text-span", start: 0, end: 10, excerpt: "..." }],
      },
    ];
  }
}
```

Then register it in the worker:

```ts
new InMemoryOrchestrator([new TextRegexAgent(), new MyAgent()]);
```

The `BaseAgent.run()` lifecycle wraps `analyze()` with timing, error capture, and trace finalization. Every emitted channel is auto-recorded as a `decision` step in `AgentTrace.steps`.

---

## Policy DSL

Per-instance YAML, structured AST (no string evaluation, fully auditable):

```yaml
instance: mastodon.social
version: 3
basedOn: standard

rules:
  - id: severe-toxicity-deep
    description: "Severe toxicity, threats, or identity-hate → deep review"
    if:
      any:
        - { channel: severe_toxic,    op: gt, value: 0.8 }
        - { channel: threat,          op: gt, value: 0.7 }
        - { channel: identity_hate,   op: gt, value: 0.7 }
    action:
      kind: queue.deep
      reason: "severe-toxicity / threat / identity-hate above threshold"

  - id: toxicity-quick
    if:
      channel: toxic
      op: gt
      value: 0.7
    action:
      kind: queue.quick
      reason: "toxicity > 0.7"

  - id: spam-link
    if:
      channel: spam-link-presence
      op: gt
      value: 0.6
    action:
      kind: queue.quick
      reason: "spam-link-presence > 0.6"

default:
  kind: auto-allow
  reason: "no rule matched"
```

Conditions form a tree: leaf (`channel + op + value` or `entity + present`), `all: [...]`, or `any: [...]`. Rules evaluate in declaration order; first match wins. The original AST is preserved in the audit log alongside the rule id, so any operator decision can be traced back to the exact configuration that produced it.

---

## Roadmap

**Done (month 1):**

- Pillar 0 — schemas, core, gateway/worker shells, end-to-end smoke
- Pillar 1 — `@aur/db` persistence with hash-chained audit + 41 tests
- Pillar 2 — orchestration upgrade with real toxicity classifier + DB-persisted pipeline + dashboard reading live data + decision flow

**Next:**

- **Pillar 4 — Skills + tools layer.** Refactor agents to compose reusable skills (`classify-toxicity`, `extract-pii`, `lookup-author-history`). Tool registry backed by `@aur/db` (author lookup, similarity search, phash query). Per-instance skill allow/block lists.
- **Pillar 3 — Context engine.** Drops out of the tools layer — pgvector similarity search + author history queries powered by `@aur/db`.
- **Real agents.** `vision-ollama` (LLaVA / qwen2.5-vl), `audio-whisper-local`, `phash-similarity`, then `@aur/agents-cloud` (Anthropic, OpenAI, Gemini).
- **Pipeline stages with budgets.** Per-modality cost caps, confidence-based escalation: cheap triage agents short-circuit when confident; only the ambiguous middle goes to cloud.
- **Pillar 5 — Shadow / puppet runs.** Agents run silently alongside reviewers; decisions become free gold-set entries. Continuous evaluation graded by the actual operator.
- **Real connectors.** ActivityPub / AT Protocol firehose subscribers.
- **Eval harness.** Wire `@aur/eval` into `@eval-kit/core`. Per-agent calibration tracking (Brier, ECE).

---

## Sibling projects

- [`eval-kit`](https://github.com/akaieuan/eval-kit) — evaluation framework for collaborative-task agents. `aur` uses `@eval-kit/ui` primitives in its eval cockpit and will use `@eval-kit/core` for calibration scoring.
- [`HITL-KIT`](https://github.com/akaieuan/HITL-KIT) — human-in-the-loop UI primitives. `aur-app`'s queue and review screens are built on `MiniTrace`, `HitlCard`, `BatchQueue`, `AiGenerationScale`, and `ApproveRejectRow` from the [hitlkit.dev](https://hitlkit.dev) shadcn registry.

---

## License

MIT — see [LICENSE](LICENSE).

Copyright © 2026 Ieuan King.
