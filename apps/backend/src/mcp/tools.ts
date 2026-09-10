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
 * The grant check applies to the tool call's target only — that part is
 * unchanged and still correct (see `docs/PROJECT_KNOWLEDGE.md` Validated).
 *
 * `getAncestry`'s *result* is now filtered (Iteration 7,
 * `docs/history/iteration-7/SCOPE.md`/`REPORT.md`): Iteration 3 left the
 * full chain unredacted as a disclosed, deliberate choice, reasoning that
 * §9.5 authorizes the call, not the result. Iteration 7 tested that
 * choice against a real agent, not just in the abstract — a real,
 * narrowly-scoped run, given a legitimate reason to call this tool and
 * never told about the wider product context, still surfaced an
 * out-of-grant ancestor's name unprompted in its own final output. That
 * is a real disclosure, not a theoretical one, so the choice was
 * corrected rather than left as documented risk.
 */

/** A redacted ancestor is a real row at a real depth and kind — only its identity is hidden. */
export function redactOutOfGrantAncestor(row: AncestryRow, grant: McpGrant): AncestryRow {
  if (grant.allowedElementIds.includes(row.id)) return row;
  // Depth-scoped, not a single fixed placeholder: multiple distinct
  // out-of-grant ancestors must stay distinguishable from each other (the
  // legitimate use this project's own Iteration 7 scenario needed —
  // "does this chain skip an implausible level" — depends on being able
  // to tell the ancestors apart, not just knowing "something was hidden").
  return { ...row, id: `[redacted:depth=${row.depth}]`, name: "[redacted]" };
}

export async function getAncestry(
  db: SqlExecutor,
  grant: McpGrant,
  elementId: string,
): Promise<AncestryRow[]> {
  assertInGrant(grant, "element", elementId);
  const rows = await ancestry(db, elementId);
  return rows.map((row) => redactOutOfGrantAncestor(row, grant));
}

export async function getCapabilitiesOf(
  db: SqlExecutor,
  grant: McpGrant,
  componentId: string,
): Promise<CapabilityRow[]> {
  assertInGrant(grant, "element", componentId);
  return capabilitiesOf(db, componentId);
}
