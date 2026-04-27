import Anthropic from "@anthropic-ai/sdk";
import type {
  Skill,
  SkillContext,
  SignalOutput,
  TextClassificationInput,
} from "@inertial/core";
import type { SignalChannel } from "@inertial/schemas";

const MODEL_ID = "claude-sonnet-4-6";
const MIN_PROBABILITY = 0.5;
const SELF_CONFIDENCE = 0.85;

/** The six toxic-bert labels — same family as the local classifier so the
 * policy engine can compare apples to apples. */
const CHANNELS = [
  "toxic",
  "severe_toxic",
  "obscene",
  "threat",
  "insult",
  "identity_hate",
] as const;
type Channel = (typeof CHANNELS)[number];

const SYSTEM_PROMPT = `You are a content-moderation classifier. Given a piece of user-generated text, score how strongly each of the following six categories applies, on a 0.0 to 1.0 scale:

- toxic: rude, disrespectful, or unreasonably aggressive
- severe_toxic: extreme toxicity that would warrant removal even from heated discourse
- obscene: pornographic or graphic sexual language
- threat: explicit or veiled threats of violence or harm
- insult: targeted personal attacks
- identity_hate: hate speech targeting protected attributes (race, religion, gender, sexuality, etc.)

Score conservatively — most ordinary language should score low. A subtle threat ("I'll find you and you'll regret it") is still a threat. Coded slurs and dog-whistles count.

Respond with JSON only, exactly this shape:
{"toxic": 0.0, "severe_toxic": 0.0, "obscene": 0.0, "threat": 0.0, "insult": 0.0, "identity_hate": 0.0, "rationale": "brief reasoning"}`;

export interface AnthropicSkillConfig {
  apiKey: string;
}

function isApiKeyAvailable(): string | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key.length > 0 ? key : null;
}

/**
 * Factory: text-toxicity classifier bound to a specific Anthropic API key.
 *
 * Used by the dashboard's catalog wiring (per-registration keys) and by the
 * env-based default skill below (single shared key). Each factory call returns
 * a self-contained Skill with its own Anthropic client — no shared mutable state.
 */
export function makeAnthropicTextToxicitySkill(
  config: AnthropicSkillConfig,
): Skill<TextClassificationInput, SignalOutput> {
  if (!config.apiKey) {
    throw new Error("makeAnthropicTextToxicitySkill: apiKey is required");
  }
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    meta: {
      name: "text-classify-toxicity@anthropic",
      version: "0.1.0",
      provider: "anthropic",
      executionModel: "remote-api",
      dataLeavesMachine: true,
      costEstimateUsd: 0.003,
      avgLatencyMs: 1500,
      description: "Claude Sonnet classifying the same six toxic-bert channels",
    },

    async run(
      input: TextClassificationInput,
      ctx: SkillContext,
    ): Promise<SignalOutput> {
      const text = input.text?.trim();
      if (!text) return { channels: [] };

      const start = Date.now();
      const response = await client.messages.create({
        model: MODEL_ID,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
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
      const evidenceExcerpt = text.slice(0, 200);

      const channels: SignalChannel[] = [];
      for (const channel of CHANNELS) {
        const raw = parsed[channel];
        const score = typeof raw === "number" && raw >= 0 && raw <= 1 ? raw : 0;
        if (score < MIN_PROBABILITY) continue;
        channels.push({
          channel,
          probability: score,
          emittedBy: "text-classify-toxicity@anthropic",
          confidence: SELF_CONFIDENCE,
          evidence: [
            { kind: "text-span", start: 0, end: text.length, excerpt: evidenceExcerpt },
          ],
          notes: rationale
            ? `${channel}: ${score.toFixed(3)} — ${rationale}`
            : `${channel}: ${score.toFixed(3)}`,
        });
      }

      ctx.trace.thought(
        `anthropic returned in ${latencyMs}ms: ${channels.length} channel(s) above ${MIN_PROBABILITY}`,
      );
      return { channels };
    },
  };
}

/**
 * Default skill bound to `process.env.ANTHROPIC_API_KEY`. Used by the runciter
 * boot path when no explicit registration exists. Lazily resolves the key —
 * importing this module never throws when the env var is absent.
 *
 * Cloud toxicity classifier. Same channel family as the local classifier so
 * the policy engine can swap or combine them. Significantly stronger on
 * subtle threats, dog-whistles, and coded language — and significantly more
 * expensive ($0.001-0.005 per text event).
 *
 * Privacy posture: dataLeavesMachine = TRUE.
 */
let envSkillCache: Skill<TextClassificationInput, SignalOutput> | null = null;
export const textToxicityAnthropicSkill: Skill<TextClassificationInput, SignalOutput> = {
  meta: {
    name: "text-classify-toxicity@anthropic",
    version: "0.1.0",
    provider: "anthropic",
    executionModel: "remote-api",
    dataLeavesMachine: true,
    costEstimateUsd: 0.003,
    avgLatencyMs: 1500,
    description: "Claude Sonnet classifying the same six toxic-bert channels",
  },
  async run(input, ctx) {
    if (!envSkillCache) {
      const key = isApiKeyAvailable();
      if (!key) {
        ctx.trace.error(
          "ANTHROPIC_API_KEY not set — text-classify-toxicity@anthropic skipped",
          true,
        );
        return { channels: [] };
      }
      envSkillCache = makeAnthropicTextToxicitySkill({ apiKey: key });
    }
    return envSkillCache.run(input, ctx);
  },
};

/** True if `ANTHROPIC_API_KEY` is set in the environment. Use this at boot to
 * decide whether to register the skill at all. */
export function anthropicAvailable(): boolean {
  return isApiKeyAvailable() !== null;
}
