import type { SqlExecutor } from "../db/sql-executor.js";
import { capabilitiesOf, resolve } from "./traversals.js";

/** Alignment context (§8.5) — named queries, no state of its own. */

export interface OrphanTaskRow {
  task_id: string;
  title: string;
  status: string;
}

/** orphanTasks(): Task with no AFFECTS edge. */
export async function orphanTasks(db: SqlExecutor): Promise<OrphanTaskRow[]> {
  const { rows } = await db.query<OrphanTaskRow>(`select * from alignment.orphan_tasks()`);
  return rows;
}

export interface UnprovidedCapabilityRow {
  capability_id: string;
  name: string;
}

/** unprovidedCapabilities(): Capability with no provider. */
export async function unprovidedCapabilities(
  db: SqlExecutor,
): Promise<UnprovidedCapabilityRow[]> {
  const { rows } = await db.query<UnprovidedCapabilityRow>(
    `select * from alignment.unprovided_capabilities()`,
  );
  return rows;
}

export interface LiveReferenceRow {
  reference_kind: "task" | "repository";
  reference_id: string;
}

/**
 * liveReferences(element): non-terminal Tasks affecting it, and active
 * Repositories implementing it (§5.6). The one place the Architecture
 * Change Proposal's retirement check (§5.6) is allowed to ask this — see
 * the migration this wraps for why it lives in Alignment, not Architecture.
 */
export async function liveReferences(
  db: SqlExecutor,
  elementId: string,
): Promise<LiveReferenceRow[]> {
  const { rows } = await db.query<LiveReferenceRow>(`select * from alignment.live_references($1)`, [
    elementId,
  ]);
  return rows;
}

/**
 * `POST /alignment/verify` (§10.5) — Iteration 18
 * (`docs/history/iteration-18/SCOPE.md`). Composes entirely from
 * already-existing functions (`resolve`, `capabilitiesOf`); the one
 * genuinely new check is the posted-vs-live component mapping
 * comparison, since nothing before this iteration compared a
 * repository's externally-supplied mapping against
 * `repo.repository_component`'s live one.
 *
 * `resolve()` alone cannot distinguish "real and active" from "never
 * existed" — it always returns at least the input id unchanged when no
 * succession edge exists, whether or not that id is real
 * (`graph.resolve()`, `db/migrations/0007_graph.sql`). Existence/status
 * is checked separately against `architecture.element` after resolving.
 */
export class InvalidAlignmentRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAlignmentRequestError";
  }
}

export interface AlignmentIssue {
  code:
    | "unknown-repository"
    | "mapping-mismatch"
    | "element-not-found"
    | "element-retired-no-successor"
    | "component-provides-nothing"
    | "element-superseded";
  message: string;
  elementId?: string;
  successorId?: string;
}

export interface AlignmentVerifyInput {
  repositoryId: string;
  componentIds: string[];
}

export interface AlignmentVerifyResult {
  ok: boolean;
  failures: AlignmentIssue[];
  warnings: AlignmentIssue[];
}

function validateAlignmentInput(input: unknown): AlignmentVerifyInput {
  const body = input as Partial<AlignmentVerifyInput> | null | undefined;
  if (!body || typeof body.repositoryId !== "string") {
    throw new InvalidAlignmentRequestError("repositoryId is required and must be a string");
  }
  if (
    !Array.isArray(body.componentIds) ||
    !body.componentIds.every((id): id is string => typeof id === "string")
  ) {
    throw new InvalidAlignmentRequestError("componentIds is required and must be an array of strings");
  }
  return { repositoryId: body.repositoryId, componentIds: body.componentIds };
}

/**
 * Checks a repository's posted `{ repositoryId, componentIds }` (the
 * parsed content of `.nexus/repository.json`) against Nexus's live
 * state. `ok: false` (a real fail condition) is a normal, structured
 * result, not a thrown error — the same way "repository ID unknown" is
 * one line of §10.5's own checklist, not an HTTP routing failure. Only
 * a malformed request (`InvalidAlignmentRequestError`) throws.
 */
export async function verifyRepositoryAlignment(
  db: SqlExecutor,
  input: unknown,
): Promise<AlignmentVerifyResult> {
  const { repositoryId, componentIds } = validateAlignmentInput(input);

  const { rows: repoRows } = await db.query<{ id: string }>(
    `select id from repo.repository where id = $1`,
    [repositoryId],
  );
  if (repoRows.length === 0) {
    return {
      ok: false,
      failures: [
        { code: "unknown-repository", message: `repository ${repositoryId} does not exist` },
      ],
      warnings: [],
    };
  }

  const { rows: liveMappingRows } = await db.query<{ component_id: string }>(
    `select component_id from repo.repository_component where repository_id = $1 order by component_id`,
    [repositoryId],
  );
  const liveComponentIds = liveMappingRows.map((r) => r.component_id);

  const failures: AlignmentIssue[] = [];
  const warnings: AlignmentIssue[] = [];

  // Posted vs. live mapping: size equality + one-directional subset check
  // is sufficient to prove set equality (two finite sets of equal size,
  // one a subset of the other, are the same set) — no need to also walk
  // the reverse direction separately.
  const posted = new Set(componentIds);
  const live = new Set(liveComponentIds);
  const mismatch = posted.size !== live.size || [...posted].some((id) => !live.has(id));
  if (mismatch) {
    failures.push({
      code: "mapping-mismatch",
      message: `posted componentIds [${[...posted].sort().join(", ")}] do not match the live mapping [${[...live].sort().join(", ")}]`,
    });
  }

  for (const componentId of posted) {
    const resolved = await resolve(db, componentId);
    const resolvedId = resolved[0] ?? componentId;
    const { rows } = await db.query<{ status: string }>(
      `select status from architecture.element where id = $1`,
      [resolvedId],
    );
    const status = rows[0]?.status;
    if (!status) {
      failures.push({
        code: "element-not-found",
        message: `${componentId} does not exist and has no succession`,
        elementId: componentId,
      });
    } else if (status === "retired") {
      // Checked regardless of whether resolvedId === componentId: a
      // succession chain that terminates in a retired element (the only
      // way resolve() would stop there) is a dead end, not merely
      // "renamed" — resolvedId !== componentId alone is not sufficient
      // grounds for the milder 'element-superseded' warning below.
      failures.push({
        code: "element-retired-no-successor",
        message:
          resolvedId === componentId
            ? `${componentId} is retired with no successor`
            : `${componentId} was superseded by ${resolvedId}, which is itself retired with no further successor`,
        elementId: componentId,
        ...(resolvedId !== componentId ? { successorId: resolvedId } : {}),
      });
    } else if (resolvedId !== componentId) {
      warnings.push({
        code: "element-superseded",
        message: `${componentId} has been superseded by ${resolvedId}`,
        elementId: componentId,
        successorId: resolvedId,
      });
    }
  }

  for (const componentId of liveComponentIds) {
    const caps = await capabilitiesOf(db, componentId);
    if (caps.length === 0) {
      failures.push({
        code: "component-provides-nothing",
        message: `${componentId} provides no capabilities`,
        elementId: componentId,
      });
    }
  }

  return { ok: failures.length === 0, failures, warnings };
}
