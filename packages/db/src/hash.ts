import { createHash } from "node:crypto";
import { canonicalJSON } from "./canonical.js";

/**
 * Hex-encoded SHA-256 over (prevHash || canonicalize(payload) || timestamp).
 * Concatenation uses the literal pipe `|` as a separator so two adjacent
 * values can't be confused for one (e.g. `prev=ab cd` vs `prev=abcd`).
 */
export function chainHash(input: {
  prevHash: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
}): string {
  const h = createHash("sha256");
  h.update(input.prevHash ?? "");
  h.update("|");
  h.update(canonicalJSON(input.payload));
  h.update("|");
  h.update(input.timestamp);
  return h.digest("hex");
}
