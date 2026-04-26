import { asc, eq } from "drizzle-orm";
import { AgentTraceSchema, type AgentTrace } from "@inertial/schemas";
import type { DbExecutor } from "../executor.js";
import { agentTraces } from "../schema.js";
import { toIso } from "../utils.js";

type TraceRow = typeof agentTraces.$inferSelect;

function rowToTrace(row: TraceRow): AgentTrace {
  return AgentTraceSchema.parse({
    agent: row.agent,
    contentEventId: row.contentEventId,
    model: row.model,
    steps: row.steps,
    startedAt: toIso(row.startedAt),
    endedAt: toIso(row.endedAt),
    ...(row.usageInputTokens !== null ||
    row.usageOutputTokens !== null ||
    row.usageCostUsd !== null
      ? {
          usage: {
            ...(row.usageInputTokens !== null
              ? { inputTokens: row.usageInputTokens }
              : {}),
            ...(row.usageOutputTokens !== null
              ? { outputTokens: row.usageOutputTokens }
              : {}),
            ...(row.usageCostUsd !== null ? { costUsd: Number(row.usageCostUsd) } : {}),
          },
        }
      : {}),
  });
}

export async function saveAgentTrace(db: DbExecutor, trace: AgentTrace): Promise<void> {
  await db.insert(agentTraces).values({
    agent: trace.agent,
    contentEventId: trace.contentEventId,
    model: trace.model,
    steps: trace.steps,
    startedAt: trace.startedAt,
    endedAt: trace.endedAt,
    usageInputTokens: trace.usage?.inputTokens ?? null,
    usageOutputTokens: trace.usage?.outputTokens ?? null,
    usageCostUsd: trace.usage?.costUsd !== undefined ? String(trace.usage.costUsd) : null,
  });
}

export async function listAgentTracesForEvent(
  db: DbExecutor,
  contentEventId: string,
): Promise<AgentTrace[]> {
  const rows = await db
    .select()
    .from(agentTraces)
    .where(eq(agentTraces.contentEventId, contentEventId))
    .orderBy(asc(agentTraces.startedAt));
  return rows.map(rowToTrace);
}
