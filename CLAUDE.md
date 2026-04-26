# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo state

Pre-alpha, month 1 of a 3-month roadmap. The workspace topology (apps, packages, package boundaries) is in place, but most packages under `apps/` and `packages/` are still empty scaffolds. The only package with real source today is `@aur/schemas`. Treat the README's architecture diagram as the *target*, not the current code — when adding to an empty package, you are establishing its conventions.

## Commands

Package manager is pnpm 10 (enforced via `packageManager`). Node ≥20.

Top-level (run from repo root, dispatch through Turbo):

- `pnpm build` — build all packages (`turbo run build`)
- `pnpm dev` — run all `dev` tasks in watch (persistent, uncached)
- `pnpm typecheck` — type-only check across the graph
- `pnpm lint` — lint across the graph
- `pnpm test` — run all package test tasks
- `pnpm clean` — `turbo run clean` plus `rm -rf node_modules`

Per-package (run inside a package dir, e.g. `packages/schemas`):

- `pnpm build` / `pnpm dev` / `pnpm typecheck` / `pnpm clean` — packages currently use plain `tsc -p tsconfig.json` (no bundler). `dev` is `tsc --watch`. `clean` removes `dist`, `.turbo`, and `*.tsbuildinfo`.

Turbo is configured so `build`, `typecheck`, and `test` depend on upstream `^build`, so a single package change rebuilds only what's needed. To target one package from the root: `pnpm --filter @aur/schemas <script>` or `turbo run build --filter=@aur/schemas`.

There is no test runner wired up yet, and no lint config — `pnpm test` / `pnpm lint` will currently no-op until packages add those scripts.

## Architecture

`aur` is a multimodal content-moderation toolkit shipped alongside a reference Electron dashboard. Two products, one monorepo:

1. **`@aur/*` toolkit** — reusable orchestration + moderation primitives (the `packages/` tree).
2. **`aur-app`** — Electron + React + Tailwind + shadcn dashboard for moderators (`apps/aur-app`).

The intended runtime data flow (per README):

```
Connectors → Gateway (Hono ingest) → Orchestrator (LangGraph, in worker)
          → Sub-agents (vision, text, video, audio, identity, context)
          → Signal Aggregator → PolicyEngine (per-instance YAML)
          → Review Queues → aur-app (HITL) → Action Dispatcher + Audit Log + Eval Harness
```

### Layer responsibilities

- **`apps/gateway`** — Hono HTTP service. Owns ingest, webhook SDK, media download + perceptual hashing. Normalizes inbound platform payloads into `ContentEvent`s before they enter the orchestrator. Media URLs in `ContentEvent.media[].url` are *internal* storage URLs (S3/R2/local), never the original platform URL — this normalization happens here.
- **`apps/worker`** — LangGraph orchestrator + agent runtime. Consumes `ContentEvent`s, dispatches sub-agents based on `event.modalities`, aggregates `StructuredSignal`s, runs the policy engine, and lands events on review queues.
- **`apps/aur-app`** — Electron dashboard for human reviewers. Built on HITL-KIT primitives (sibling project). Surfaces queues, signals, and decisions; emits `ReviewDecision`s.

### Package responsibilities

- **`@aur/schemas`** — the lingua franca. Zod contracts for `ContentEvent`, `StructuredSignal`, `ReviewDecision`, `AgentTrace`. Every other package depends on this. **When adding a cross-package shape, add it here first.**
- **`@aur/core`** — orchestrator + agent base classes.
- **`@aur/agents/{vision,video,text,audio,identity,context}`** — one nested workspace per modality agent. Workspace globs are explicit: `packages/agents/*` and `packages/connectors/*` are listed separately in `pnpm-workspace.yaml`, so a new agent must live directly under `packages/agents/`, not nested deeper.
- **`@aur/policy`** — YAML loader + evaluator. Per-instance policies live in `config/policies/` and are resolved by `instance.id` from the event.
- **`@aur/connectors/{activitypub,atproto,lemmy,sdk-webhook}`** — one workspace per source platform. Each connector's job is to emit normalized `ContentEvent`s; everything platform-specific (auth, pagination, payload shape) is contained here.
- **`@aur/db`** — Drizzle + Postgres + pgvector. pgvector is the choice because perceptual-hash and embedding similarity search live alongside the relational data.
- **`@aur/eval`** — wraps `@eval-kit/core` (sibling project) for the eval harness. Gold sets and suites live in `config/evals/`.
- **`@aur/sdk`** — public SDK surface for external consumers.
- **`@aur/registry`** — shadcn-compatible component registry (the toolkit's published UI primitives).

### Design invariant: signals, not verdicts

The README's tagline — "**Structured signals, not verdicts**" — is load-bearing. Sub-agents must emit typed structured signals; the *only* place a verdict is produced is the policy engine, and the *only* place a moderation action is committed is the human review path. When designing an agent or signal type, resist the temptation to bake policy decisions into the agent output.

### Federation / multi-tenancy model

`InstanceContextSchema` (in `@aur/schemas`) carries an `id` that is either a federated instance domain (e.g. `mastodon.social`) or a centralized tenant/workspace ID. Policy resolution, queue routing, and audit logging are all keyed on this ID. Code that needs "which policy applies" should always go through `instance.id` — never the source platform alone.

## Conventions

- **TypeScript**: ESM-only (`"type": "module"`), strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Inherited from `tsconfig.base.json` — extend it rather than redeclaring options.
- **Build output**: each package builds to `dist/` via `tsc -p tsconfig.json`. Packages publish `./dist/index.js` + `./dist/index.d.ts` via the `exports` field; keep that shape consistent when scaffolding new packages.
- **Workspace deps**: pnpm is configured with `link-workspace-packages=true` and `prefer-workspace-packages=true`, so `"@aur/schemas": "workspace:*"` will resolve locally without extra config.
- **Schema-first**: when a piece of data crosses a package boundary, define it in `@aur/schemas` as a Zod schema and infer the TS type. This is already the pattern in `content-event.ts`.
