import type { Skill, SkillContext } from "@inertial/core";

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const MODEL_ID = "voyage-3-large";

/** Vector dimension we ask Voyage for — must match `event_embeddings.embedding`. */
const DIMENSIONS = 1536;

/** Defensive cap. voyage-3-large hard-truncates at 32k tokens; 2000 chars is
 *  plenty for a moderation post and keeps free-tier usage low. */
const MAX_INPUT_CHARS = 2000;

export interface TextEmbedInput {
  text: string;
}

export interface TextEmbedOutput {
  embedding: number[];
  model: string;
  /** Tokens consumed by Voyage. Useful for budget tracking + audit. */
  inputTokens: number;
}

export interface VoyageSkillConfig {
  apiKey: string;
}

interface VoyageEmbeddingsResponse {
  object: string;
  data: Array<{ object: string; embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

/**
 * Factory: Voyage embeddings skill bound to a specific API key.
 *
 * Used by both the env-based default boot path AND user-added registrations
 * (the runciter's catalog switch case calls this with the per-registration
 * `providerConfig.apiKey`). Skills emit no channels — the runciter consumes
 * the output directly to populate `event_embeddings`.
 *
 * Privacy posture: dataLeavesMachine = TRUE. Text is sent over HTTPS to
 * Voyage. Operators who can't tolerate this should not enable the skill.
 */
export function makeVoyageEmbedSkill(
  config: VoyageSkillConfig,
): Skill<TextEmbedInput, TextEmbedOutput> {
  if (!config.apiKey) {
    throw new Error("makeVoyageEmbedSkill: apiKey is required");
  }

  return {
    meta: {
      name: "text-embed@voyage",
      version: "0.1.0",
      provider: "voyage",
      executionModel: "remote-api",
      dataLeavesMachine: true,
      costEstimateUsd: 0.00002,
      avgLatencyMs: 400,
      description:
        "voyage-3-large @ 1536-dim — populates event_embeddings for the similar-events context skill",
    },

    async run(input: TextEmbedInput, ctx: SkillContext): Promise<TextEmbedOutput> {
      const text = (input.text ?? "").trim().slice(0, MAX_INPUT_CHARS);
      if (!text) {
        throw new Error("text-embed@voyage: input.text is empty");
      }

      const start = Date.now();
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL_ID,
          input: [text],
          // Voyage uses Matryoshka embeddings — we ask for the 1536-dim slice
          // explicitly so it matches our schema rather than the model default.
          output_dimension: DIMENSIONS,
          input_type: "document",
          truncation: true,
        }),
        signal: ctx.signal,
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const body = await res.text().catch(() => "<unreadable>");
        throw new Error(
          `voyage embeddings ${res.status}: ${body.slice(0, 300)}`,
        );
      }

      const data = (await res.json()) as VoyageEmbeddingsResponse;
      const first = data.data[0];
      if (!first || !Array.isArray(first.embedding)) {
        throw new Error("voyage returned no embedding");
      }
      if (first.embedding.length !== DIMENSIONS) {
        throw new Error(
          `voyage returned ${first.embedding.length}-dim, expected ${DIMENSIONS}`,
        );
      }

      ctx.trace.thought(
        `voyage embed ok: ${data.usage.total_tokens} tokens, ${latencyMs}ms, ${first.embedding.length}-dim`,
      );

      return {
        embedding: first.embedding,
        model: data.model ?? MODEL_ID,
        inputTokens: data.usage.total_tokens,
      };
    },
  };
}

/**
 * Default skill bound to `process.env.VOYAGE_API_KEY`. Used by the runciter
 * boot path when no explicit registration exists. Lazily resolves the key —
 * the factory is constructed on first `.run()` so importing this module
 * doesn't throw when the env var is absent.
 */
let envSkillCache: Skill<TextEmbedInput, TextEmbedOutput> | null = null;
export const textEmbedVoyageSkill: Skill<TextEmbedInput, TextEmbedOutput> = {
  meta: {
    name: "text-embed@voyage",
    version: "0.1.0",
    provider: "voyage",
    executionModel: "remote-api",
    dataLeavesMachine: true,
    costEstimateUsd: 0.00002,
    avgLatencyMs: 400,
    description:
      "voyage-3-large @ 1536-dim — populates event_embeddings for the similar-events context skill",
  },
  async run(input, ctx) {
    if (!envSkillCache) {
      const key = process.env.VOYAGE_API_KEY;
      if (!key) throw new Error("VOYAGE_API_KEY not set");
      envSkillCache = makeVoyageEmbedSkill({ apiKey: key });
    }
    return envSkillCache.run(input, ctx);
  },
};

/** True if `VOYAGE_API_KEY` is set in the environment. Use at boot to decide
 *  whether to register the env-based skill at all. */
export function voyageAvailable(): boolean {
  const key = process.env.VOYAGE_API_KEY;
  return typeof key === "string" && key.length > 0;
}
