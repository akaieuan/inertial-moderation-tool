import type { AgentTrace, ContentEvent, StructuredSignal } from "@aur/schemas";
import type { BaseAgent, AgentContext } from "./agent.js";
import { TraceCollector } from "./trace.js";
import { aggregate } from "./aggregator.js";

export interface OrchestratorRunResult {
  signal: StructuredSignal;
  traces: AgentTrace[];
}

export interface Orchestrator {
  run(
    event: ContentEvent,
    signal?: AbortSignal,
  ): Promise<OrchestratorRunResult>;
}

export class InMemoryOrchestrator implements Orchestrator {
  constructor(private readonly agents: readonly BaseAgent[]) {}

  async run(
    event: ContentEvent,
    abortSignal?: AbortSignal,
  ): Promise<OrchestratorRunResult> {
    const start = Date.now();
    const dispatched = this.agents.filter((a) => a.shouldRun(event));
    const signal = abortSignal ?? new AbortController().signal;

    const settled = await Promise.allSettled(
      dispatched.map(async (agent) => {
        const trace = new TraceCollector();
        const ctx: AgentContext = { trace, signal, runId: event.id };
        const { channels, trace: agentTrace } = await agent.run(event, ctx);
        return { agent: agent.name, channels, trace: agentTrace };
      }),
    );

    const results: Array<{
      agent: string;
      channels: StructuredSignal["channels"][string][];
    }> = [];
    const failures: Array<{ agent: string; error: string }> = [];
    const traces: AgentTrace[] = [];

    settled.forEach((res, i) => {
      const agentName = dispatched[i]?.name ?? "unknown";
      if (res.status === "fulfilled") {
        results.push({
          agent: res.value.agent,
          channels: res.value.channels,
        });
        traces.push(res.value.trace);
      } else {
        const err = res.reason;
        failures.push({
          agent: agentName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    const aggregated = aggregate({
      contentEventId: event.id,
      results,
      failures,
      latencyMs: Date.now() - start,
    });

    return { signal: aggregated, traces };
  }
}
