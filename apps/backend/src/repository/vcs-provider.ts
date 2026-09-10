/**
 * VcsProvider — MVP_ARCHITECTURE_V2 §10.2: "VcsProvider is a port; GitHub
 * is one adapter." Deliberately not a real GitHub integration in this
 * iteration — GitHub integration was excluded from scope from Iteration 0
 * onward and that exclusion is not being revisited here. Validating the
 * bootstrap state machine against a fake provider first is the same
 * sequencing Iteration 2 used for `AgentRuntimeAdapter` (two no-op
 * adapters before any real SDK integration) and Iteration 3 used for MCP
 * grants (enforcement logic before a real protocol server) — proven twice
 * already to be the right order for this project.
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
