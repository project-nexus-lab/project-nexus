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
