import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  ContentEventSchema,
  GoldEventSchema,
  GoldEventSourceSchema,
  ExpectedChannelSchema,
  PolicyActionSchema,
  type ContentEvent,
  type GoldEvent,
} from "@inertial/schemas";

/**
 * JSONL gold-set file format — one entry per line, fully self-contained:
 *
 *   {
 *     "event": { ...full ContentEvent... },
 *     "expectedChannels": { "toxic": { "probability": 0.9, "confidence": "high" } },
 *     "expectedAction": { "kind": "queue.quick", "reason": "..." },
 *     "source": "hand-labeled",
 *     "authorId": "ieuan@local",
 *     "notes": "optional"
 *   }
 *
 * Each entry hydrates into TWO things:
 *  - The ContentEvent (inserted into `content_events` if not present)
 *  - The GoldEvent (inserted into `gold_events`, keyed by contentEventId+source)
 *
 * Blank lines and `//` / `#` comment lines are tolerated to keep hand-written
 * gold sets readable. `id` and `createdAt` on the GoldEvent default to
 * server-assigned values when missing.
 */
const RawGoldEntrySchema = z.object({
  event: ContentEventSchema,
  expectedChannels: z.record(z.string(), ExpectedChannelSchema),
  expectedAction: PolicyActionSchema.optional(),
  source: GoldEventSourceSchema.default("hand-labeled"),
  authorId: z.string(),
  notes: z.string().optional(),
  /** Optional override — defaults to randomUUID() at parse time. */
  id: z.string().uuid().optional(),
  /** Optional override — defaults to `now` at parse time. */
  createdAt: z.string().datetime().optional(),
});

export interface ParseGoldSetOptions {
  /** Override every entry's instanceId (rewriting `event.instance.id` AND
   *  the gold's `instanceId`). Useful when one JSONL serves multiple instances. */
  instanceId?: string;
  /** Override every entry's source. */
  source?: GoldEvent["source"];
  /** Author handle to stamp on every entry. */
  authorId?: string;
}

export interface LoadedGoldEntry {
  event: ContentEvent;
  goldEvent: GoldEvent;
}

export interface ParseGoldSetResult {
  entries: LoadedGoldEntry[];
  /** Lines that failed to parse, with line number + reason. The caller logs
   *  these — we don't throw because one bad line shouldn't kill the whole load. */
  errors: Array<{ line: number; reason: string }>;
}

export function parseGoldSetJsonl(
  text: string,
  opts: ParseGoldSetOptions = {},
): ParseGoldSetResult {
  const entries: LoadedGoldEntry[] = [];
  const errors: Array<{ line: number; reason: string }> = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      errors.push({
        line: i + 1,
        reason: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const rawResult = RawGoldEntrySchema.safeParse(parsed);
    if (!rawResult.success) {
      errors.push({
        line: i + 1,
        reason: rawResult.error.issues
          .map((iss) => `${iss.path.join(".")}: ${iss.message}`)
          .join("; "),
      });
      continue;
    }
    const entry = rawResult.data;

    // Apply instance override to both the embedded event and the gold row.
    let event = entry.event;
    if (opts.instanceId) {
      event = {
        ...event,
        instance: { ...event.instance, id: opts.instanceId },
      };
    }

    const goldRaw = {
      id: entry.id ?? randomUUID(),
      contentEventId: event.id,
      instanceId: opts.instanceId ?? event.instance.id,
      expectedChannels: entry.expectedChannels,
      expectedAction: entry.expectedAction,
      source: opts.source ?? entry.source,
      authorId: opts.authorId ?? entry.authorId,
      notes: entry.notes,
      createdAt: entry.createdAt ?? new Date().toISOString(),
    };

    const goldResult = GoldEventSchema.safeParse(goldRaw);
    if (!goldResult.success) {
      errors.push({
        line: i + 1,
        reason: goldResult.error.issues
          .map((iss) => `${iss.path.join(".")}: ${iss.message}`)
          .join("; "),
      });
      continue;
    }

    entries.push({ event, goldEvent: goldResult.data });
  }

  return { entries, errors };
}

/** Node-only: read a JSONL file from disk + parse it. */
export async function loadGoldSetFromFile(
  path: string,
  opts: ParseGoldSetOptions = {},
): Promise<ParseGoldSetResult> {
  const text = await readFile(path, "utf8");
  return parseGoldSetJsonl(text, opts);
}
