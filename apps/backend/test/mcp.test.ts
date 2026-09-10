import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { buildGrant, GrantRefusedError, type McpGrant } from "../src/mcp/grant.js";
import { getAncestry, getCapabilitiesOf, redactOutOfGrantAncestor } from "../src/mcp/tools.js";
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

test("getAncestry: an in-grant call succeeds and returns the full chain in shape, but redacts any ancestor not itself in the grant (Iteration 7)", async () => {
  const rows = await getAncestry(db, grant, "comp.invoice-service");
  assert.equal(rows.length, 4, "the chain's shape (four levels) is preserved");
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["component", "subsystem", "domain", "product"],
    "kind is preserved at every depth — a caller can still tell what the chain is made of",
  );
  assert.deepEqual(
    rows.map((r) => r.depth),
    [0, 1, 2, 3],
    "depth is preserved — a caller can still tell the chain is not skipping or misordered",
  );

  // comp.invoice-service is the call's own target, in the grant — real identity kept.
  assert.equal(rows[0]?.id, "comp.invoice-service");
  assert.equal(rows[0]?.name, "Invoice Service");

  // subsys.invoice, dom.billing, prod.trade-platform are none of them in
  // allowedElementIds (confirmed directly, not assumed) — each is
  // redacted, and distinctly so, not collapsed into one indistinguishable
  // placeholder.
  for (const id of ["subsys.invoice", "dom.billing", "prod.trade-platform"]) {
    assert.ok(!grant.allowedElementIds.includes(id));
  }
  const redactedIds = rows.slice(1).map((r) => r.id);
  assert.deepEqual(redactedIds, ["[redacted:depth=1]", "[redacted:depth=2]", "[redacted:depth=3]"]);
  assert.ok(rows.slice(1).every((r) => r.name === "[redacted]"));
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

test("redactOutOfGrantAncestor: an in-grant row is returned unchanged, not merely equal", () => {
  const row = { id: "comp.invoice-service", kind: "component", name: "Invoice Service", depth: 0 };
  assert.equal(redactOutOfGrantAncestor(row, grant), row);
});

test("redactOutOfGrantAncestor: an out-of-grant row keeps kind and depth, hides id and name", () => {
  const row = { id: "prod.trade-platform", kind: "product", name: "Trade Platform", depth: 3 };
  const redacted = redactOutOfGrantAncestor(row, grant);
  assert.deepEqual(redacted, { id: "[redacted:depth=3]", kind: "product", name: "[redacted]", depth: 3 });
});

test("redactOutOfGrantAncestor: two out-of-grant rows at different depths redact to distinct placeholders, not one indistinguishable value", () => {
  const a = redactOutOfGrantAncestor({ id: "subsys.invoice", kind: "subsystem", name: "Invoice", depth: 1 }, grant);
  const b = redactOutOfGrantAncestor({ id: "dom.billing", kind: "domain", name: "Billing", depth: 2 }, grant);
  assert.notEqual(a.id, b.id);
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
