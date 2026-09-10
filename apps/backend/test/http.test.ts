import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { createHttpServer } from "../src/http/server.js";
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
