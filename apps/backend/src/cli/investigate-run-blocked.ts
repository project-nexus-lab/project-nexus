/**
 * Iteration 8 (`docs/history/iteration-8/SCOPE.md`) — does the six-event
 * `RunEvent` vocabulary hold once a scope actually needs `RunBlocked`?
 * NOT part of `npm test`, and deliberately not named `verify-*`: this
 * script's outcome was not known in advance.
 *
 * `ClaudeSdkAdapter.mapMessage()` had no path that ever produced a
 * `RunBlocked` event before this iteration — `NoopAdapterB`'s existing
 * coverage of that event kind (Iteration 2) is a hardcoded, canned
 * emission, not a translation of anything real. `buildPrompt()` now
 * always includes a standing `BLOCKED: context-insufficient — <note>`
 * convention; `mapMessage()` now parses the terminal result for it. This
 * script drives one real run built so the agent has a genuine, ordinary
 * reason to call a tool that gets refused — checking a related
 * component's capabilities before treating implementation as ready — and
 * records, precisely, whether the real agent actually uses the
 * convention and whether `events()` correctly translates it.
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

console.log("=== Iteration 8: can a real agent's RunBlocked signal be captured? ===\n");

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

console.log("\n--- Classification ---");
if (!upstreamCall || !wasRefused) {
  console.log(
    "NO OPPORTUNITY: the agent either never called getCapabilitiesOf on the out-of-grant component, or the call was not " +
      "actually refused, so this run produced no evidence either way about the RunBlocked mechanism. See " +
      "docs/history/iteration-8/REPORT.md for what this means for the scenario design.",
  );
} else if (followedConvention && emittedRunBlocked) {
  console.log(
    "MECHANISM CONFIRMED: the agent was genuinely refused, correctly followed the BLOCKED: convention, and events() " +
      "translated it into a real RunBlocked event — not RunCompleted.",
  );
} else if (followedConvention && !emittedRunBlocked) {
  console.log(
    "PARSING GAP: the agent followed the BLOCKED: convention in its final text, but events() did not emit RunBlocked — " +
      "a real bug in mapMessage()'s parsing, worse than the agent simply not signaling, since a real blocked condition " +
      "would be silently reported as a success.",
  );
} else {
  console.log(
    "AGENT DID NOT SIGNAL: the agent was genuinely refused but its final text does not match the BLOCKED: convention — " +
      "it worked around the gap, guessed, or reported the refusal only as prose. The mechanism (parsing) was never " +
      "exercised because the agent never produced the input it looks for.",
  );
}

await db.close();
