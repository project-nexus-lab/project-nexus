import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { freshDb } from "./helpers.js";

let db: NexusDb;
before(async () => {
  db = await freshDb();
});
after(async () => {
  await db.close();
});

test("DB rejects a malformed architecture element id (check constraint)", async () => {
  await assert.rejects(() =>
    db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ('not-an-id', 'component', null, 'x')`,
    ),
  );
});

test("DB rejects illegal containment via trigger (subsystem cannot contain a domain)", async () => {
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name) values ('prod.p1', 'product', null, 'P1')`,
  );
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name) values ('dom.d1', 'domain', 'prod.p1', 'D1')`,
  );
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name) values ('subsys.s1', 'subsystem', 'dom.d1', 'S1')`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ('dom.illegal', 'domain', 'subsys.s1', 'Illegal')`,
    ),
  );
});

test("DB accepts legal containment (subsystem contains component and capability)", async () => {
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name) values ('comp.c1', 'component', 'subsys.s1', 'C1')`,
  );
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name) values ('cap.cap1', 'capability', 'subsys.s1', 'Cap1')`,
  );
  const { rows } = await db.query<{ id: string }>(
    `select id from architecture.element where id in ('comp.c1', 'cap.cap1')`,
  );
  assert.equal(rows.length, 2);
});

test("only 'product' may have a null parent (element_root_parent)", async () => {
  await assert.rejects(() =>
    db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ('comp.orphanroot', 'component', null, 'x')`,
    ),
  );
});

test("at most one primary provider per capability", async () => {
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name) values ('comp.c2', 'component', 'subsys.s1', 'C2')`,
  );
  await db.query(
    `insert into architecture.element_provision (component_id, capability_id, is_primary)
     values ('comp.c1', 'cap.cap1', true)`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into architecture.element_provision (component_id, capability_id, is_primary)
       values ('comp.c2', 'cap.cap1', true)`,
    ),
  );
});

test("dependsOn forbids self-dependency", async () => {
  await assert.rejects(() =>
    db.query(
      `insert into architecture.element_dependency (from_id, to_id) values ('comp.c1', 'comp.c1')`,
    ),
  );
});

test("legal containment enforced for work items (feature cannot contain an epic)", async () => {
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('init.i1', 'initiative', null, 'I1')`,
  );
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('epic.e1', 'epic', 'init.i1', 'E1')`,
  );
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('feat.f1', 'feature', 'epic.e1', 'F1')`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ('epic.illegal', 'epic', 'feat.f1', 'Illegal')`,
    ),
  );
});

test("Task.affects requires the referenced capability to actually exist and be a capability", async () => {
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('task.t1', 'task', 'feat.f1', 'T1')`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into work.work_item_capability (work_item_id, capability_id) values ('task.t1', 'cap.does-not-exist')`,
    ),
  );
  await db.query(
    `insert into work.work_item_capability (work_item_id, capability_id) values ('task.t1', 'cap.cap1')`,
  );
});

test("a blocked work item must name its blocking proposal, and vice versa", async () => {
  await assert.rejects(() =>
    db.query(
      `insert into work.work_item (id, kind, parent_id, title, status, blocked_by_proposal_id)
       values ('task.t2', 'task', 'feat.f1', 'T2', 'ready', 'acp.01ARZ3NDEKTSV4RRFFQ69G5FAV')`,
    ),
    /check constraint|violates/,
  );
});

test("DB rejects a malformed technology_profile id (check constraint)", async () => {
  await db.query(
    `insert into architecture.decision (id, title, status, statement)
     values ('adr.schema-test', 'Schema test decision', 'accepted', 'stmt')`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into architecture.technology_profile
         (id, category, language, language_version, build_system, decision_id, authored_by)
       values ('not-a-tech-id', 'backend', 'Java', '24', 'Gradle', 'adr.schema-test', 'human:x')`,
    ),
  );
});

test("product_technology_profile: at most one profile per (product, category) — primary key is the final word", async () => {
  await db.query(
    `insert into architecture.technology_profile
       (id, category, language, language_version, build_system, decision_id, authored_by)
     values ('tech.schema-test-a', 'backend', 'Java', '24', 'Gradle', 'adr.schema-test', 'human:x')`,
  );
  await db.query(
    `insert into architecture.technology_profile
       (id, category, language, language_version, build_system, decision_id, authored_by)
     values ('tech.schema-test-b', 'backend', 'Kotlin', '2.0', 'Gradle', 'adr.schema-test', 'human:x')`,
  );
  await db.query(
    `insert into architecture.product_technology_profile (product_id, category, profile_id)
     values ('prod.p1', 'backend', 'tech.schema-test-a')`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into architecture.product_technology_profile (product_id, category, profile_id)
       values ('prod.p1', 'backend', 'tech.schema-test-b')`,
    ),
  );
});

