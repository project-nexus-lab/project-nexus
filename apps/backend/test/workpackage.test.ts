import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { buildWorkPackage, WorkPackageGateError } from "../src/workpackage/build.js";
import { freshDb, seededDb } from "./helpers.js";

test("work package generation works: buildWorkPackage matches WORK_PACKAGE_SPEC.md's example", async () => {
  const db = await seededDb();
  try {
    const wp = await buildWorkPackage(db, "task.invoice-discount-validation", "wpp.implementation");
    assert.equal(wp.created, true);
    assert.match(wp.id, /^wp\.\d+$/);
    assert.deepEqual(wp.payload, {
      id: wp.id,
      schemaVersion: 2,
      profile: "wpp.implementation",
      task: "task.invoice-discount-validation",
      feature: "feat.invoice-discounts",
      capabilities: ["cap.invoice-discount"],
      components: ["comp.invoice-service"],
      repositories: ["repo.billing-service"],
      files: ["InvoiceService.java"],
      constraints: ["con.backward-compatible"],
      acceptanceCriteria: ["ac.discount-applied", "ac.existing-behaviour-unchanged"],
      decisions: ["adr.discount-strategy-v1"],
    });
  } finally {
    await db.close();
  }
});

test("deterministic and idempotent: same input ⇒ same content hash ⇒ same package, no duplicate row", async () => {
  const db = await seededDb();
  try {
    const first = await buildWorkPackage(db, "task.invoice-discount-validation", "wpp.implementation");
    const second = await buildWorkPackage(db, "task.invoice-discount-validation", "wpp.implementation");

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.id, second.id);
    assert.equal(first.contentHash, second.contentHash);
    assert.deepEqual(first.payload, second.payload);

    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count from execution.work_package
       where task_id = 'task.invoice-discount-validation'`,
    );
    assert.equal(Number(rows[0]?.count), 1);
  } finally {
    await db.close();
  }
});

test("gate: unknown task is rejected", async () => {
  const db = await seededDb();
  try {
    await assert.rejects(
      () => buildWorkPackage(db, "task.does-not-exist", "wpp.implementation"),
      (err) => err instanceof WorkPackageGateError && err.reason === "task-not-found",
    );
  } finally {
    await db.close();
  }
});

test("gate: a non-ready task is rejected", async () => {
  const db = await seededDb();
  try {
    await assert.rejects(
      () => buildWorkPackage(db, "task.draft-example", "wpp.implementation"),
      (err) => err instanceof WorkPackageGateError && err.reason === "task-not-ready",
    );
  } finally {
    await db.close();
  }
});

/** Builds a minimal ready task affecting one capability, bypassing the import-time guard, for gate edge cases. */
async function architectureScaffold(db: NexusDb) {
  await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('prod.p','product',null,'P')`);
  await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('dom.d','domain','prod.p','D')`);
  await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('subsys.s','subsystem','dom.d','S')`);
  await db.query(`insert into work.work_item (id, kind, parent_id, title) values ('init.i','initiative',null,'I')`);
  await db.query(`insert into work.work_item (id, kind, parent_id, title) values ('epic.e','epic','init.i','E')`);
  await db.query(`insert into work.work_item (id, kind, parent_id, title) values ('feat.f','feature','epic.e','F')`);
  await db.query(
    `insert into execution.work_package_profile (id, name) values ('wpp.implementation', 'Implementation')`,
  );
}

async function readyTask(db: NexusDb, id: string, capabilityId: string) {
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title, status) values ($1, 'task', 'feat.f', 'T', 'ready')`,
    [id],
  );
  await db.query(
    `insert into work.work_item_capability (work_item_id, capability_id) values ($1, $2)`,
    [id, capabilityId],
  );
  await db.query(
    `insert into work.acceptance_criterion (id, work_item_id, statement, ordinal) values ($1, $2, 'stmt', 0)`,
    [`ac.${id.split(".")[1]}`, id],
  );
}

test("gate: a task with an affected capability that has zero providers is rejected", async () => {
  const db = await freshDb();
  try {
    await architectureScaffold(db);
    await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('cap.unprovided','capability','subsys.s','Unprovided')`);
    await readyTask(db, "task.t1", "cap.unprovided");

    await assert.rejects(
      () => buildWorkPackage(db, "task.t1", "wpp.implementation"),
      (err) => err instanceof WorkPackageGateError && err.reason === "unprovided-capability",
    );
  } finally {
    await db.close();
  }
});

