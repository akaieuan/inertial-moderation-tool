# inertial

**A reference architecture for auditable AI content review.** Not a deployable moderation service — a working demonstration of one architectural thesis, end-to-end through real code:

> *AI classification outputs and human review actions should both land in a hash-chained audit log, with typed structured signals as the unit of evidence and per-instance YAML as the unit of policy.*

What's real: schema-first Zod contracts across 12+ shapes, a skill/tool registry with a catalog + per-instance registration table, a YAML policy evaluator with hash-chained `/verify`, an eval harness scoring per-(skill, channel) Brier/ECE/agreement, a reviewer-tag layer with per-modality / per-segment scope, and a reviewer dashboard wired to all of it.

What's stubbed (deliberately): every source connector (Mastodon, Bluesky, Lemmy, Discord, Slack), the action dispatcher that pushes decisions back to source platforms, all `agents-*` packages except text + context, audio entirely, and any auth / observability layer. The architecture diagram below documents the *target* shape; what runs today is a verification substrate with a reference UI on top.

This is portfolio work, not a maintained OSS project. The point is the architecture choices and where they hold up, not feature completeness.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](#)
[![pnpm](https://img.shields.io/badge/pnpm-10-orange.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](#)
[![Status](https://img.shields.io/badge/status-pre--alpha-red.svg)](#)

> **Status — reference architecture, not deployable.** Schemas, audit chain, eval harness, skill registry, and reviewer dashboard are real and tested. Connectors are stubbed. Action dispatch is unimplemented. No auth. The 31-event gold set is too small for statistical claims; it's there to demonstrate the calibration math, not to certify any skill's accuracy.

`inertial` is two things in one monorepo:

1. **`@inertial/*` toolkit** — orchestration, persistence, policy, and HITL primitives. Sibling to [`eval-kit`](https://github.com/akaieuan/eval-kit) and [`HITL-KIT`](https://github.com/akaieuan/HITL-KIT).
2. **`@inertial/app`** — Electron + React + Tailwind reference dashboard for moderators, built on HITL-KIT.

![Inertial dashboard — flag activity heatmap, queue mix, top of queue](docs/screenshots/dashboard.png)

---

## Naming

The project takes its vocabulary from Philip K. Dick's *Ubik* (1969):

- **inertial** — In *Ubik*, "inertials" are anti-telepaths whose function is to neutralize harmful psychic intrusion on behalf of clients. That's the metaphor: the toolkit's sub-agents are *inertials* — each one neutralizes a class of harmful signal (toxicity, spam, NSFW, identity hate, brigading…) for the communities it serves.
- **Runciter** — Glen Runciter, the operator who runs the prudence organization that *dispatches* the inertials. The orchestrator class in `@inertial/core` is `Runciter`; the host process is `apps/runciter`. Code reads as: `runciter.dispatch(event) → inertials emit StructuredSignals`.
- **structured signals** — what inertials emit. Probability + confidence + evidence pointers. Never verdicts. The policy layer turns signals into routing decisions; humans turn routing decisions into actions.

If you only remember one rule: **inertials emit signals; the Runciter dispatches them; humans decide.**

---

## The reviewer surface

The dashboard is the reference implementation of the `inertial` HITL contract. Every flag flows through here; nothing the runciter does is hidden.

### Dashboard — flag activity at a glance

The first thing the reviewer sees: a 52-week flag heatmap (GitHub-style, but red and pale enough to scan without being alarming), the day-by-day breakdown on hover, the operational stats below, and the next items waiting on a moderator on the right.

![Dashboard with flag-activity heatmap, stats grid, queue mix](docs/screenshots/dashboard.png)

### Queue — three decks, click to review inline

The Quick / Deep / Escalation queues live side by side. Each card is one pending item with author, snippet, and the top channel that fired. Click any card and the deck opens **in place** (not as a modal) so you can flip through the stack approving / removing / escalating without losing the rest of the page.

![Queue page with three deck columns](docs/screenshots/queue.png)

The detail panel surfaces every signal the runciter generated: channel chips with per-channel evidence, **reviewer tags** with per-modality / per-segment scope (Add tag opens a popover catalog filtered to the event's modalities), a **video frames** strip when the event is video (thumbnails with timestamp overlays + top-channel score per keyframe), **author history** with verdict pills, and **similar events** (top-K cosine-similar past events via Voyage embeddings + pgvector).

Approve / Remove / Escalate commits a `ReviewDecision` + every applied tag into the hash-chained audit log. Tags auto-promote into the gold set as `reviewer-derived` rows, so the eval corpus grows on every commit.

![Queue review session — channels + reviewer tags + similar events](docs/screenshots/queue-review.png)

### Pipelines — wire up your dispatch flow

Visual canvas showing how an event flows through the runciter. Below it: the active YAML configurations the instance has loaded, with route badges colour-tied to the queues they feed.

![Pipelines page with visual canvas + active configs](docs/screenshots/pipelines.png)

### Skills — what the runciter is allowed to do

Active classifiers + registered tools, with execution model + privacy budget visible per skill. The **Add skill** sheet is the entry point for registering a new classifier without touching YAML.

![Skills page with stat row + skill list](docs/screenshots/skills.png)

![Skills create sheet — add a new classifier](docs/screenshots/skills-create-sheet.png)

### Compliance — hash-chained audit + shadow agreement

Per-skill shadow agreement (how often each silent skill agreed with the human) plus the live audit feed — every state transition the runciter wrote, in order.

![Compliance page with shadow agreement + audit feed](docs/screenshots/compliance.png)

### Insights — calibration & reviewer-tagged corpus

Per-skill Brier / ECE / agreement against the gold set, the reviewer-tag corpus that grows on every commit decision, and an eval-runs history. The "Run eval" button kicks off a live calibration pass against the active skill registry.

![Insights page with calibration table + tag corpus + run history](docs/screenshots/insights.png)

### Side panels — chat, notes, agent activity

The right rail extends edge-to-edge from the top of the window. The Chat panel mirrors the Claude home pattern (greeting, overview card with a 15-week flag heatmap, suggestion chips, pill input with model + tools below). Notes is a per-case scratchpad; Agent activity shows the live inertial dispatch trace.

![Dashboard with chat panel open](docs/screenshots/dashboard-chat-panel.png)

---

## Why I built this

Commercial moderation APIs claim accuracy without proof and ship verdicts without evidence. Federated mods distrust them because they can't audit them; centralized compliance teams need defensible records they can show regulators. Both want decomposed, evidence-rich decisions; neither has them.

I wanted to know: what would a *substrate* for that look like — schemas, audit log, skill registry, eval harness, reviewer surface — wired together end-to-end with real code rather than a slide-deck. So I built it. The thesis is:

- **Inertials (sub-agents) emit typed structured signals**, not verdicts. Probability + confidence + evidence pointers. The policy layer turns signals into routing; humans turn routing into actions.
- **Per-instance YAML policy** so federation is a first-class case, not an afterthought. The same code serves "wide-open community" and "high-compliance enterprise" because the operator brings their own rules.
- **Per-skill privacy posture lives in the schema.** A skill is either `dataLeavesMachine: true` or false. The audit chain records which model saw which event so "no remote API touched my instance for 30 days" becomes a SQL query, not a vendor promise.
- **Reviewer decisions auto-promote into the eval gold set.** Every commit grows the calibration corpus by one structured row, so the system improves at measuring itself.

That thesis — verification substrate, not vendor API — is what's actually built and demonstrated end-to-end.

### What this is NOT, in plain language

- **Not a deployable moderation service.** No connectors to source platforms. No action dispatcher pushing changes back. No auth on the HTTP surface. Don't run this in front of any real instance.
- **Not a model.** Composes existing classifiers (toxic-bert, Claude, Voyage) under typed contracts. Does not train anything.
- **Not statistically validated.** The 31-event gold set demonstrates the calibration math is correct; per-channel sample sizes (1-15) are too small to make any actual claim about any skill's real-world accuracy.
- **Not multimodal in the way that phrase usually means.** Audio is fully unimplemented. Video is keyframe extraction plus per-frame image classification — no temporal reasoning, no audio track, no scene-change detection.
- **Not a complete moderation toolkit.** The dashboard, audit log, eval harness, and skill registry are real. Six of the seven `@inertial/agents-*` packages are stubs. Two of the four planned connector packages don't even have a placeholder.
- **Not a maintained OSS project.** No CONTRIBUTING.md, no issue templates, no triage commitment. If you want to use any of this, fork it.

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
                │  Runciter   │  Orchestrator runtime (apps/runciter).
                │             │  Dispatches inertials matching event.modalities.
                │             │  Aggregates signals (max-confidence on collision).
                └──────┬──────┘
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐    Tier 0 (heuristic)
  │  text-   │  │  phash-  │  │   ...    │    Tier 1 (transformers.js WASM)
  │  regex   │  │ similar  │  │ vision-  │    Tier 2 (Ollama @ :11434)
  │          │  │          │  │  ollama  │    Tier 3 (Anthropic / OpenAI)
  └────┬─────┘  └────┬─────┘  └────┬─────┘    (each box = one inertial)
       └─────────────┼─────────────┘
                     ▼
              ┌─────────────┐
              │ Aggregator  │  StructuredSignal: channels record + entities
              └──────┬──────┘  + agentsRun + agentsFailed + latencyMs
                     ▼
              ┌──────────────────┐
              │ @inertial/policy │  Per-instance YAML rules over signal.
              │    evaluator     │  Emits PolicyAction (queue.quick / queue.deep
              └──────┬───────────┘  / escalate / auto-allow / auto-remove).
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
  ┌──────────┐            ┌──────────────┐
  │ReviewItem│  ◀─────────│ @inertial/app│  Reviewer commits ReviewDecision.
  │ (queue)  │            │  (Electron + │  Decision + signalFeedback flow
  └────┬─────┘            │    HITL)     │  back into the eval harness.
       │                  └──────────────┘
       ▼
  ┌─────────────────┐
  │  @inertial/db   │  Hash-chained audit log: every state transition writes one
  │  (Postgres +    │  entry per instance. prevHash → hash linkage; tamper-detectable.
  │    pgvector)    │
  └─────────────────┘
```

Every box has a corresponding `@inertial/*` package. Every cross-package shape is a Zod schema in `@inertial/schemas` — when you add a new inertial or signal type, the contract change happens there first.

---

## Skill tiers (what's actually demonstrated)

The architecture supports four execution tiers. **Today, only two are exercised.** Tier 2 (local server / Ollama) has no skill implementations; Tier 0 has one (regex URL detection). Below is the honest mapping of tier → what ships, not what could theoretically run.

| Tier | Where it runs | Install | What ships today |
|---|---|---|---|
| **0. Heuristic** | In-process JS | nothing | `text-detect-spam-link` (regex URL detection) |
| **1. Local WASM** | `@huggingface/transformers` ONNX runtime | nothing — model auto-downloads to `~/.cache/huggingface/hub` | `text-classify-toxicity@local` (toxic-bert) |
| **2. Local server** | Ollama daemon at `localhost:11434` | `brew install ollama && ollama pull llama3.2-vision` | nothing yet — planned for the in-flight `vision-ollama` work |
| **3. Cloud** | Anthropic / Voyage / (future) OpenAI / Gemini | `@inertial/agents-cloud` package + per-skill API key wired through the dashboard catalog | `text-classify-toxicity@anthropic`, `image-classify@anthropic`, `text-embed@voyage`, **video frame-by-frame** (extract via local ffmpeg → image-classify@anthropic per keyframe) |

Privacy posture is per-skill: Tier 0/1 never leave the machine; Tier 3 always does. The audit log records which model saw which event, so a federated mod can prove "no remote API touched my instance over the last 30 days" — not as a promise, as a hash-chained artifact.

### Honest capability matrix

What's actually working today, by modality:

| Modality | Tier 0 | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| Text — spam links | full | full | — | — |
| Text — toxicity | — | ~70% (toxic-bert) | — | ~90% (Claude) |
| Image — NSFW / violence / minor / self-harm | — | — | — | ~85% (Claude Vision) |
| Video — frame-level | phash on keyframes (planned) | — | — | ffmpeg keyframe extract → Claude Vision per-frame |
| Video — temporal reasoning across frames | — | — | — | planned for v2 (Gemini multi-frame) |
| Audio | — | — | — | — (planned: Whisper transcribe → text classify) |
| Cross-event ("is this brigading?") | — | — | — | partial (`db.events.find-similar` via Voyage embeddings) |

Local-first is not a magic bullet. **For high-stakes content (minor detection, video understanding, audio harassment, coordinated attacks), cloud is currently the only adequate tier — and audio is unimplemented entirely.** The point of inertial isn't to replace cloud — it's to make the routing legible and the data flow auditable.

---

## Run the demo locally

This boots the full pipeline against an in-memory pglite + 10 hand-crafted events. No real ingestion happens; there's no source connector. You're running the verification substrate against synthetic input to see what the audit log, eval harness, and dashboard look like wired together.

Requires Node ≥20 and pnpm 10. The text path needs no other deps.

**Optional** — to exercise the cloud and video skills you'll want one or more of:

| Want | Install / set |
|---|---|
| Text + image moderation via Claude | `ANTHROPIC_API_KEY` |
| Similar-events context (`db.events.find-similar`) | `VOYAGE_API_KEY` ([free tier](https://www.voyageai.com/)) |
| Video keyframe extraction | `brew install ffmpeg` (or apt/yum equivalent) |

Each is optional; missing keys / binaries are detected at boot, the relevant skill is skipped with a clear log line, and other modalities still work.

```bash
git clone https://github.com/akaieuan/inertial-moderation-tool inertial
cd inertial
pnpm install
pnpm build
```

Three terminals:

```bash
# 1. Runciter — orchestrator + in-memory pglite. First boot downloads
#    toxic-bert (~250MB) to ~/.cache/huggingface/hub. ~30s one-time.
pnpm --filter @inertial/runciter dev

# 2. Gateway — HTTP ingest on :4000
pnpm --filter @inertial/gateway dev

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
pnpm --filter @inertial/app dev
```

The Queue tab pulls live data from the Runciter, lets you expand each item to see post text + per-inertial traces, and approve/remove commits a `ReviewDecision` with a hash-chained audit entry.

For real Postgres persistence:

```bash
pnpm db:up && pnpm db:migrate
DATABASE_URL=postgres://aur:aur@localhost:5432/aur pnpm --filter @inertial/runciter dev
```

> **Note:** The Postgres user/db/container is still named `aur` for now (renaming requires destroying the local volume). It will move to `inertial` in a follow-up that is scheduled when local state can be safely nuked.

---

## Verifiability — `pnpm eval`

Calibration is a hash-chained artifact, not vibes. From the repo root:

```bash
pnpm eval
```

Boots an in-memory pipeline, dispatches the 31-event hand-labeled gold set
(`config/evals/gold-set-v1.jsonl` — 30 text + 1 video) through the live
skill registry, and prints per-(skill, channel) Brier / ECE / agreement:

```
skill                                  channel                  brier     ece   agree  samples
────────────────────────────────────── ────────────────────── ─────── ─────── ─────── ────────
text-classify-toxicity@local           toxic                   0.0330  0.0888    0.93       31
text-classify-toxicity@local           insult                  0.0421  0.0604    0.90       31
text-classify-toxicity@local           obscene                 0.0345  0.0596    0.90       31
text-classify-toxicity@local           threat                  0.0241  0.0291    0.97       31
text-context-author@local              context.author-prior-…  0.1480  0.1933    0.83       31
text-detect-spam-link                  spam-link-presence      0.0213  0.0267    0.97       31
────────────────────────────────────── ────────────────────── ─────── ─────── ─────── ────────
6 (skill, channel) row(s) | scored: 31 | unresolved: 0 | failed: 0 | mean latency: 10ms
```

The gold set grows organically: every reviewer commit decision's
`signalFeedback` + `reviewerTags` auto-promotes to a `gold_events` row
(source `reviewer-derived`). Hand-edit the JSONL or click "Add tag" in the
dashboard — both paths grow the same corpus.

Cloud skills are skipped by default (free + fast in CI). Set
`EVAL_INCLUDE_CLOUD=true` to score Anthropic / Voyage too.
Set `EVAL_BRIER_THRESHOLD=0.15` to fail CI on regressions.

The script prints a machine-parseable final line —
`[eval] result=ok scored=31 skipped=0 rows=6` — so CI can grep for success
even when Node's exit on macOS races with `@huggingface/transformers`'s
WASM thread teardown (a cosmetic libc++abi message that doesn't affect
the actual results above).

---

## What's actually working today

Two tables. The first is what runs. The second is what doesn't and why it matters. The gap between them is the gap between "verification substrate" and "moderation tool."

### Real

| Component | Status |
|---|---|
| `@inertial/schemas` | Real. 12+ Zod schemas: ContentEvent, StructuredSignal, AgentTrace, ReviewItem, ReviewDecision (+ `reviewerTags`), Policy, AuditEntry, SkillRegistration, GoldEvent, EvalRun, SkillCalibration, ReviewerTag + scope, TagAgreement. |
| `@inertial/core` | Real. BaseAgent + TraceCollector + InMemoryRunciter, SkillRegistry + ToolRegistry, `SKILL_CATALOG`, `TAG_CATALOG` (~18 starter tags). |
| `@inertial/db` | Real. 14 tables (incl. `skill_registrations`, `gold_events`, `eval_runs`, `skill_calibrations`, `reviewer_tags`, `event_embeddings`). **68 hermetic integration tests.** Hash-chained audit with tamper detection. |
| `@inertial/policy` | Real. YAML loader + structured AST evaluator. First-match wins; per-instance versioning. Confidence-based escalation working. |
| `@inertial/eval` | Real. Brier / ECE / agreement + tag-PRF scoring, calibration aggregator, JSONL loader, reviewer-derived auto-promotion, persistence-agnostic runner. **30 unit tests.** |
| `apps/gateway` | Real. Hono ingest, normalizes payloads, forwards to runciter. |
| `apps/runciter` | Real. Runciter runtime + 5 eval endpoints + 3 tag endpoints + boot-time gold-set loader + reviewer-derived gold auto-promotion on every commit decision. |
| `apps/inertial-app` | Real. Electron + React + Tailwind v4. Live Insights tab (calibration table + Tag corpus + Eval runs history + Run-eval button), QueueDetailPanel with reviewer-tag picker. |
| `text-regex` (Tier 0) | Real. URL detection via skill `text-detect-spam-link`. |
| `text-toxicity-local` (Tier 1) | Real. `Xenova/toxic-bert` via transformers.js. ~50ms/event after warmup. |
| `text-context-author@local` + `text-context-similar@local` | Real. Context skills via `db.author.list-history` + `db.events.find-similar` tools. |
| `video-frame-extract@local` + `VideoAgent` | Real. System ffmpeg keyframe extraction; composes any registered image classifier per-frame; emits `video-segment` evidence the dashboard renders as a thumbnail strip. Skipped at boot when ffmpeg is missing. |
| `vision-*`, `audio-*`, `identity-*` inertials | Stubbed. Empty `analyze()` returning `[]`. (Cloud vision works via `image-classify@anthropic` from `@inertial/agents-cloud`.) |
| `connectors-{activitypub,atproto,lemmy,sdk-webhook}` | Stubbed. |
| `@inertial/agents-cloud` | Real. Anthropic text-toxicity + image-NSFW + Voyage embeddings — all factory-shaped so per-instance API keys work via the catalog. |
| `pnpm eval` | Real. Boots an in-memory pipeline, runs the gold set against the live skill registry, prints per-(skill, channel) Brier / ECE / agreement, exits non-zero on regressions when `EVAL_BRIER_THRESHOLD` is set. |

### Not real (and what each gap blocks)

| Missing | Why it matters |
|---|---|
| **Source connectors** (ActivityPub / AT Protocol / Lemmy / Discord / Slack / webhook). All four `@inertial/connectors-*` packages contain stub interfaces with zero ingestion logic. | Without these, no real platform's events ever reach the runciter. The system can only process events posted directly to `POST /v1/events` by a script. This is the single biggest gap between this project and a moderation tool. |
| **Action dispatcher** to source platforms. Reviewer commits land in the audit log; nothing pushes Approve / Remove / Limit back to Mastodon / Bluesky / Discord. | A moderation system that can't act on its decisions is a logging system. |
| **Authentication / authorization** on the runciter HTTP surface. Anyone who can reach `localhost:4001` can `POST /v1/skills/registrations`, kick off eval runs, or delete review items. | Don't run this in front of any real instance. |
| **Audio inertials of any kind.** No transcription, no audio classification, no even-stub package beyond `@inertial/agents-audio` returning `[]`. | "Multimodal" is overstated — text + image + frame-grabbed-video only. |
| **Real video understanding.** The `VideoAgent` extracts keyframes via ffmpeg and runs the existing image classifier on each. There is no temporal reasoning, no audio track, no scene-change detection, no live stream support. | Calling this a "video pillar" is a pattern claim, not a capability claim. Honest framing: "video keyframe extraction skill that lets image classifiers generalize to video files." |
| **Statistically meaningful gold set.** 31 hand-labeled events with 1-15 samples per channel. Brier scores in the 0.02-0.15 range are arithmetically correct and statistically nothing. | Every calibration number in the README and dashboard demonstrates the math is plumbed; none of them tell you whether any skill is actually well-calibrated in production. The reviewer-derived auto-promotion path can grow this corpus organically once real reviewer activity happens — it has not. |
| **Observability / logging / metrics.** No structured logs (just `console.log("[runciter] ...")`), no `/metrics` endpoint, no error tracking, no tracing. | Operating this in any non-dev context is flying blind. |
| **Backup / restore / migration rollback** for the production Postgres path. Drizzle migrations are committed; nothing automates restore. | Same gap. |
| **End-to-end integration tests** that boot gateway + runciter + dashboard and run an event from POST → audit → review → audit-verify. Each layer is unit-tested in isolation; the seams are not. | A real bug will live between layers, not in any one layer. |
| **A second registered skill per Tier 2.** Ollama integration is in flight but not implemented; nothing exercises Tier 2 today. | The "four-tier" architecture story is real at the schema level, partial at the code level. |

The skill catalog + registrations table + hot-toggle CRUD + audit chain + boot-time loader is **shaped for ~50 skills**. With ~7 actual skills it's correct-pattern, oversized-scope. That's a deliberate "ready to grow" stance, but if you're scanning for honest signals, this is one of them: the infra outsizes the live use case.

---

## Project layout

```
apps/
  gateway/              Hono :4000 — ingest + normalize
  runciter/             Hono :4001 — Runciter (orchestrator), persist + audit
  inertial-app/         Electron dashboard (HITL-KIT primitives)
packages/
  schemas/              @inertial/schemas         — Zod contracts
  core/                 @inertial/core            — BaseAgent, Runciter, aggregator
  agents/
    text/               @inertial/agents-text     — text-regex, text-toxicity-local
    cloud/              @inertial/agents-cloud    — Anthropic / OpenAI / Gemini skills
    vision/             @inertial/agents-vision   — (stub)
    video/              @inertial/agents-video    — (stub)
    audio/              @inertial/agents-audio    — (stub)
    identity/           @inertial/agents-identity — (stub)
    context/            @inertial/agents-context  — (stub)
  connectors/
    activitypub/        @inertial/connectors-activitypub  — (stub)
    atproto/            @inertial/connectors-atproto      — (stub)
    lemmy/              @inertial/connectors-lemmy        — (stub)
    sdk-webhook/        @inertial/connectors-sdk-webhook  — (stub)
  policy/               @inertial/policy          — YAML loader + AST evaluator
  db/                   @inertial/db              — Drizzle + Postgres + pgvector + hash-chained audit
  eval/                 @inertial/eval            — wraps @eval-kit/core (stub)
  sdk/                  @inertial/sdk             — public SDK surface (stub)
  registry/             @inertial/registry        — shadcn-compatible UI primitives (stub)
config/
  policies/
    default.yaml        Default policy (toxicity + spam-link rules)
  evals/                Gold sets, suites (empty)
scripts/
  seed.mjs              10 hand-crafted events through gateway → runciter
  smoke.mjs             Single-event smoke test
docker-compose.yml      Postgres + pgvector for prod-shape persistence
```

---

## Build your own inertial

A new inertial is a class extending `BaseAgent`:

```ts
import { BaseAgent, type AgentContext } from "@inertial/core";
import type { ContentEvent, Modality, SignalChannel } from "@inertial/schemas";

export class MyInertial extends BaseAgent {
  readonly name = "my-inertial";
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

Then register it with the Runciter:

```ts
new InMemoryRunciter([new TextRegexAgent(), new MyInertial()]);
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

This is the order pillars landed during the build, not a commitment to keep building. Each pillar is scoped honestly — "what landed" is what runs, not what could exist.

### Shipped (substrate work)

| Pillar | What landed | Why it matters |
|---|---|---|
| **Foundations** | `@inertial/schemas` (8 Zod contracts), `@inertial/core` (Runciter, BaseAgent, max-confidence aggregator), gateway + runciter shells, end-to-end smoke | Every cross-package shape is a typed Zod schema. The runciter dispatches inertials; humans decide. |
| **Persistence + audit** | `@inertial/db` (Drizzle + Postgres + pgvector), 8 tables, **hash-chained audit log with tamper detection**, pglite dev factory, 41 hermetic integration tests | "No remote API touched my instance over the last 30 days" becomes a hash-chained artifact, not a promise. |
| **Live moderation pipeline** | Real `text-toxicity-local` (`Xenova/toxic-bert` via transformers.js, ~50ms/event after warmup), `@inertial/policy` YAML evaluator, DB-persisted pipeline, dashboard reading live data, decision commit flow | Seed 10 events → see them route to queues → approve/remove from the dashboard → audit log grows. |
| **Vision + split-pane review** | Claude Vision moderation (`image-classify@anthropic`), split-pane queue → detail layout, evidence rendering with bbox overlays | Image flags get the same audit + reviewer treatment as text. |
| **Shadow runs + compliance** | Skills can run as `shadow:` peers; their decisions are recorded silently. Compliance tab surfaces per-skill agreement vs. the human reviewer. | Free continuous gold-set generation. Calibration data flows back into the eval harness. |
| **Reviewer experience** | Dashboard FlagMap heatmap with hover stats, three-deck queue layout with inline review session, Pipelines visual canvas, Skills create sheet, Insights rebuilt on internal primitives, side panels (Chat / Notes / Agent activity) docked edge-to-edge | The dashboard reads as one app instead of seven loosely related views. See [`docs/screenshots/`](docs/screenshots/). |
| **Skills + tools layer** | Skill / tool registries in `@inertial/core`, `SKILL_CATALOG` of installable modules, `skill_registrations` persistence, dashboard catalog picker + per-instance hot toggle, factory-shaped cloud skills, `db.author.list-history` + `db.events.find-similar` + `db.embeddings.get` tools | Adding a skill becomes a registration row, not a code change. The reviewer can wire Voyage / Anthropic / etc. without touching YAML. |
| **Context engine** | `ContextAgent` composing `text-context-author@local` + `text-context-similar@local`. Voyage embeddings populate `event_embeddings` inline on every text-bearing event. Author history + similar events surface in the queue detail panel. | "Has this user done this before? Has anything like this happened before?" answered for every queued item. |
| **Eval harness + reviewer-tagged corpus** | `@inertial/eval` (Brier / ECE / agreement scoring), `gold_events` + `eval_runs` + `skill_calibrations` tables, JSONL gold-set v1 (30 hand-labeled cases), `pnpm eval` CLI with summary table, runciter `/v1/eval/runs` endpoints, Insights tab live, **reviewer-tag layer** (`TAG_CATALOG`, `reviewer_tags` table, per-modality / per-segment scoping, in-line tag picker on every queued item) | Calibration becomes hash-chained, not vibes. Every reviewer commit grows the gold set automatically (auto-promotion). The "good video bad audio" mixed-validity case gets a precise label, not a whole-asset verdict. |
| **Video keyframe extraction (not video understanding)** | `video-frame-extract@local` skill (system ffmpeg), `VideoAgent` composing extract → image-classify on each frame, `video-segment` evidence with `keyframeUrl`, dashboard `<VideoFramesSection>` rendering per-keyframe scores. **No temporal reasoning, no audio, no scene-change detection, no live-stream support.** | Demonstrates that the architecture handles a new modality by composing existing skills (image classifier per-frame). Honest framing: "image moderation with auto-frame-grab," not video understanding. |

### Not built — what would be needed for this to become deployable

These aren't in any active queue; they're the gaps a careful reviewer should know exist.

- **Source connectors.** ActivityPub / AT Protocol firehose subscribers, Discord bot ingest, Slack event API, generic webhook receiver. Without one of these, no real platform's events reach the system.
- **Action dispatcher.** Push reviewer commits back to source platforms (Mastodon API, Bluesky, Discord, etc). Without this, the system is logging-only.
- **Auth + observability.** Bearer-token (or session-cookie) auth on the runciter HTTP surface. Structured logging via pino. `/metrics` endpoint. Error tracking integration. Without these, this is dev-only.
- **Statistically meaningful gold set.** The hand-labeled set needs to grow from 31 to ~1,000+ events with ≥30 samples per channel before any calibration claim is statistically meaningful. The reviewer-derived auto-promotion path can do this in production but hasn't.
- **End-to-end integration tests.** Unit tests cover each layer in isolation; nothing tests gateway → runciter → DB → dashboard as one flow.
- **Audio of any kind.** Currently zero implementation. Whisper-local transcription → existing text skills is the obvious path, not built.
- **Real video understanding.** Gemini multi-frame for temporal reasoning, audio track integration, scene-change detection, live-stream segmentation.
- **More inertials.** `vision-ollama` (Tier 2), `phash-similarity` (Tier 0), expanded `@inertial/agents-cloud` (OpenAI moderation, Gemini).
- **Pipeline stages with budgets.** Per-modality cost caps, confidence-based escalation routing.
- **Tag-aware skills.** A `text-context-precedent@rag` skill calling `db.tags.find-similar` to surface reviewer-tag precedents as in-context evidence for cloud classifiers. The tag corpus exists; nothing reads it as RAG yet.

### Sibling kits

- **[`tag-kit`](https://github.com/akaieuan/tag-kit)** — domain-agnostic structured tagging primitives (catalog + scope-aware matching + PRF scoring + headless React `TagPicker` / `TagChip`). `inertial`'s `TAG_CATALOG` + reviewer-tag layer was extracted into `tag-kit` so other HITL annotation workflows (medical, legal, ML training data) can reuse the same substrate.

### Capturing fresh screenshots

The screenshots in this README are auto-generated against the dev server.

```bash
pnpm --filter @inertial/app dev   # in one terminal
node scripts/capture-screenshots.mjs  # in another — writes to docs/screenshots/
```

The script uses puppeteer-core against a system Chrome (override with `CHROME_PATH`), navigates each route, and writes 1600×1000 dark-mode PNGs.

---

## Sibling projects

- [`eval-kit`](https://github.com/akaieuan/eval-kit) — evaluation framework for collaborative-task agents. `inertial` uses `@eval-kit/ui` primitives in its eval cockpit and will use `@eval-kit/core` for calibration scoring.
- [`HITL-KIT`](https://github.com/akaieuan/HITL-KIT) — human-in-the-loop UI primitives. `@inertial/app`'s queue and review screens are built on `MiniTrace`, `HitlCard`, `BatchQueue`, `AiGenerationScale`, and `ApproveRejectRow` from the [hitlkit.dev](https://hitlkit.dev) shadcn registry.

---

## License

MIT — see [LICENSE](LICENSE).

Copyright © 2026 Ieuan King.
