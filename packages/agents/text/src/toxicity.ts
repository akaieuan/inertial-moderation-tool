import { BaseAgent, type AgentContext } from "@inertial/core";
import type { ContentEvent, Modality, SignalChannel } from "@inertial/schemas";
import { pipeline, type TextClassificationPipeline } from "@huggingface/transformers";

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
    classifierPromise = pipeline("text-classification", MODEL_ID, {
      // Get all 6 class scores rather than just the top-k.
      // Cast: transformers.js types this loosely.
    }) as Promise<TextClassificationPipeline>;
  }
  return classifierPromise;
}

/**
 * Local-first toxicity classifier. Wraps the toxic-bert ONNX port via
 * transformers.js (WASM in-process, no daemon). Emits a SignalChannel for
 * each Civil Comments label scoring above MIN_PROBABILITY.
 *
 * Cold-start: first call downloads the ONNX weights to ~/.cache/huggingface/hub
 * (~250MB, one-time). Subsequent inferences run in ~50–200ms on a laptop CPU.
 *
 * Privacy posture: dataLeavesMachine = false. The model runs entirely in this
 * Node process; no network call after the initial download.
 */
export class TextToxicityLocalAgent extends BaseAgent {
  readonly name = "text-toxicity-local";
  readonly modalities: readonly Modality[] = ["text"];
  readonly model = MODEL_ID;

  override shouldRun(event: ContentEvent): boolean {
    return Boolean(event.text && event.text.trim().length > 0);
  }

  /** Pre-download + initialize the model. Call at worker startup to avoid
   * a 30-second cold-start on the first event. */
  async warmup(): Promise<void> {
    await getClassifier();
  }

  protected override async analyze(
    event: ContentEvent,
    _ctx: AgentContext,
  ): Promise<SignalChannel[]> {
    const text = event.text?.trim();
    if (!text) return [];

    const classifier = await getClassifier();
    // top_k: 6 returns scores for all 6 toxic-bert labels (toxic, severe_toxic,
    // obscene, threat, insult, identity_hate). Default is 1 (top label only).
    const result = await classifier(text, { top_k: 6 });

    // Normalize: pipeline returns either Array<...> or Array<Array<...>> depending
    // on input shape. We always pass a single string, so unwrap one level.
    const scores = (Array.isArray(result[0]) ? result[0] : result) as Array<{
      label: string;
      score: number;
    }>;

    const evidenceExcerpt = text.slice(0, EVIDENCE_EXCERPT_MAX);
    const channels: SignalChannel[] = [];

    for (const { label, score } of scores) {
      if (score < MIN_PROBABILITY) continue;
      channels.push({
        channel: label,
        probability: score,
        emittedBy: this.name,
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

    return channels;
  }
}
