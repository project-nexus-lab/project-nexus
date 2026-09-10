import type { SqlExecutor } from "../db/sql-executor.js";

/**
 * TypeScript-facing wrappers over the named traversals defined in
 * `db/migrations/0007_graph.sql` (MVP_ARCHITECTURE_V2 §8.4). These are the
 * only sanctioned retrieval path — callers never write ad-hoc joins.
 */

export interface AncestryRow {
  id: string;
  kind: string;
  name: string;
  depth: number;
}

/** element →CONTAINS*→ root. Includes the element itself at depth 0. */
export async function ancestry(db: SqlExecutor, elementId: string): Promise<AncestryRow[]> {
  const { rows } = await db.query<AncestryRow>(`select * from graph.ancestry($1)`, [elementId]);
  return rows;
}

export interface ProviderRow {
  component_id: string;
  is_primary: boolean;
}

/** Capability ←PROVIDES← Component */
export async function providersOf(db: SqlExecutor, capabilityId: string): Promise<ProviderRow[]> {
  const { rows } = await db.query<ProviderRow>(`select * from graph.providers_of($1)`, [
    capabilityId,
  ]);
  return rows;
}

export interface CapabilityRow {
  capability_id: string;
  is_primary: boolean;
}

/** Component →PROVIDES→ Capability */
export async function capabilitiesOf(
  db: SqlExecutor,
  componentId: string,
): Promise<CapabilityRow[]> {
  const { rows } = await db.query<CapabilityRow>(`select * from graph.capabilities_of($1)`, [
    componentId,
  ]);
  return rows;
}

export interface ImplementationPathRow {
  capability_id: string;
  component_id: string | null;
  provider_is_primary: boolean | null;
  repository_id: string | null;
  repo_is_primary: boolean | null;
}

/**
 * Task→AFFECTS→Capability←PROVIDES←Component←IMPLEMENTS←Repository.
 * Raw, multi-valued graph — Work Package generation applies the §4.3
 * repository-resolution order on top of this.
 */
export async function implementationPath(
  db: SqlExecutor,
  taskId: string,
): Promise<ImplementationPathRow[]> {
  const { rows } = await db.query<ImplementationPathRow>(
    `select * from graph.implementation_path($1)`,
    [taskId],
  );
  return rows;
}

export interface ImpactRow {
  component_id: string;
  distance: number;
}

/** Component→DEPENDS_ON{1..depth}→Component */
export async function impactOf(
  db: SqlExecutor,
  componentId: string,
  depth: number,
): Promise<ImpactRow[]> {
  const { rows } = await db.query<ImpactRow>(`select * from graph.impact_of($1, $2)`, [
    componentId,
    depth,
  ]);
  return rows;
}

export interface GovernanceRow {
  decision_id: string | null;
  constraint_id: string | null;
  via_element_id: string;
  depth: number;
}

/** ancestry(element) ←GOVERNS/CONSTRAINS← Decision/Constraint, single element. */
export async function governanceOf(
  db: SqlExecutor,
  elementId: string,
): Promise<GovernanceRow[]> {
  const { rows } = await db.query<GovernanceRow>(`select * from graph.governance_of($1)`, [
    elementId,
  ]);
  return rows;
}

/**
 * Resolved governance for a *set* of elements — the Work Package form
 * (§11.2 step 6): union of each element's ancestry-governance, nearest
 * ancestor wins when the same decision/constraint is reachable via more
 * than one element.
 */
export async function governanceOfElements(
  db: SqlExecutor,
  elementIds: string[],
): Promise<{ decisions: string[]; constraints: string[] }> {
  const nearestDepth = new Map<string, number>(); // key: `d:<id>` | `c:<id>`

  for (const elementId of elementIds) {
    for (const row of await governanceOf(db, elementId)) {
      if (row.decision_id) {
        const key = `d:${row.decision_id}`;
        const existing = nearestDepth.get(key);
        if (existing === undefined || row.depth < existing) nearestDepth.set(key, row.depth);
      }
      if (row.constraint_id) {
        const key = `c:${row.constraint_id}`;
        const existing = nearestDepth.get(key);
        if (existing === undefined || row.depth < existing) nearestDepth.set(key, row.depth);
      }
    }
  }

  const decisions: string[] = [];
  const constraints: string[] = [];
  for (const key of nearestDepth.keys()) {
    if (key.startsWith("d:")) decisions.push(key.slice(2));
    else constraints.push(key.slice(2));
  }
  return { decisions: decisions.sort(), constraints: constraints.sort() };
}

/** element →SUPERSEDED_BY*→ active successor set. */
export async function resolve(db: SqlExecutor, id: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(`select * from graph.resolve($1)`, [id]);
  return rows.map((r) => r.id);
}
