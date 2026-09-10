/**
 * The minimal surface import/graph/work-package code needs from either a
 * plain PGlite connection or an open transaction. Depending on this instead
 * of `NexusDb` lets every read/write function run equally well standalone or
 * nested inside `db.transaction(tx => ...)`.
 */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
