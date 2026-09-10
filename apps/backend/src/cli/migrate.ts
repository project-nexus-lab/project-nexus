import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";

const dataDir = process.argv[2] ?? ".nexus-data/db";

const db = await openDb(dataDir);
const applied = await migrate(db);
console.log(`applied ${applied.length} migration(s) to ${dataDir}:`);
for (const file of applied) console.log(`  ${file}`);
await db.close();
