import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { createHttpServer } from "../http/server.js";

const dataDir = process.argv[2] ?? ".nexus-data/db";
const port = Number(process.env.PORT ?? 3000);

const db = await openDb(dataDir);
await migrate(db);

const server = createHttpServer(db);
server.listen(port, () => {
  console.log(`nexus-core listening on http://localhost:${port} (data: ${dataDir})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    server.close();
    await db.close();
    process.exit(0);
  });
}
