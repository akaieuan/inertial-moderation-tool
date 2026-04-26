/**
 * Tools — deterministic primitives skills call to read or mutate state.
 *
 * Tools differ from skills in *purpose*:
 *   - Skills produce reasoning output (signal channels, classifications).
 *     They may invoke models, may be probabilistic.
 *   - Tools produce structured data. They hit databases, HTTP endpoints,
 *     filesystems. They are deterministic given their inputs.
 *
 * Every tool call is recorded in the agent trace via SkillContext.callTool().
 * That gives the audit log a complete picture of which side-effects each
 * skill triggered on each event.
 */

export type ToolKind = "db" | "http" | "fs" | "compute";

export interface ToolMeta {
  /** Stable identifier, e.g. "db.author.list-history". */
  name: string;
  /** Semver. */
  version: string;
  /** Coarse classification — used by per-instance allow/block rules. */
  kind: ToolKind;
  /** One-liner for the dashboard's tool-usage panel. */
  description: string;
  /** True iff this tool writes state. Read-only tools can be safely retried. */
  mutates: boolean;
}

export interface ToolContext {
  /** Always present — every tool runs in the context of a specific instance. */
  instanceId: string;
  signal: AbortSignal;
}

export interface Tool<TInput, TOutput> {
  meta: ToolMeta;
  run(input: TInput, ctx: ToolContext): Promise<TOutput>;
}

/**
 * Registry of available tools. The Runciter app builds this at boot from the
 * tools it imports; per-instance allow-lists are enforced at the policy layer
 * (the policy decides which tools the Runciter wires into agent contexts).
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool<unknown, unknown>>();

  register<I, O>(tool: Tool<I, O>): this {
    if (this.tools.has(tool.meta.name)) {
      throw new Error(`tool "${tool.meta.name}" already registered`);
    }
    this.tools.set(tool.meta.name, tool as Tool<unknown, unknown>);
    return this;
  }

  /** Get a tool by name, or undefined if not registered. */
  get<I, O>(name: string): Tool<I, O> | undefined {
    return this.tools.get(name) as Tool<I, O> | undefined;
  }

  /** Get a tool by name, throwing if not registered. */
  require<I, O>(name: string): Tool<I, O> {
    const tool = this.get<I, O>(name);
    if (!tool) throw new Error(`tool "${name}" not registered`);
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): readonly ToolMeta[] {
    return Array.from(this.tools.values()).map((t) => t.meta);
  }
}
