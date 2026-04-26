import type {
  Skill,
  SkillContext,
  SignalOutput,
  TextClassificationInput,
} from "@inertial/core";
import {
  pipeline,
  type TextClassificationPipeline,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/toxic-bert";

/** Channels below this probability are omitted (per schema: absence is meaningful). */
const MIN_PROBABILITY = 0.5;

/** Self-reported confidence. Calibrated against gold sets by the eval harness. */
const SELF_CONFIDENCE = 0.7;

/** Truncate evidence excerpts so we don't bloat audit payloads. */
const EVIDENCE_EXCERPT_MAX = 200;

let classifierPromise: Promise<TextClassificationPipeline> | null = null;

function getClassifier(): Promise<TextClassificationPipeline> {
  if (!classifierPromise) {
    classifierPromise = pipeline(
      "text-classification",
      MODEL_ID,
    ) as Promise<TextClassificationPipeline>;
  }
  return classifierPromise;
}

/**
 * Local-first toxicity classifier. Wraps the toxic-bert ONNX port via
 * transformers.js (WASM in-process, no daemon).
 *
 * Cold-start: first call downloads the ONNX weights to ~/.cache/huggingface/hub
 * (~250MB, one-time). Subsequent inferences run in ~50–200ms on a laptop CPU.
 *
 * Privacy posture: dataLeavesMachine = false. Model runs entirely in this
 * Node process; no network call after the initial weight download.
 */
export const textToxicityLocalSkill: Skill<TextClassificationInput, SignalOutput> = {
  meta: {
    name: "text-classify-toxicity@local",
    version: "0.1.0",
    provider: "transformers.js",
    executionModel: "in-process",
    dataLeavesMachine: false,
    costEstimateUsd: 0,
    avgLatencyMs: 100,
    description: "toxic-bert ONNX classifier in-process via transformers.js",
  },

  async warmup(): Promise<void> {
    await getClassifier();
  },

  async run(input: TextClassificationInput, _ctx: SkillContext): Promise<SignalOutput> {
    const text = input.text?.trim();
    if (!text) return { channels: [] };

    const classifier = await getClassifier();
    // top_k: 6 returns scores for all 6 toxic-bert labels (toxic, severe_toxic,
    // obscene, threat, insult, identity_hate). Default is 1 (top label only).
    const result = await classifier(text, { top_k: 6 });
    const scores = (Array.isArray(result[0]) ? result[0] : result) as Array<{
      label: string;
      score: number;
    }>;

    const evidenceExcerpt = text.slice(0, EVIDENCE_EXCERPT_MAX);
    const channels: SignalOutput["channels"] = [];

    for (const { label, score } of scores) {
      if (score < MIN_PROBABILITY) continue;
      channels.push({
        channel: label,
        probability: score,
        emittedBy: "text-classify-toxicity@local",
        confidence: SELF_CONFIDENCE,
        evidence: [
          {
            kind: "text-span",
            start: 0,
            end: text.length,
            excerpt: evidenceExcerpt,
          },
        ],
        notes: `${label}: ${score.toFixed(3)}`,
      });
    }

    return { channels };
  },
};
