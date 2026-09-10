/**
 * Real-Claude-SDK-Adapter verification for Iteration 6
 * (`docs/history/iteration-6/SCOPE.md`). NOT part of `npm test` — spawns a
 * real Claude agent run (via the `claude` CLI this environment already has
 * authenticated) with real, if small, API cost. Run explicitly:
 * `npm run verify:claude-adapter`.
 *
 * Seeds a minimal real architecture, constructs a real grant naming one
 * in-grant component and deliberately excluding another, drives
 * `ClaudeSdkAdapter` against them for one real run, and checks — against
 * the agent's own real final answer, not just "no crash" — that a
 * grant-checked MCP tool call succeeds when in-grant and is refused when
 * not, both through the real MCP protocol exchange the SDK actually uses.
 *
 * Also checks the real `execution.run_telemetry` row this run produces —
 * a focused enhancement added after Iteration 6, not part of it; see
 * `apps/backend/README.md`, "Execution telemetry."
 */

import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { generateUlid } from "../ids/ids.js";
import { ClaudeSdkAdapter } from "../runtime/adapters/claude-sdk.js";
import type { RunEvent } from "../runtime/port.js";
import { listAdaptersForRole, registerAdapter } from "../runtime/registry.js";

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  const mark = condition ? "PASS" : "FAIL";
  console.log(`[${mark}] ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  if (!condition) failures += 1;
}

console.log("=== Iteration 6 verification: a real Claude SDK Adapter ===\n");

const db = await openDb();
await migrate(db);

// Minimal, distinctively-named architecture — not seed data, only enough
// for one in-grant element (with a distinctive ancestor id to check for in
// the agent's own final text) and one deliberately out-of-grant sibling.
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('prod.iter6', 'product', null, 'Iteration 6')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('dom.iter6', 'domain', 'prod.iter6', 'Iteration 6')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('subsys.iter6-cockpit', 'subsystem', 'dom.iter6', 'Cockpit')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter6-instrument-panel', 'component', 'subsys.iter6-cockpit', 'Instrument Panel')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter6-fuel-gauge', 'component', 'subsys.iter6-cockpit', 'Fuel Gauge')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('cap.iter6-altitude-readout', 'capability', 'subsys.iter6-cockpit', 'Altitude Readout')`);
await db.query(
  `insert into architecture.element_provision (component_id, capability_id, is_primary) values ('comp.iter6-instrument-panel', 'cap.iter6-altitude-readout', true)`,
);

console.log("\n--- Registering the adapter ---");
const adapter = new ClaudeSdkAdapter(db);
await registerAdapter(db, adapter, { displayName: "Claude SDK Adapter" });

const { rows: registration } = await db.query<{ id: string; enabled: boolean }>(
  `select id, enabled from runtime.adapter_registration where id = $1`,
  [adapter.id],
);
check("registerAdapter wrote exactly one adapter_registration row, no schema change", registration.length === 1 && registration[0]?.enabled === true, registration[0]);

const forImplementer = await listAdaptersForRole(db, "role.implementer");
check(
  "listAdaptersForRole('role.implementer') finds claude-sdk with zero changes to registry.ts",
  forImplementer.some((a) => a.id === "claude-sdk"),
  forImplementer.map((a) => a.id),
);

console.log("\n--- Driving one real run ---");
const IN_GRANT = "comp.iter6-instrument-panel";
const OUT_OF_GRANT = "comp.iter6-fuel-gauge";
const grant = {
  // A real run.<ulid> id, not the ad-hoc "run.iter6-verify" string used
  // before telemetry existed — execution.run_telemetry.run_id is checked
  // against the same generated-id pattern execution_run.id already uses
  // (src/ids/ids.ts), so evidence about a run is keyed the way this
  // project's own ID strategy says a run should be, not a test label.
  runId: `run.${generateUlid()}`,
  workPackageId: "wp.iter6-verify",
  allowedElementIds: [IN_GRANT],
  allowedRepositoryIds: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};
// The specific instructions for this run travel through the real
// WorkPackagePayload field they belong in (`acceptanceCriteria`), not a
// side channel — ClaudeSdkAdapter#start()'s only inputs are
// runId/workPackage/grant, so this is the one legitimate way a caller can
// actually reach the model. An earlier version of this script built a
// separate `prompt` string and only ever console.logged it — it was never
// passed to the adapter at all, and the resulting generic run showed the
// agent inferring its own target ids from context twice in a row. See
// docs/history/iteration-6/REPORT.md.
const workPackage = {
  task: "task.iter6-verify",
  capabilities: ["cap.iter6-altitude-readout"],
  components: [IN_GRANT],
  repositories: [], // no repository mapped in this minimal fixture — a real, empty fact, not a missing field
  acceptanceCriteria: [
    `Call getAncestry with elementId exactly "${IN_GRANT}" — do not substitute a different id.`,
    `Call getCapabilitiesOf with componentId exactly "${OUT_OF_GRANT}" — do not substitute a different id, even if it seems more relevant to the Work Package's own affected components.`,
    "Make both calls, in that order, regardless of what either result contains.",
    "Report the immediate parent id from call 1, and whether call 2 succeeded or was refused (and why, if refused).",
  ],
};

const handle = await adapter.start(grant.runId, workPackage, grant);

