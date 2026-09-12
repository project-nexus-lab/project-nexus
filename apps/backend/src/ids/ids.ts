import { randomBytes } from "node:crypto";

/**
 * Stable ID Strategy — MVP_ARCHITECTURE_V2 §6.
 *
 * Two ID classes:
 *   - Authored IDs:  <prefix>.<slug>, human-meaningful, immutable, validated here.
 *   - Generated IDs: opaque, machine-minted (wp.<seq>, run.<ulid>, acp.<ulid>).
 *
 * IDs are never repaired or normalised — a string either matches its kind's
 * pattern or it is rejected (§6.2 rule 1: globally unique on the full string).
 */

export type AuthoredKind =
  | "product"
  | "domain"
  | "subsystem"
  | "component"
  | "capability"
  | "decision"
  | "constraint"
  | "repository"
  | "initiative"
  | "epic"
  | "feature"
  | "task"
  | "acceptanceCriterion"
  | "workPackageProfile"
  | "agentRole"
  | "technologyProfile";

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";

/** §6.1 authored-ID prefix table. */
export const AUTHORED_PREFIX: Record<AuthoredKind, string> = {
  product: "prod",
  domain: "dom",
  subsystem: "subsys",
  component: "comp",
  capability: "cap",
  decision: "adr",
  constraint: "con",
  repository: "repo",
  initiative: "init",
  epic: "epic",
  feature: "feat",
  task: "task",
  acceptanceCriterion: "ac",
  workPackageProfile: "wpp",
  agentRole: "role",
  technologyProfile: "tech",
};

const AUTHORED_PATTERN: Record<AuthoredKind, RegExp> = Object.fromEntries(
  Object.entries(AUTHORED_PREFIX).map(([kind, prefix]) => [
    kind,
    new RegExp(`^${prefix}\\.${SLUG}$`),
  ]),
) as Record<AuthoredKind, RegExp>;

/** The four architecture-element kinds share one ID pattern (§7.3 check constraint). */
export const ARCHITECTURE_ELEMENT_ID = /^(prod|dom|subsys|comp|cap)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The four work-item kinds share one ID pattern (§7.4 check constraint). */
export const WORK_ITEM_ID = /^(init|epic|feat|task)\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ULID = "[0-9A-HJKMNP-TV-Z]{26}"; // Crockford base32, excludes I L O U

/** Generated-ID patterns (§6.1). */
export const GENERATED_PATTERN = {
  workPackage: /^wp\.[0-9]+$/,
  executionRun: new RegExp(`^run\\.${ULID}$`),
  changeProposal: new RegExp(`^acp\\.${ULID}$`),
} as const;

export class InvalidIdError extends Error {
  constructor(
    public readonly id: string,
    public readonly kind: string,
  ) {
    super(`invalid id "${id}" for kind "${kind}": expected <prefix>.<slug>`);
    this.name = "InvalidIdError";
  }
}

/** True/false predicate — use `assertId` at ingestion boundaries instead when a thrown error is wanted. */
export function isValidId(id: string, kind: AuthoredKind): boolean {
  const pattern = AUTHORED_PATTERN[kind];
  return pattern.test(id);
}

/** Throws InvalidIdError when `id` does not match the pattern for `kind`. Returns `id` for chaining. */
export function assertId(id: string, kind: AuthoredKind): string {
  if (!isValidId(id, kind)) {
    throw new InvalidIdError(id, kind);
  }
  return id;
}

export function isValidArchitectureElementId(id: string): boolean {
  return ARCHITECTURE_ELEMENT_ID.test(id);
}

export function isValidWorkItemId(id: string): boolean {
  return WORK_ITEM_ID.test(id);
}

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // excludes I L O U, per ULID spec

/**
 * Generates a 26-character Crockford-base32 string matching `GENERATED_PATTERN`
 * (`acp.<ulid>`, `run.<ulid>`). 128 bits of randomness — enough for
 * uniqueness, which is the only property anything in the schema or the
 * traversal layer depends on. True ULID monotonic sortability (a
 * timestamp-prefixed encoding) is not a stated requirement anywhere in
 * MVP_ARCHITECTURE_V2 — only the id *shape* is — so this stays a single
 * self-contained function rather than pulling in a ULID library for a
 * property nothing here uses.
 */
export function generateUlid(): string {
  const bytes = randomBytes(16); // 128 bits
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < 26; i++) {
    const chunk = bits.slice(i * 5, i * 5 + 5).padEnd(5, "0");
    out += CROCKFORD_BASE32[parseInt(chunk, 2)];
  }
  return out;
}

/** The prefix a given architecture element kind must carry. */
export const ARCHITECTURE_KIND_PREFIX: Record<
  "product" | "domain" | "subsystem" | "component" | "capability",
  string
> = {
  product: "prod",
  domain: "dom",
  subsystem: "subsys",
  component: "comp",
  capability: "cap",
};

export const WORK_KIND_PREFIX: Record<
  "initiative" | "epic" | "feature" | "task",
  string
> = {
  initiative: "init",
  epic: "epic",
  feature: "feat",
  task: "task",
};

/**
 * Cross-checks that an ID's literal prefix matches the kind it is declared as
 * in source data (YAML import boundary). The DB check constraint is the
 * ultimate guard (§7.2); this lets import fail fast with a precise message
 * before a single statement reaches Postgres.
 */
export function assertPrefixMatchesKind(
  id: string,
  kind: keyof typeof ARCHITECTURE_KIND_PREFIX | keyof typeof WORK_KIND_PREFIX,
): void {
  const table: Record<string, string> = {
    ...ARCHITECTURE_KIND_PREFIX,
    ...WORK_KIND_PREFIX,
  };
  const expectedPrefix = table[kind];
  if (!expectedPrefix) {
    throw new Error(`unknown kind "${kind}"`);
  }
  const actualPrefix = id.split(".")[0];
  if (actualPrefix !== expectedPrefix) {
    throw new InvalidIdError(id, kind);
  }
}
