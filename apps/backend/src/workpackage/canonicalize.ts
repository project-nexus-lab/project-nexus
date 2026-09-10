import { createHash } from "node:crypto";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Deterministic serialisation (§11.2 step 8: "Sort keys, sort arrays,
 * serialise, hash"). Object keys are sorted recursively; arrays whose
 * elements are all primitives are sorted too, since every array in the
 * payload (capabilities, components, repositories, constraints, decisions,
 * acceptanceCriteria, files) is graph-derived and carries no significance in
 * traversal order — only membership does. This is what makes
 * `buildWorkPackage` a pure function of graph state (§11.1): identical
 * graph state produces byte-identical canonical JSON regardless of the
 * order Postgres happened to return rows in.
 */
export function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    const mapped = value.map(canonicalize);
    const allPrimitive = mapped.every((v) => v === null || typeof v !== "object");
    return allPrimitive ? [...mapped].sort(comparePrimitive) : mapped;
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalize((value as Record<string, JsonValue>)[key]!);
    }
    return sorted;
  }
  return value;
}

function comparePrimitive(a: JsonValue, b: JsonValue): number {
  return String(a).localeCompare(String(b));
}

/** Canonical JSON string. Object key order is already stable after `canonicalize`. */
export function canonicalStringify(value: JsonValue): string {
  return JSON.stringify(value);
}

/** sha256 of the canonical JSON string — the WorkPackage content hash. */
export function contentHash(value: JsonValue): string {
  const canonical = canonicalize(value);
  return createHash("sha256").update(canonicalStringify(canonical)).digest("hex");
}
