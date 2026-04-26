/**
 * Deterministic JSON serializer for hash-chain integrity.
 *
 * Ordering rules:
 *   - Object keys sorted lexicographically at every level.
 *   - Arrays preserve order (semantic).
 *   - undefined values are dropped (matches JSON.stringify default).
 *   - Strings escape per JSON.stringify; numbers must be finite.
 *
 * This is *not* RFC 8785 — we don't normalize numeric representation — but is
 * sufficient for our threat model: detecting accidental tampering, not
 * defending against adversaries who can rewrite floating-point bits.
 */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    const v = obj[k];
    if (v === undefined) continue;
    out[k] = canonicalize(v);
  }
  return out;
}
