import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NexusDb } from "../src/db/client.js";
import { openDb } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { importAll } from "../src/import/importAll.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SEED_DIR = path.resolve(__dirname, "../seed");

export async function freshDb(): Promise<NexusDb> {
  const db = await openDb();
  await migrate(db);
  return db;
}

export async function seededDb(): Promise<NexusDb> {
  const db = await freshDb();
  await importAll(db, {
    architecture: path.join(SEED_DIR, "architecture.yaml"),
    repository: path.join(SEED_DIR, "repository.yaml"),
    work: path.join(SEED_DIR, "work.yaml"),
    execution: path.join(SEED_DIR, "execution.yaml"),
  });
  return db;
}
