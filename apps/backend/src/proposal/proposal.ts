import type { NexusDb } from "../db/client.js";
import type { SqlExecutor } from "../db/sql-executor.js";
import { liveReferences } from "../graph/alignment.js";
import { assertId, assertPrefixMatchesKind, generateUlid, InvalidIdError } from "../ids/ids.js";
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
 * below needs it. Validating the proposal model initially required only
 * `create` and `retire`.
 *
 * `provide` was added in Iteration 12 (`docs/history/iteration-12/SCOPE.md`):
 * minting a component to satisfy a missing capability is not, on its own,
 * enough to make that capability usable — `buildWorkPackage`'s gate and
 * `unprovidedCapabilities()` (`src/graph/alignment.ts`) both check for a
 * real `element_provision` row, not merely the component's existence.
 * `provide` writes into that existing table unchanged; its own
 * kind-checked foreign keys and at-most-one-primary-provider index remain
 * the final word, the same discipline `create`/`retire` already follow
 * for containment and retirement.
 *
 * `decide` was added in Iteration 16 (`docs/history/iteration-16/SCOPE.md`):
 * `architecture.decision` had no governed creation path at all — every
 * row was a direct insert. `decide` closes it the same way `provide`
 * closed the equivalent Element gap: a fourth operation on this same
 * mechanism, not a second, parallel proposal-and-approval lifecycle.
 * A Decision is inserted only at apply time, already `status = 'accepted'`
 * — the same pattern `create` already established for Elements (minted
 * only at apply time, already `'active'`). No attribution columns were
 * added to `architecture.decision` itself; attribution is discoverable
 * the same indirect way a minted Element's already is, by joining back
 * through `change_operation`/`change_proposal`. `decision_scope` (which
 * elements a Decision governs) remains untouched — a separate, still
 * unimplemented gap (`docs/history/iteration-12/LESSONS.md`).
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
  op: "create" | "retire" | "provide" | "decide";
  // create:
  mintId?: string;
  mintKind?: ArchitectureKind;
  mintParentId?: string;
  mintName?: string;
  supersedesId?: string;
  requiresRepository?: boolean;
  // retire:
  targetId?: string;
  // provide (Component provides Capability, R2 §4.2):
  provideComponentId?: string;
  provideCapabilityId?: string;
  provideIsPrimary?: boolean;
  // decide (governed Decision creation, Iteration 16):
  decideId?: string;
  decideTitle?: string;
  decideStatement?: string;
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
  } else if (op.op === "provide") {
    if (!op.provideComponentId || !op.provideCapabilityId) {
      throw new InvalidProposalError(
        `operation ${index}: 'provide' requires provideComponentId and provideCapabilityId`,
      );
    }
  } else if (op.op === "decide") {
    if (!op.decideId || !op.decideTitle || !op.decideStatement) {
      throw new InvalidProposalError(
        `operation ${index}: 'decide' requires decideId, decideTitle, and decideStatement`,
      );
    }
    try {
      assertId(op.decideId, "decision");
    } catch (err) {
      if (err instanceof InvalidIdError) {
        throw new InvalidProposalError(`operation ${index}: ${err.message}`);
      }
      throw err;
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
          supersedes_id, requires_repository, provide_component_id, provide_capability_id,
          provide_is_primary, decide_id, decide_title, decide_statement)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
        op.provideComponentId ?? null,
        op.provideCapabilityId ?? null,
        op.provideIsPrimary ?? false,
        op.decideId ?? null,
        op.decideTitle ?? null,
        op.decideStatement ?? null,
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
  op: "create" | "retire" | "provide" | "decide";
  target_id: string | null;
  mint_id: string | null;
  mint_kind: string | null;
  mint_parent_id: string | null;
  mint_name: string | null;
  supersedes_id: string | null;
  requires_repository: boolean;
  provide_component_id: string | null;
  provide_capability_id: string | null;
  provide_is_primary: boolean;
  decide_id: string | null;
  decide_title: string | null;
  decide_statement: string | null;
}

export interface ApplyProposalResult {
  proposalId: string;
  mintedIds: string[];
  retiredIds: string[];
  /** Provision edges established by this proposal's `provide` operations (Iteration 12). */
  providedLinks: Array<{ componentId: string; capabilityId: string }>;
  /** Decisions created by this proposal's `decide` operations (Iteration 16), already 'accepted'. */
  decidedIds: string[];
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
            supersedes_id, requires_repository, provide_component_id, provide_capability_id,
            provide_is_primary, decide_id, decide_title, decide_statement
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
    const providedLinks: Array<{ componentId: string; capabilityId: string }> = [];
    const decidedIds: string[] = [];

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
      } else if (op.op === "provide") {
        const componentId = op.provide_component_id as string;
        const capabilityId = op.provide_capability_id as string;
        await tx.query(
          `insert into architecture.element_provision (component_id, capability_id, is_primary)
           values ($1, $2, $3)`,
          [componentId, capabilityId, op.provide_is_primary],
        );
        providedLinks.push({ componentId, capabilityId });
      } else if (op.op === "decide") {
        await tx.query(
          `insert into architecture.decision (id, title, status, statement)
           values ($1, $2, 'accepted', $3)`,
          [op.decide_id, op.decide_title, op.decide_statement],
        );
        decidedIds.push(op.decide_id as string);
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

    return { proposalId, mintedIds, retiredIds, providedLinks, decidedIds, releasedTaskIds };
  });
}

