/**
 * Iteration 14a (`docs/history/iteration-14a/SCOPE.md`) — does
 * `buildWorkPackage()`, populating `relatedElements` from a real declared
 * table (`work.work_item_related_element`) instead of a hand-typed JS
 * literal, still reproduce Iteration 9/11's own validated classification
 * outcomes? NOT part of `npm test`: this script's job is a live agent run,
 * the same evidentiary bar every prior `RunBlocked`-related claim in this
 * project has been held to (Iterations 8, 9, 11).
 *
 * Reuses Iteration 9's and Iteration 11's own two reusable scenarios
 * exactly — same component/capability shape, same acceptance-criteria
 * text, same grant — changing only *how* `relatedElements` reaches the
 * agent: real declaration → real `buildWorkPackage()` → real live run,
 * instead of a literal typed directly into the script.
 *
 * `acceptanceCriteria` is still hand-supplied as text below, not read from
 * `buildWorkPackage()`'s own output — a pre-existing, disclosed,
 * *unrelated* gap (`buildWorkPackage()` populates `acceptanceCriteria`
 * with `ac.*` ids, not statement text; every investigate script has always
 * hand-supplied text instead, per Iteration 11's own Lessons). Fixing that
 * is not this iteration's job; only `relatedElements` is sourced for real
 * here, so the comparison against Iteration 9/11's own known-correct
 * results isolates exactly the one thing that changed.
 *
 * Uses an in-memory database, the same choice every other
 * `investigate-*.ts` script has made and for the same reason: this
 * script's evidence is the transcripts and classifications below, not an
 * accumulating record.
 */

import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { generateUlid } from "../ids/ids.js";
import { ClaudeSdkAdapter, parseBlockedSignal } from "../runtime/adapters/claude-sdk.js";
import type { RunEvent } from "../runtime/port.js";
import { buildWorkPackage } from "../workpackage/build.js";

console.log(
  "=== Iteration 14a: does buildWorkPackage(), reading a real declared table, still reproduce Iteration 9/11's own validated relatedElements outcomes? ===\n",
);

interface ScenarioResult {
  name: string;
  expectedKind: RunEvent["kind"];
  actualKind: string | undefined;
  relatedElementsMatch: boolean;
  pass: boolean;
}

const results: ScenarioResult[] = [];

async function runScenario(opts: {
  name: string;
  subsystemId: string;
  targetId: string;
  targetCapId: string;
  relatedId: string;
  relatedName: string;
  required: boolean;
  acceptanceCriteria: string[];
  taskId: string;
  expectedKind: RunEvent["kind"];
  toolTargetElementId: string;
}): Promise<void> {
  const db = await openDb();
  await migrate(db);
  await db.query(
    `insert into execution.work_package_profile (id, name, context_depth) values ('wpp.implementation', 'Implementation', 0)`,
  );

  // opts.taskId already carries its own `task.` prefix (e.g.
  // "task.iter14a-required") — the slug after it, not the full id, is
  // what every other prefix below shares.
  const slug = opts.taskId.replace(/^task\./, "");
  const prodId = `prod.${slug}`;
  const domId = `dom.${slug}`;
  await db.query(`insert into architecture.element (id, kind, parent_id, name) values ($1, 'product', null, $2)`, [prodId, opts.name]);
  await db.query(`insert into architecture.element (id, kind, parent_id, name) values ($1, 'domain', $2, $3)`, [domId, prodId, opts.name]);
  await db.query(`insert into architecture.element (id, kind, parent_id, name) values ($1, 'subsystem', $2, $3)`, [opts.subsystemId, domId, opts.name]);
  await db.query(`insert into architecture.element (id, kind, parent_id, name) values ($1, 'component', $2, $3)`, [opts.targetId, opts.subsystemId, "Target"]);
  await db.query(`insert into architecture.element (id, kind, parent_id, name) values ($1, 'component', $2, $3)`, [opts.relatedId, opts.subsystemId, opts.relatedName]);
  await db.query(`insert into architecture.element (id, kind, parent_id, name) values ($1, 'capability', $2, $3)`, [opts.targetCapId, opts.subsystemId, "Target Capability"]);
  await db.query(
    `insert into architecture.element_provision (component_id, capability_id, is_primary) values ($1, $2, true)`,
    [opts.targetId, opts.targetCapId],
  );

  const repoId = `repo.${slug}`;
  await db.query(`insert into repo.repository (id, name, provider) values ($1, $2, 'github')`, [repoId, opts.name]);
  await db.query(
    `insert into repo.repository_component (repository_id, component_id, is_primary) values ($1, $2, true)`,
    [repoId, opts.targetId],
  );

  const initId = `init.${slug}`;
  const epicId = `epic.${slug}`;
  const featId = `feat.${slug}`;
  await db.query(`insert into work.work_item (id, kind, parent_id, title, status) values ($1, 'initiative', null, $2, 'draft')`, [initId, opts.name]);
  await db.query(`insert into work.work_item (id, kind, parent_id, title, status) values ($1, 'epic', $2, $3, 'draft')`, [epicId, initId, opts.name]);
  await db.query(`insert into work.work_item (id, kind, parent_id, title, status) values ($1, 'feature', $2, $3, 'draft')`, [featId, epicId, opts.name]);
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title, status) values ($1, 'task', $2, $3, 'ready')`,
    [opts.taskId, featId, opts.name],
  );
  await db.query(`insert into work.work_item_capability (work_item_id, capability_id) values ($1, $2)`, [opts.taskId, opts.targetCapId]);
  await db.query(
    `insert into work.acceptance_criterion (id, work_item_id, statement, ordinal) values ($1, $2, 'stmt', 0)`,
    [`ac.${slug}`, opts.taskId],
  );

  // The one real thing this iteration adds: a declared row, not a
  // hand-typed literal.
  await db.query(
    `insert into work.work_item_related_element (work_item_id, element_id, required) values ($1, $2, $3)`,
    [opts.taskId, opts.relatedId, opts.required],
  );

  const wp = await buildWorkPackage(db, opts.taskId, "wpp.implementation");
  const expectedRelatedElements = [{ elementId: opts.relatedId, required: opts.required }];
  const relatedElementsMatch =
    JSON.stringify(wp.payload.relatedElements) === JSON.stringify(expectedRelatedElements);

  console.log(`--- ${opts.name} ---`);
  console.log(`buildWorkPackage() real relatedElements: ${JSON.stringify(wp.payload.relatedElements)}`);
  console.log(`matches Iteration 9/11's own known-correct value: ${relatedElementsMatch}`);

  const runId = `run.${generateUlid()}`;
  const grant = {
    runId,
    workPackageId: wp.id,
    allowedElementIds: [opts.targetId],
    allowedRepositoryIds: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };

  // Everything except relatedElements is still hand-supplied text/ids,
  // the same pre-existing, disclosed gap every prior investigate script
  // has had (see this file's own header comment) — relatedElements is the
  // only field sourced from the real buildWorkPackage() call above.
  const workPackage = {
    task: opts.taskId,
    capabilities: [opts.targetCapId],
    components: [opts.targetId],
    repositories: [],
    acceptanceCriteria: opts.acceptanceCriteria,
    relatedElements: wp.payload.relatedElements ?? [],
  };

  console.log("(Work Package given to the agent):");
  console.log(JSON.stringify(workPackage, null, 2));

  const adapter = new ClaudeSdkAdapter(db);
  const handle = await adapter.start(runId, workPackage, grant);

  const events: RunEvent[] = [];
  for await (const event of adapter.events(handle)) {
    events.push(event);
    console.log("event:", JSON.stringify(event));
  }

  const finalText = handle.lastResultText ?? "";
  console.log(`(the real agent's final output):\n${finalText}\n`);

  const actualKind = events[events.length - 1]?.kind;
  const pass = actualKind === opts.expectedKind;
  console.log(`expected final event kind: ${opts.expectedKind}, actual: ${actualKind} -> ${pass ? "MATCH" : "MISMATCH"}\n`);

  results.push({ name: opts.name, expectedKind: opts.expectedKind, actualKind, relatedElementsMatch, pass });

  await db.close();
}

