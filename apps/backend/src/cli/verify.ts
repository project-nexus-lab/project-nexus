import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { orphanTasks, unprovidedCapabilities } from "../graph/alignment.js";
import { ancestry, capabilitiesOf, implementationPath } from "../graph/traversals.js";
import { importAll } from "../import/importAll.js";
import { isValidArchitectureElementId, isValidWorkItemId } from "../ids/ids.js";
import { buildWorkPackage } from "../workpackage/build.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedDir = path.resolve(__dirname, "../../seed");

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  const mark = condition ? "PASS" : "FAIL";
  console.log(`[${mark}] ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  if (!condition) failures += 1;
}

console.log("=== Iteration 0 verification (in-memory database) ===\n");

const db = await openDb(); // in-memory — a clean instance per run
await migrate(db);

console.log("--- 1. Stable ID validation ---");
check("valid architecture id accepted", isValidArchitectureElementId("comp.invoice-service"));
check("valid work id accepted", isValidWorkItemId("task.invoice-discount-validation"));
check("uppercase id rejected", !isValidArchitectureElementId("Comp.InvoiceService"));
check("unknown prefix rejected", !isValidArchitectureElementId("widget.invoice-service"));
check("missing dot rejected", !isValidArchitectureElementId("compinvoiceservice"));
check("trailing hyphen rejected", !isValidArchitectureElementId("comp.invoice-"));

try {
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name) values ('nope', 'component', null, 'x')`,
  );
  check("DB rejects malformed id", false);
} catch {
  check("DB rejects malformed id (check constraint fired)", true);
}

console.log("\n--- 2. Seed import (Architecture, Work, Repository, Execution) ---");
const imported = await importAll(db, {
  architecture: path.join(seedDir, "architecture.yaml"),
  repository: path.join(seedDir, "repository.yaml"),
  work: path.join(seedDir, "work.yaml"),
  execution: path.join(seedDir, "execution.yaml"),
});
check("architecture elements imported", imported.architecture.elements > 0, imported.architecture);
check("work items imported", imported.work.workItems > 0, imported.work);
check("repositories imported", imported.repository.repositories > 0, imported.repository);

console.log("\n--- 3. Legal containment enforced ---");
try {
  // subsystem cannot directly contain a domain (illegal per legal_containment table)
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name)
     values ('dom.illegal', 'domain', 'subsys.invoice', 'Illegal Domain')`,
  );
  check("illegal containment rejected", false);
} catch {
  check("illegal containment rejected (trigger fired)", true);
}

console.log("\n--- 4. Graph traversals ---");
const invoiceAncestry = await ancestry(db, "comp.invoice-service");
check(
  "ancestry(comp.invoice-service) reaches the product root",
  invoiceAncestry.at(-1)?.id === "prod.trade-platform",
  invoiceAncestry.map((a) => a.id),
);

const caps = await capabilitiesOf(db, "comp.invoice-service");
check(
  "capabilitiesOf(comp.invoice-service) includes cap.invoice-discount",
  caps.some((c) => c.capability_id === "cap.invoice-discount"),
  caps,
);

const path1 = await implementationPath(db, "task.invoice-discount-validation");
check(
  "implementationPath(task) resolves Task→Capability→Component→Repository",
  path1.some(
    (r) =>
      r.capability_id === "cap.invoice-discount" &&
      r.component_id === "comp.invoice-service" &&
      r.repository_id === "repo.billing-service",
  ),
  path1,
);

console.log("\n--- 5. Alignment queries ---");
const orphans = await orphanTasks(db);
check(
  "orphanTasks() reports the draft task with no affects link",
  orphans.some((o) => o.task_id === "task.draft-example"),
  orphans,
);
check(
  "orphanTasks() does not report the ready, affects-linked task",
  !orphans.some((o) => o.task_id === "task.invoice-discount-validation"),
);

const unprovided = await unprovidedCapabilities(db);
check(
  "unprovidedCapabilities() reports cap.invoice-export",
  unprovided.some((c) => c.capability_id === "cap.invoice-export"),
  unprovided,
);

console.log("\n--- 6. Work Package generation (determinism + idempotency) ---");
const wp1 = await buildWorkPackage(db, "task.invoice-discount-validation", "wpp.implementation");
const wp2 = await buildWorkPackage(db, "task.invoice-discount-validation", "wpp.implementation");

check("first build inserts a new WorkPackage", wp1.created === true, wp1.id);
check("second build returns the same package (idempotent)", wp2.created === false && wp2.id === wp1.id);
check("same input ⇒ same content hash", wp1.contentHash === wp2.contentHash, wp1.contentHash);
check(
  "payload matches WORK_PACKAGE_SPEC.md's worked example",
  wp1.payload.task === "task.invoice-discount-validation" &&
    wp1.payload.feature === "feat.invoice-discounts" &&
    wp1.payload.capabilities.includes("cap.invoice-discount") &&
    wp1.payload.components.includes("comp.invoice-service") &&
    wp1.payload.repositories.includes("repo.billing-service") &&
    wp1.payload.files.includes("InvoiceService.java") &&
    wp1.payload.constraints.includes("con.backward-compatible") &&
    wp1.payload.decisions.includes("adr.discount-strategy-v1") &&
    wp1.payload.acceptanceCriteria.includes("ac.discount-applied") &&
    wp1.payload.acceptanceCriteria.includes("ac.existing-behaviour-unchanged"),
  wp1.payload,
);

const { rows: wpCount } = await db.query<{ count: number }>(
  `select count(*)::int as count from execution.work_package`,
);
check(
  "exactly one WorkPackage row persisted despite two build calls",
  Number(wpCount[0]?.count) === 1,
  wpCount[0],
);

console.log("\n--- 7. Work Package gate rejects a non-ready task ---");
try {
  await buildWorkPackage(db, "task.draft-example", "wpp.implementation");
  check("gate rejects draft task", false);
} catch (err) {
  check(
    "gate rejects draft task (task-not-ready)",
    (err as { reason?: string }).reason === "task-not-ready",
  );
}

await db.close();

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
