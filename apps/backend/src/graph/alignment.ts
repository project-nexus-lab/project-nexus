import type { SqlExecutor } from "../db/sql-executor.js";
import { extractManagedRegion } from "../repository/generate.js";
import type { VcsProvider, VcsProviderCommitStatusState } from "../repository/vcs-provider.js";
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

/**
 * GitHub does not truncate a commit status `description` past this
 * length — it rejects the request outright with a 422 ("Description is
 * too long (maximum is 140 characters)"), confirmed directly against a
 * real, disposable repository, not assumed from documentation (a first
 * attempt at reading GitHub's own published REST API docs did not even
 * mention a length limit). Slicing to exactly this length client-side is
 * therefore load-bearing, not cosmetic: `verification.failures` can
 * concatenate an unbounded number of messages, and without this, a
 * repository with only two or three real alignment failures already
 * risks a thrown `GhCliError` instead of a posted status.
 */
const COMMIT_STATUS_DESCRIPTION_MAX_LENGTH = 140;

const COMMIT_STATUS_CONTEXT = "nexus/alignment";

export interface AlignmentPublishResult {
  status: VcsProviderCommitStatusState;
  description: string;
  /** The exact commit the status was posted against, or `null` when nothing was posted (repository unprovisioned, file missing, or unparseable). */
  sha: string | null;
  verification: AlignmentVerifyResult | null;
}

/**
 * §10.5's Nexus-initiated half (Iteration 21,
 * `docs/history/iteration-21/SCOPE.md`): resolves the repository's own
 * `provider_ref`/default branch, fetches `.nexus/repository.json` at
 * that branch's current commit, reuses `verifyRepositoryAlignment()`
 * unmodified against its managed-region content, and posts the result
 * as a real GitHub Commit Status onto that exact commit — the reverse
 * direction of the repository-initiated mechanism this iteration
 * retires (`src/repository/generate.ts`'s module doc comment).
 *
 * Every "file missing/unparseable" case (SCOPE.md item 4) returns a
 * `status: "error"` result and posts nothing — an unprovisioned or
 * not-yet-bootstrapped repository is a real, expected state, not a bug,
 * and there is no commit to post a status against in that case anyway.
 * Only `verifyRepositoryAlignment`'s own two outcomes (`ok: true` /
 * `ok: false`) reach `postCommitStatus`.
 */
export async function verifyAndPublishAlignment(
  db: SqlExecutor,
  repositoryId: string,
  vcsProvider: VcsProvider,
): Promise<AlignmentPublishResult> {
  const { rows } = await db.query<{ provider_ref: string | null; default_branch: string }>(
    `select provider_ref, default_branch from repo.repository where id = $1`,
    [repositoryId],
  );
  const repo = rows[0];
  if (!repo) {
    return {
      status: "error",
      description: `repository ${repositoryId} does not exist`,
      sha: null,
      verification: null,
    };
  }
  if (!repo.provider_ref) {
    return {
      status: "error",
      description: `repository ${repositoryId} has not been provisioned — no provider_ref`,
      sha: null,
      verification: null,
    };
  }

  const file = await vcsProvider.getFileAtRef(
    repo.provider_ref,
    ".nexus/repository.json",
    repo.default_branch,
  );
  if (!file) {
    return {
      status: "error",
      description: `.nexus/repository.json not found at ${repo.provider_ref}@${repo.default_branch}`,
      sha: null,
      verification: null,
    };
  }

  const region = extractManagedRegion(file.content);
  if (region === null) {
    return {
      status: "error",
      description: ".nexus/repository.json has no managed region",
      sha: file.sha,
      verification: null,
    };
  }

  let requestBody: unknown;
  try {
    requestBody = JSON.parse(region);
  } catch {
    return {
      status: "error",
      description: ".nexus/repository.json's managed region is not valid JSON",
      sha: file.sha,
      verification: null,
    };
  }

  let verification: AlignmentVerifyResult;
  try {
    verification = await verifyRepositoryAlignment(db, requestBody);
  } catch (err) {
    if (err instanceof InvalidAlignmentRequestError) {
      return {
        status: "error",
        description: `.nexus/repository.json does not match the expected shape: ${err.message}`,
        sha: file.sha,
        verification: null,
      };
    }
    throw err;
  }

  const status: VcsProviderCommitStatusState = verification.ok ? "success" : "failure";
  const rawDescription = verification.ok
    ? "repository is aligned with live Nexus state"
    : `alignment failed: ${verification.failures.map((f) => f.message).join("; ")}`;
  // Truncated once, then reused for both the posted status and the return
  // value — a real, live-verified GitHub run caught these diverging when
  // truncation was applied only on the posted side: the result claimed a
  // description GitHub had actually cut short, which is worse than the
  // truncation itself.
  const description = rawDescription.slice(0, COMMIT_STATUS_DESCRIPTION_MAX_LENGTH);

  await vcsProvider.postCommitStatus(repo.provider_ref, file.sha, {
    state: status,
    context: COMMIT_STATUS_CONTEXT,
    description,
  });

  return { status, description, sha: file.sha, verification };
}
