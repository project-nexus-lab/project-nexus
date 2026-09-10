import type { SqlExecutor } from "../db/sql-executor.js";
import { localSubgraph } from "../graph/traversals.js";
import { assertId } from "../ids/ids.js";
import { hashManagedRegion, render, type ManagedFile } from "./generate.js";
import type { VcsProvider } from "./vcs-provider.js";

/**
 * Repository bootstrap state machine — MVP_ARCHITECTURE_V2 §10.1, §10.2:
 * `declared → provisioned → mapped → bootstrapped → active`.
 *
 * Before this iteration, every `repo.repository` row in this codebase was
 * created by `src/import/repository.ts` bulk-inserting directly from YAML
 * — bypassing this state machine entirely, even though it has existed as
 * schema since Iteration 0 (`db/migrations/0004_repo.sql`) and §10.2
 * states plainly: "Repositories are never created outside this flow."
 * That YAML import path is unchanged and still bypasses this — a
 * disclosed tension, not silently resolved; see
 * `docs/history/iteration-4/REPORT.md`.
 *
 * Step 6, "Human merges PR" → `active`, and the `RepositoryActivated`
 * event (§2.2: "Tasks awaiting a repository re-gated") are both out of
 * scope: there is no real VCS integration to merge a PR against (§10.2's
 * `VcsProvider` here is `NoopVcsProvider`), and no "Task blocked on a
 * missing repository" state exists anywhere in this schema to re-gate —
 * only `blocked_by_proposal_id` exists, tied to proposals, not
 * repositories. `activateRepository` here is a bare state transition.
 */

export class RepositoryNotFoundError extends Error {
  constructor(public readonly repositoryId: string) {
    super(`repository ${repositoryId} does not exist`);
    this.name = "RepositoryNotFoundError";
  }
}

export class IllegalRepositoryTransitionError extends Error {
  constructor(
    public readonly repositoryId: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`repository ${repositoryId} cannot transition from '${from}' to '${to}'`);
    this.name = "IllegalRepositoryTransitionError";
  }
}

interface RepositoryRow {
  id: string;
  name: string;
  provider: string;
  provider_ref: string | null;
  default_branch: string;
  bootstrap_state: string;
  template_version: string | null;
}

async function getRepository(db: SqlExecutor, repositoryId: string): Promise<RepositoryRow> {
  const { rows } = await db.query<RepositoryRow>(
    `select id, name, provider, provider_ref, default_branch, bootstrap_state, template_version
     from repo.repository where id = $1`,
    [repositoryId],
  );
  const repo = rows[0];
  if (!repo) throw new RepositoryNotFoundError(repositoryId);
  return repo;
}

/** Step 2: mint the repository, state `declared`. `id` is caller-supplied and validated, the same pattern `draftProposal`'s `mintId` already uses — Nexus validates the slug's legality, it does not invent the text. */
export async function declareRepository(
  db: SqlExecutor,
  input: { id: string; name: string; provider: string; defaultBranch?: string },
): Promise<void> {
  assertId(input.id, "repository");
  await db.query(
    `insert into repo.repository (id, name, provider, default_branch) values ($1, $2, $3, $4)`,
    [input.id, input.name, input.provider, input.defaultBranch ?? "main"],
  );
}

/** Step 3: `declared` -> `provisioned`. Calls the VcsProvider port; stores whatever `provider_ref` it returns. */
export async function provisionRepository(
  db: SqlExecutor,
  repositoryId: string,
  vcsProvider: VcsProvider,
): Promise<void> {
  const repo = await getRepository(db, repositoryId);
  if (repo.bootstrap_state !== "declared") {
    throw new IllegalRepositoryTransitionError(repositoryId, repo.bootstrap_state, "provisioned");
  }
  const { providerRef } = await vcsProvider.create({ name: repo.name, defaultBranch: repo.default_branch });
  await db.query(
    `update repo.repository set provider_ref = $2, bootstrap_state = 'provisioned' where id = $1`,
    [repositoryId, providerRef],
  );
}

/**
 * Step 4: `provisioned` -> `mapped` on the first mapping; further mappings
 * are legal while already `mapped` (the invariant is "at least one",
 * §3.6, not "exactly one").
 */
