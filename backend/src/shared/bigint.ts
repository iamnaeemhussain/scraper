/**
 * Walks a value recursively and converts everything JSON.stringify can't
 * handle into something it can:
 *
 *   - BigInt → string (JSON.stringify throws on BigInt natively)
 *   - Date   → ISO string (Date.toJSON works on its own, but we recurse into
 *              "object" branches, so we'd otherwise lose Date's special
 *              serialization. Explicit short-circuit keeps it correct.)
 *
 * Use at controller boundaries so internal math/keys stay exact.
 */
export function bigIntToString<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString() as unknown as T;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) {
    return value.map((v) => bigIntToString(v)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = bigIntToString(v);
    }
    return out as T;
  }
  return value;
}
