import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { orphanTasks, unprovidedCapabilities } from "../src/graph/alignment.js";
import {
  ancestry,
  capabilitiesOf,
  governanceOfElements,
  implementationPath,
  providersOf,
  resolve,
} from "../src/graph/traversals.js";
import { seededDb } from "./helpers.js";

let db: NexusDb;
before(async () => {
  db = await seededDb();
});
after(async () => {
  await db.close();
});

test("ancestry(element): element →CONTAINS*→ root, in order", async () => {
  const rows = await ancestry(db, "comp.invoice-service");
  assert.deepEqual(
    rows.map((r) => r.id),
    ["comp.invoice-service", "subsys.invoice", "dom.billing", "prod.trade-platform"],
  );
  assert.deepEqual(
    rows.map((r) => r.depth),
    [0, 1, 2, 3],
  );
});

test("providersOf(capability): Capability ←PROVIDES← Component", async () => {
  const rows = await providersOf(db, "cap.invoice-discount");
  assert.deepEqual(rows, [{ component_id: "comp.invoice-service", is_primary: true }]);
});

test("providersOf returns nothing for an unprovided capability", async () => {
  const rows = await providersOf(db, "cap.invoice-export");
  assert.deepEqual(rows, []);
});

test("capabilitiesOf(component): Component →PROVIDES→ Capability", async () => {
  const rows = await capabilitiesOf(db, "comp.invoice-service");
  const ids = rows.map((r) => r.capability_id).sort();
  assert.deepEqual(ids, ["cap.create-invoice", "cap.invoice-discount"]);
});

test("implementationPath(task): Task→Capability→Component→Repository, task-to-capability path resolution works", async () => {
  const rows = await implementationPath(db, "task.invoice-discount-validation");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    capability_id: "cap.invoice-discount",
    component_id: "comp.invoice-service",
    provider_is_primary: true,
    repository_id: "repo.billing-service",
    repo_is_primary: true,
  });
});

test("implementationPath(task) is empty for a task with no affects links", async () => {
  const rows = await implementationPath(db, "task.draft-example");
  assert.deepEqual(rows, []);
});

test("governanceOf: decision and constraint attached to comp.invoice-service resolve via ancestry", async () => {
  const { decisions, constraints } = await governanceOfElements(db, ["comp.invoice-service"]);
  assert.deepEqual(decisions, ["adr.discount-strategy-v1"]);
  assert.deepEqual(constraints, ["con.backward-compatible"]);
});

test("governanceOf union: governance reachable via either of two elements is deduplicated", async () => {
  const { decisions, constraints } = await governanceOfElements(db, [
    "comp.invoice-service",
    "cap.invoice-discount",
  ]);
  assert.deepEqual(decisions, ["adr.discount-strategy-v1"]);
  assert.deepEqual(constraints, ["con.backward-compatible"]);
});

test("resolve(id) returns the id itself when no succession edge exists", async () => {
  const rows = await resolve(db, "comp.invoice-service");
  assert.deepEqual(rows, ["comp.invoice-service"]);
});

test("orphanTasks() flags the draft task with no affects link, and only that one", async () => {
  const rows = await orphanTasks(db);
  assert.deepEqual(
    rows.map((r) => r.task_id),
    ["task.draft-example"],
  );
});

test("unprovidedCapabilities() flags cap.invoice-export, and only that one", async () => {
  const rows = await unprovidedCapabilities(db);
  assert.deepEqual(
    rows.map((r) => r.capability_id),
    ["cap.invoice-export"],
  );
});
