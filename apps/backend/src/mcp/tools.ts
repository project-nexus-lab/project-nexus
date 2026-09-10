import type { SqlExecutor } from "../db/sql-executor.js";
import { ancestry, capabilitiesOf, type AncestryRow, type CapabilityRow } from "../graph/traversals.js";
import { assertInGrant, type McpGrant } from "./grant.js";

/**
 * Grant-checked Architecture MCP tool wrappers (§9.2) — two of the seven
 * documented there, chosen because both already exist and are already
 * tested (`src/graph/traversals.ts`). This iteration tests grant
 * enforcement itself, not the size of the tool catalog; the other five
 * Architecture tools, and all of Work MCP and Repository MCP, are
 * deferred (see `docs/history/iteration-3/REPORT.md`).
 *
 * The grant check applies to the tool call's target only. `getAncestry`
 * still walks all the way to the containment root even when the root's id
 * is not itself in `grant.allowedElementIds` — §9.5 does not say whether a
 * grant should also filter a tool's result set, and this project reads it
 * as authorizing the *call*, not re-deriving the traversal's own contract
 * to also mean "and filter everything it returns." A disclosed choice, not
 * an oversight — see the Iteration 3 report for the reasoning and what
 * would need to change if a future iteration decides otherwise.
 */

export async function getAncestry(
  db: SqlExecutor,
  grant: McpGrant,
  elementId: string,
): Promise<AncestryRow[]> {
  assertInGrant(grant, "element", elementId);
  return ancestry(db, elementId);
}

export async function getCapabilitiesOf(
  db: SqlExecutor,
  grant: McpGrant,
  componentId: string,
): Promise<CapabilityRow[]> {
  assertInGrant(grant, "element", componentId);
  return capabilitiesOf(db, componentId);
}
