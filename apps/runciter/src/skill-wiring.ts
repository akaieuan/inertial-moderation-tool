/**
 * Catalog → registration wiring.
 *
 * The skill catalog (in @inertial/core) is a static index of what *can* be
 * enabled. The registration table (in @inertial/db) records what an operator
 * actually configured. This module bridges the two: given a row, it knows how
 * to construct the matching Skill instance and register it with the runtime
 * SkillRegistry.
 *
 * Adding a new catalog entry means three changes (in order):
 *   1. New skill implementation in the appropriate @inertial/agents-* package.
 *   2. New `SkillCatalogEntry` in @inertial/core's `skill-catalog.ts`.
 *   3. New `case` here that destructures `providerConfig` and calls the skill's
 *      factory.
 *
 * The default-skills (regex, toxic-bert local, etc.) don't go through this
 * path — they're registered directly in the boot script with `skills.register`.
 */
import type { SkillRegistry } from "@inertial/core";
import { findCatalogEntry } from "@inertial/core";
import type { SkillRegistration } from "@inertial/schemas";
import {
  makeAnthropicImageNsfwSkill,
  makeAnthropicTextToxicitySkill,
  makeVoyageEmbedSkill,
} from "@inertial/agents-cloud";

export interface RegisterFromCatalogResult {
  /** The canonical Skill.meta.name that was registered. Used for hot
   *  block/unblock when the dashboard toggles the registration. */
  skillName: string;
}

/**
 * Register a user-added skill into the live registry. Throws if `catalogId` is
 * unknown or `providerConfig` is missing required fields.
 *
 * Idempotent at the registry level: if the same skill name is already
 * registered (e.g. from the env-based default boot path) this throws via
 * `SkillRegistry.register`. Callers who want to *replace* should
 * `skills.block(name)` first or skip wiring when the skill is already there.
 */
export function registerFromCatalog(
  skills: SkillRegistry,
  reg: SkillRegistration,
): RegisterFromCatalogResult {
  const entry = findCatalogEntry(reg.catalogId);
  if (!entry) {
    throw new Error(
      `unknown catalogId "${reg.catalogId}" — add a SKILL_CATALOG entry first`,
    );
  }

  switch (reg.catalogId) {
    case "voyage-text-embedding": {
      const apiKey = stringConfig(reg, "apiKey");
      skills.register(makeVoyageEmbedSkill({ apiKey }));
      return { skillName: "text-embed@voyage" };
    }
    case "anthropic-text-toxicity": {
      const apiKey = stringConfig(reg, "apiKey");
      skills.register(makeAnthropicTextToxicitySkill({ apiKey }));
      return { skillName: "text-classify-toxicity@anthropic" };
    }
    case "anthropic-image-nsfw": {
      const apiKey = stringConfig(reg, "apiKey");
      skills.register(makeAnthropicImageNsfwSkill({ apiKey }));
      return { skillName: "image-classify@anthropic" };
    }
    // Defaults are registered at boot via direct `skills.register` calls —
    // they shouldn't have rows in skill_registrations. If they do, log and
    // skip (the env-based registration is already the source of truth).
    case "local-text-spam-link":
    case "local-text-toxicity":
    case "local-text-context-author":
    case "local-text-context-similar":
      console.warn(
        `[runciter] skipped catalog wiring for default skill "${reg.catalogId}" — already registered at boot`,
      );
      return { skillName: entry.family };
    default:
      throw new Error(`no wiring case for catalogId "${reg.catalogId}"`);
  }
}

/** Resolve `catalogId` → underlying skill name without instantiating. Useful
 *  for hot toggle endpoints that need to call `skills.block(name)`. */
export function skillNameForCatalogId(catalogId: string): string | undefined {
  return findCatalogEntry(catalogId)?.family;
}

function stringConfig(reg: SkillRegistration, key: string): string {
  const v = reg.providerConfig[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(
      `${reg.catalogId}: providerConfig.${key} required (string, non-empty)`,
    );
  }
  return v;
}
