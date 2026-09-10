import type { SqlExecutor } from "../db/sql-executor.js";

/** Alignment context (§8.5) — named queries, no state of its own. */

export interface OrphanTaskRow {
  task_id: string;
  title: string;
  status: string;
}

/** orphanTasks(): Task with no AFFECTS edge. */
export async function orphanTasks(db: SqlExecutor): Promise<OrphanTaskRow[]> {
  const { rows } = await db.query<OrphanTaskRow>(`select * from alignment.orphan_tasks()`);
  return rows;
}

export interface UnprovidedCapabilityRow {
  capability_id: string;
  name: string;
}

/** unprovidedCapabilities(): Capability with no provider. */
export async function unprovidedCapabilities(
  db: SqlExecutor,
): Promise<UnprovidedCapabilityRow[]> {
  const { rows } = await db.query<UnprovidedCapabilityRow>(
    `select * from alignment.unprovided_capabilities()`,
  );
  return rows;
}

export interface LiveReferenceRow {
  reference_kind: "task" | "repository";
  reference_id: string;
}

/**
 * liveReferences(element): non-terminal Tasks affecting it, and active
 * Repositories implementing it (§5.6). The one place the Architecture
 * Change Proposal's retirement check (§5.6) is allowed to ask this — see
 * the migration this wraps for why it lives in Alignment, not Architecture.
 */
export async function liveReferences(
  db: SqlExecutor,
  elementId: string,
): Promise<LiveReferenceRow[]> {
  const { rows } = await db.query<LiveReferenceRow>(`select * from alignment.live_references($1)`, [
    elementId,
  ]);
  return rows;
}
