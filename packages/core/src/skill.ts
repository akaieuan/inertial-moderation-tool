/**
 * Skills — discrete capabilities agents compose.
 *
 * A skill is a versioned, swappable unit of capability with a typed input
 * and a typed output. Skills declare their provider, where they execute,
 * and whether they leak data off the operator's machine — so the policy
 * engine can route based on those properties and the audit log can prove
 * what ran on what.
 *
 * Skills compose: a skill may call other skills (via SkillContext.skills) or
 * tools (via SkillContext.callTool, which auto-traces).
 *
 * Naming convention: "<modality>-<task>" is the *family* (e.g.,
 * "text-classify-toxicity"). Multiple providers may register the same name —
 * the registry treats them as alternates and the policy chooses one. Use
 * "<name>@<provider>" notation in policy YAML when disambiguation matters
 * (e.g., "text-classify-toxicity@local" vs "@anthropic").
 */
import type { ExtractedEntity, SignalChannel } from "@inertial/schemas";
import type { TraceCollector } from "./trace.js";
import type { ToolRegistry } from "./tool.js";

export type ExecutionModel = "in-process" | "local-server" | "remote-api";

export interface SkillMeta {
  /** Stable identifier, e.g. "text-classify-toxicity". */
  name: string;
  /** Semver. */
  version: string;
  /** "transformers.js", "anthropic", "ollama", "regex", "openai", etc. */
  provider: string;
  /** Where the skill physically runs. */
  executionModel: ExecutionModel;
  /** True iff input bytes leave the operator's machine on a typical run. */
  dataLeavesMachine: boolean;
  /** Estimated cost per call in USD. 0 for local. Actual cost recorded in trace.usage. */
  costEstimateUsd?: number;
  /** Rough average latency in ms — used by per-modality budget enforcement. */
  avgLatencyMs?: number;
  /** One-liner for the dashboard's capability discovery panel. */
  description?: string;
}

/** Common output shape for moderation skills. */
export interface SignalOutput {
  channels: SignalChannel[];
  entities?: ExtractedEntity[];
}

/** Most text-classification skills accept this input shape. */
export interface TextClassificationInput {
  text: string;
  /** Optional context the skill may use to enrich the classification. */
  authorId?: string;
  instanceId?: string;
}

export interface SkillContext {
  trace: TraceCollector;
  tools: ToolRegistry;
  skills: SkillRegistry;
  signal: AbortSignal;
  runId: string;
  instanceId: string;
  /**
   * Invoke a tool by name. Auto-records `tool-call` and `tool-result` trace
   * steps with timing. Throws if the tool isn't registered. Use this rather
   * than `tools.require(...).run(...)` directly — it keeps traces honest.
   */
  callTool: <I, O>(name: string, input: I) => Promise<O>;
}

export interface Skill<TInput, TOutput> {
  meta: SkillMeta;
  /** Pre-warm any expensive initialization (model download, connection pool).
   * Called once per process at boot via `SkillRegistry.warmupAll()`. */
  warmup?(): Promise<void>;
  run(input: TInput, ctx: SkillContext): Promise<TOutput>;
}

/**
 * Centralized catalog of available skills. Workers build this at boot;
 * per-instance allow/block lists are enforced by the policy layer (which
 * calls .block() on disallowed skills before the registry is exposed to
 * agent contexts).
 */
export class SkillRegistry {
  private readonly skills = new Map<string, Skill<unknown, unknown>>();
  private readonly blocked = new Set<string>();

  /** Register a skill. Throws if a skill with the same name already exists. */
  register<I, O>(skill: Skill<I, O>): this {
    if (this.skills.has(skill.meta.name)) {
      throw new Error(`skill "${skill.meta.name}" already registered`);
    }
    this.skills.set(skill.meta.name, skill as Skill<unknown, unknown>);
    return this;
  }

  /** Mark a skill as disallowed for this registry. Idempotent. */
  block(name: string): this {
    this.blocked.add(name);
    return this;
  }

  unblock(name: string): this {
    this.blocked.delete(name);
    return this;
  }

  /** Get a skill by name. Returns undefined if missing OR blocked. */
  get<I, O>(name: string): Skill<I, O> | undefined {
    if (this.blocked.has(name)) return undefined;
    return this.skills.get(name) as Skill<I, O> | undefined;
  }

  /** Get a skill, throwing with a clear reason if not available. */
  require<I, O>(name: string): Skill<I, O> {
    const skill = this.get<I, O>(name);
    if (!skill) {
      const reason = this.blocked.has(name) ? "blocked by policy" : "not registered";
      throw new Error(`skill "${name}" unavailable: ${reason}`);
    }
    return skill;
  }

  has(name: string): boolean {
    return !this.blocked.has(name) && this.skills.has(name);
  }

  /** All currently-available skill metas. Excludes blocked. */
  list(): readonly SkillMeta[] {
    return Array.from(this.skills.values())
      .filter((s) => !this.blocked.has(s.meta.name))
      .map((s) => s.meta);
  }

  /** Pre-warm every active skill with a warmup() hook. Boot-time. */
  async warmupAll(): Promise<void> {
    await Promise.all(
      Array.from(this.skills.values())
        .filter((s) => !this.blocked.has(s.meta.name) && s.warmup)
        .map((s) => s.warmup!()),
    );
  }
}
