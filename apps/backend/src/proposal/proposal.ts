import type { NexusDb } from "../db/client.js";
import type { SqlExecutor } from "../db/sql-executor.js";
import { liveReferences } from "../graph/alignment.js";
import { assertPrefixMatchesKind, generateUlid, InvalidIdError } from "../ids/ids.js";
import { releaseBlockedTasks } from "../work/lifecycle.js";

/**
 * Architecture Change Proposal lifecycle — MVP_ARCHITECTURE_V2 §5.
 *
 * "A proposal is to architecture what a pull request is to code." (§5.2)
 * This is the mechanism v1 lacked entirely (§5.1) and Iteration 0 shipped
 * only as inert schema. Iteration 1's primary target: prove the schema
 * actually supports the lifecycle it was built for.
 *
 * `move`, `split`, and `merge` operations are deliberately out of scope
 * here, exactly as §5.3 scopes them to iteration 2 — the succession table
 * exists from day one (§5.5) so that decision costs nothing later, but nothing
 * below needs it. Validating the proposal model requires only `create` and
 * `retire`, which is all the schema's `change_operation.op` check constraint
 * has ever allowed.
 */

export class InvalidProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProposalError";
  }
}

export class ProposalNotFoundError extends Error {
  constructor(public readonly proposalId: string) {
    super(`proposal ${proposalId} does not exist`);
    this.name = "ProposalNotFoundError";
  }
}

export class IllegalProposalTransitionError extends Error {
  constructor(
    public readonly proposalId: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`proposal ${proposalId} cannot transition from '${from}' to '${to}'`);
    this.name = "IllegalProposalTransitionError";
  }
}

/** §5.6: retiring an element with a live inbound reference and no succession. */
export class RetirementRefusedError extends Error {
  constructor(
    public readonly elementId: string,
    reason: string,
  ) {
    super(`cannot retire ${elementId}: ${reason} (§5.6)`);
    this.name = "RetirementRefusedError";
  }
}

type ArchitectureKind = "product" | "domain" | "subsystem" | "component" | "capability";

export interface ProposalOperationInput {
  op: "create" | "retire";
  // create:
  mintId?: string;
  mintKind?: ArchitectureKind;
  mintParentId?: string;
  mintName?: string;
  supersedesId?: string;
  requiresRepository?: boolean;
  // retire:
  targetId?: string;
}

export interface DraftProposalInput {
  intent: string;
  /** opaque principal, 'human:<id>' | 'run:<id>' (§5.2) — never an FK, §7.1 */
  authoredBy: string;
  operations: ProposalOperationInput[];
}

function validateOperation(op: ProposalOperationInput, index: number): void {
  if (op.op === "create") {
    if (!op.mintId || !op.mintKind || !op.mintName) {
      throw new InvalidProposalError(
        `operation ${index}: 'create' requires mintId, mintKind, and mintName`,
      );
    }
    try {
      assertPrefixMatchesKind(op.mintId, op.mintKind);
    } catch (err) {
      if (err instanceof InvalidIdError) {
        throw new InvalidProposalError(`operation ${index}: ${err.message}`);
      }
      throw err;
    }
    if (op.mintKind !== "product" && !op.mintParentId) {
      throw new InvalidProposalError(
        `operation ${index}: mintKind '${op.mintKind}' requires mintParentId (only 'product' has no parent)`,
      );
    }
  } else if (op.op === "retire") {
    if (!op.targetId) {
      throw new InvalidProposalError(`operation ${index}: 'retire' requires targetId`);
    }
  } else {
    throw new InvalidProposalError(`operation ${index}: unknown op '${(op as { op: string }).op}'`);
  }
}

