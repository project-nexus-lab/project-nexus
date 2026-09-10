import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { NoopAdapterA } from "../src/runtime/adapters/noop-a.js";
import { NoopAdapterB } from "../src/runtime/adapters/noop-b.js";
import type { RunEvent } from "../src/runtime/port.js";
import { listAdaptersForRole, registerAdapter } from "../src/runtime/registry.js";
import { freshDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: NexusDb;
before(async () => {
  db = await freshDb();
});
after(async () => {
  await db.close();
});

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

test("the role vocabulary (§4.4) is seeded in full, six roles, regardless of MVP orchestration scope", async () => {
  const { rows } = await db.query<{ id: string }>(`select id from runtime.agent_role order by id`);
  assert.deepEqual(
    rows.map((r) => r.id),
    [
      "role.code-locator",
      "role.consistency-auditor",
      "role.context-navigator",
      "role.implementer",
      "role.knowledge-maintainer",
      "role.task-analyst",
    ],
  );
});

test("registering the first adapter writes to runtime.adapter_registration and adapter_role_support, tables that predate this iteration untouched", async () => {
  const adapterA = new NoopAdapterA();
  await registerAdapter(db, adapterA, { displayName: "No-op Adapter A" });

  const { rows } = await db.query<{ id: string; display_name: string; enabled: boolean }>(
    `select id, display_name, enabled from runtime.adapter_registration where id = $1`,
    [adapterA.id],
  );
  assert.deepEqual(rows[0], { id: "adapter-noop-a", display_name: "No-op Adapter A", enabled: true });

  const { rows: support } = await db.query(
    `select role_id from runtime.adapter_role_support where adapter_id = $1`,
    [adapterA.id],
  );
  assert.deepEqual(support, [{ role_id: "role.implementer" }]);
});

test("registering a second adapter requires no schema change: same tables, same functions, one new row", async () => {
  const adapterB = new NoopAdapterB();
  await registerAdapter(db, adapterB, { displayName: "No-op Adapter B" });

  const forImplementer = await listAdaptersForRole(db, "role.implementer");
  assert.deepEqual(
    forImplementer.map((a) => a.id).sort(),
    ["adapter-noop-a", "adapter-noop-b"],
  );
});

test("registerAdapter is idempotent — re-registering the same adapter does not duplicate role support", async () => {
  const adapterA = new NoopAdapterA();
  await registerAdapter(db, adapterA, { displayName: "No-op Adapter A (re-registered)" });

  const { rows } = await db.query<{ display_name: string }>(
    `select display_name from runtime.adapter_registration where id = $1`,
    [adapterA.id],
  );
  assert.equal(rows[0]?.display_name, "No-op Adapter A (re-registered)");

  const { rows: support } = await db.query(
    `select role_id from runtime.adapter_role_support where adapter_id = $1`,
    [adapterA.id],
  );
  assert.equal(support.length, 1, "re-registering must not duplicate the role-support row");
});

test("adapter A: start + events produces a conformant, always-succeeds sequence", async () => {
  const adapter = new NoopAdapterA();
  const grant = {
    runId: "run.test",
    workPackageId: "wp.1",
    allowedElementIds: [],
    allowedRepositoryIds: [],
    expiresAt: new Date().toISOString(),
  };
  const handle = await adapter.start("run.test", { id: "wp.1" }, grant);
  const events = await collect(adapter.events(handle));

  assert.deepEqual(
    events.map((e) => e.kind),
    ["RunStarted", "ArtifactProduced", "RunCompleted"],
  );
});

test("adapter B: start + events exercises RunBlocked, the event v2 added over v1", async () => {
  const adapter = new NoopAdapterB();
  const grant = {
    runId: "run.test",
    workPackageId: "wp.1",
    allowedElementIds: [],
    allowedRepositoryIds: [],
    expiresAt: new Date().toISOString(),
  };
  const handle = await adapter.start("run.test", { id: "wp.1" }, grant);
  const events = await collect(adapter.events(handle));

  assert.deepEqual(events.map((e) => e.kind), ["RunStarted", "RunBlocked"]);
  const blocked = events[1];
  assert.ok(blocked && blocked.kind === "RunBlocked");
  if (blocked.kind === "RunBlocked") {
    assert.equal(blocked.reason, "architecture-change-required");
  }
});

// This is the actual experiment (docs/PROJECT_KNOWLEDGE.md Open Question
// #1): adding the *second* adapter must not require touching core context
// code. A green test suite doesn't prove this on its own — Iteration 1's
// own lesson was that a claim like this needs a check of its own, not just
// passing tests (docs/history/iteration-1/LESSONS.md, "Biggest Surprise").
// This statically inspects the file's imports rather than trusting that it
// merely compiles.
test("structural check: noop-b.ts's only local import is the port — zero dependency on architecture, work, repo, or workpackage code", async () => {
  const filePath = path.resolve(__dirname, "../src/runtime/adapters/noop-b.ts");
  const source = await readFile(filePath, "utf8");
  // Matches the module specifier of every `import ... from "..."` clause,
  // regardless of whether the imported names span multiple lines — a
  // line-anchored regex would (and, in an earlier version of this test,
  // did) silently miss a multi-line `import type { ... } from "..."`.
  const moduleSpecifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

  assert.ok(moduleSpecifiers.length > 0, "expected at least one import statement to check");

  for (const spec of moduleSpecifiers) {
    assert.equal(spec, "../port.js", `noop-b.ts must import only from the port, found: ${spec}`);
  }
});
