import { z } from "zod";

/**
 * Single step in an agent's execution trace.
 * Surfaced in the dashboard via the HITL-KIT MiniTrace primitive.
 *
 * Steps are append-only and ordered. The renderer dispatches by `kind`:
 * - `tool-call` shows a function call with args
 * - `tool-result` shows the structured output
 * - `thought` shows model reasoning (if exposed by the provider)
 * - `decision` marks the agent's emitted signal
 */
export const TraceStepSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tool-call"),
    tool: z.string(),
    args: z.record(z.string(), z.unknown()),
    timestamp: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("tool-result"),
    tool: z.string(),
    result: z.unknown(),
    durationMs: z.number().int().nonnegative(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("thought"),
    content: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("decision"),
    /** Channel name being emitted, matches StructuredSignal.channels key. */
    channel: z.string(),
    probability: z.number().min(0).max(1),
    rationale: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("error"),
    message: z.string(),
    recoverable: z.boolean(),
    timestamp: z.string().datetime(),
  }),
]);
export type TraceStep = z.infer<typeof TraceStepSchema>;

/**
 * Full execution trace for a single agent run.
 * Persisted alongside the StructuredSignal for reviewer transparency and
 * eval-harness replay.
 */
export const AgentTraceSchema = z.object({
  agent: z.string(),
  contentEventId: z.string().uuid(),
  /**
   * Underlying model identifier (e.g. "claude-sonnet-4-5", "gpt-4o", "hf:facebook/bart-large-mnli").
   * Used by eval harness for per-model calibration tracking.
   */
  model: z.string(),
  steps: z.array(TraceStepSchema),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  /** Token usage for cost tracking, if the provider reports it. */
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
      costUsd: z.number().nonnegative().optional(),
    })
    .optional(),
});
export type AgentTrace = z.infer<typeof AgentTraceSchema>;
