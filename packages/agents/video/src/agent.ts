import {
  BaseAgent,
  type AgentContext,
  type ImageClassificationInput,
  type SignalOutput,
} from "@inertial/core";
import type { ContentEvent, Modality, SignalChannel } from "@inertial/schemas";
import {
  ffmpegAvailable,
  videoFrameExtractSkill,
  type VideoFrameExtractInput,
  type VideoFrameExtractOutput,
} from "./skills/frame-extract.js";

/**
 * VideoAgent — composes the existing image classifiers over extracted
 * keyframes.
 *
 * The pipeline:
 *  1. For each `video` MediaAsset on the event, call
 *     `video-frame-extract@local` to get N keyframes as new image MediaAssets.
 *  2. For each extracted frame, call whichever image-classification skills
 *     the worker registered (`image-classify@anthropic`, etc.).
 *  3. Wrap each frame's emitted channels with a `video-segment` evidence
 *     pointer so the dashboard can render per-timestamp scores.
 *
 * No video-specific model required — the architecture's claim is that
 * "video is a sequence of images" stays true at the substrate level, and
 * any image classifier auto-generalizes once frames exist.
 *
 * Graceful degrade:
 *  - If ffmpeg isn't on PATH, the frame-extract skill throws and the agent
 *    catches it; the event proceeds with no video signals (other modalities
 *    still work).
 *  - If no image-classification skill is registered (no API key, no local
 *    image classifier yet), only the frame-extracted evidence lands —
 *    visible in the dashboard but no per-frame scores.
 */
export class VideoAgent extends BaseAgent {
  readonly name = "video-agent";
  readonly modalities: readonly Modality[] = ["video"];
  readonly model = "composed";
  override readonly skills: readonly string[];

  constructor(skills?: readonly string[]) {
    super();
    this.skills = skills ?? [
      "video-frame-extract@local",
      "image-classify@anthropic",
    ];
  }

  override shouldRun(event: ContentEvent): boolean {
    return event.modalities.includes("video") && event.media.length > 0;
  }

  protected override async analyze(
    event: ContentEvent,
    ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    const videoAssets = event.media.filter((m) => m.modality === "video");
    if (videoAssets.length === 0) return [];

    // The frame-extract skill is special — it's not a classifier; it
    // produces frames the OTHER skills consume. We invoke it directly
    // instead of via the skill-name list pattern because the output is
    // structured (not just channels).
    const extractAvailable =
      ctx.skills.has("video-frame-extract@local") && (await ffmpegAvailable());
    if (!extractAvailable) {
      ctx.trace.thought(
        "video-agent: no frame-extract skill available — skipping (install ffmpeg or register the skill)",
      );
      return [];
    }

    const allChannels: SignalChannel[] = [];

    for (const asset of videoAssets) {
      // 1. Extract frames.
      let extractResult: VideoFrameExtractOutput;
      try {
        const skill = ctx.skills.require<
          VideoFrameExtractInput,
          VideoFrameExtractOutput
        >("video-frame-extract@local");
        extractResult = await skill.run(
          {
            mediaAssetId: asset.id,
            url: asset.url,
            mimeType: asset.mimeType,
          },
          ctx,
        );
      } catch (err) {
        ctx.trace.error(
          `video-agent: frame extract failed for ${asset.id.slice(0, 8)}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          true,
        );
        continue;
      }

      if (extractResult.frames.length === 0) continue;

      // Always emit a low-probability "video.frames-extracted" channel so
      // the dashboard has a video-segment evidence pointer to render
      // (even when no image classifier is around to score them).
      allChannels.push({
        channel: "video.frames-extracted",
        probability: 0.0, // not a violation signal — this is just metadata
        emittedBy: this.name,
        confidence: 1.0,
        evidence: extractResult.frames.map((f) => ({
          kind: "video-segment" as const,
          mediaAssetId: f.sourceMediaAssetId,
          startSec: f.timestampSec,
          endSec: f.timestampSec + 0.04, // ~one frame at 25fps
          keyframeUrl: f.url,
          label: `${f.timestampSec.toFixed(1)}s`,
        })),
        notes: `${extractResult.frames.length} keyframe(s) extracted from ${
          extractResult.durationSec ? `${extractResult.durationSec.toFixed(1)}s` : "?"
        } video`,
      });

      // 2. For each frame, run any registered image classifiers.
      const imageSkillNames = this.skills.filter(
        (n) => n !== "video-frame-extract@local" && ctx.skills.has(n),
      );
      if (imageSkillNames.length === 0) continue;

      for (const frame of extractResult.frames) {
        for (const skillName of imageSkillNames) {
          try {
            const skill = ctx.skills.require<
              ImageClassificationInput,
              SignalOutput
            >(skillName);
            const out = await skill.run(
              {
                mediaAssetId: frame.id,
                url: frame.url,
                mimeType: frame.mimeType,
                width: frame.width,
                height: frame.height,
                authorId: event.author.id,
                instanceId: event.instance.id,
              },
              ctx,
            );
            // Re-stamp evidence with video-segment pointers so the reviewer
            // sees per-timestamp scores instead of per-frame-image scores.
            for (const ch of out.channels) {
              allChannels.push({
                ...ch,
                emittedBy: `video-agent:${ch.emittedBy}`,
                evidence: [
                  {
                    kind: "video-segment",
                    mediaAssetId: frame.sourceMediaAssetId,
                    startSec: frame.timestampSec,
                    endSec: frame.timestampSec + 0.04,
                    keyframeUrl: frame.url,
                    label: `${ch.channel} @ ${frame.timestampSec.toFixed(1)}s`,
                  },
                ],
              });
            }
          } catch (err) {
            ctx.trace.error(
              `video-agent: ${skillName} failed on frame at ${frame.timestampSec.toFixed(1)}s: ${
                err instanceof Error ? err.message : String(err)
              }`,
              true,
            );
          }
        }
      }
    }

    return allChannels;
  }
}

export {
  videoFrameExtractSkill,
  ffmpegAvailable,
  type ExtractedFrame,
  type VideoFrameExtractInput,
  type VideoFrameExtractOutput,
} from "./skills/frame-extract.js";
