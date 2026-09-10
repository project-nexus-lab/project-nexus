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
  | "agentRole";

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