/**
 * Read-only proposal detail — Iteration 13
 * (`docs/history/iteration-13/SCOPE.md`): before this, nothing exposed a
 * proposal's own operations, so a reviewer had to approve blind. Only
 * fields relevant to each operation's `op` are included, mirroring
 * `ProposalOperationInput`'s own shape rather than exposing every raw
 * nullable column.
 */
export interface ProposalOperationDetail {
  ordinal: number;
  op: "create" | "retire" | "provide" | "decide";
  targetId?: string;
  mintId?: string;
  mintKind?: string;
  mintParentId?: string;
  mintName?: string;
  supersedesId?: string;
  requiresRepository?: boolean;
  provideComponentId?: string;
  provideCapabilityId?: string;
  provideIsPrimary?: boolean;
  decideId?: string;
  decideTitle?: string;
  decideStatement?: string;
}

export interface ProposalDetail {
  id: string;
  intent: string;
  state: string;
  authoredBy: string;
  approvedBy: string | null;
  operations: ProposalOperationDetail[];
}

function toOperationDetail(op: ChangeOperationRow): ProposalOperationDetail {
  const detail: ProposalOperationDetail = { ordinal: op.ordinal, op: op.op };
  if (op.target_id !== null) detail.targetId = op.target_id;
  if (op.mint_id !== null) detail.mintId = op.mint_id;
  if (op.mint_kind !== null) detail.mintKind = op.mint_kind;
  if (op.mint_parent_id !== null) detail.mintParentId = op.mint_parent_id;
  if (op.mint_name !== null) detail.mintName = op.mint_name;
  if (op.supersedes_id !== null) detail.supersedesId = op.supersedes_id;
  if (op.requires_repository) detail.requiresRepository = op.requires_repository;
  if (op.provide_component_id !== null) detail.provideComponentId = op.provide_component_id;
  if (op.provide_capability_id !== null) detail.provideCapabilityId = op.provide_capability_id;
  if (op.provide_is_primary) detail.provideIsPrimary = op.provide_is_primary;
  if (op.decide_id !== null) detail.decideId = op.decide_id;
  if (op.decide_title !== null) detail.decideTitle = op.decide_title;
  if (op.decide_statement !== null) detail.decideStatement = op.decide_statement;
  return detail;
}

export async function getProposalDetail(
  db: SqlExecutor,
  proposalId: string,
): Promise<ProposalDetail> {
  const { rows } = await db.query<{
    id: string;
    intent: string;
    state: string;
    authored_by: string;
    approved_by: string | null;
  }>(
    `select id, intent, state, authored_by, approved_by
     from architecture.change_proposal where id = $1`,
    [proposalId],
  );
  const proposal = rows[0];
  if (!proposal) throw new ProposalNotFoundError(proposalId);

  const { rows: operations } = await db.query<ChangeOperationRow>(
    `select ordinal, op, target_id, mint_id, mint_kind, mint_parent_id, mint_name,
            supersedes_id, requires_repository, provide_component_id, provide_capability_id,
            provide_is_primary, decide_id, decide_title, decide_statement
     from architecture.change_operation
     where proposal_id = $1
     order by ordinal`,
    [proposalId],
  );

  return {
    id: proposal.id,
    intent: proposal.intent,
    state: proposal.state,
    authoredBy: proposal.authored_by,
    approvedBy: proposal.approved_by,
    operations: operations.map(toOperationDetail),
  };
}

export interface ProposalSummary {
  id: string;
  intent: string;
  state: string;
  authoredBy: string;
}

export interface ListProposalsFilter {
  state?: string | undefined;
}

/**
 * Bounded proposal listing — a PO's pending-review queue. Fixed cap, no
 * cursor pagination, same postponement `listElements`
 * (`src/graph/elements.ts`) and §9.6 already apply to MCP.
 */
const LIST_PROPOSALS_LIMIT = 200;

export async function listProposals(
  db: SqlExecutor,
  filter: ListProposalsFilter = {},
): Promise<ProposalSummary[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.state) {
    params.push(filter.state);
    conditions.push(`state = $${params.length}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  const { rows } = await db.query<{
    id: string;
    intent: string;
    state: string;
    authored_by: string;
  }>(
    `select id, intent, state, authored_by from architecture.change_proposal ${where}
     order by created_at limit ${LIST_PROPOSALS_LIMIT}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    intent: r.intent,
    state: r.state,
    authoredBy: r.authored_by,
  }));
}
