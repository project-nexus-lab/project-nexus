import type { SqlExecutor } from "../db/sql-executor.js";

/**
 * Work context — WorkItem lifecycle (§3.5, §5.4).
 *
 * These are the operations a future Work API would expose. Iteration 0
 * exercised the §3.5 invariant only at YAML-import time; Iteration 1 adds
 * the rest of the lifecycle the Architecture Change Proposal flow (§5.4)
 * depends on: a Task can be blocked on a proposal, released when that
 * proposal is applied, linked to a newly-minted capability, and moved to
 * `ready` — all under the same invariant, checked once, here.
 */

export class OrphanTaskError extends Error {
  constructor(taskId: string) {
    super(
      `task ${taskId} may not leave 'draft' with zero Capability links (§3.5 no-orphan-task invariant)`,
    );
    this.name = "OrphanTaskError";
  }
}

export class MissingAcceptanceCriteriaError extends Error {
  constructor(taskId: string) {
    super(`task ${taskId} may not leave 'draft' with zero AcceptanceCriteria (§3.5)`);
    this.name = "MissingAcceptanceCriteriaError";
  }
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`task ${taskId} does not exist`);
    this.name = "TaskNotFoundError";
  }
}

export class IllegalTaskTransitionError extends Error {
  constructor(taskId: string, from: string, to: string) {
    super(`task ${taskId} cannot transition from '${from}' to '${to}'`);
    this.name = "IllegalTaskTransitionError";
  }
}

/**
 * §5.4's blocking step requires a proposal that can still be applied — a
 * proposal that does not exist, or has already reached `applied` or
 * `rejected`, cannot ever release the Task it would block (see
 * `docs/history/iteration-1/REPORT.md`, "Finding 1", for how this was
 * found: blocking against an already-`applied` proposal left a Task
 * permanently stuck, since `releaseBlockedTasks` only ever runs from
 * inside `applyProposal`, which refuses to run a second time on the same
 * proposal).
 */
export type ProposalNotBlockableReason = "not-found" | "terminal";

export class ProposalNotBlockableError extends Error {
  constructor(
    public readonly proposalId: string,
    public readonly reason: ProposalNotBlockableReason,
    detail: string,
  ) {
    super(`proposal ${proposalId} cannot be used to block a task: ${detail}`);
    this.name = "ProposalNotBlockableError";
  }
}

interface TaskRow {
  id: string;
  status: string;
}

async function getTask(db: SqlExecutor, taskId: string): Promise<TaskRow> {
  const { rows } = await db.query<TaskRow>(
    `select id, status from work.work_item where id = $1 and kind = 'task'`,
    [taskId],
  );
  const task = rows[0];
  if (!task) throw new TaskNotFoundError(taskId);
  return task;
}

/**
 * The §3.5 invariant, checked against database state rather than in-memory
 * data — usable both by YAML import (after inserting draft rows) and by the
 * lifecycle operations below (against a Task that already existed). One
 * check, one place, two callers — not two definitions of the same rule.
 */
export async function assertReadyInvariants(db: SqlExecutor, taskId: string): Promise<void> {
  const { rows: affects } = await db.query(
    `select 1 from work.work_item_capability where work_item_id = $1 limit 1`,
    [taskId],
  );
  if (affects.length === 0) throw new OrphanTaskError(taskId);

  const { rows: acceptanceCriteria } = await db.query(
    `select 1 from work.acceptance_criterion where work_item_id = $1 limit 1`,
    [taskId],
  );
  if (acceptanceCriteria.length === 0) throw new MissingAcceptanceCriteriaError(taskId);
}

/** Task --affects--> Capability ("Task links the new capability", §5.4). */
export async function linkCapability(
  db: SqlExecutor,
  taskId: string,
  capabilityId: string,
): Promise<void> {
  await getTask(db, taskId);
  await db.query(
    `insert into work.work_item_capability (work_item_id, capability_id) values ($1, $2)
     on conflict do nothing`,
    [taskId, capabilityId],
  );
}

/** draft -> ready, enforcing §3.5 ("...returns to ready", §5.4). */
export async function markReady(db: SqlExecutor, taskId: string): Promise<void> {
  const task = await getTask(db, taskId);
  if (task.status !== "draft") {
    throw new IllegalTaskTransitionError(taskId, task.status, "ready");
  }
  await assertReadyInvariants(db, taskId);
  await db.query(`update work.work_item set status = 'ready', updated_at = now() where id = $1`, [
    taskId,
  ]);
}

/**
 * "Task status -> blocked, naming the proposal" (§5.4). Stands in for what
 * an Orchestrator would do automatically on a `RunBlocked` event (§12.2,
 * deferred to iteration 1f) — called directly here since no orchestrator
 * exists yet.
 *
 * Validates that `proposalId` both exists and is non-terminal (not
 * `applied` or `rejected`) before blocking. This is *not* covered by the
 * FK on `blocked_by_proposal_id`: a foreign key enforces only that the
 * referenced row exists, never a condition on one of its columns, so it
 * cannot express "and is still open." Blocking against an already-
 * `applied` (or `rejected`) proposal would leave the Task permanently
 * stuck — `releaseBlockedTasks` only ever runs from inside
 * `applyProposal`, which refuses to run a second time on the same
 * proposal (`IllegalProposalTransitionError`) — so there would be no path
 * back to `ready`. See `docs/history/iteration-1/REPORT.md`, "Finding 1",
 * for how this gap was found and why an earlier version of this comment
 * incorrectly claimed the FK already covered it.
 *
 * Reading `architecture.change_proposal` from this Work-context function
 * is a declared-legal direction (§2.3: `Work → Architecture`) — unlike the
 * Architecture-reading-Work/Repository violation fixed elsewhere this
 * iteration (§5.6's retirement check, now routed through Alignment), this
 * read needs no such correction.
 */
export async function blockTask(
  db: SqlExecutor,
  taskId: string,
  proposalId: string,
): Promise<void> {
  const task = await getTask(db, taskId);
  if (task.status === "done" || task.status === "cancelled") {
    throw new IllegalTaskTransitionError(taskId, task.status, "blocked");
  }

  const { rows: proposalRows } = await db.query<{ state: string }>(
    `select state from architecture.change_proposal where id = $1`,
    [proposalId],
  );
  const proposal = proposalRows[0];
  if (!proposal) {
    throw new ProposalNotBlockableError(proposalId, "not-found", "it does not exist");
  }
  if (proposal.state === "applied" || proposal.state === "rejected") {
    throw new ProposalNotBlockableError(
      proposalId,
      "terminal",
      `its state is '${proposal.state}' — a task blocked on it would never be released`,
    );
  }

  await db.query(
    `update work.work_item set status = 'blocked', blocked_by_proposal_id = $2, updated_at = now()
     where id = $1`,
    [taskId, proposalId],
  );
}

/**
 * "blocked Tasks released for re-gating" (§2.2, `ProposalApplied` handled
 * by Work). Releases every Task blocked on `proposalId` back to `draft`,
 * clearing the block — re-gating (linking the new capability, returning to
 * `ready`) is a deliberate separate step (`linkCapability` + `markReady`),
 * not automatic, matching §5.4's flow exactly.
 */
export async function releaseBlockedTasks(
  db: SqlExecutor,
  proposalId: string,
): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `update work.work_item
       set status = 'draft', blocked_by_proposal_id = null, updated_at = now()
     where blocked_by_proposal_id = $1 and status = 'blocked'
     returning id`,
    [proposalId],
  );
  return rows.map((r) => r.id);
}
