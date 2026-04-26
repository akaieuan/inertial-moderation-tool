import {
  BaseAgent,
  type AgentContext,
  type SignalOutput,
  type TextClassificationInput,
} from "@inertial/core";
import type { ContentEvent, Modality, SignalChannel } from "@inertial/schemas";

/**
 * TextAgent — composes whatever text-classification skills the worker
 * registered. It looks up its skills by name from the SkillContext at run
 * time, so an operator can swap `text-classify-toxicity@local` for
 * `text-classify-toxicity@anthropic` (or both) by changing the skill
 * registry — without touching this file.
 *
 * Default composition: spam-link detection always runs (it's free), then
 * whichever toxicity classifier the registry exposes by the canonical
 * `text-classify-toxicity` family. If multiple providers are registered,
 * pass an explicit list via the constructor.
 */
export class TextAgent extends BaseAgent {
  readonly name = "text-agent";
  readonly modalities: readonly Modality[] = ["text"];
  readonly model = "composed";
  override readonly skills: readonly string[];

  constructor(skills?: readonly string[]) {
    super();
    this.skills = skills ?? [
      "text-detect-spam-link",
      "text-classify-toxicity@local",
    ];
  }

  override shouldRun(event: ContentEvent): boolean {
    return event.modalities.includes("text") && Boolean(event.text?.trim());
  }

  protected override async analyze(
    event: ContentEvent,
    ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    const input: TextClassificationInput = {
      text: event.text ?? "",
      authorId: event.author.id,
      instanceId: event.instance.id,
    };

    const settled = await Promise.allSettled(
      this.skills
        .filter((name) => ctx.skills.has(name))
        .map(async (name) => {
          const skill = ctx.skills.require<TextClassificationInput, SignalOutput>(
            name,
          );
          ctx.trace.thought(
            `running ${skill.meta.name} (${skill.meta.provider}, dataLeavesMachine=${skill.meta.dataLeavesMachine})`,
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
        ctx.trace.error(`skill failed: ${message}`, true);
      }
    }
    return channels;
  }
}
