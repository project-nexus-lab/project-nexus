import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { generateUlid } from "../src/ids/ids.js";
import {
  assertReadyInvariants,
  blockTask,
  IllegalTaskTransitionError,
  linkCapability,
  markReady,
  MissingAcceptanceCriteriaError,
  OrphanTaskError,
  ProposalNotBlockableError,
  releaseBlockedTasks,
  TaskNotFoundError,
} from "../src/work/lifecycle.js";
import { seededDb } from "./helpers.js";

let db: NexusDb;
before(async () => {
  db = await seededDb();
});
after(async () => {
  await db.close();
});

test("assertReadyInvariants throws OrphanTaskError for a task with no affects link", async () => {
  await assert.rejects(
    () => assertReadyInvariants(db, "task.draft-example"),
    (err) => err instanceof OrphanTaskError,
  );
});

test("assertReadyInvariants throws MissingAcceptanceCriteriaError for a task with affects but no AC", async () => {
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('task.no-ac', 'task', 'feat.invoice-discounts', 'No AC')`,
  );
  await db.query(
    `insert into work.work_item_capability (work_item_id, capability_id) values ('task.no-ac', 'cap.invoice-discount')`,
  );
  await assert.rejects(
    () => assertReadyInvariants(db, "task.no-ac"),
    (err) => err instanceof MissingAcceptanceCriteriaError,
  );
});

test("assertReadyInvariants passes for the seeded ready task", async () => {
  await assert.doesNotReject(() => assertReadyInvariants(db, "task.invoice-discount-validation"));
});

test("markReady refuses a task with unmet invariants and refuses from a non-draft status", async () => {
  await assert.rejects(
    () => markReady(db, "task.draft-example"),
    (err) => err instanceof OrphanTaskError,
  );
  // already 'ready' — not 'draft'
  await assert.rejects(
    () => markReady(db, "task.invoice-discount-validation"),
    (err) => err instanceof IllegalTaskTransitionError,
  );
});

test("linkCapability + markReady moves a draft task to ready", async () => {
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('task.link-ready', 'task', 'feat.invoice-discounts', 'Link then ready')`,
  );
  await db.query(
    `insert into work.acceptance_criterion (id, work_item_id, statement, ordinal) values ('ac.link-ready', 'task.link-ready', 'stmt', 0)`,
  );

  await assert.rejects(
    () => markReady(db, "task.link-ready"),
    (err) => err instanceof OrphanTaskError,
  );

  await linkCapability(db, "task.link-ready", "cap.create-invoice");
  await markReady(db, "task.link-ready");

  const { rows } = await db.query<{ status: string }>(
    `select status from work.work_item where id = 'task.link-ready'`,
  );
  assert.equal(rows[0]?.status, "ready");
});