test("gate: a component with no mapped repository is rejected (mapping-missing)", async () => {
  const db = await freshDb();
  try {
    await architectureScaffold(db);
    await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.unmapped','component','subsys.s','Unmapped')`);
    await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('cap.x','capability','subsys.s','X')`);
    await db.query(`insert into architecture.element_provision (component_id, capability_id, is_primary) values ('comp.unmapped','cap.x', true)`);
    await readyTask(db, "task.t1", "cap.x");

    await assert.rejects(
      () => buildWorkPackage(db, "task.t1", "wpp.implementation"),
      (err) => err instanceof WorkPackageGateError && err.reason === "mapping-missing",
    );
  } finally {
    await db.close();
  }
});

test("gate: two mapped repositories with no primary and allow_ambiguous_repo=false is rejected", async () => {
  const db = await freshDb();
  try {
    await architectureScaffold(db);
    await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.c','component','subsys.s','C')`);
    await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('cap.x','capability','subsys.s','X')`);
    await db.query(`insert into architecture.element_provision (component_id, capability_id, is_primary) values ('comp.c','cap.x', true)`);
    await db.query(`insert into repo.repository (id, name, provider) values ('repo.a','a','github')`);
    await db.query(`insert into repo.repository (id, name, provider) values ('repo.b','b','github')`);
    await db.query(`insert into repo.repository_component (repository_id, component_id, is_primary) values ('repo.a','comp.c', false)`);
    await db.query(`insert into repo.repository_component (repository_id, component_id, is_primary) values ('repo.b','comp.c', false)`);
    await readyTask(db, "task.t1", "cap.x");

    await assert.rejects(
      () => buildWorkPackage(db, "task.t1", "wpp.implementation"),
      (err) => err instanceof WorkPackageGateError && err.reason === "ambiguous-repository",
    );
  } finally {
    await db.close();
  }
});

test("profile.allow_ambiguous_repo=true widens ambiguous mapping into both repositories", async () => {
  const db = await freshDb();
  try {
    await architectureScaffold(db);
    await db.query(
      `insert into execution.work_package_profile (id, name, allow_ambiguous_repo) values ('wpp.wide', 'Wide', true)`,
    );
    await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.c','component','subsys.s','C')`);
    await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('cap.x','capability','subsys.s','X')`);
    await db.query(`insert into architecture.element_provision (component_id, capability_id, is_primary) values ('comp.c','cap.x', true)`);
    await db.query(`insert into repo.repository (id, name, provider) values ('repo.a','a','github')`);
    await db.query(`insert into repo.repository (id, name, provider) values ('repo.b','b','github')`);
    await db.query(`insert into repo.repository_component (repository_id, component_id, is_primary) values ('repo.a','comp.c', false)`);
    await db.query(`insert into repo.repository_component (repository_id, component_id, is_primary) values ('repo.b','comp.c', false)`);
    await readyTask(db, "task.t1", "cap.x");

    const wp = await buildWorkPackage(db, "task.t1", "wpp.wide");
    assert.deepEqual(wp.payload.repositories.sort(), ["repo.a", "repo.b"]);
  } finally {
    await db.close();
  }
});

test("gate: a retired capability with no succession is rejected", async () => {
  const db = await seededDb();
  try {
    await db.query(`update architecture.element set status = 'retired' where id = 'cap.invoice-discount'`);
    await assert.rejects(
      () => buildWorkPackage(db, "task.invoice-discount-validation", "wpp.implementation"),
      (err) => err instanceof WorkPackageGateError && err.reason === "retired-without-succession",
    );
  } finally {
    await db.close();
  }
});

test("impactOf is actually executed for step 4 (Bound): a wider profile surfaces dependsOn neighbours", async () => {
  const db = await seededDb();
  try {
    await db.query(
      `insert into execution.work_package_profile (id, name, context_depth)
       values ('wpp.depth1', 'Depth 1', 1)`,
    );
    const wp = await buildWorkPackage(db, "task.invoice-discount-validation", "wpp.depth1");
    // seed: comp.invoice-service dependsOn comp.payment-service
    assert.deepEqual(wp.impactedComponents, ["comp.payment-service"]);
    // impactOf is bounding for a future MCP grant, not part of the persisted payload (§11.3)
    assert.ok(!("impactedComponents" in wp.payload));
  } finally {
    await db.close();
  }
});

test("default profile (context_depth=0) yields no impacted components", async () => {
  const db = await seededDb();
  try {
    const wp = await buildWorkPackage(db, "task.invoice-discount-validation", "wpp.implementation");
    assert.deepEqual(wp.impactedComponents, []);
  } finally {
    await db.close();
  }
});

test("explicit implementedIn override replaces component-derived repository resolution", async () => {
  const db = await seededDb();
  try {
    await db.query(`insert into repo.repository (id, name, provider) values ('repo.override','override','github')`);
    await db.query(
      `insert into work.work_item_repository (work_item_id, repository_id) values ('task.invoice-discount-validation', 'repo.override')`,
    );
    const wp = await buildWorkPackage(db, "task.invoice-discount-validation", "wpp.implementation");
    assert.deepEqual(wp.payload.repositories, ["repo.override"]);
  } finally {
    await db.close();
  }
});
