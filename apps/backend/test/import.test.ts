import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { importArchitecture } from "../src/import/architecture.js";
import { importWork, MissingAcceptanceCriteriaError, OrphanTaskError } from "../src/import/work.js";
import { freshDb, seededDb } from "./helpers.js";

test("importAll loads the seed dataset: Task → Capability → Component → Repository", async () => {
  const db = await seededDb();
  try {
    const { rows: task } = await db.query(
      `select 1 from work.work_item where id = 'task.invoice-discount-validation'`,
    );
    const { rows: capability } = await db.query(
      `select 1 from architecture.element where id = 'cap.invoice-discount' and kind = 'capability'`,
    );
    const { rows: component } = await db.query(
      `select 1 from architecture.element where id = 'comp.invoice-service' and kind = 'component'`,
    );
    const { rows: repository } = await db.query(
      `select 1 from repo.repository where id = 'repo.billing-service'`,
    );
    assert.equal(task.length, 1);
    assert.equal(capability.length, 1);
    assert.equal(component.length, 1);
    assert.equal(repository.length, 1);
  } finally {
    await db.close();
  }
});

test("a malformed id in YAML is rejected before it reaches the database", async () => {
  const db = await freshDb();
  try {
    await assert.rejects(
      () => importArchitecture(db, { products: [{ id: "not-a-valid-id", name: "X" }] }),
      /invalid id/,
    );
  } finally {
    await db.close();
  }
});

test("import guard: a non-draft Task with zero capability links is refused (§3.5 no-orphan-task)", async () => {
  const db = await freshDb();
  try {
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ('init.i', 'initiative', null, 'I')`,
    );
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ('epic.e', 'epic', 'init.i', 'E')`,
    );
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ('feat.f', 'feature', 'epic.e', 'F')`,
    );
    await assert.rejects(
      () =>
        importWork(db, {
          tasks: [{ id: "task.orphan", parent: "feat.f", title: "T", status: "ready", affects: [] }],
        }),
      (err) => err instanceof OrphanTaskError,
    );
  } finally {
    await db.close();
  }
});

test("import guard: a non-draft Task with zero AcceptanceCriteria is refused (§3.5)", async () => {
  const db = await freshDb();
  try {
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ('init.i', 'initiative', null, 'I')`,
    );
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ('epic.e', 'epic', 'init.i', 'E')`,
    );
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ('feat.f', 'feature', 'epic.e', 'F')`,
    );
    await db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ('prod.p', 'product', null, 'P')`,
    );
    await db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ('dom.d', 'domain', 'prod.p', 'D')`,
    );
    await db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ('subsys.s', 'subsystem', 'dom.d', 'S')`,
    );
    await db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ('cap.x', 'capability', 'subsys.s', 'X')`,
    );
    await assert.rejects(
      () =>
        importWork(db, {
          tasks: [
            {
              id: "task.no-ac",
              parent: "feat.f",
              title: "T",
              status: "ready",
              affects: ["cap.x"],
              acceptanceCriteria: [],
            },
          ],
        }),
      (err) => err instanceof MissingAcceptanceCriteriaError,
    );
  } finally {
    await db.close();
  }
});

test("a draft Task may legally have zero capability links", async () => {
  const db: NexusDb = await freshDb();
  try {
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ('init.i', 'initiative', null, 'I')`,
    );
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ('epic.e', 'epic', 'init.i', 'E')`,
    );
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ('feat.f', 'feature', 'epic.e', 'F')`,
    );
    await importWork(db, {
      tasks: [{ id: "task.draft", parent: "feat.f", title: "T", status: "draft" }],
    });
    const { rows } = await db.query<{ status: string }>(
      `select status from work.work_item where id = 'task.draft'`,
    );
    assert.equal(rows[0]?.status, "draft");
  } finally {
    await db.close();
  }
});
