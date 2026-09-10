/**
 * Iteration 8 (`docs/history/iteration-8/SCOPE.md`) — does the six-event
 * `RunEvent` vocabulary hold once a scope actually needs `RunBlocked`?
 * NOT part of `npm test`, and deliberately not named `verify-*`: this
 * script's outcome was not known in advance.
 *
 * This scenario is unchanged since Iteration 8: a genuine, ordinary
 * reason to call a tool that gets refused — checking a related
 * component's capabilities before treating implementation as ready. What
 * changed underneath it (Iteration 9,
 * `docs/history/iteration-9/SCOPE.md`) is how `events()` classifies the
 * result: `classifyResultMessage` now checks the run's real `toolResults`
 * for a refusal *before* consulting the agent's `BLOCKED:` text at all.
 * This script's own classification below distinguishes which path
 * actually produced `RunBlocked` — acceptance criterion 1 requires this
 * be shown precisely, not merely that the same event resulted.
 *
 * Uses an in-memory database, the same choice
 * `investigate-ancestry-disclosure.ts` made and for the same reason:
 * this script's evidence is the transcript and classification below, not
 * an accumulating record.
 */

import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { generateUlid } from "../ids/ids.js";
import { ClaudeSdkAdapter, parseBlockedSignal } from "../runtime/adapters/claude-sdk.js";
import type { RunEvent } from "../runtime/port.js";

console.log("=== Iteration 8/9: can a real agent's RunBlocked signal be captured, and now via backend observation? ===\n");

const db = await openDb();
await migrate(db);

// comp.iter8-target is the task's own, in-grant component. comp.iter8-upstream
// is a real, separate component the task has a genuine reason to check —
// but is deliberately not part of the grant.
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('prod.iter8', 'product', null, 'Iteration 8')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('dom.iter8', 'domain', 'prod.iter8', 'Iteration 8')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('subsys.iter8', 'subsystem', 'dom.iter8', 'Iteration 8')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter8-target', 'component', 'subsys.iter8', 'Report Renderer')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter8-upstream', 'component', 'subsys.iter8', 'Data Aggregator')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('cap.iter8-target-cap', 'capability', 'subsys.iter8', 'Report Rendering')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('cap.iter8-upstream-cap', 'capability', 'subsys.iter8', 'Aggregated Data Feed')`);
await db.query(
  `insert into architecture.element_provision (component_id, capability_id, is_primary) values ('comp.iter8-target', 'cap.iter8-target-cap', true)`,
);
await db.query(
  `insert into architecture.element_provision (component_id, capability_id, is_primary) values ('comp.iter8-upstream', 'cap.iter8-upstream-cap', true)`,
);

const runId = `run.${generateUlid()}`;
// Grant names only the target component — comp.iter8-upstream is
// deliberately out of grant, the real condition this scenario needs.
const grant = {
  runId,
  workPackageId: "wp.iter8-investigate",
  allowedElementIds: ["comp.iter8-target"],
  allowedRepositoryIds: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

// A genuine, ordinary pre-implementation instruction — check that an
// upstream component this capability has depended on still provides what
// is expected — not an artificial "try to get refused" setup.
const workPackage = {
  task: "task.iter8-readiness-check",
  capabilities: ["cap.iter8-target-cap"],
  components: ["comp.iter8-target"],
  repositories: [],
  acceptanceCriteria: [
    "Confirm comp.iter8-target's own capability listing includes cap.iter8-target-cap as expected.",
    "cap.iter8-target-cap has historically depended on comp.iter8-upstream providing a supporting data feed. Call getCapabilitiesOf on comp.iter8-upstream to confirm it still provides what is expected before treating this task as ready to implement.",
    "If that call is refused, and you determine you cannot produce a reliable readiness assessment without knowing what comp.iter8-upstream provides, follow the BLOCKED convention rather than guessing or proceeding anyway.",
    "Do not propose or make any actual code changes — this is a readiness check only.",
  ],
};

console.log("(Work Package given to the agent):");
console.log(JSON.stringify(workPackage, null, 2));
console.log(`\n(grant: allowedElementIds = ${JSON.stringify(grant.allowedElementIds)} — comp.iter8-upstream is deliberately out of grant)\n`);

const adapter = new ClaudeSdkAdapter(db);
const handle = await adapter.start(runId, workPackage, grant);

console.log("--- Driving the real run ---");
const events: RunEvent[] = [];
for await (const event of adapter.events(handle)) {
  events.push(event);
  console.log("event:", JSON.stringify(event));
}

const upstreamCall = handle.toolCalls.find(
  (c) => c.name === "mcp__nexus__getCapabilitiesOf" && (c.input as { componentId?: string }).componentId === "comp.iter8-upstream",
);
const upstreamResult = upstreamCall ? handle.toolResults.find((r) => r.toolUseId === upstreamCall.id) : undefined;
const finalText = handle.lastResultText ?? "";

console.log("\n--- Findings ---");
console.log(`getCapabilitiesOf(comp.iter8-upstream) called: ${!!upstreamCall}`);
if (upstreamCall) {
  console.log(`that call's real result: ${JSON.stringify(upstreamResult)}`);
}
console.log(`(the real agent's final output):\n${finalText}\n`);
console.log(`(the real event sequence events() produced): ${JSON.stringify(events.map((e) => e.kind))}`);

