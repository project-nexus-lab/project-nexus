import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  InvalidAlignmentRequestError,
  verifyRepositoryAlignment,
} from "../src/graph/alignment.js";
import type { NexusDb } from "../src/db/client.js";
import { seededDb } from "./helpers.js";

let db: NexusDb;
before(async () => {
  db = await seededDb();
});
after(async () => {
  await db.close();
});

test("a repository whose posted componentIds exactly match its live mapping, every component active and providing capabilities, is fully aligned", async () => {
  const result = await verifyRepositoryAlignment(db, {
    repositoryId: "repo.billing-service",
    componentIds: ["comp.invoice-service"],
  });
  assert.deepEqual(result, { ok: true, failures: [], warnings: [] });
});

test("an unknown repositoryId reports only 'unknown-repository', nothing else attempted", async () => {
  const result = await verifyRepositoryAlignment(db, {
    repositoryId: "repo.does-not-exist",
    componentIds: ["comp.invoice-service"],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    { code: "unknown-repository", message: "repository repo.does-not-exist does not exist" },
  ]);
  assert.deepEqual(result.warnings, []);
});

test("posted componentIds differing from the live mapping (either direction) produces a mapping-mismatch failure", async () => {
  // direction 1: posted claims a component the live mapping doesn't have
  const extra = await verifyRepositoryAlignment(db, {
    repositoryId: "repo.billing-service",
    componentIds: ["comp.invoice-service", "comp.payment-service"],
  });
  assert.ok(extra.failures.some((f) => f.code === "mapping-mismatch"));

  // direction 2: posted omits a component the live mapping actually has
  const missing = await verifyRepositoryAlignment(db, {
    repositoryId: "repo.billing-service",
    componentIds: [],
  });
  assert.ok(missing.failures.some((f) => f.code === "mapping-mismatch"));
});

test("a posted componentId with no matching architecture.element row and no succession produces element-not-found", async () => {
  const result = await verifyRepositoryAlignment(db, {
    repositoryId: "repo.billing-service",
    componentIds: ["comp.invoice-service", "comp.iter18-ghost"],
  });
  assert.ok(
    result.failures.some(
      (f) => f.code === "element-not-found" && f.elementId === "comp.iter18-ghost",
    ),
  );
});

test("a posted componentId resolved to itself with status 'retired' produces element-retired-no-successor", async () => {
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name, status)
     values ('comp.iter18-retired', 'component', 'subsys.invoice', 'Retired', 'retired')`,
  );
  const result = await verifyRepositoryAlignment(db, {
    repositoryId: "repo.billing-service",
    componentIds: ["comp.invoice-service", "comp.iter18-retired"],
  });
  assert.ok(
    result.failures.some(
      (f) => f.code === "element-retired-no-successor" && f.elementId === "comp.iter18-retired",
    ),
  );
});

test("a posted componentId resolved to a different, active id via succession produces an element-superseded warning, not a failure", async () => {
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name, status)
     values ('comp.iter18-old', 'component', 'subsys.invoice', 'Old', 'retired')`,
  );
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name, status)
     values ('comp.iter18-new', 'component', 'subsys.invoice', 'New', 'active')`,
  );
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by, state, approved_by, applied_at)
     values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FA9', 'x', 'human:a', 'applied', 'human:a', now())`,
  );
  await db.query(
    `insert into architecture.element_succession (predecessor_id, successor_id, proposal_id)
     values ('comp.iter18-old', 'comp.iter18-new', 'acp.01ARZ3NDEKTSV4RRFFQ69G5FA9')`,
  );

  const result = await verifyRepositoryAlignment(db, {
    repositoryId: "repo.billing-service",
    componentIds: ["comp.invoice-service", "comp.iter18-old"],
  });
  assert.ok(
    result.failures.every((f) => f.elementId !== "comp.iter18-old"),
    "a superseded element must not also appear as a failure",
  );
  assert.deepEqual(
    result.warnings.find((w) => w.elementId === "comp.iter18-old"),
    {
      code: "element-superseded",
      message: "comp.iter18-old has been superseded by comp.iter18-new",
      elementId: "comp.iter18-old",
      successorId: "comp.iter18-new",
    },
  );
});

test("a succession chain that terminates in a retired element (no living successor) is a failure, not merely an element-superseded warning", async () => {
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name, status)
     values ('comp.iter18-dead-1', 'component', 'subsys.invoice', 'Dead 1', 'retired')`,
  );
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name, status)
     values ('comp.iter18-dead-2', 'component', 'subsys.invoice', 'Dead 2', 'retired')`,
  );
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by, state, approved_by, applied_at)
     values ('acp.01ARZ3NDEKTSV4RRFFQ69G5FB0', 'x', 'human:a', 'applied', 'human:a', now())`,
  );
  await db.query(
    `insert into architecture.element_succession (predecessor_id, successor_id, proposal_id)
     values ('comp.iter18-dead-1', 'comp.iter18-dead-2', 'acp.01ARZ3NDEKTSV4RRFFQ69G5FB0')`,
  );

  const result = await verifyRepositoryAlignment(db, {
    repositoryId: "repo.billing-service",
    componentIds: ["comp.invoice-service", "comp.iter18-dead-1"],
  });
  assert.deepEqual(
    result.warnings.find((w) => w.elementId === "comp.iter18-dead-1"),
    undefined,
    "a dead-end chain must not also appear as a mere warning",
  );
  assert.deepEqual(
    result.failures.find((f) => f.elementId === "comp.iter18-dead-1"),
    {
      code: "element-retired-no-successor",
      message:
        "comp.iter18-dead-1 was superseded by comp.iter18-dead-2, which is itself retired with no further successor",
      elementId: "comp.iter18-dead-1",
      successorId: "comp.iter18-dead-2",
    },
  );
});

test("duplicate posted componentIds are checked once, not once per occurrence", async () => {
  const result = await verifyRepositoryAlignment(db, {
    repositoryId: "repo.billing-service",
    componentIds: ["comp.invoice-service", "comp.invoice-service"],
  });
  assert.deepEqual(result, { ok: true, failures: [], warnings: [] });
});

test("a live-mapped component with zero capabilities produces component-provides-nothing", async () => {
  await db.query(
    `insert into repo.repository (id, name, provider, provider_ref) values ('repo.iter18-empty', 'empty', 'github', 'acme/empty')`,
  );
  await db.query(
    `insert into repo.repository_component (repository_id, component_id, is_primary)
     values ('repo.iter18-empty', 'comp.payment-service', true)`,
  );
  const result = await verifyRepositoryAlignment(db, {
    repositoryId: "repo.iter18-empty",
    componentIds: ["comp.payment-service"],
  });
  assert.ok(
    result.failures.some(
      (f) => f.code === "component-provides-nothing" && f.elementId === "comp.payment-service",
    ),
  );
});

test("a malformed request (missing repositoryId, or a non-array componentIds) is rejected as InvalidAlignmentRequestError", async () => {
  await assert.rejects(
    () => verifyRepositoryAlignment(db, { componentIds: [] }),
    (err) => err instanceof InvalidAlignmentRequestError,
  );
  await assert.rejects(
    () => verifyRepositoryAlignment(db, { repositoryId: "repo.billing-service", componentIds: "not-an-array" }),
    (err) => err instanceof InvalidAlignmentRequestError,
  );
  await assert.rejects(
    () => verifyRepositoryAlignment(db, null),
    (err) => err instanceof InvalidAlignmentRequestError,
  );
});