test("linkCapability is idempotent (on conflict do nothing)", async () => {
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('task.link-twice', 'task', 'feat.invoice-discounts', 'Link twice')`,
  );
  await linkCapability(db, "task.link-twice", "cap.create-invoice");
  await assert.doesNotReject(() => linkCapability(db, "task.link-twice", "cap.create-invoice"));
  const { rows } = await db.query(
    `select 1 from work.work_item_capability where work_item_id = 'task.link-twice'`,
  );
  assert.equal(rows.length, 1);
});

test("blockTask sets status and blocked_by_proposal_id; releaseBlockedTasks clears them and returns to draft", async () => {
  const proposalId = `acp.${generateUlid()}`;
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('task.block-me', 'task', 'feat.invoice-discounts', 'Block me')`,
  );
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by) values ($1, 'test intent', 'human:tester')`,
    [proposalId],
  );

  await blockTask(db, "task.block-me", proposalId);
  const afterBlock = (
    await db.query<{ status: string; blocked_by_proposal_id: string | null }>(
      `select status, blocked_by_proposal_id from work.work_item where id = 'task.block-me'`,
    )
  ).rows[0];
  assert.equal(afterBlock?.status, "blocked");
  assert.equal(afterBlock?.blocked_by_proposal_id, proposalId);

  const released = await releaseBlockedTasks(db, proposalId);
  assert.deepEqual(released, ["task.block-me"]);

  const afterRelease = (
    await db.query<{ status: string; blocked_by_proposal_id: string | null }>(
      `select status, blocked_by_proposal_id from work.work_item where id = 'task.block-me'`,
    )
  ).rows[0];
  assert.equal(afterRelease?.status, "draft");
  assert.equal(afterRelease?.blocked_by_proposal_id, null);
});

// Finding 1 (docs/history/iteration-1/REPORT.md): blocking a task against a
// terminal (applied or rejected) proposal previously succeeded silently and
// left the task permanently stuck, since releaseBlockedTasks only ever runs
// from inside applyProposal, which refuses to run twice on the same
// proposal. These three tests prove the fix: a nonexistent, an already-
// applied, and an already-rejected proposal are all refused as blockers,
// and the task's status is left untouched in every case.

test("blockTask refuses a proposal that does not exist", async () => {
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('task.block-missing-proposal', 'task', 'feat.invoice-discounts', 'X')`,
  );
  const proposalId = `acp.${generateUlid()}`; // never inserted

  await assert.rejects(
    () => blockTask(db, "task.block-missing-proposal", proposalId),
    (err) => err instanceof ProposalNotBlockableError && err.reason === "not-found",
  );

  const { rows } = await db.query<{ status: string }>(
    `select status from work.work_item where id = 'task.block-missing-proposal'`,
  );
  assert.equal(rows[0]?.status, "draft", "task status must be untouched by a refused block");
});

test("blockTask refuses an already-applied proposal (would leave the task permanently stuck)", async () => {
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('task.block-applied', 'task', 'feat.invoice-discounts', 'X')`,
  );
  const proposalId = `acp.${generateUlid()}`;
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by, state, approved_by, applied_at)
     values ($1, 'already applied', 'human:tester', 'applied', 'human:approver', now())`,
    [proposalId],
  );

  await assert.rejects(
    () => blockTask(db, "task.block-applied", proposalId),
    (err) => err instanceof ProposalNotBlockableError && err.reason === "terminal",
  );

  const { rows } = await db.query<{ status: string; blocked_by_proposal_id: string | null }>(
    `select status, blocked_by_proposal_id from work.work_item where id = 'task.block-applied'`,
  );
  assert.equal(rows[0]?.status, "draft");
  assert.equal(rows[0]?.blocked_by_proposal_id, null);
});

test("blockTask refuses an already-rejected proposal", async () => {
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title) values ('task.block-rejected', 'task', 'feat.invoice-discounts', 'X')`,
  );
  const proposalId = `acp.${generateUlid()}`;
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by, state)
     values ($1, 'already rejected', 'human:tester', 'rejected')`,
    [proposalId],
  );

  await assert.rejects(
    () => blockTask(db, "task.block-rejected", proposalId),
    (err) => err instanceof ProposalNotBlockableError && err.reason === "terminal",
  );

  const { rows } = await db.query<{ status: string }>(
    `select status from work.work_item where id = 'task.block-rejected'`,
  );
  assert.equal(rows[0]?.status, "draft");
});

test("lifecycle operations on an unknown task throw TaskNotFoundError", async () => {
  const proposalId = `acp.${generateUlid()}`;
  await assert.rejects(
    () => linkCapability(db, "task.does-not-exist", "cap.create-invoice"),
    (err) => err instanceof TaskNotFoundError,
  );
  await assert.rejects(
    () => markReady(db, "task.does-not-exist"),
    (err) => err instanceof TaskNotFoundError,
  );
  await assert.rejects(
    () => blockTask(db, "task.does-not-exist", proposalId),
    (err) => err instanceof TaskNotFoundError,
  );
});
