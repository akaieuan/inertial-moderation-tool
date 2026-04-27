# Eval gold sets

This directory holds hand-labeled gold-set JSONL files used to score skill
calibration. Every line is one self-contained gold entry: a full
`ContentEvent` plus the labeler's expectations of what each skill should emit.

## Format

One JSON object per line. Blank lines and `//` / `#` comment lines are
allowed for readability.

```jsonc
{
  "event": {
    "id": "00000000-0000-0000-0001-000000000001",
    "sourceId": "gold-001",
    "source": "test",
    "instance": { "id": "default", "source": "test" },
    "modalities": ["text"],
    "text": "Just had a great cup of coffee this morning.",
    "links": [],
    "media": [],
    "hasContentWarning": false,
    "author": { "id": "user-clean-1", "handle": "morning_person", "priorActionCount": 0 },
    "postedAt": "2026-04-26T09:00:00.000Z",
    "ingestedAt": "2026-04-26T09:00:00.000Z"
  },
  "expectedChannels": {},
  "expectedAction": { "kind": "auto-allow", "reason": "no rule matched" },
  "source": "hand-labeled",
  "authorId": "ieuan@local",
  "notes": "baseline clean post — all skills should NOT fire"
}
```

### Fields

| Field | Required | Notes |
|---|---|---|
| `event` | yes | Full `ContentEvent` shape from `@inertial/schemas`. UUIDs should be stable so re-loading the same set is idempotent. |
| `expectedChannels` | yes | `{ channelName: { probability: 0..1, confidence: "high" \| "medium" \| "low" } }`. Channels not listed are expected to NOT fire. |
| `expectedAction` | optional | What the policy router should produce. When set, the eval also scores routing, not just skill outputs. |
| `source` | optional | `"hand-labeled"` (default) or `"reviewer-derived"` (auto-promotion). |
| `authorId` | yes | Operator handle for hand-labeled rows; reviewer ID for derived rows. |
| `notes` | optional | Why this case matters. Surfaced in the dashboard. |
| `id` | optional | Override the gold event UUID. Defaults to a new random one at parse time. |
| `createdAt` | optional | Override the timestamp. Defaults to now. |

### Loader behavior

The runciter's boot loader and `pnpm eval` script both call
`loadGoldSetFromFile` from `@inertial/eval`. The loader:

1. Splits the file on newlines.
2. Skips blank + comment lines.
3. Parses each entry, hydrates the `event` and the `goldEvent` separately.
4. Returns `{ entries, errors }` — bad lines don't kill the whole load.

Persistence is idempotent on `(contentEventId, source)` — re-running the
loader replaces the existing gold for the same (event, source) pair.

## Authoring guidance

- **Bias toward borderline cases.** Models are usually confident on obvious
  examples; calibration matters most where they hedge. Expect probabilities
  near 0.5 with `confidence: "medium"`.
- **Clean cases ARE useful.** A high false-positive rate on clean content
  hurts users; the gold set should include negative examples.
- **Confidence reflects YOUR certainty.** "high" means you're sure of the
  expected probability; "low" means it's a judgment call.
- **Stable UUIDs matter.** The `(contentEventId, source)` upsert means
  changing UUIDs creates orphans. Pick deterministic IDs and keep them.

## Files

- `gold-set-v1.jsonl` — initial 30+ cases spanning toxicity, spam, borderline,
  and clean scenarios. Mirrors the cases in `scripts/seed.mjs` plus
  additional hand-crafted edge cases.
