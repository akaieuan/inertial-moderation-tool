/**
 * Repository-side helpers for the Postgres ↔ Zod boundary.
 *
 * Postgres returns timestamps in its own format ("2026-04-25 12:00:00+00")
 * and nulls for empty nullable columns. Our Zod contracts use ISO 8601
 * strings (`.datetime()`) and `.optional()` (undefined, not null) for some
 * fields. These two helpers normalize both crossings in one place so every
 * `rowToX()` reads cleanly.
 */

/** Postgres timestamp → ISO 8601 (millisecond precision). */
export function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

/** Same as above but passes through null/undefined for optional columns. */
export function toIsoOpt(
  value: string | Date | null | undefined,
): string | undefined {
  return value == null ? undefined : new Date(value).toISOString();
}

/** DB null → undefined, for Zod `.optional()` (non-nullable) fields. */
export function nullToUndef<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}
