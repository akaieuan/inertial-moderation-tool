import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ImageClassificationInput,
  Skill,
  SkillContext,
  SignalOutput,
} from "@inertial/core";
import type { SignalChannel } from "@inertial/schemas";

const MODEL_ID = "claude-sonnet-4-6";
const MIN_PROBABILITY = 0.5;
const SELF_CONFIDENCE = 0.9;

/**
 * The four channels this skill scores. Same channel-naming convention as the
 * other classifiers — `<modality>_<task>` — so policy rules read uniformly.
 */
const CHANNELS = [
  "image_nsfw",
  "image_violence",
  "image_minor_present",
  "image_self_harm",
] as const;

const SYSTEM_PROMPT = `You are a content-moderation image classifier. Given an image, score how strongly each of the following four categories applies, on a 0.0 to 1.0 scale:

- image_nsfw: explicit sexual content, full or implied nudity, pornographic imagery
- image_violence: gore, blood, weapons being used, depicted physical violence
- image_minor_present: identifiable presence of children or minors in the frame
- image_self_harm: visible self-injury, suicidal imagery, content depicting self-harm

Score conservatively — most ordinary images should score low. A picture of a sunset is 0.0 across the board. A swimsuit catalog is moderate on image_nsfw but not high. Score "image_minor_present" only when minors are clearly identifiable subjects, not background extras at a public event.

Respond with JSON only, exactly this shape:
{"image_nsfw": 0.0, "image_violence": 0.0, "image_minor_present": 0.0, "image_self_harm": 0.0, "rationale": "brief reasoning, ≤ 30 words"}`;

function isApiKeyAvailable(): string | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key.length > 0 ? key : null;
}

export interface AnthropicImageSkillConfig {
  apiKey: string;
}

interface Base64Source {
  data: string;
  mediaType: string;
}

/**
 * Download (or read) the image and return base64 + MIME for the Anthropic
 * messages API. We base64 even for HTTP URLs because Claude restricts URL
 * sources to a small allowlist of providers; redirecting through base64
 * removes that constraint at the cost of one extra download per call.
 */
async function buildImageSource(
  input: ImageClassificationInput,
): Promise<Base64Source> {
  let buf: Buffer;
  let mediaType = input.mimeType;
  if (input.url.startsWith("file://")) {
    buf = await readFile(fileURLToPath(input.url));
  } else {
    const res = await fetch(input.url, { redirect: "follow" });
    if (!res.ok) {
      throw new Error(`failed to fetch image ${input.url}: HTTP ${res.status}`);
    }
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.startsWith("image/")) {
      // Trust the upstream content-type over the input MediaAsset hint.
      mediaType = contentType.split(";")[0]!.trim();
    }
    buf = Buffer.from(await res.arrayBuffer());
  }
  return { data: buf.toString("base64"), mediaType };
}

/**
 * Factory: image-NSFW classifier bound to a specific Anthropic API key. Each
 * factory call creates a fresh Anthropic client — no shared mutable state.
 */
export function makeAnthropicImageNsfwSkill(
  config: AnthropicImageSkillConfig,
): Skill<ImageClassificationInput, SignalOutput> {
  if (!config.apiKey) {
    throw new Error("makeAnthropicImageNsfwSkill: apiKey is required");
  }
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    meta: {
      name: "image-classify@anthropic",
      version: "0.1.0",
      provider: "anthropic",
      executionModel: "remote-api",
      dataLeavesMachine: true,
      costEstimateUsd: 0.012,
      avgLatencyMs: 2500,
      description: "Claude Vision multi-category image moderation classifier",
    },

    async run(
      input: ImageClassificationInput,
      ctx: SkillContext,
    ): Promise<SignalOutput> {
      const start = Date.now();
      const source = await buildImageSource(input);
      const response = await client.messages.create({
        model: MODEL_ID,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  // The Anthropic SDK types `media_type` as a closed union of
                  // image/jpeg|png|gif|webp; we cast at the boundary because
                  // the upstream content-type may legitimately be any of them.
                  media_type: source.mediaType as "image/jpeg",
                  data: source.data,
                },
              },
              { type: "text", text: "Classify this image." },
            ],
          },
        ],
      });
      const latencyMs = Date.now() - start;

      const block = response.content[0];
      if (!block || block.type !== "text") {
        ctx.trace.error("anthropic returned no text content block", true);
        return { channels: [] };
      }

      let parsed: Record<string, unknown>;
      try {
        const cleaned = block.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
        parsed = JSON.parse(cleaned);
      } catch (err) {
        ctx.trace.error(
          `failed to parse anthropic JSON: ${err instanceof Error ? err.message : String(err)}`,
          true,
        );
        return { channels: [] };
      }

      const rationale =
        typeof parsed["rationale"] === "string" ? (parsed["rationale"] as string) : "";

      const channels: SignalChannel[] = [];
      for (const channel of CHANNELS) {
        const raw = parsed[channel];
        const score = typeof raw === "number" && raw >= 0 && raw <= 1 ? raw : 0;
        if (score < MIN_PROBABILITY) continue;
        channels.push({
          channel,
          probability: score,
          emittedBy: "image-classify@anthropic",
          confidence: SELF_CONFIDENCE,
          evidence: [
            {
              kind: "image-region",
              mediaAssetId: input.mediaAssetId,
              bbox: { x: 0, y: 0, w: 1, h: 1 },
              label: channel,
            },
          ],
          notes: rationale
            ? `${channel}: ${score.toFixed(3)} — ${rationale}`
            : `${channel}: ${score.toFixed(3)}`,
        });
      }

      ctx.trace.thought(
        `claude vision returned in ${latencyMs}ms: ${channels.length} channel(s) above ${MIN_PROBABILITY}`,
      );
      return { channels };
    },
  };
}

/**
 * Default skill bound to `process.env.ANTHROPIC_API_KEY`. Lazily resolves the
 * key — importing this module never throws when the env var is absent.
 *
 * Cloud vision moderation. Calls Claude with a single image plus a
 * deterministic JSON-only system prompt; emits up to four signal channels
 * (nsfw, violence, minor_present, self_harm). Whole-image evidence —
 * Claude doesn't return bboxes, so the bbox is `{0,0,1,1}`.
 *
 * Privacy posture: dataLeavesMachine = TRUE. The image bytes are sent to
 * Anthropic over HTTPS.
 *
 * Cost (approx, per image at typical sizes): $0.005–$0.02.
 */
let envSkillCache: Skill<ImageClassificationInput, SignalOutput> | null = null;
export const imageNsfwAnthropicSkill: Skill<ImageClassificationInput, SignalOutput> = {
  meta: {
    name: "image-classify@anthropic",
    version: "0.1.0",
    provider: "anthropic",
    executionModel: "remote-api",
    dataLeavesMachine: true,
    costEstimateUsd: 0.012,
    avgLatencyMs: 2500,
    description: "Claude Vision multi-category image moderation classifier",
  },
  async run(input, ctx) {
    if (!envSkillCache) {
      const key = isApiKeyAvailable();
      if (!key) {
        ctx.trace.error(
          "ANTHROPIC_API_KEY not set — image-classify@anthropic skipped",
          true,
        );
        return { channels: [] };
      }
      envSkillCache = makeAnthropicImageNsfwSkill({ apiKey: key });
    }
    return envSkillCache.run(input, ctx);
  },
};