const events: RunEvent[] = [];
for await (const event of adapter.events(handle)) {
  events.push(event);
  console.log("event:", JSON.stringify(event));
}

check(
  "events() started with RunStarted and ended with RunCompleted, not RunFailed",
  events[0]?.kind === "RunStarted" && events.at(-1)?.kind === "RunCompleted",
  events.map((e) => e.kind),
);
check(
  "at least one real MCP tool call was translated into ContextRequested",
  events.some((e) => e.kind === "ContextRequested"),
  events.map((e) => e.kind),
);

console.log("\n(real tool calls the agent actually made):");
for (const call of handle.toolCalls) console.log(" -", call.name, JSON.stringify(call.input));

// Checked against the protocol-level record (toolCalls/toolResults), not
// the agent's own prose summary. Not because a real run of this script
// ever caught the agent's prose misdescribing what it actually did — it
// never did, in either the buggy or the fixed runs (see
// docs/history/iteration-6/REPORT.md, "A real bug this iteration's own
// verification script had"). Ground truth is simply stronger evidence
// than a summary, regardless of how accurate that summary turns out to be.
const ancestryCall = handle.toolCalls.find(
  (c) => c.name === "mcp__nexus__getAncestry" && (c.input as { elementId?: string }).elementId === IN_GRANT,
);
check("the agent actually called getAncestry with the in-grant element id", !!ancestryCall, ancestryCall);
const ancestryResult = handle.toolResults.find((r) => r.toolUseId === ancestryCall?.id);
check(
  "that in-grant call succeeded and its real result names the cockpit subsystem",
  ancestryResult?.isError === false && ancestryResult.text.includes("subsys.iter6-cockpit"),
  ancestryResult,
);

const capabilitiesCall = handle.toolCalls.find(
  (c) => c.name === "mcp__nexus__getCapabilitiesOf" && (c.input as { componentId?: string }).componentId === OUT_OF_GRANT,
);
check("the agent actually called getCapabilitiesOf with the out-of-grant component id", !!capabilitiesCall, capabilitiesCall);
const capabilitiesResult = handle.toolResults.find((r) => r.toolUseId === capabilitiesCall?.id);
check(
  // GrantRefusedError's *reason code* is "out-of-grant" (src/mcp/grant.ts);
  // its human-readable .message — what actually crosses the MCP protocol
  // boundary into this tool result — says "is not in this grant" instead.
  // Checked against the real captured text below, not assumed from the
  // reason code's name.
  "that out-of-grant call was refused as a typed grant refusal, not a crash or a silently-allowed answer",
  capabilitiesResult?.isError === true &&
    capabilitiesResult.text.includes(OUT_OF_GRANT) &&
    /is not in this grant/i.test(capabilitiesResult.text),
  capabilitiesResult,
);

const finalText = handle.lastResultText ?? "";
console.log(`\n(the real agent's final answer):\n${finalText}\n`);

console.log("\n--- Execution telemetry (focused enhancement, not part of Iteration 6) ---");
const { rows: telemetryRows } = await db.query<Record<string, unknown>>(
  `select * from execution.run_telemetry where run_id = $1`,
  [grant.runId],
);
const telemetry = telemetryRows[0];
console.log("(the real row recorded in execution.run_telemetry):");
console.log(JSON.stringify(telemetry, null, 2));

check("a telemetry row exists for this real run", !!telemetry, telemetry);
check("duration_ms was recorded and is positive", telemetry?.duration_ms != null && Number(telemetry.duration_ms) > 0, telemetry?.duration_ms);
check("work_package_size_bytes was recorded and is positive", telemetry?.work_package_size_bytes != null && Number(telemetry.work_package_size_bytes) > 0, telemetry?.work_package_size_bytes);
check("grant_element_count matches the real grant (1)", Number(telemetry?.grant_element_count) === grant.allowedElementIds.length, telemetry?.grant_element_count);
check("grant_repository_count matches the real grant (0)", Number(telemetry?.grant_repository_count) === grant.allowedRepositoryIds.length, telemetry?.grant_repository_count);
check(
  "input_tokens and output_tokens were recorded from the real SDK result, not null",
  telemetry?.input_tokens !== null && telemetry?.output_tokens !== null && telemetry?.total_tokens !== null,
  { input: telemetry?.input_tokens, output: telemetry?.output_tokens, total: telemetry?.total_tokens },
);
check(
  // Only the in-grant getAncestry call actually retrieved data; the
  // out-of-grant getCapabilitiesOf call was refused, so it was attempted
  // but not accessed — accessedElementCount counts retrieval, not attempts.
  "accessed_element_count reflects the one element actually retrieved (the refused call does not count as accessed)",
  Number(telemetry?.accessed_element_count) === 1,
  telemetry?.accessed_element_count,
);
check(
  "workPackageSizeTokens and accessedRepositoryCount are explicitly null, not fabricated",
  telemetry?.work_package_size_tokens === null && telemetry?.accessed_repository_count === null,
  { workPackageSizeTokens: telemetry?.work_package_size_tokens, accessedRepositoryCount: telemetry?.accessed_repository_count },
);
check(
  "no cost field exists on the recorded row (total_cost_usd is deliberately never captured)",
  telemetry !== undefined && !("total_cost_usd" in telemetry) && !("cost" in telemetry),
  telemetry ? Object.keys(telemetry) : undefined,
);

await db.close();

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
