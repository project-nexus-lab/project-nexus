/**
 * VcsProvider — MVP_ARCHITECTURE_V2 §10.2: "VcsProvider is a port; GitHub
 * is one adapter." `NoopVcsProvider` below validated the bootstrap state
 * machine against a fake provider first — the same sequencing Iteration 2
 * used for `AgentRuntimeAdapter` (two no-op adapters before any real SDK
 * integration) and Iteration 3 used for MCP grants (enforcement logic
 * before a real protocol server). A real implementation,
 * `GhCliVcsProvider`, now exists alongside this one
 * (`src/repository/gh-cli-vcs-provider.ts`, Iteration 5) and required no
 * change to this port — see `docs/history/iteration-5/REPORT.md`.
 * `NoopVcsProvider` stays in use for every hermetic test in this project;
 * `GhCliVcsProvider` is exercised only by the separate, non-hermetic
 * `npm run verify:github`.
 *
 * `openPullRequestWithChanges` was added in Iteration 17
 * (`docs/history/iteration-17/SCOPE.md`): §10.2 step 5's remaining,
 * never-attempted half — `generateProjection` already renders real file
 * content but never pushes it anywhere. One method, matching step 5's own
 * granularity ("files rendered; branch nexus/bootstrap; PR opened" is one
 * step's effect, not three), not `pushBranch`/`openPullRequest` split
 * apart. Deliberately does not change `create()` or `provisionRepository`.
 *
 * `getFileAtRef` and `postCommitStatus` were added in Iteration 21
 * (`docs/history/iteration-21/SCOPE.md`), resolving
 * `docs/PROJECT_KNOWLEDGE.md`'s Open Question #7: repositories stop
 * being Nexus clients. Together they let Nexus verify a repository from
 * the *outside* — fetch what it actually committed, post a real result
 * onto it — rather than the repository having to call Nexus itself.
 * Added to the port, not left `GhCliVcsProvider`-only (unlike
 * `deleteRepository`, §10.2 never describes deletion at all): a
 * hermetic caller needs a fake counterpart for both, the same reason
 * `openPullRequestWithChanges` is on the port rather than bolted onto
 * one adapter.
 */

export interface VcsProviderCreateInput {
  name: string;
  defaultBranch: string;
}

export interface VcsProviderCreateResult {
  /** e.g. "owner/name" for a real GitHub adapter; provider-defined shape. */
  providerRef: string;
}

export interface VcsProviderFile {
  path: string;
  content: string;
}

export interface VcsProviderOpenPullRequestInput {
  providerRef: string;
  branch: string;
  baseBranch: string;
  files: VcsProviderFile[];
  title: string;
  body: string;
}

export interface VcsProviderOpenPullRequestResult {
  prUrl: string;
}

export interface VcsProviderFileAtRef {
  content: string;
  /** The exact commit SHA `content` was read at — not necessarily `ref` itself, if `ref` was a branch name. */
  sha: string;
}

export type VcsProviderCommitStatusState = "success" | "failure" | "error" | "pending";

export interface VcsProviderCommitStatusInput {
  state: VcsProviderCommitStatusState;
  context: string;
  description: string;
}

export interface VcsProvider {
  readonly id: string;
  create(input: VcsProviderCreateInput): Promise<VcsProviderCreateResult>;
  /**
   * `branch` must not already exist on the remote — this covers a
   * single, first-ever bootstrap push only (§10.2 step 5), not an update
   * to an already-opened PR. `GhCliVcsProvider`'s real implementation
   * always branches fresh from `baseBranch`'s current tip; calling this
   * again for a branch that already has a prior commit on the remote
   * fails as a real, typed push rejection (Iteration 17,
   * `docs/history/iteration-17/SCOPE.md` — "Explicit Deferrals:
   * incremental/repeat bootstrap pushes"), not an update. A future
   * iteration adding repeat/incremental pushes would need to document
   * that separately, not assume this method already supports it.
   */
  openPullRequestWithChanges(
    input: VcsProviderOpenPullRequestInput,
  ): Promise<VcsProviderOpenPullRequestResult>;
  /** `null`, not a throw, when `path` does not exist at `ref` — an unbootstrapped repository is a real, expected state, not an error. */
  getFileAtRef(providerRef: string, path: string, ref: string): Promise<VcsProviderFileAtRef | null>;
  postCommitStatus(providerRef: string, sha: string, input: VcsProviderCommitStatusInput): Promise<void>;
}

/** Does no real provisioning. Exists to validate the state machine and the port, not to stand in for GitHub. */
export class NoopVcsProvider implements VcsProvider {
  readonly id = "noop";

  async create(input: VcsProviderCreateInput): Promise<VcsProviderCreateResult> {
    return { providerRef: `noop/${input.name}` };
  }

  async openPullRequestWithChanges(
    input: VcsProviderOpenPullRequestInput,
  ): Promise<VcsProviderOpenPullRequestResult> {
    return { prUrl: `noop://${input.providerRef}/pull/${input.branch}` };
  }

  async getFileAtRef(): Promise<VcsProviderFileAtRef | null> {
    return null;
  }

  async postCommitStatus(): Promise<void> {
    // does no real I/O — exists to validate the port, not to stand in for GitHub.
  }
}
