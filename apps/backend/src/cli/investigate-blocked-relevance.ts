/**
 * Iteration 9 (`docs/history/iteration-9/SCOPE.md`) acceptance criteria
 * 3 and 4 — does deterministic backend classification over-trigger
 * `RunBlocked` for a refusal that is genuinely irrelevant to task
 * completion? NOT part of `npm test`; deliberately not named `verify-*`:
 * the outcome is the open question this script exists to gather evidence
 * on, not a known-good result to confirm.
 *
 * Unlike `investigate-run-blocked.ts` (where the refused call is
 * *required* by the task's own acceptance criteria), this scenario's
 * task is fully completable using only the in-grant component — a
 * second, related component is explicitly offered as an *optional*,
 * not-required check, the realistic shape of an agent doing a little
 * more due diligence than its task strictly demands. If the agent
 * attempts the optional check and is refused, Iteration 9's backend-only
 * classifier (`classifyResultMessage`, reading `toolResults` directly)
 * will mark this run `RunBlocked` regardless of whether the refusal
 * actually mattered — that is exactly the risk named in
 * `docs/PROJECT_KNOWLEDGE.md`'s Open Question "can deterministic backend
 * classification over-trigger compared to agent-reported blockage?" this
 * script exists to test, not to avoid.
 *
 * Since Iteration 11 (`docs/history/iteration-11/SCOPE.md`): the Work
 * Package below now declares `relatedElements`, naming
 * `comp.iter9-related` as `required: false` — the whole point of this
 * scenario is to test whether declaring it optional (rather than the
 * agent's own text, or nothing at all) is enough for the new rule to
 * avoid the over-trigger Iteration 9 found. The agent's prompt is
 * unaffected — `buildPrompt()` never reads `relatedElements` — so the
 * real agent transcript below should not differ from Iteration 9's own
 * Run 3; only the classification this script reports can change.
 *
 * Uses an in-memory database, the same choice every other
 * `investigate-*.ts` script has made and for the same reason: this
 * script's evidence is the transcript and classification below, not an
 * accumulating record.
 */

import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { generateUlid } from "../ids/ids.js";
import { ClaudeSdkAdapter, parseBlockedSignal } from "../runtime/adapters/claude-sdk.js";
import type { RunEvent } from "../runtime/port.js";

console.log("=== Iteration 9/11: does declaring a refusal optional avoid the over-trigger backend classification found? ===\n");

const db = await openDb();
await migrate(db);

await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('prod.iter9', 'product', null, 'Iteration 9')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('dom.iter9', 'domain', 'prod.iter9', 'Iteration 9')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('subsys.iter9', 'subsystem', 'dom.iter9', 'Iteration 9')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter9-target', 'component', 'subsys.iter9', 'Notification Dispatcher')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter9-related', 'component', 'subsys.iter9', 'Delivery Log Archiver')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('cap.iter9-target-cap', 'capability', 'subsys.iter9', 'Notification Dispatch')`);
await db.query(
  `insert into architecture.element_provision (component_id, capability_id, is_primary) values ('comp.iter9-target', 'cap.iter9-target-cap', true)`,
);

const runId = `run.${generateUlid()}`;
// comp.iter9-related is deliberately out of grant — the same mechanism
// as investigate-run-blocked.ts, but this time the task does not need it.
const grant = {
  runId,
  workPackageId: "wp.iter9-investigate",
  allowedElementIds: ["comp.iter9-target"],
  allowedRepositoryIds: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

// The task is fully completable from comp.iter9-target alone. The
// optional check is offered honestly as optional, not as a disguised
// requirement — the point is to see what a real agent does with genuine
// discretion, not to manufacture a forced outcome.
const workPackage = {
  task: "task.iter9-readiness-check",
  capabilities: ["cap.iter9-target-cap"],
  components: ["comp.iter9-target"],
  repositories: [],
  acceptanceCriteria: [
    "Confirm comp.iter9-target's own capability listing includes cap.iter9-target-cap as expected. This check is sufficient to complete this readiness assessment.",
    "As a matter of good practice before signing off, it is worth also checking comp.iter9-related — a separate component in the same subsystem that historically logged delivery attempts for this capability — to see what it currently provides, for extra confidence in your assessment. This is not required: the task is still considered complete based on comp.iter9-target's own listing alone, regardless of what (if anything) you learn about comp.iter9-related.",
    "Do not propose or make any actual code changes — this is a readiness check only.",
  ],
  // Iteration 11: declared, not inferred — comp.iter9-related is named
  // explicitly optional because this task's own acceptance criteria say
  // so, decided here at Work Package construction time. The agent never
  // sees this field.
  relatedElements: [{ elementId: "comp.iter9-related", required: false }],
};

console.log("(Work Package given to the agent):");
console.log(JSON.stringify(workPackage, null, 2));
console.log(`\n(grant: allowedElementIds = ${JSON.stringify(grant.allowedElementIds)} — comp.iter9-related is deliberately out of grant, and deliberately optional)\n`);

const adapter = new ClaudeSdkAdapter(db);
const handle = await adapter.start(runId, workPackage, grant);

console.log("--- Driving the real run ---");
const events: RunEvent[] = [];
for await (const event of adapter.events(handle)) {
  events.push(event);
  console.log("event:", JSON.stringify(event));
}

const relatedCall = handle.toolCalls.find(
  (c) => c.name === "mcp__nexus__getCapabilitiesOf" && (c.input as { componentId?: string }).componentId === "comp.iter9-related",
);
const relatedResult = relatedCall ? handle.toolResults.find((r) => r.toolUseId === relatedCall.id) : undefined;
const finalText = handle.lastResultText ?? "";

console.log("\n--- Findings ---");
console.log(`getCapabilitiesOf(comp.iter9-related) attempted (the optional check): ${!!relatedCall}`);
if (relatedCall) {
  console.log(`that call's real result: ${JSON.stringify(relatedResult)}`);
}
console.log(`(the real agent's final output):\n${finalText}\n`);
console.log(`(the real event sequence events() produced): ${JSON.stringify(events.map((e) => e.kind))}`);

