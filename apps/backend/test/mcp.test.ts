import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { buildGrant, GrantRefusedError, type McpGrant } from "../src/mcp/grant.js";
import { getAncestry, getCapabilitiesOf } from "../src/mcp/tools.js";
import { buildWorkPackage, type WorkPackageResult } from "../src/workpackage/build.js";
import { seededDb } from "./helpers.js";

let db: NexusDb;
let wp: WorkPackageResult;
let grant: McpGrant;

before(async () => {
  db = await seededDb();
  // one unrelated component, connected to nothing this task's Work Package
  // touches — the deliberate out-of-grant target for getCapabilitiesOf.
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name)
     values ('comp.unrelated', 'component', 'subsys.invoice', 'Unrelated')`,
  );
  wp = await buildWorkPackage(db, "task.invoice-discount-validation", "wpp.implementation");
  grant = await buildGrant(db, wp, "run.test-1");
});
after(async () => {
  await db.close();
});

test("buildGrant includes the Work Package's own capabilities, components, and repositories", () => {
  assert.equal(grant.runId, "run.test-1");
  assert.equal(grant.workPackageId, wp.id);
  assert.ok(grant.allowedElementIds.includes("cap.invoice-discount"));
  assert.ok(grant.allowedElementIds.includes("comp.invoice-service"));
  assert.ok(grant.allowedRepositoryIds.includes("repo.billing-service"));
});

test("buildGrant widens one level past the Work Package's own context_depth (§9.5), unlike the Work Package itself", async () => {
  // wpp.implementation ships context_depth: 0, so the Work Package's own
  // impactedComponents is empty (proven in Iteration 0's test suite) — but
  // the *grant* widens to context_depth + 1 = 1, and the seed has
  // comp.invoice-service dependsOn comp.payment-service, one hop away.
  assert.deepEqual(wp.impactedComponents, []);
  assert.ok(
    grant.allowedElementIds.includes("comp.payment-service"),
    "grant must include the one-hop dependency the Work Package itself does not",
  );
});

test("an element the Work Package never touched is not in the grant", () => {
  assert.ok(!grant.allowedElementIds.includes("cap.invoice-export"));
  assert.ok(!grant.allowedElementIds.includes("comp.unrelated"));
});

test("getAncestry: an in-grant call succeeds and returns the full chain, including ancestors not themselves individually in the grant", async () => {
  const rows = await getAncestry(db, grant, "comp.invoice-service");
  const ids = rows.map((r) => r.id);
  assert.deepEqual(ids, ["comp.invoice-service", "subsys.invoice", "dom.billing", "prod.trade-platform"]);
  // the grant check applies to the call's target, not to filtering the
  // result — prod.trade-platform need not itself be in allowedElementIds
  // for its ancestry to be returned once the target passed the check.
  assert.ok(!grant.allowedElementIds.includes("prod.trade-platform"));
});

test("getAncestry: an out-of-grant target is refused, not silently narrowed or emptied", async () => {
  await assert.rejects(
    () => getAncestry(db, grant, "cap.invoice-export"),
    (err) => err instanceof GrantRefusedError && err.reason === "out-of-grant",
  );
});

test("getCapabilitiesOf: in-grant succeeds, out-of-grant is refused", async () => {
  const rows = await getCapabilitiesOf(db, grant, "comp.invoice-service");
  assert.ok(rows.some((r) => r.capability_id === "cap.invoice-discount"));

  await assert.rejects(
    () => getCapabilitiesOf(db, grant, "comp.unrelated"),
    (err) => err instanceof GrantRefusedError && err.reason === "out-of-grant",
  );
});

test("an expired grant refuses every call, including one for an otherwise in-grant target", async () => {
  const expired: McpGrant = { ...grant, expiresAt: new Date(Date.now() - 1000).toISOString() };
  await assert.rejects(
    () => getAncestry(db, expired, "comp.invoice-service"),
    (err) => err instanceof GrantRefusedError && err.reason === "expired",
  );
});

test("buildGrant rejects a Work Package referencing a profile that does not exist (structurally FK-prevented; verified anyway)", async () => {
  const bogus: WorkPackageResult = { ...wp, profileId: "wpp.does-not-exist" };
  await assert.rejects(() => buildGrant(db, bogus, "run.test-2"));
});
