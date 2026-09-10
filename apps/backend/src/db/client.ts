import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Iteration 0 runs on an embedded, wire-compatible Postgres (PGlite) rather
 * than a networked server: same SQL, same constraints, same recursive CTEs,
 * zero external infrastructure to operate. Swapping to a networked Postgres
 * later is a driver change, not a schema or query change (§2.4, §7).
 */
export type NexusDb = PGlite;

export async function openDb(dataDir?: string): Promise<NexusDb> {
  if (dataDir) await mkdir(path.dirname(dataDir), { recursive: true });
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  return db;
}