export async function registerMapping(
  db: SqlExecutor,
  repositoryId: string,
  componentId: string,
  isPrimary: boolean,
): Promise<void> {
  const repo = await getRepository(db, repositoryId);
  if (repo.bootstrap_state !== "provisioned" && repo.bootstrap_state !== "mapped") {
    throw new IllegalRepositoryTransitionError(repositoryId, repo.bootstrap_state, "mapped");
  }
  await db.query(
    `insert into repo.repository_component (repository_id, component_id, is_primary)
     values ($1, $2, $3)`,
    [repositoryId, componentId, isPrimary],
  );
  if (repo.bootstrap_state === "provisioned") {
    await db.query(`update repo.repository set bootstrap_state = 'mapped' where id = $1`, [repositoryId]);
  }
}

/**
 * Step 5: `mapped` -> `bootstrapped`. Generates the managed files (§10.3),
 * hashes each one's managed region (§10.4) into `repo.generated_region`,
 * and transitions state. Stands in for "files rendered; branch
 * nexus/bootstrap; PR opened" (§10.2) — no branch, no PR, no real VCS
 * write; see the module doc comment.
 */
export async function generateProjection(
  db: SqlExecutor,
  repositoryId: string,
  templateVersion: string,
): Promise<ManagedFile[]> {
  const repo = await getRepository(db, repositoryId);
  if (repo.bootstrap_state !== "mapped") {
    throw new IllegalRepositoryTransitionError(repositoryId, repo.bootstrap_state, "bootstrapped");
  }

  const { rows: mappings } = await db.query<{ component_id: string }>(
    `select component_id from repo.repository_component where repository_id = $1 order by component_id`,
    [repositoryId],
  );
  const componentIds = mappings.map((m) => m.component_id);
  const subgraphs = await Promise.all(componentIds.map((id) => localSubgraph(db, id)));

  const files = render({
    repository: { id: repo.id, name: repo.name, defaultBranch: repo.default_branch },
    componentIds,
    subgraphs,
    templateVersion,
  });

  for (const file of files) {
    const hash = hashManagedRegion(file.content);
    if (!hash) throw new Error(`generated file ${file.path} has no managed region — a generator bug, not caller input`);
    await db.query(
      `insert into repo.generated_region (repository_id, file_path, region_hash)
       values ($1, $2, $3)
       on conflict (repository_id, file_path) do update set region_hash = excluded.region_hash`,
      [repositoryId, file.path, hash],
    );
  }

  await db.query(
    `update repo.repository set bootstrap_state = 'bootstrapped', template_version = $2 where id = $1`,
    [repositoryId, templateVersion],
  );

  return files;
}

/** Step 6: `bootstrapped` -> `active`. See the module doc comment for what this deliberately does not do. */
export async function activateRepository(db: SqlExecutor, repositoryId: string): Promise<void> {
  const repo = await getRepository(db, repositoryId);
  if (repo.bootstrap_state !== "bootstrapped") {
    throw new IllegalRepositoryTransitionError(repositoryId, repo.bootstrap_state, "active");
  }
  await db.query(`update repo.repository set bootstrap_state = 'active' where id = $1`, [repositoryId]);
}

export interface DriftResult {
  drifted: boolean;
  storedHash: string | null;
  currentHash: string | null;
}

/**
 * §10.5's drift check, narrowed to the managed-region comparison only —
 * the rest of §10.5's rule set (unknown repo id, broken/superseded
 * references, unprovided-capability-on-mapped-component) is deferred; see
 * `docs/history/iteration-4/REPORT.md`. Compares only the hash of the
 * *current* file's managed region against what `generateProjection`
 * stored — content outside the markers never enters the comparison,
 * because `hashManagedRegion` never reads it.
 */
export async function checkDrift(
  db: SqlExecutor,
  repositoryId: string,
  filePath: string,
  currentFileContent: string,
): Promise<DriftResult> {
  const { rows } = await db.query<{ region_hash: string }>(
    `select region_hash from repo.generated_region where repository_id = $1 and file_path = $2`,
    [repositoryId, filePath],
  );
  const storedHash = rows[0]?.region_hash ?? null;
  const currentHash = hashManagedRegion(currentFileContent);
  return { drifted: storedHash !== currentHash, storedHash, currentHash };
}
