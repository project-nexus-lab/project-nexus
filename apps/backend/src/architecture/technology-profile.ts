import type { SqlExecutor } from "../db/sql-executor.js";
import { ancestry } from "../graph/traversals.js";
import { assertId } from "../ids/ids.js";

/**
 * Technology Profiles — Iteration 15 (`docs/history/iteration-15/SCOPE.md`).
 *
 * `Product x Category -> Technology Profile`, not a flat profile per
 * Product (rejected: a composite catalog id doesn't decompose into
 * queryable facts and grows combinatorially). v1 populates only the
 * `backend` category with one profile; `frontend`/`infrastructure`/`data`
 * exist as category rows from day one so adding a real profile for them
 * later is additive, not a migration.
 *
 * Governance: creating a profile requires citing an existing, `accepted`
 * `architecture.decision` row (checked here — a bare FK can only assert the
 * decision exists, not that its status is `accepted`). Deliberately not
 * routed through `architecture.change_operation` — see Decision 2 in this
 * iteration's own SCOPE.md: that table already carries disclosed,
 * not-mutually-exclusive schema debt (`docs/history/iteration-12/LESSONS.md`)
 * a fourth operation type would inherit, and an assignment has none of the
 * cascading side effects that table's lifecycle exists to govern.
 *
 * Resolution reuses `graph/traversals.ts#ancestry` (§8.4, already validated)
 * to find a Component's Product; there is exactly one attachment point, so
 * no override or nearest-ancestor-wins logic exists here, unlike
 * `governanceOfElements`'s decision/constraint resolution.
 */

export class InvalidTechnologyProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTechnologyProfileError";
  }
}

export class DecisionNotAcceptedError extends Error {
  constructor(public readonly decisionId: string) {
    super(`architecture.decision ${decisionId} does not exist or is not 'accepted'`);
    this.name = "DecisionNotAcceptedError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(public readonly productId: string) {
    super(`${productId} does not exist or is not a 'product' element`);
    this.name = "ProductNotFoundError";
  }
}

export interface CreateTechnologyProfileInput {
  id: string;
  category: string;
  language: string;
  languageVersion: string;
  buildSystem: string;
  /** Must reference an existing, 'accepted' architecture.decision row. */
  decisionId: string;
  /** opaque principal, 'human:<id>' | 'run:<id>' — mirrors change_proposal.authoredBy (§7.1) */
  authoredBy: string;
}

async function assertDecisionAccepted(db: SqlExecutor, decisionId: string): Promise<void> {
  const { rows } = await db.query<{ status: string }>(
    `select status from architecture.decision where id = $1`,
    [decisionId],
  );
  if (rows[0]?.status !== "accepted") {
    throw new DecisionNotAcceptedError(decisionId);
  }
}

/**
 * Creates a Technology Profile. Category and profile-id shape are the DB's
 * own final word (FK to `technology_category`, id CHECK constraint); the one
 * rule the DB cannot express — that the cited Decision is `accepted`, not
 * merely present — is checked here, before the insert.
 */
export async function createTechnologyProfile(
  db: SqlExecutor,
  input: CreateTechnologyProfileInput,
): Promise<{ id: string }> {
  assertId(input.id, "technologyProfile");
  if (!/^(human|run):/.test(input.authoredBy)) {
    throw new InvalidTechnologyProfileError(
      `authoredBy must be 'human:<id>' or 'run:<id>', got '${input.authoredBy}'`,
    );
  }
  await assertDecisionAccepted(db, input.decisionId);

  await db.query(
    `insert into architecture.technology_profile
       (id, category, language, language_version, build_system, decision_id, authored_by)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.id,
      input.category,
      input.language,
      input.languageVersion,
      input.buildSystem,
      input.decisionId,
      input.authoredBy,
    ],
  );

  return { id: input.id };
}

export interface AssignTechnologyProfileInput {
  productId: string;
  category: string;
  profileId: string;
}

/**
 * Assigns an already-existing profile to `(product, category)`. No Decision
 * citation required here — selecting among already-governed options needs
 * none, only creating or modifying a profile does (see module header).
 * Category/profile existence and the profile's own category actually
 * matching are the DB's final word (FK + `product_technology_profile_category_match`
 * trigger); `productId` naming a real, `kind = 'product'` element is
 * checked here first only to give a precise error instead of a raw FK
 * violation.
 */
export async function assignTechnologyProfile(
  db: SqlExecutor,
  input: AssignTechnologyProfileInput,
): Promise<void> {
  const { rows } = await db.query<{ kind: string }>(
    `select kind from architecture.element where id = $1`,
    [input.productId],
  );
  if (rows[0]?.kind !== "product") {
    throw new ProductNotFoundError(input.productId);
  }

  await db.query(
    `insert into architecture.product_technology_profile (product_id, category, profile_id)
     values ($1, $2, $3)
     on conflict (product_id, category) do update set profile_id = excluded.profile_id`,
    [input.productId, input.category, input.profileId],
  );
}

export interface ResolvedTechnologyProfile {
  id: string;
  category: string;
  language: string;
  languageVersion: string;
  buildSystem: string;
  decisionId: string;
}

/**
 * Resolves the Technology Profile governing `componentId`'s category, by
 * walking `componentId` up to its Product via `ancestry()` and looking up
 * `(product_id, category)` — no new traversal, no override chain. Returns
 * `null` when the component's Product has no profile assigned for that
 * category (an unassigned category is a valid state, not an error).
 */
export async function resolveTechnologyProfile(
  db: SqlExecutor,
  componentId: string,
  category: string,
): Promise<ResolvedTechnologyProfile | null> {
  const anc = await ancestry(db, componentId);
  const product = anc.find((row) => row.kind === "product");
  if (!product) {
    throw new InvalidTechnologyProfileError(
      `${componentId} does not exist, or its ancestry contains no 'product' element`,
    );
  }

  const { rows } = await db.query<{
    id: string;
    category: string;
    language: string;
    language_version: string;
    build_system: string;
    decision_id: string;
  }>(
    `select tp.id, tp.category, tp.language, tp.language_version, tp.build_system, tp.decision_id
     from architecture.product_technology_profile ptp
     join architecture.technology_profile tp on tp.id = ptp.profile_id
     where ptp.product_id = $1 and ptp.category = $2`,
    [product.id, category],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    category: row.category,
    language: row.language,
    languageVersion: row.language_version,
    buildSystem: row.build_system,
    decisionId: row.decision_id,
  };
}
