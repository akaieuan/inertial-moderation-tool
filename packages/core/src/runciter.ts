import type { AgentTrace, ContentEvent, StructuredSignal } from "@inertial/schemas";
import type { AgentContext, BaseAgent } from "./agent.js";
import { TraceCollector } from "./trace.js";
import { aggregate } from "./aggregator.js";
import { SkillRegistry } from "./skill.js";
import { ToolRegistry } from "./tool.js";
import { makeSkillContext } from "./context.js";

export interface RunciterRunResult {
  signal: StructuredSignal;
  traces: AgentTrace[];
}

/**
 * A Runciter dispatches inertials (agents) at incoming ContentEvents and
 * aggregates the StructuredSignals they emit. Named for Glen Runciter, the
 * operator in PKD's _Ubik_ who runs the prudence organization that dispatches
 * inertials to neutralize harmful psychic intrusion.
 */
export interface Runciter {
  run(
    event: ContentEvent,
    signal?: AbortSignal,
  ): Promise<RunciterRunResult>;
}

export interface InMemoryRunciterOptions {
  agents: readonly BaseAgent[];
  /** Optional — if omitted, an empty registry is used. Skills can still be
   * called via direct imports, but the policy layer can't gate them. */
  skills?: SkillRegistry;
  /** Optional — if omitted, an empty registry is used. */
  tools?: ToolRegistry;
}

export class InMemoryRunciter implements Runciter {
  private readonly agents: readonly BaseAgent[];
  private readonly skills: SkillRegistry;
  private readonly tools: ToolRegistry;

  constructor(options: InMemoryRunciterOptions | readonly BaseAgent[]) {
    // Backwards-compatibility: callers that pass a bare agent array still work.
    if (Array.isArray(options)) {
      this.agents = options;
      this.skills = new SkillRegistry();
      this.tools = new ToolRegistry();
    } else {
      const opts = options as InMemoryRunciterOptions;
      this.agents = opts.agents;
      this.skills = opts.skills ?? new SkillRegistry();
      this.tools = opts.tools ?? new ToolRegistry();
    }
  }

  async run(
    event: ContentEvent,
    abortSignal?: AbortSignal,
  ): Promise<RunciterRunResult> {
    const start = Date.now();
    const dispatched = this.agents.filter((a) => a.shouldRun(event));
    const signal = abortSignal ?? new AbortController().signal;
    const instanceId = event.instance.id;

    const settled = await Promise.allSettled(
      dispatched.map(async (agent) => {
        const trace = new TraceCollector();
        const ctx: AgentContext = makeSkillContext({
          trace,
          tools: this.tools,
          skills: this.skills,
          signal,
          runId: event.id,
          instanceId,
        });
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