await runScenario({
  name: "Required (reproducing Iteration 8/11's own scenario)",
  subsystemId: "subsys.iter14a-req",
  targetId: "comp.iter14a-req-target",
  targetCapId: "cap.iter14a-req-target-cap",
  relatedId: "comp.iter14a-req-upstream",
  relatedName: "Data Aggregator",
  required: true,
  taskId: "task.iter14a-required",
  expectedKind: "RunBlocked",
  toolTargetElementId: "comp.iter14a-req-upstream",
  acceptanceCriteria: [
    "Confirm this task's own component's capability listing includes its target capability as expected.",
    "This capability has historically depended on comp.iter14a-req-upstream providing a supporting data feed. Call getCapabilitiesOf on comp.iter14a-req-upstream to confirm it still provides what is expected before treating this task as ready to implement.",
    "If that call is refused, and you determine you cannot produce a reliable readiness assessment without knowing what comp.iter14a-req-upstream provides, follow the BLOCKED convention rather than guessing or proceeding anyway.",
    "Do not propose or make any actual code changes — this is a readiness check only.",
  ],
});

await runScenario({
  name: "Optional (reproducing Iteration 9/11's own scenario)",
  subsystemId: "subsys.iter14a-opt",
  targetId: "comp.iter14a-opt-target",
  targetCapId: "cap.iter14a-opt-target-cap",
  relatedId: "comp.iter14a-opt-related",
  relatedName: "Delivery Log Archiver",
  required: false,
  taskId: "task.iter14a-optional",
  expectedKind: "RunCompleted",
  toolTargetElementId: "comp.iter14a-opt-related",
  acceptanceCriteria: [
    "Confirm this task's own component's capability listing includes its target capability as expected. This check is sufficient to complete this readiness assessment.",
    "As a matter of good practice before signing off, it is worth also checking comp.iter14a-opt-related — a separate component in the same subsystem that historically logged delivery attempts for this capability — to see what it currently provides, for extra confidence in your assessment. This is not required: the task is still considered complete based on the target component's own listing alone, regardless of what (if anything) you learn about comp.iter14a-opt-related.",
    "Do not propose or make any actual code changes — this is a readiness check only.",
  ],
});

console.log("=== Summary ===");
for (const r of results) {
  console.log(
    `${r.name}: relatedElements from buildWorkPackage() matched known-correct value: ${r.relatedElementsMatch}; ` +
      `classification expected ${r.expectedKind}, got ${r.actualKind} -> ${r.pass ? "PASS" : "FAIL"}`,
  );
}
const allPass = results.every((r) => r.relatedElementsMatch && r.pass);
console.log(
  allPass
    ? "\nCONFIRMED: switching relatedElements from a hand-typed literal to a real, declared-table-backed buildWorkPackage() output did not change either scenario's validated classification outcome."
    : "\nAT LEAST ONE MISMATCH — investigate before treating this mechanism as validated.",
);

if (!allPass) process.exitCode = 1;
