import type { TraceCollector } from "./trace.js";
import type { SkillContext } from "./skill.js";
import type { SkillRegistry } from "./skill.js";
import type { ToolRegistry } from "./tool.js";

export interface MakeSkillContextOptions {
  trace: TraceCollector;
  tools: ToolRegistry;
  skills: SkillRegistry;
  signal: AbortSignal;
  runId: string;
  instanceId: string;
}

/**
 * Build a SkillContext with the auto-tracing `callTool` wrapper.
 *
 * The Runciter uses this to construct the context it hands to each
 * agent's `analyze()`. It's also exposed publicly so callers (e.g. the
 * Runciter app handling policy escalations) can build a context outside the
 * orchestrator and run skills directly with full trace fidelity.
 */
export function makeSkillContext(opts: MakeSkillContextOptions): SkillContext {
  const callTool = async <I, O>(name: string, input: I): Promise<O> => {
    opts.trace.toolCall(name, input as unknown as Record<string, unknown>);
    const start = Date.now();
    try {
      const tool = opts.tools.require<I, O>(name);
      const result = await tool.run(input, {
        instanceId: opts.instanceId,
        signal: opts.signal,
      });
      opts.trace.toolResult(name, result, Date.now() - start);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.trace.error(`tool ${name} failed: ${message}`, true);
      throw err;
    }
  };
  return {
    trace: opts.trace,
    tools: opts.tools,
    skills: opts.skills,
    signal: opts.signal,
    runId: opts.runId,
    instanceId: opts.instanceId,
    callTool,
  };
}