/** Drafts a proposal in state 'draft' (R-1: agents may only ever produce drafts). */
export async function draftProposal(
  db: SqlExecutor,
  input: DraftProposalInput,
): Promise<{ id: string }> {
  if (!/^(human|run):/.test(input.authoredBy)) {
    throw new InvalidProposalError(
      `authoredBy must be 'human:<id>' or 'run:<id>', got '${input.authoredBy}'`,
    );
  }
  if (input.operations.length === 0) {
    throw new InvalidProposalError("a proposal must contain at least one operation");
  }
  input.operations.forEach(validateOperation);

  const id = `acp.${generateUlid()}`;
  await db.query(
    `insert into architecture.change_proposal (id, intent, authored_by) values ($1, $2, $3)`,
    [id, input.intent, input.authoredBy],
  );

  for (const [index, op] of input.operations.entries()) {
    await db.query(
      `insert into architecture.change_operation
         (proposal_id, ordinal, op, target_id, mint_id, mint_kind, mint_parent_id, mint_name,
          supersedes_id, requires_repository)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        index,
        op.op,
        op.targetId ?? null,
        op.mintId ?? null,
        op.mintKind ?? null,
        op.mintParentId ?? null,
        op.mintName ?? null,
        op.supersedesId ?? null,
        op.requiresRepository ?? false,
      ],
    );
  }

  return { id };
}

interface ProposalRow {
  id: string;
  state: string;
}

async function getProposal(db: SqlExecutor, proposalId: string): Promise<ProposalRow> {
  const { rows } = await db.query<ProposalRow>(
    `select id, state from architecture.change_proposal where id = $1`,
    [proposalId],
  );
  const proposal = rows[0];
  if (!proposal) throw new ProposalNotFoundError(proposalId);
  return proposal;
}

/** draft -> proposed. */
export async function submitProposal(db: SqlExecutor, proposalId: string): Promise<void> {
  const proposal = await getProposal(db, proposalId);
  if (proposal.state !== "draft") {
    throw new IllegalProposalTransitionError(proposalId, proposal.state, "proposed");
  }
  await db.query(`update architecture.change_proposal set state = 'proposed' where id = $1`, [
    proposalId,
  ]);
}

/** proposed -> approved. approvedBy must be a human principal (§3.2). */
export async function approveProposal(
  db: SqlExecutor,
  proposalId: string,
  approvedBy: string,
): Promise<void> {
  const proposal = await getProposal(db, proposalId);
  if (proposal.state !== "proposed") {
    throw new IllegalProposalTransitionError(proposalId, proposal.state, "approved");
  }
  if (!approvedBy.startsWith("human:")) {
    throw new InvalidProposalError(
      `approvedBy must be a human principal ('human:<id>'), got '${approvedBy}'`,
    );
  }
  await db.query(
    `update architecture.change_proposal set state = 'approved', approved_by = $2 where id = $1`,
    [proposalId, approvedBy],
  );
}

/**
 * draft | proposed -> rejected — deliberately *not* legal from `approved`.
 *
 * §5.2 states the state machine as a single line: `draft → proposed →
 * approved → applied | rejected`. Read strictly as a linear chain with a
 * terminal branch, that notation says rejection happens *from* `approved`,
 * alongside `applied`. This implementation reads it differently: rejection
 * is a way to decline a proposal *before* it is approved (a review
 * outcome), not an alternative to applying one that already has been. Once
 * `approved`, a proposal has only one legal next state, `applied` — there
 * is no "unapprove." Chosen because it is the more conservative reading
 * (fewer legal transitions out of a state carrying a recorded human
 * approval, not more), and because nothing in §5 describes a scenario for
 * withdrawing an *already-approved* proposal. This is a genuine reading of
 * an ambiguous line, not a forced one — see
 * `docs/history/iteration-1/REPORT.md`, "Finding 2 (Interpretive
 * decision)", for the full reasoning and what would need to change if a
 * future iteration decides the other reading is correct. Tested in
 * `test/proposal.test.ts`, "state machine rejects out-of-order
 * transitions."
 */
export async function rejectProposal(db: SqlExecutor, proposalId: string): Promise<void> {
  const proposal = await getProposal(db, proposalId);
  if (proposal.state !== "draft" && proposal.state !== "proposed") {
    throw new IllegalProposalTransitionError(proposalId, proposal.state, "rejected");
  }
  await db.query(`update architecture.change_proposal set state = 'rejected' where id = $1`, [
    proposalId,
  ]);
}

/**
 * §5.6: refuse retirement when a live inbound reference exists from a
 * non-terminal Work Item or an active Repository, unless the same proposal
 * supplies succession for this element. Scoped exactly to the two live,
 * cross-context references §5.6 names — not to other architecture elements
 * (a still-providing Component, a still-depended-on Component), which the
 * rule as written does not cover.
 *
 * Delegates the actual cross-context read to Alignment
 * (`graph/alignment.ts#liveReferences`) rather than querying `work.*` /
 * `repo.*` here directly — §2.3 gives Architecture no declared read
 * dependency on Work or Repository at all (only the reverse), and Alignment
 * is the one context declared read-only across all of them.
 */
async function assertRetirementAllowed(
  db: SqlExecutor,
  targetId: string,
  hasSuccessionInThisProposal: boolean,
): Promise<void> {
  if (hasSuccessionInThisProposal) return;

  const refs = await liveReferences(db, targetId);
  const taskRefs = refs.filter((r) => r.reference_kind === "task");
  const repoRefs = refs.filter((r) => r.reference_kind === "repository");

  if (taskRefs.length > 0) {
    throw new RetirementRefusedError(
      targetId,
      `referenced by non-terminal task(s): ${taskRefs.map((r) => r.reference_id).join(", ")}`,
    );
  }
  if (repoRefs.length > 0) {
    throw new RetirementRefusedError(
      targetId,
      `implemented by active repository(ies): ${repoRefs.map((r) => r.reference_id).join(", ")}`,
    );
  }
}

interface ChangeOperationRow {
  ordinal: number;
  op: "create" | "retire";
  target_id: string | null;
  mint_id: string | null;
  mint_kind: string | null;
  mint_parent_id: string | null;
  mint_name: string | null;
  supersedes_id: string | null;
  requires_repository: boolean;
}

export interface ApplyProposalResult {
  proposalId: string;
  mintedIds: string[];
  retiredIds: string[];
  /** Tasks previously blocked on this proposal, now released back to 'draft' (§2.2). */
  releasedTaskIds: string[];
}

/**
 * approved -> applied. Mint, retire, and write succession in one
 * transaction (§3.2, §5.4) — PGlite rolls back the whole transaction if any
 * operation throws (verified directly against this project's driver, not
 * assumed). Ends by releasing any Task blocked on this proposal (§2.2:
 * `ProposalApplied` handled by Work) inside the same transaction, so there
 * is no window where the proposal is applied but its blocked Tasks are not
 * yet released.
 */
export async function applyProposal(db: NexusDb, proposalId: string): Promise<ApplyProposalResult> {
  const proposal = await getProposal(db, proposalId);
  if (proposal.state !== "approved") {
    throw new IllegalProposalTransitionError(proposalId, proposal.state, "applied");
  }

  const { rows: operations } = await db.query<ChangeOperationRow>(
    `select ordinal, op, target_id, mint_id, mint_kind, mint_parent_id, mint_name,
            supersedes_id, requires_repository
     from architecture.change_operation
     where proposal_id = $1
     order by ordinal`,
    [proposalId],
  );

  const supersededByThisProposal = new Set(
    operations
      .filter((o) => o.op === "create" && o.supersedes_id)
      .map((o) => o.supersedes_id as string),
  );

  return db.transaction(async (tx) => {
    const mintedIds: string[] = [];
    const retiredIds: string[] = [];

    for (const op of operations) {
      if (op.op === "create") {
        await tx.query(
          `insert into architecture.element (id, kind, parent_id, name) values ($1, $2, $3, $4)`,
          [op.mint_id, op.mint_kind, op.mint_parent_id, op.mint_name],
        );
        mintedIds.push(op.mint_id as string);

        if (op.supersedes_id) {
          await tx.query(
            `insert into architecture.element_succession (predecessor_id, successor_id, proposal_id)
             values ($1, $2, $3)`,
            [op.supersedes_id, op.mint_id, proposalId],
          );
        }
      } else {
        const targetId = op.target_id as string;
        await assertRetirementAllowed(tx, targetId, supersededByThisProposal.has(targetId));

        const { rows: retired } = await tx.query<{ id: string }>(
          `update architecture.element
             set status = 'retired', updated_at = now()
           where id = $1 and status in ('active', 'deprecated')
           returning id`,
          [targetId],
        );
        if (retired.length === 0) {
          throw new InvalidProposalError(
            `cannot retire ${targetId}: not found, or not 'active'/'deprecated'`,
          );
        }
        retiredIds.push(targetId);
      }
    }

    await tx.query(
      `update architecture.change_proposal set state = 'applied', applied_at = now() where id = $1`,
      [proposalId],
    );

    const releasedTaskIds = await releaseBlockedTasks(tx, proposalId);

    return { proposalId, mintedIds, retiredIds, releasedTaskIds };
  });
}
