import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { importAll } from "../import/importAll.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedDir = process.argv[2] ?? path.resolve(__dirname, "../../seed");
const dataDir = process.argv[3] ?? ".nexus-data/db";

const db = await openDb(dataDir);
await migrate(db);

const result = await importAll(db, {
  architecture: path.join(seedDir, "architecture.yaml"),
  repository: path.join(seedDir, "repository.yaml"),
  work: path.join(seedDir, "work.yaml"),
  execution: path.join(seedDir, "execution.yaml"),
});

console.log(`imported from ${seedDir} into ${dataDir}:`);
console.log(JSON.stringify(result, null, 2));

await db.close();
