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
 * Since Iteration 11 (`docs/history/iteration-11/SCOPE.md`): the Work
 * Package below now declares `relatedElements`, naming
 * `comp.iter8-upstream` as `required: true` — the same real refusal this
 * scenario has always produced, now also checked against the new,
 * declared-relevance rule, not only the naive "any refusal" rule Iteration
 * 9 built. The agent's prompt is unaffected — `buildPrompt()` never reads
 * `relatedElements` — so the real agent transcript below should not
 * differ from any prior run of this same scenario; only which rule(s)
 * this script reports as having decided the classification can change.
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

console.log("=== Iteration 8/9/11: can a real agent's RunBlocked signal be captured, via backend observation, and now via declared relevance? ===\n");

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
  // Iteration 11: declared, not inferred — comp.iter8-upstream is named
  // required because this task's own acceptance criteria say so, decided
  // here at Work Package construction time, not derived from anything
  // observed during the run. The agent never sees this field.
  relatedElements: [{ elementId: "comp.iter8-upstream", required: true }],
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
// Iteration 11: the same real refusal, checked against the new,
// declared-relevance rule specifically — did the refused call's own
// elementId (correlated by events(), not this script) match a required
// entry declared above? Derived from workPackage.relatedElements itself,
// not a hardcoded id, so this check means the same thing here as it does
// in investigate-blocked-relevance.ts.
const requiredIds = new Set(workPackage.relatedElements.filter((r) => r.required).map((r) => r.elementId));
const requiredRelatedRefusal = handle.toolResults.some((r) => r.isError && r.elementId !== undefined && requiredIds.has(r.elementId));
console.log(`\n(declared relatedElements: ${JSON.stringify(workPackage.relatedElements)})`);
console.log(`(required-related refusal observed: ${requiredRelatedRefusal})`);

console.log("\n--- Classification ---");
if (!upstreamCall || !wasRefused) {
  console.log(
    "NO OPPORTUNITY: the agent either never called getCapabilitiesOf on the out-of-grant component, or the call was not " +
      "actually refused, so this run produced no evidence either way about the RunBlocked mechanism. See " +
      "docs/history/iteration-9/REPORT.md for what this means for the scenario design.",
  );
} else if (requiredRelatedRefusal && emittedRunBlocked) {
  console.log(
    "MECHANISM CONFIRMED, DECLARED-RELEVANCE PATH: the refused call's own elementId (comp.iter8-upstream) matched this " +
      "Work Package's declared required entry, and events() emitted RunBlocked from that alone — independent of " +
      `whether the agent's text matched the BLOCKED: convention (it ${followedConvention ? "also did" : "did NOT, and it did not need to"}). ` +
      "This reproduces Iteration 9's own validated relevant-refusal outcome under the new, narrower rule — " +
      "acceptance criterion 3's relevant-refusal half. For comparison, not as evidence of what actually decided " +
      `this run: Iteration 9's now-superseded naive rule would also have fired here (backendObservedRefusal=${backendObservedRefusal}).`,
  );
} else if (requiredRelatedRefusal && !emittedRunBlocked) {
  console.log(
    "REGRESSION: the refusal matched a declared required element, but events() did not emit RunBlocked — a real bug " +
      "in classifyResultMessage or the elementId correlation in events(), not merely a missed signal.",
  );
} else if (!requiredRelatedRefusal && emittedRunBlocked && followedConvention) {
  console.log(
    "UNEXPECTED, FALLBACK PATH ONLY: the declared-relevance rule did not recognize this refusal as matching " +
      "comp.iter8-upstream (it should have), but the agent's own BLOCKED: text still drove RunBlocked. Investigate " +
      "the elementId correlation in events() before trusting the new rule for this scenario.",
  );
} else {
  console.log(
    "UNEXPECTED: this scenario names comp.iter8-upstream as required and the tool was genuinely refused, but the " +
      "declared-relevance rule did not recognize it and no text fallback caught it either — investigate the " +
      "elementId correlation in events() and parseRelatedElements directly.",
  );
}

await db.close();
