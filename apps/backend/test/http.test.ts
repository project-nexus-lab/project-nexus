import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { createHttpServer } from "../src/http/server.js";
import {
  declareRepository,
  generateProjection,
  provisionRepository,
  registerMapping,
} from "../src/repository/lifecycle.js";
import { NoopVcsProvider } from "../src/repository/vcs-provider.js";
import { seededDb } from "./helpers.js";

let baseUrl: string;
let server: ReturnType<typeof createHttpServer>;
let db: NexusDb;

before(async () => {
  db = await seededDb();
  server = createHttpServer(db);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function call(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

test("GET /health", async () => {
  const { status, body } = await call("GET", "/health");
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
});

test("unknown route returns 404", async () => {
  const { status, body } = await call("GET", "/nope");
  assert.equal(status, 404);
  assert.equal(body.error, "NotFound");
});

test("GET /architecture/:id/ancestry wraps the traversal", async () => {
  const { status, body } = await call("GET", "/architecture/comp.invoice-service/ancestry");
  assert.equal(status, 200);
  assert.deepEqual(
    body.map((r: { id: string }) => r.id),
    ["comp.invoice-service", "subsys.invoice", "dom.billing", "prod.trade-platform"],
  );
});

test("GET /work-packages/:taskId/:profileId builds a Work Package (201 on first build)", async () => {
  const { status, body } = await call(
    "GET",
    "/work-packages/task.invoice-discount-validation/wpp.implementation",
  );
  assert.equal(status, 201);
  assert.equal(body.payload.task, "task.invoice-discount-validation");
});

test("GET /work-packages for a non-ready task returns 422 with the gate reason", async () => {
  const { status, body } = await call(
    "GET",
    "/work-packages/task.draft-example/wpp.implementation",
  );
  assert.equal(status, 422);
  assert.equal(body.error, "WorkPackageGateError");
  assert.equal(body.reason, "task-not-ready");
});

test("full HTTP-driven proposal lifecycle: draft -> submit -> approve -> apply", async () => {
  const draft = await call("POST", "/proposals", {
    intent: "mint a component over HTTP",
    authoredBy: "human:http-test",
    operations: [
      {
        op: "create",
        mintId: "comp.http-minted",
        mintKind: "component",
        mintParentId: "subsys.invoice",
        mintName: "HTTP Minted",
      },
    ],
  });
  assert.equal(draft.status, 201);
  const proposalId: string = draft.body.id;
  assert.match(proposalId, /^acp\./);

  assert.equal((await call("POST", `/proposals/${proposalId}/submit`)).status, 200);
  assert.equal(
    (await call("POST", `/proposals/${proposalId}/approve`, { approvedBy: "human:reviewer" })).status,
    200,
  );

  const applied = await call("POST", `/proposals/${proposalId}/apply`);
  assert.equal(applied.status, 200);
  assert.deepEqual(applied.body.mintedIds, ["comp.http-minted"]);
});

test("invalid proposal input returns 400, unknown proposal returns 404, wrong-state transition returns 409", async () => {
  const bad = await call("POST", "/proposals", { intent: "x", authoredBy: "nobody", operations: [] });
  assert.equal(bad.status, 400);

  const missing = await call("POST", "/proposals/acp.00000000000000000000000000/submit");
  assert.equal(missing.status, 404);

  const draft = await call("POST", "/proposals", {
    intent: "x",
    authoredBy: "human:a",
    operations: [{ op: "create", mintId: "comp.http-409", mintKind: "component", mintParentId: "subsys.invoice", mintName: "X" }],
  });
  const wrongState = await call("POST", `/proposals/${draft.body.id}/apply`); // still draft
  assert.equal(wrongState.status, 409);
});

test("task lifecycle over HTTP: block, then release via proposal apply, then link + ready", async () => {
  // seed a ready-shaped task affecting an unprovided capability, mirroring
  // the in-process end-to-end test in proposal.test.ts, driven over HTTP
  // this time.
  const draft = await call("POST", "/proposals", {
    intent: "provide a capability over HTTP",
    authoredBy: "run:http-agent",
    operations: [
      {
        op: "create",
        mintId: "comp.http-provider",
        mintKind: "component",
        mintParentId: "subsys.invoice",
        mintName: "HTTP Provider",
      },
    ],
  });
  const proposalId: string = draft.body.id;

  const block = await call("POST", "/tasks/task.draft-example/block", { proposalId });
  assert.equal(block.status, 200);

  await call("POST", `/proposals/${proposalId}/submit`);
  await call("POST", `/proposals/${proposalId}/approve`, { approvedBy: "human:reviewer" });
  const applied = await call("POST", `/proposals/${proposalId}/apply`);
  assert.deepEqual(applied.body.releasedTaskIds, ["task.draft-example"]);

  const link = await call("POST", "/tasks/task.draft-example/capabilities", {
    capabilityId: "cap.create-invoice",
  });
  assert.equal(link.status, 200);

  // AcceptanceCriterion authoring has no HTTP endpoint in this iteration's
  // thin surface (see docs/history/iteration-1/REPORT.md) — seeded directly
  // so this test can reach the draft->ready transition it is testing.
  await db.query(
    `insert into work.acceptance_criterion (id, work_item_id, statement, ordinal)
     values ('ac.http-lifecycle', 'task.draft-example', 'stmt', 0)`,
  );

  const ready = await call("POST", "/tasks/task.draft-example/ready");
  assert.equal(ready.status, 200);
});

// Finding 1 (docs/history/iteration-1/REPORT.md): blocking against a
// terminal proposal previously succeeded silently over HTTP too. These
// confirm the fix's error mapping, not just that it throws in-process.
test("POST /tasks/:id/block against a nonexistent proposal returns 404", async () => {
  const res = await call("POST", "/tasks/task.draft-example/block", {
    proposalId: "acp.00000000000000000000000000",
  });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "ProposalNotBlockableError");
  assert.equal(res.body.reason, "not-found");
});

test("POST /tasks/:id/block against an already-applied proposal returns 409", async () => {
  const draft = await call("POST", "/proposals", {
    intent: "mint a component to immediately apply and then reuse as a blocker",
    authoredBy: "human:http-test",
    operations: [
      {
        op: "create",
        mintId: "comp.http-terminal-block",
        mintKind: "component",
        mintParentId: "subsys.invoice",
        mintName: "HTTP Terminal Block",
      },
    ],
  });
  const proposalId: string = draft.body.id;
  await call("POST", `/proposals/${proposalId}/submit`);
  await call("POST", `/proposals/${proposalId}/approve`, { approvedBy: "human:reviewer" });
  await call("POST", `/proposals/${proposalId}/apply`);

  const block = await call("POST", "/tasks/task.draft-example/block", { proposalId });
  assert.equal(block.status, 409);
  assert.equal(block.body.error, "ProposalNotBlockableError");
  assert.equal(block.body.reason, "terminal");
});

// Iteration 3: MCP grant enforcement (§9.5), demonstrable over HTTP.
test("POST /grants issues a grant, then in-grant and out-of-grant tool calls behave as the grant says", async () => {
  const grantRes = await call("POST", "/grants", {
    taskId: "task.invoice-discount-validation",
    profileId: "wpp.implementation",
    runId: "run.http-test",
  });
  assert.equal(grantRes.status, 201);
  const grant = grantRes.body;
  assert.ok(grant.allowedElementIds.includes("comp.invoice-service"));
  assert.ok(!grant.allowedElementIds.includes("cap.invoice-export"));

  const inGrant = await call("POST", "/mcp/architecture/ancestry", {
    grant,
    elementId: "comp.invoice-service",
  });
  assert.equal(inGrant.status, 200);
  assert.ok(Array.isArray(inGrant.body));

  const outOfGrant = await call("POST", "/mcp/architecture/ancestry", {
    grant,
    elementId: "cap.invoice-export",
  });
  assert.equal(outOfGrant.status, 403);
  assert.equal(outOfGrant.body.error, "GrantRefusedError");
  assert.equal(outOfGrant.body.reason, "out-of-grant");
});

// --- Iteration 13: architecture/proposal discovery and review -------------
// docs/history/iteration-13/SCOPE.md — a plain, ungated read surface (not
// grant-gated MCP) so a human can discover what exists and review a
// proposal before approving it. See
// src/cli/investigate-po-authoring-workflow.ts for the qualitative
// findings (step count, friction, indispensable endpoints, missing
// information) this surface was validated against.

test("GET /architecture/:id returns element detail with childIds", async () => {
  const { status, body } = await call("GET", "/architecture/subsys.invoice");
  assert.equal(status, 200);
  assert.equal(body.kind, "subsystem");
  assert.equal(body.name, "Invoice");
  assert.equal(body.status, "active");
  assert.equal(body.parentId, "dom.billing");
  // Superset check, not exact equality: earlier tests in this file (shared
  // db across the whole file) mint their own components under this same
  // subsystem, so the seed's own children are a floor, not the ceiling.
  for (const expected of [
    "cap.create-invoice",
    "cap.invoice-discount",
    "cap.invoice-export",
    "comp.invoice-service",
    "comp.payment-service",
  ]) {
    assert.ok(body.childIds.includes(expected), `expected childIds to include ${expected}`);
  }
});

test("GET /architecture/:id for an unknown id returns 404", async () => {
  const { status, body } = await call("GET", "/architecture/comp.does-not-exist");
  assert.equal(status, 404);
  assert.equal(body.error, "ElementNotFoundError");
});

test("GET /architecture lists elements, bounded by kind and parent filters", async () => {
  const byKind = await call("GET", "/architecture?kind=product");
  assert.equal(byKind.status, 200);
  assert.deepEqual(byKind.body.map((e: { id: string }) => e.id), ["prod.trade-platform"]);

  const byParent = await call("GET", "/architecture?kind=component&parent=subsys.invoice");
  assert.equal(byParent.status, 200);
  const parentIds = byParent.body.map((e: { id: string }) => e.id);
  // Superset check — see the childIds test above for why.
  assert.ok(parentIds.includes("comp.invoice-service"));
  assert.ok(parentIds.includes("comp.payment-service"));
});

test("GET /architecture/:id/providers wraps providersOf (Capability <- PROVIDES <- Component)", async () => {
  const provided = await call("GET", "/architecture/cap.invoice-discount/providers");
  assert.equal(provided.status, 200);
  assert.deepEqual(provided.body, [{ component_id: "comp.invoice-service", is_primary: true }]);

  const unprovided = await call("GET", "/architecture/cap.invoice-export/providers");
  assert.equal(unprovided.status, 200);
  assert.deepEqual(unprovided.body, []);
});

test("GET /proposals/:id returns the proposal's own operations, unreachable before this iteration", async () => {
  const draft = await call("POST", "/proposals", {
    intent: "mint and provide, then review before approving",
    authoredBy: "human:reviewer-test",
    operations: [
      {
        op: "create",
        mintId: "comp.http-review",
        mintKind: "component",
        mintParentId: "subsys.invoice",
        mintName: "HTTP Review",
      },
      {
        op: "provide",
        provideComponentId: "comp.http-review",
        provideCapabilityId: "cap.invoice-export",
        provideIsPrimary: true,
      },
      {
        op: "decide",
        decideId: "adr.http-review",
        decideTitle: "HTTP Review Decision",
        decideStatement: "Exists to confirm 'decide' surfaces over the existing read route.",
      },
    ],
  });

  const { status, body } = await call("GET", `/proposals/${draft.body.id}`);
  assert.equal(status, 200);
  assert.equal(body.state, "draft");
  assert.equal(body.authoredBy, "human:reviewer-test");
  assert.equal(body.approvedBy, null);
  assert.deepEqual(body.operations, [
    { ordinal: 0, op: "create", mintId: "comp.http-review", mintKind: "component", mintParentId: "subsys.invoice", mintName: "HTTP Review" },
    { ordinal: 1, op: "provide", provideComponentId: "comp.http-review", provideCapabilityId: "cap.invoice-export", provideIsPrimary: true },
    { ordinal: 2, op: "decide", decideId: "adr.http-review", decideTitle: "HTTP Review Decision", decideStatement: "Exists to confirm 'decide' surfaces over the existing read route." },
  ]);
});

test("GET /proposals/:id for an unknown id returns 404", async () => {
  const { status, body } = await call("GET", "/proposals/acp.00000000000000000000000000");
  assert.equal(status, 404);
  assert.equal(body.error, "ProposalNotFoundError");
});

test("GET /proposals lists proposals, bounded by state", async () => {
  const draft = await call("POST", "/proposals", {
    intent: "list-by-state fixture",
    authoredBy: "human:list-test",
    operations: [{ op: "create", mintId: "comp.http-list-state", mintKind: "component", mintParentId: "subsys.invoice", mintName: "X" }],
  });
  await call("POST", `/proposals/${draft.body.id}/submit`);

  const proposed = await call("GET", "/proposals?state=proposed");
  assert.equal(proposed.status, 200);
  assert.ok(proposed.body.some((p: { id: string }) => p.id === draft.body.id));
  assert.ok(proposed.body.every((p: { state: string }) => p.state === "proposed"));
});

test("PO discovery workflow: starting from only the product's name, discover, draft, review, approve, apply, and confirm — no other id hardcoded", async () => {
  const products = await call("GET", "/architecture?kind=product");
  const product = products.body.find((p: { name: string }) => p.name === "Trade Platform");
  assert.ok(product, "Trade Platform must be discoverable by name alone");

  const domains = await call("GET", `/architecture?kind=domain&parent=${product.id}`);
  const domain = domains.body[0];

  const subsystems = await call("GET", `/architecture?kind=subsystem&parent=${domain.id}`);
  const subsystem = subsystems.body[0];

  const capabilities = await call("GET", `/architecture?kind=capability&parent=${subsystem.id}`);
  const capability = capabilities.body.find((c: { name: string }) => c.name === "Export Invoice");
  assert.ok(capability, "Export Invoice must be discoverable by name under the discovered subsystem");

  const providersBefore = await call("GET", `/architecture/${capability.id}/providers`);
  assert.deepEqual(providersBefore.body, []);

  const draft = await call("POST", "/proposals", {
    intent: "PO workflow test: provide the discovered capability",
    authoredBy: "human:po-workflow-test",
    operations: [
      {
        op: "create",
        mintId: "comp.po-test-export-service",
        mintKind: "component",
        mintParentId: subsystem.id,
        mintName: "PO Test Export Service",
      },
      {
        op: "provide",
        provideComponentId: "comp.po-test-export-service",
        provideCapabilityId: capability.id,
        provideIsPrimary: true,
      },
    ],
  });
  assert.equal(draft.status, 201);

  const review = await call("GET", `/proposals/${draft.body.id}`);
  assert.equal(review.body.operations.length, 2);

  await call("POST", `/proposals/${draft.body.id}/submit`);
  await call("POST", `/proposals/${draft.body.id}/approve`, { approvedBy: "human:po-reviewer-test" });
  const applied = await call("POST", `/proposals/${draft.body.id}/apply`);
  assert.equal(applied.status, 200);

  const providersAfter = await call("GET", `/architecture/${capability.id}/providers`);
  assert.deepEqual(providersAfter.body, [
    { component_id: "comp.po-test-export-service", is_primary: true },
  ]);
});

test("POST /alignment/verify accepts the exact managed-region-wrapped text render() produces, not bare JSON (Iteration 18)", async () => {
  // Drives the real, unmodified state machine to get a real
  // generateProjection() output — the same content the actual generated
  // CI workflow posts, markers included, not a hand-typed approximation.
  const noop = new NoopVcsProvider();
  await declareRepository(db, { id: "repo.iter18-http-real", name: "iter18-http-real", provider: "noop" });
  await provisionRepository(db, "repo.iter18-http-real", noop);
  await registerMapping(db, "repo.iter18-http-real", "comp.invoice-service", false);
  const [repositoryJsonFile] = await generateProjection(db, "repo.iter18-http-real", "v1");
  assert.ok(repositoryJsonFile);

  const res = await fetch(`${baseUrl}/alignment/verify`, {
    method: "POST",
    body: repositoryJsonFile.content, // the raw, marker-wrapped file — not JSON.stringify'd
  });
  const body = await res.json();

  assert.equal(res.status, 200, "must not be 400 InvalidJson");
  assert.deepEqual(body, { ok: true, failures: [], warnings: [] });
});

test("POST /alignment/verify rejects a malformed request with 400, not a 500", async () => {
  const { status, body } = await call("POST", "/alignment/verify", { componentIds: [] });
  assert.equal(status, 400);
  assert.equal(body.error, "InvalidAlignmentRequestError");
});

test("POST /alignment/verify reports an unknown repository as a structured result, not a 404", async () => {
  const { status, body } = await call("POST", "/alignment/verify", {
    repositoryId: "repo.does-not-exist-http",
    componentIds: [],
  });
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ok: false,
    failures: [{ code: "unknown-repository", message: "repository repo.does-not-exist-http does not exist" }],
    warnings: [],
  });
});