test("product_technology_profile rejects a profile whose own category does not match the assignment's (trigger)", async () => {
  await assert.rejects(() =>
    db.query(
      `insert into architecture.product_technology_profile (product_id, category, profile_id)
       values ('prod.p1', 'frontend', 'tech.schema-test-a')`, // tech.schema-test-a is 'backend'
    ),
  );
});

test("product_technology_profile rejects a product_id that is not a 'product'-kind element (composite FK)", async () => {
  await assert.rejects(() =>
    db.query(
      `insert into architecture.product_technology_profile (product_id, category, profile_id)
       values ('comp.c1', 'backend', 'tech.schema-test-a')`, // comp.c1 is a component, not a product
    ),
  );
});

test("change_operation accepts a well-formed 'decide' row", async () => {
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by)
     values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA0', 'schema test', 'human:x')`,
  );
  await db.query(
    `insert into architecture.change_operation
       (proposal_id, ordinal, op, decide_id, decide_title, decide_statement)
     values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA0', 0, 'decide', 'adr.contam-ok', 'T', 'S')`,
  );
  const { rows } = await db.query<{ decide_id: string }>(
    `select decide_id from architecture.change_operation where proposal_id = 'acp.01ARZ3NDEKTSV4RRFFQ69G5FA0'`,
  );
  assert.deepEqual(rows, [{ decide_id: "adr.contam-ok" }]);
});

test("change_operation's mutual-exclusivity check (Iteration 16): a 'create' row cannot also carry retire/provide/decide fields", async () => {
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by)
     values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA1', 'schema test', 'human:x')`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into architecture.change_operation
         (proposal_id, ordinal, op, mint_id, mint_kind, mint_name,
          target_id, provide_component_id, provide_capability_id,
          decide_id, decide_title, decide_statement)
       values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA1', 0, 'create', 'comp.contam-1', 'component', 'X',
               'comp.c1', 'comp.c1', 'cap.cap1', 'adr.contam-1', 'T', 'S')`,
    ),
  );
});

test("change_operation's mutual-exclusivity check: a 'retire' row cannot also carry create/provide/decide fields", async () => {
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by)
     values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA2', 'schema test', 'human:x')`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into architecture.change_operation
         (proposal_id, ordinal, op, target_id, mint_id, mint_kind, mint_name,
          provide_component_id, provide_capability_id,
          decide_id, decide_title, decide_statement)
       values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA2', 0, 'retire', 'comp.c1', 'comp.contam-2', 'component', 'X',
               'comp.c1', 'cap.cap1', 'adr.contam-2', 'T', 'S')`,
    ),
  );
});

test("change_operation's mutual-exclusivity check: a 'provide' row cannot also carry create/retire/decide fields", async () => {
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by)
     values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA3', 'schema test', 'human:x')`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into architecture.change_operation
         (proposal_id, ordinal, op, provide_component_id, provide_capability_id,
          target_id, mint_id, mint_kind, mint_name,
          decide_id, decide_title, decide_statement)
       values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA3', 0, 'provide', 'comp.c1', 'cap.cap1',
               'comp.c1', 'comp.contam-3', 'component', 'X', 'adr.contam-3', 'T', 'S')`,
    ),
  );
});

test("change_operation's mutual-exclusivity check: a 'decide' row cannot also carry create/retire/provide fields", async () => {
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by)
     values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA4', 'schema test', 'human:x')`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into architecture.change_operation
         (proposal_id, ordinal, op, decide_id, decide_title, decide_statement,
          target_id, mint_id, mint_kind, mint_name,
          provide_component_id, provide_capability_id)
       values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA4', 0, 'decide', 'adr.contam-4', 'T', 'S',
               'comp.c1', 'comp.contam-4', 'component', 'X', 'comp.c1', 'cap.cap1')`,
    ),
  );
});

test("execution.work_package is insert-only in intent: unique(task_id, profile_id, content_hash)", async () => {
  await db.query(
    `insert into execution.work_package_profile (id, name) values ('wpp.test', 'Test')`,
  );
  await db.query(
    `insert into execution.work_package (id, seq, task_id, profile_id, content_hash, payload, schema_version)
     values ('wp.1', 1, 'task.t1', 'wpp.test', 'deadbeef', '{}', '2')`,
  );
  await assert.rejects(() =>
    db.query(
      `insert into execution.work_package (id, seq, task_id, profile_id, content_hash, payload, schema_version)
       values ('wp.2', 2, 'task.t1', 'wpp.test', 'deadbeef', '{}', '2')`,
    ),
  );
});
