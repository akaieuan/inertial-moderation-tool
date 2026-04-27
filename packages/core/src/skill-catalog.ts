/**
 * Skill catalog — the *index* of skill modules the dashboard can offer.
 *
 * Skills themselves are code: concrete `Skill<I, O>` implementations living in
 * the @inertial/agents-* packages. This catalog is the discoverable list a
 * reviewer browses when clicking "Add skill" — it tells the dashboard what
 * exists, what config it needs, and how it behaves.
 *
 * Add a new entry here whenever you ship a new skill the user should be able
 * to enable from the dashboard. Entries that need runtime config (typically
 * an API key) declare it via `configFields`. The Runciter holds the matching
 * registration logic in a switch keyed by `catalogId` (apps/runciter/src/skill-wiring.ts).
 *
 * Naming: `catalogId` is `<provider>-<modality>-<task>`. Stable forever once
 * shipped — registrations in the DB store this string.
 */
import type { ExecutionModel } from "./skill.js";

/** A single user-supplied configuration value. */
export interface SkillCatalogConfigField {
  /** Object key used in `SkillRegistration.providerConfig`. */
  key: string;
  /** Display label in the dashboard form. */
  label: string;
  /** Render hint:
   *  - `secret` → password input with show/hide toggle (API keys, tokens)
   *  - `text`   → plain input
   *  - `select` → dropdown over `options` */
  type: "secret" | "text" | "select";
  /** Choices when `type === "select"`. */
  options?: readonly string[];
  required: boolean;
  /** Placeholder rendered inside the input. Often the env var name. */
  placeholder?: string;
  /** Help text rendered under the field. */
  description?: string;
}

export interface SkillCatalogEntry {
  /** Stable identifier — FK from `SkillRegistration.catalogId`. Never change once shipped. */
  catalogId: string;
  /** The skill family this entry resolves to (the canonical `Skill.meta.name`). */
  family: string;
  /** Dashboard-facing label. Tweak freely. */
  displayName: string;
  provider: string;
  executionModel: ExecutionModel;
  dataLeavesMachine: boolean;
  /** USD per call. 0 for in-process / DB-backed skills. */
  costEstimateUsd: number;
  description: string;
  configFields: readonly SkillCatalogConfigField[];
  /** Convenience hint for env-var-aware operators. Shown next to the API-key field. */
  envVarHint?: string;
  /** True for skills the runciter registers automatically on every boot
   *  (no DB row needed). The dashboard renders these with a `default` chip. */
  defaultEnabled: boolean;
}

/**
 * Initial v1 catalog. Every entry here is currently implementable — we don't
 * ship "coming soon" stubs that throw on register.
 */
export const SKILL_CATALOG: readonly SkillCatalogEntry[] = [
  // -- Defaults: registered at boot, no config required --
  {
    catalogId: "local-text-spam-link",
    family: "text-detect-spam-link",
    displayName: "Spam-link detector",
    provider: "regex",
    executionModel: "in-process",
    dataLeavesMachine: false,
    costEstimateUsd: 0,
    description: "Heuristic URL presence check. Tier 0, free.",
    configFields: [],
    defaultEnabled: true,
  },
  {
    catalogId: "local-text-toxicity",
    family: "text-classify-toxicity@local",
    displayName: "Toxic-BERT (local)",
    provider: "transformers.js",
    executionModel: "in-process",
    dataLeavesMachine: false,
    costEstimateUsd: 0,
    description: "ONNX port of toxic-bert running in-process via transformers.js.",
    configFields: [],
    defaultEnabled: true,
  },
  {
    catalogId: "local-text-context-author",
    family: "text-context-author@local",
    displayName: "Author history",
    provider: "db",
    executionModel: "in-process",
    dataLeavesMachine: false,
    costEstimateUsd: 0,
    description: "Reputation context from the author's prior moderated events.",
    configFields: [],
    defaultEnabled: true,
  },
  {
    catalogId: "local-text-context-similar",
    family: "text-context-similar@local",
    displayName: "Similar events",
    provider: "db",
    executionModel: "in-process",
    dataLeavesMachine: false,
    costEstimateUsd: 0,
    description:
      "pgvector cosine search over recent events. Requires an embedding skill (Voyage) to be active.",
    configFields: [],
    defaultEnabled: true,
  },

  // -- User-addable: require config; persisted as SkillRegistration rows --
  {
    catalogId: "anthropic-text-toxicity",
    family: "text-classify-toxicity@anthropic",
    displayName: "Claude toxicity",
    provider: "anthropic",
    executionModel: "remote-api",
    dataLeavesMachine: true,
    costEstimateUsd: 0.003,
    description:
      "Claude Sonnet classifying the same six toxic-bert channels. Stronger on dog-whistles + coded language.",
    envVarHint: "ANTHROPIC_API_KEY",
    configFields: [
      {
        key: "apiKey",
        label: "Anthropic API key",
        type: "secret",
        required: true,
        placeholder: "sk-ant-...",
        description: "Stored in the runciter's `skill_registrations` table.",
      },
    ],
    defaultEnabled: false,
  },
  {
    catalogId: "anthropic-image-nsfw",
    family: "image-classify@anthropic",
    displayName: "Claude vision NSFW",
    provider: "anthropic",
    executionModel: "remote-api",
    dataLeavesMachine: true,
    costEstimateUsd: 0.005,
    description:
      "Multimodal Claude classifying images for NSFW + nudity + violence channels.",
    envVarHint: "ANTHROPIC_API_KEY",
    configFields: [
      {
        key: "apiKey",
        label: "Anthropic API key",
        type: "secret",
        required: true,
        placeholder: "sk-ant-...",
      },
    ],
    defaultEnabled: false,
  },
  {
    catalogId: "voyage-text-embedding",
    family: "text-embed@voyage",
    displayName: "Voyage embeddings",
    provider: "voyage",
    executionModel: "remote-api",
    dataLeavesMachine: true,
    costEstimateUsd: 0.00002,
    description:
      "voyage-3-large at 1536-dim — populates event_embeddings so similar-events context can fire.",
    envVarHint: "VOYAGE_API_KEY",
    configFields: [
      {
        key: "apiKey",
        label: "Voyage API key",
        type: "secret",
        required: true,
        placeholder: "pa-...",
        description:
          "Free tier covers ~50M tokens — enough for dev + small instances.",
      },
    ],
    defaultEnabled: false,
  },
];

/** Lookup helper. Returns undefined for unknown IDs. */
export function findCatalogEntry(catalogId: string): SkillCatalogEntry | undefined {
  return SKILL_CATALOG.find((e) => e.catalogId === catalogId);
}
