# @aur/db

Drizzle + Postgres + pgvector persistence for `aur`.

Stores `ContentEvent`, `StructuredSignal`, `AgentTrace`, `ReviewItem`,
`ReviewDecision`, `Policy`, `AuditEntry`, and per-event embeddings for
similarity search. Every table mirrors a `@aur/schemas` Zod contract — adding
a cross-package shape always starts in `@aur/schemas` and propagates here.

## Design invariants

- **Schema-first**: every column has a Zod field. Repository reads
  `.parse()` the row before returning, so consumers never see invalid data.
- **Federation-native**: `instance_id` is denormalized + indexed on every
  multi-tenant table. Every operational query takes an instance id.
- **Append-only audit log**: `audit_entries` is hash-chained per instance.
  `verifyAuditChain()` walks the chain and detects payload tampering and
  sequence gaps. Concurrent appends are serialized with
  `pg_advisory_xact_lock(hashtext(instance_id))`.
- **Variable shapes in JSONB, with types**: signal channels, agent trace
  steps, policy rules, audit payloads. Each column uses Drizzle's
  `$type<>()` so TypeScript catches misuse without a separate ORM mapping.
- **pgvector for embeddings**: `event_embeddings` carries a `vector(1536)`
  column with an HNSW cosine index. `findSimilarEvents()` returns top-K with
  cosine similarity in `[-1, 1]`.

## Local dev

Spin up Postgres + pgvector and apply migrations:

```bash
# from repo root
pnpm db:up           # docker compose up -d postgres
pnpm db:migrate      # tsx packages/db/bin/migrate.ts
```

The default connection string is `postgres://aur:aur@localhost:5432/aur`.
Override with `DATABASE_URL`.

To stop: `pnpm db:down`.

## Tests

Tests are hermetic — they spin up an in-memory pglite (Postgres-in-WASM with
pgvector) per file. No Docker required.

```bash
pnpm --filter @aur/db test
```

41 tests cover schema round-trip parity, hash-chain integrity (including
tamper and gap detection), multi-tenancy isolation across every table, and
cosine similarity search.

## Migrations

```bash
# After editing src/schema.ts:
pnpm --filter @aur/db db:generate    # writes migrations/NNNN_<name>.sql
pnpm db:migrate                      # applies them
```

The initial migration prepends `CREATE EXTENSION IF NOT EXISTS vector;` and
appends an HNSW cosine index on `event_embeddings.embedding` — neither is
emitted by `drizzle-kit generate` so they're added by hand. Future
migrations should be checked for the same gotchas if they touch
`event_embeddings`.

## Public API

```ts
import {
  createDatabase,        // postgres-js factory
  events, signals, traces, review, policy, audit, embeddings, // repositories
  // schema tables (also under "@aur/db/schema"):
  contentEvents, structuredSignals, /* ... */
} from "@aur/db";

const { db, close } = createDatabase();
await events.saveContentEvent(db, event);
const stored = await events.getContentEvent(db, event.id);

await audit.appendAuditEntry(db, {
  instanceId: event.instance.id,
  kind: "event-ingested",
  ref: { type: "content-event", id: event.id },
  payload: { sourceId: event.sourceId },
  actorId: null,
});

await close();
```

## Tables

| Table                | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `content_events`     | Normalized inbound event (one row per gateway-assigned UUID).      |
| `structured_signals` | Aggregated agent output keyed by `content_event_id`.               |
| `agent_traces`       | Append-only execution traces; one row per agent run on an event.   |
| `review_items`       | Queue rows awaiting human review.                                  |
| `review_decisions`   | Immutable human verdicts with signal feedback for calibration.     |
| `policies`           | Versioned per-instance policy bundles.                             |
| `audit_entries`      | Hash-chained append-only audit log (one chain per `instance_id`).  |
| `event_embeddings`   | One pgvector row per `(content_event_id, kind)` pair.              |

## What's deliberately not here yet

- Author + InstanceContext as first-class tables — denormalized into
  `content_events` until the query patterns require it.
- Streaming change feed (`pg_notify` listener) — added when the worker needs
  push-based reaction.
- Row-level security — multi-tenancy is enforced at the application layer
  via `instance_id` filtering; RLS layered on top is a follow-up.
- Hot media perceptual-hash similarity table — `media[].perceptualHash` is
  stored on the event JSONB; promote when query patterns demand.
