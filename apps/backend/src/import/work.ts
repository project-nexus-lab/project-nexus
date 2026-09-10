import type { SqlExecutor } from "../db/sql-executor.js";
import { assertPrefixMatchesKind } from "../ids/ids.js";
import { WorkYaml } from "./schema.js";

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
    super(
      `task ${taskId} may not leave 'draft' with zero AcceptanceCriteria (§3.5)`,
    );
    this.name = "MissingAcceptanceCriteriaError";
  }
}

/**
 * Work YAML import (Iteration 0 deliverable #4).
 *
 * Enforces the WorkItem aggregate invariant (§3.5) at the same boundary a
 * future Work API would: a Task requesting any non-draft status must already
 * carry at least one `affects` link and one AcceptanceCriterion. The
 * composite FK (§7.4) and `orphanTasks()` (§8.5) back this up continuously;
 * this is the write-time check.
 */
export async function importWork(
  db: SqlExecutor,
  doc: unknown,
): Promise<{ workItems: number; acceptanceCriteria: number; affects: number }> {
  const data = WorkYaml.parse(doc);

  for (const i of data.initiatives) {
    assertPrefixMatchesKind(i.id, "initiative");
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ($1, 'initiative', null, $2)`,
      [i.id, i.title],
    );
  }
  for (const e of data.epics) {
    assertPrefixMatchesKind(e.id, "epic");
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ($1, 'epic', $2, $3)`,
      [e.id, e.parent, e.title],
    );
  }
  for (const f of data.features) {
    assertPrefixMatchesKind(f.id, "feature");
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title) values ($1, 'feature', $2, $3)`,
      [f.id, f.parent, f.title],
    );
  }

  let acceptanceCriteria = 0;
  let affects = 0;
  for (const t of data.tasks) {
    assertPrefixMatchesKind(t.id, "task");

    if (t.status !== "draft") {
      if (t.affects.length === 0) throw new OrphanTaskError(t.id);
      if (t.acceptanceCriteria.length === 0) throw new MissingAcceptanceCriteriaError(t.id);
    }

    // Insert as draft first: legal FK targets (capabilities, repositories) may
    // reference rows created moments ago in this same import, but the status
    // check constraint requires blocked_by_proposal_id discipline we don't
    // need here — draft is always a legal starting state.
    await db.query(
      `insert into work.work_item (id, kind, parent_id, title, status) values ($1, 'task', $2, $3, 'draft')`,
      [t.id, t.parent, t.title],
    );

    for (const capabilityId of t.affects) {
      await db.query(
        `insert into work.work_item_capability (work_item_id, capability_id) values ($1, $2)`,
        [t.id, capabilityId],
      );
      affects += 1;
    }

    let ordinal = 0;
    for (const ac of t.acceptanceCriteria) {
      await db.query(
        `insert into work.acceptance_criterion (id, work_item_id, statement, ordinal) values ($1, $2, $3, $4)`,
        [ac.id, t.id, ac.statement, ordinal],
      );
      ordinal += 1;
      acceptanceCriteria += 1;
    }

    for (const repositoryId of t.implementedIn) {
      await db.query(
        `insert into work.work_item_repository (work_item_id, repository_id) values ($1, $2)`,
        [t.id, repositoryId],
      );
    }

    if (t.status !== "draft") {
      await db.query(`update work.work_item set status = $2 where id = $1`, [t.id, t.status]);
    }
  }

  return {
    workItems:
      data.initiatives.length + data.epics.length + data.features.length + data.tasks.length,
    acceptanceCriteria,
    affects,
  };
}