const attemptedOptionalCheck = !!relatedCall;
const wasRefused = relatedResult?.isError === true;
const emittedRunBlocked = events.some((e) => e.kind === "RunBlocked");
// Iteration 11: was this specific refusal for an element declared
// *required*, not merely for comp.iter9-related itself — it is declared
// required: false above, so this must check the required set, not just
// whether that element was the one refused. Should always be false here;
// the interesting question is whether events() still emitted RunBlocked
// anyway, e.g. via the agent's own text.
const requiredIds = new Set(workPackage.relatedElements.filter((r) => r.required).map((r) => r.elementId));
const requiredRelatedRefusal = handle.toolResults.some((r) => r.isError && r.elementId !== undefined && requiredIds.has(r.elementId));
const followedConvention = parseBlockedSignal(finalText) !== null;
console.log(`\n(declared relatedElements: ${JSON.stringify(workPackage.relatedElements)})`);
console.log(`(required-related refusal observed: ${requiredRelatedRefusal})`);

console.log("\n--- Classification ---");
if (!attemptedOptionalCheck) {
  console.log(
    "NO OPPORTUNITY: the agent did not attempt the optional check at all, so this run produced no evidence about " +
      "over-triggering — it completed using only what its task actually needed. This is itself a real, useful data " +
      "point: a real agent given genuine discretion did not create the risk condition on its own.",
  );
} else if (wasRefused && !requiredRelatedRefusal && !emittedRunBlocked) {
  console.log(
    "OVER-TRIGGER AVOIDED: the agent attempted the explicitly optional check, was refused, and — unlike Iteration 9's " +
      "own Run 3 under the naive rule — events() did NOT emit RunBlocked. Declaring comp.iter9-related optional in " +
      "relatedElements was sufficient to avoid the over-trigger this scenario is built to test, with zero " +
      "text-parsing of the agent's own final answer.",
  );
} else if (wasRefused && !requiredRelatedRefusal && emittedRunBlocked && followedConvention) {
  console.log(
    "OVER-TRIGGER PARTIALLY AVOIDED, TEXT FALLBACK FIRED INSTEAD: the declared-relevance rule correctly did not " +
      "treat this refusal as blocking, but the agent's own text still matched the BLOCKED: convention, so " +
      "events() emitted RunBlocked via the unrelated fallback path anyway. The new rule did its job; the fallback " +
      "convention is what still over-triggers here, worth noting distinctly from the rule this iteration tests.",
  );
} else if (wasRefused && !requiredRelatedRefusal && emittedRunBlocked && !followedConvention) {
  console.log(
    "REGRESSION: the declared-relevance rule correctly did not treat this refusal as blocking, and the agent's text " +
      "did not match the BLOCKED: convention either, but events() emitted RunBlocked anyway — a real bug in " +
      "classifyResultMessage, investigate directly.",
  );
} else if (wasRefused && requiredRelatedRefusal) {
  console.log(
    "UNEXPECTED: this refusal was recognized as matching a required relatedElements entry, but comp.iter9-related is " +
      "declared optional above — a bug in the elementId correlation in events() or in this script's own check.",
  );
} else {
  console.log(
    "NOT REFUSED: the agent attempted the optional check but it was not actually refused (e.g. the grant somehow " +
      "covered it) — re-check the seed data and grant construction above.",
  );
}

await db.close();
