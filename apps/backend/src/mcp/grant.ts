import type { SqlExecutor } from "../db/sql-executor.js";
import { impactOf } from "../graph/traversals.js";
import type { WorkPackageResult } from "../workpackage/build.js";

/**
 * The MCP access model — MVP_ARCHITECTURE_V2 §9.5.
 *
 * "Every MCP session is authorised by a run-scoped grant issued when an
 * ExecutionRun is dispatched... The grant is always exactly one level
 * wider than the package the profile built. That is a rule, not two magic
 * numbers: the package carries the minimum to start, the grant carries
 * the minimum to discover what else is needed, and anything beyond that
 * is a RunBlocked with reason context-insufficient rather than a silent
 * widening."
 *
 * This is `docs/PROJECT_KNOWLEDGE.md`'s top-ranked Open Question as of
 * Iteration 2's close: is this a real enforcement boundary, or only a
 * documented formula nobody checks? `buildGrant` here is the formula;
 * `assertInGrant` (this file) and `src/mcp/tools.ts` are the check.
 *
 * The `McpGrant` shape was first defined in `src/runtime/port.ts`
 * (Iteration 2), as a placeholder — nothing existed yet to construct or
 * enforce one, only a port signature that needed the type. This is its
 * real home now that something does both; `runtime/port.ts` imports it
 * from here instead of duplicating it. A disclosed correction, the same
 * shape as Iteration 1's Alignment-boundary fix — not a new decision.
 */
export interface McpGrant {
  runId: string;
  workPackageId: string;
  allowedElementIds: string[];
  allowedRepositoryIds: string[];
  expiresAt: string; // ISO timestamp
}

/**
 * Builds a run-scoped grant from an already-generated Work Package.
 * `runId` is accepted as a parameter rather than looked up — no
 * `execution.execution_run` row is created here; there is no Orchestrator
 * yet to dispatch one (§16 1f, still deferred). A caller stands in for
 * that dispatch step, the same way Iteration 1's tests stood in for a
 * RunBlocked-raising Orchestrator when driving the proposal lifecycle.
 */
export async function buildGrant(
  db: SqlExecutor,
  workPackage: WorkPackageResult,
  runId: string,
  ttlSeconds = 3600,
): Promise<McpGrant> {
  const { rows } = await db.query<{ context_depth: number }>(
    `select context_depth from execution.work_package_profile where id = $1`,
    [workPackage.profileId],
  );
  const profile = rows[0];
  if (!profile) {
    // Structurally prevented by the FK on execution.work_package.profile_id;
    // no real caller can trigger this. Not worth a bespoke error type.
    throw new Error(`work package profile ${workPackage.profileId} does not exist`);
  }

  // "WP elements": the payload's own capabilities and components. "∪
  // impactOf(components, context_depth + 1)": one level wider than what
  // the Work Package itself resolved (§11.2 step 4 used context_depth
  // exactly; the grant deliberately widens by one).
  const widerDepth = profile.context_depth + 1;
  const impacted = new Set<string>();
  for (const componentId of workPackage.payload.components) {
    for (const impact of await impactOf(db, componentId, widerDepth)) {
      impacted.add(impact.component_id);
    }
  }

  const allowedElementIds = [
    ...new Set([...workPackage.payload.capabilities, ...workPackage.payload.components, ...impacted]),
  ];
  const allowedRepositoryIds = [...new Set(workPackage.payload.repositories)];

  return {
    runId,
    workPackageId: workPackage.id,
    allowedElementIds,
    allowedRepositoryIds,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

export type GrantRefusalReason = "expired" | "out-of-grant";

/** A tool call refused because the grant has expired, or the requested id isn't in it. */
export class GrantRefusedError extends Error {
  constructor(
    public readonly reason: GrantRefusalReason,
    public readonly runId: string,
    detail: string,
  ) {
    super(`MCP call refused for run ${runId}: ${detail}`);
    this.name = "GrantRefusedError";
  }
}

function assertGrantNotExpired(grant: McpGrant): void {
  if (new Date(grant.expiresAt).getTime() <= Date.now()) {
    throw new GrantRefusedError("expired", grant.runId, `grant expired at ${grant.expiresAt}`);
  }
}

/**
 * "A tool call outside the grant is refused" (§9.5). Checked against the
 * tool call's *target* — the id the caller asked for — not against every
 * id a tool's result might go on to mention. See `src/mcp/tools.ts` for
 * what that means in practice for a traversal like `ancestry`.
 */
export function assertInGrant(grant: McpGrant, kind: "element" | "repository", id: string): void {
  assertGrantNotExpired(grant);
  const allowed = kind === "element" ? grant.allowedElementIds : grant.allowedRepositoryIds;
  if (!allowed.includes(id)) {
    throw new GrantRefusedError("out-of-grant", grant.runId, `${kind} ${id} is not in this grant`);
  }
}
