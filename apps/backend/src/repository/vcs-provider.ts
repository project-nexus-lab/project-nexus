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
 */

export interface VcsProviderCreateInput {
  name: string;
  defaultBranch: string;
}

export interface VcsProviderCreateResult {
  /** e.g. "owner/name" for a real GitHub adapter; provider-defined shape. */
  providerRef: string;
}

export interface VcsProvider {
  readonly id: string;
  create(input: VcsProviderCreateInput): Promise<VcsProviderCreateResult>;
}

/** Does no real provisioning. Exists to validate the state machine and the port, not to stand in for GitHub. */
export class NoopVcsProvider implements VcsProvider {
  readonly id = "noop";

  async create(input: VcsProviderCreateInput): Promise<VcsProviderCreateResult> {
    return { providerRef: `noop/${input.name}` };
  }
}
