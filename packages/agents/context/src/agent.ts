import {
  BaseAgent,
  type AgentContext,
  type SignalOutput,
} from "@inertial/core";
import type { ContentEvent, Modality, SignalChannel } from "@inertial/schemas";
import type { ContextSkillInput } from "./skills/author-context.js";

/**
 * ContextAgent — composes whichever context skills the worker registered.
 *
 * Mirrors the TextAgent pattern: looks up its skills by name from the
 * SkillContext at run time so an operator can swap or disable them via the
 * skill registry without touching this file.
 *
 * Default composition:
 *  - text-context-author@local — author reputation lookup (always works, DB-only)
 *  - text-context-similar@local — pgvector similarity (degrades to no-op when
 *    no embedding exists for the event)
 *
 * Runs on every event regardless of modality — context is universally useful.
 */
export class ContextAgent extends BaseAgent {
  readonly name = "context-agent";
  readonly modalities: readonly Modality[] = ["text", "image", "video", "audio", "link"];
  readonly model = "composed";
  override readonly skills: readonly string[];

  constructor(skills?: readonly string[]) {
    super();
    this.skills = skills ?? [
      "text-context-author@local",
      "text-context-similar@local",
    ];
  }

  // Always run — context is useful for every event regardless of modality.
  override shouldRun(_event: ContentEvent): boolean {
    return true;
  }

  protected override async analyze(
    event: ContentEvent,
    ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    const input: ContextSkillInput = {
      contentEventId: event.id,
      authorId: event.author.id,
      instanceId: event.instance.id,
    };

    const settled = await Promise.allSettled(
      this.skills
        .filter((name) => ctx.skills.has(name))
        .map(async (name) => {
          const skill = ctx.skills.require<ContextSkillInput, SignalOutput>(name);
          ctx.trace.thought(
            `running ${skill.meta.name} (${skill.meta.provider})`,
          );
          return skill.run(input, ctx);
        }),
    );

    const channels: SignalChannel[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        channels.push(...result.value.channels);
      } else {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        ctx.trace.error(`context skill failed: ${message}`, true);
      }
    }
    return channels;
  }
}
