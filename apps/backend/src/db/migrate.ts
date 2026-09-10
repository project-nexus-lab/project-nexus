import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NexusDb } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../db/migrations");

/** Tracks which migration files have already run so `migrate()` is safe to call repeatedly. */
async function ensureMigrationsTable(db: NexusDb): Promise<void> {
  await db.exec(
    `create table if not exists public.schema_migrations (
       filename    text primary key,
       applied_at  timestamptz not null default now()
     )`,
  );
}

export async function migrate(db: NexusDb): Promise<string[]> {
  await ensureMigrationsTable(db);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows } = await db.query<{ filename: string }>(
    `select filename from public.schema_migrations`,
  );
  const alreadyApplied = new Set(rows.map((r) => r.filename));

  const applied: string[] = [];
  for (const file of files) {
    if (alreadyApplied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.exec(sql);
    await db.query(`insert into public.schema_migrations (filename) values ($1)`, [file]);
    applied.push(file);
  }
  return applied;
}
