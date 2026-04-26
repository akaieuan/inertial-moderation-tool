import {
  BaseAgent,
  type AgentContext,
  type ImageClassificationInput,
  type SignalOutput,
} from "@inertial/core";
import type { ContentEvent, Modality, SignalChannel } from "@inertial/schemas";

/**
 * VisionAgent — composes whichever image-classification skills the
 * runciter registered. Mirrors TextAgent: skills are looked up by name
 * from SkillContext at run time, so an operator can swap
 * `image-classify-nsfw@local` for `@anthropic` (or both) by changing the
 * registry, without touching this file.
 *
 * Each registered skill runs once *per image* in `event.media`. Channels
 * from every (skill × image) combination get flattened and returned —
 * the aggregator's max-confidence collision rule then handles duplicates.
 */
export class VisionAgent extends BaseAgent {
  readonly name = "vision-agent";
  readonly modalities: readonly Modality[] = ["image"];
  readonly model = "composed";
  override readonly skills: readonly string[];

  constructor(skills?: readonly string[]) {
    super();
    this.skills = skills ?? ["image-classify@anthropic"];
  }

  override shouldRun(event: ContentEvent): boolean {
    if (!event.modalities.includes("image")) return false;
    return event.media.some((m) => m.modality === "image");
  }

  protected override async analyze(
    event: ContentEvent,
    ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    const images = event.media.filter((m) => m.modality === "image");
    if (images.length === 0) return [];

    const tasks: Array<Promise<SignalOutput>> = [];
    for (const image of images) {
      for (const skillName of this.skills) {
        if (!ctx.skills.has(skillName)) continue;
        const skill = ctx.skills.require<ImageClassificationInput, SignalOutput>(
          skillName,
        );
        ctx.trace.thought(
          `running ${skill.meta.name} on ${image.id} (${skill.meta.provider}, dataLeavesMachine=${skill.meta.dataLeavesMachine})`,
        );
        tasks.push(
          skill.run(
            {
              mediaAssetId: image.id,
              url: image.url,
              mimeType: image.mimeType,
              width: image.width,
              height: image.height,
              authorId: event.author.id,
              instanceId: event.instance.id,
            },
            ctx,
          ),
        );
      }
    }

    const settled = await Promise.allSettled(tasks);
    const channels: SignalChannel[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        channels.push(...result.value.channels);
      } else {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        ctx.trace.error(`vision skill failed: ${message}`, true);
      }
    }
    return channels;
  }
}