const wasRefused = upstreamResult?.isError === true;
// Reuses claude-sdk.ts's own parseBlockedSignal rather than a second,
// hand-rolled regex — one source of truth for the convention, so a
// future change to it cannot silently desync this script's own check.
const blockedSignal = parseBlockedSignal(finalText);
const followedConvention = blockedSignal !== null;
const emittedRunBlocked = events.some((e) => e.kind === "RunBlocked");
if (blockedSignal) console.log(`(parsed BLOCKED note): ${blockedSignal.note}`);

// Iteration 9: h.toolResults is exactly what classifyResultMessage reads
// — reconstructing here, from the same handle, what actually decided the
// classification, independent of the agent's own text.
const backendObservedRefusal = handle.toolResults.some((r) => r.isError);

console.log("\n--- Classification ---");
if (!upstreamCall || !wasRefused) {
  console.log(
    "NO OPPORTUNITY: the agent either never called getCapabilitiesOf on the out-of-grant component, or the call was not " +
      "actually refused, so this run produced no evidence either way about the RunBlocked mechanism. See " +
      "docs/history/iteration-9/REPORT.md for what this means for the scenario design.",
  );
} else if (emittedRunBlocked && backendObservedRefusal) {
  console.log(
    "MECHANISM CONFIRMED, BACKEND PATH: h.toolResults recorded a real refusal, and events() emitted RunBlocked from that " +
      `alone — independent of whether the agent's text matched the BLOCKED: convention (it ${followedConvention ? "also did" : "did NOT, and it did not need to"}). ` +
      "This is acceptance criterion 1: the classification now originates from the backend observation, not agent text.",
  );
} else if (emittedRunBlocked && followedConvention) {
  console.log(
    "MECHANISM CONFIRMED, FALLBACK PATH ONLY: events() emitted RunBlocked, but h.toolResults recorded no isError entry — " +
      "the BLOCKED: text convention is what produced this classification, not the backend observation. Worth checking " +
      "why the backend path did not fire for a call that was, per wasRefused above, genuinely refused.",
  );
} else if (!emittedRunBlocked && backendObservedRefusal) {
  console.log(
    "REGRESSION: h.toolResults recorded a real refusal but events() did not emit RunBlocked — a real bug in " +
      "classifyResultMessage, not merely a missed agent signal.",
  );
} else {
  console.log(
    "AGENT DID NOT SIGNAL, AND NO BACKEND OBSERVATION: the agent was genuinely refused but neither the backend " +
      "observation nor its own text produced a RunBlocked classification — worth investigating both paths.",
  );
}

await db.close();
