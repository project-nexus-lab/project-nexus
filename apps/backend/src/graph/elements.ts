import type { SqlExecutor } from "../db/sql-executor.js";

/**
 * Plain lookups over `architecture.element` — Iteration 13. Deliberately
 * separate from `traversals.ts`'s closed, §8.4 named-traversal set (that
 * file's own header: "the only sanctioned retrieval path" refers to those
 * eight names specifically, backed by `graph.*` SQL functions). These two
 * functions back §9.2's spec'd, never-before-built `architecture.get_element`
 * shape — but as a plain, ungated HTTP surface for human discovery
 * (`docs/history/iteration-13/SCOPE.md`), not a grant-checked MCP tool for
 * agents. No new invariant, no write.
 */

export class ElementNotFoundError extends Error {
  constructor(public readonly elementId: string) {
    super(`architecture element ${elementId} does not exist`);
    this.name = "ElementNotFoundError";
  }
}

export interface ElementDetail {
  id: string;
  kind: string;
  name: string;
  status: string;
  parentId: string | null;
  childIds: string[];
}

/** id -> kind, name, status, parentId, childIds (§9.2 architecture.get_element shape). */
export async function getElement(db: SqlExecutor, id: string): Promise<ElementDetail> {
  const { rows } = await db.query<{
    id: string;
    kind: string;
    name: string;
    status: string;
    parent_id: string | null;
  }>(`select id, kind, name, status, parent_id from architecture.element where id = $1`, [id]);
  const row = rows[0];
  if (!row) throw new ElementNotFoundError(id);

  const { rows: children } = await db.query<{ id: string }>(
    `select id from architecture.element where parent_id = $1 order by id`,
    [id],
  );

  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    status: row.status,
    parentId: row.parent_id,
    childIds: children.map((c) => c.id),
  };
}

export interface ElementSummary {
  id: string;
  kind: string;
  name: string;
  status: string;
}

export interface ListElementsFilter {
  kind?: string | undefined;
  parent?: string | undefined;
}

/**
 * Bounded discovery listing — `kind`/`parent` filters, both optional, fixed
 * cap and no cursor pagination (same postponement §9.6 already states for
 * MCP, applied here). Deterministic retrieval (id/kind/name/status only),
 * not free-text search, consistent with the Constitution's MCP Layer bias
 * applied to a plain human-facing surface instead of an agent tool.
 */
const LIST_ELEMENTS_LIMIT = 200;

export async function listElements(
  db: SqlExecutor,
  filter: ListElementsFilter = {},
): Promise<ElementSummary[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.kind) {
    params.push(filter.kind);
    conditions.push(`kind = $${params.length}`);
  }
  if (filter.parent) {
    params.push(filter.parent);
    conditions.push(`parent_id = $${params.length}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  const { rows } = await db.query<ElementSummary>(
    `select id, kind, name, status from architecture.element ${where}
     order by id limit ${LIST_ELEMENTS_LIMIT}`,
    params,
  );
  return rows;
}
