import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { unprovidedCapabilities } from "../src/graph/alignment.js";
import {
  applyProposal,
  approveProposal,
  draftProposal,
  IllegalProposalTransitionError,
  InvalidProposalError,
  ProposalNotFoundError,
  rejectProposal,
  RetirementRefusedError,
  submitProposal,
} from "../src/proposal/proposal.js";
import { blockTask, linkCapability, markReady } from "../src/work/lifecycle.js";
import { buildWorkPackage, WorkPackageGateError } from "../src/workpackage/build.js";
import { seededDb } from "./helpers.js";

let db: NexusDb;
before(async () => {
  db = await seededDb();
});
after(async () => {
  await db.close();
});

test("draftProposal validates authoredBy, operation shape, and id/kind agreement", async () => {
  await assert.rejects(
    () => draftProposal(db, { intent: "x", authoredBy: "nobody", operations: [] }),
    (err) => err instanceof InvalidProposalError,
  );
  await assert.rejects(
    () => draftProposal(db, { intent: "x", authoredBy: "human:a", operations: [] }),
    (err) => err instanceof InvalidProposalError,
  );
  await assert.rejects(
    () =>
      draftProposal(db, {
        intent: "x",
        authoredBy: "human:a",
        operations: [{ op: "create", mintKind: "component" }], // missing mintId, mintName
      }),
    (err) => err instanceof InvalidProposalError,
  );
  await assert.rejects(
    () =>
      draftProposal(db, {
        intent: "x",
        authoredBy: "human:a",
        operations: [
          { op: "create", mintId: "cap.wrong-prefix", mintKind: "component", mintName: "X", mintParentId: "subsys.invoice" },
        ],
      }),
    (err) => err instanceof InvalidProposalError, // prefix must match kind
  );
  await assert.rejects(
    () =>
      draftProposal(db, {
        intent: "x",
        authoredBy: "human:a",
        operations: [{ op: "create", mintId: "comp.no-parent", mintKind: "component", mintName: "X" }],
      }),
    (err) => err instanceof InvalidProposalError, // non-product requires mintParentId
  );
  await assert.rejects(
    () =>
      draftProposal(db, {
        intent: "x",
        authoredBy: "human:a",
        operations: [{ op: "retire" }], // missing targetId
      }),
    (err) => err instanceof InvalidProposalError,
  );
  await assert.rejects(
    () =>
      draftProposal(db, {
        intent: "x",
        authoredBy: "human:a",
        operations: [{ op: "provide", provideComponentId: "comp.invoice-service" }], // missing provideCapabilityId
      }),
    (err) => err instanceof InvalidProposalError,
  );
});

test("'provide' operation establishes Component provides Capability transactionally, referencing elements minted by 'create' operations earlier in the same proposal (Iteration 12)", async () => {
  // Deliberately mints both ends of the provision edge in this same
  // proposal — the exact ordering risk docs/history/iteration-12/SCOPE.md
  // named directly ("a provide operation naming a mintId from an earlier
  // create operation... before that id is visible"). Uses fresh ids, not
  // any seeded capability, so it cannot affect later tests sharing `db`.
  const { id } = await draftProposal(db, {
    intent: "mint a component and a capability, then make the component provide it",
    authoredBy: "human:alice",
    operations: [
      {
        op: "create",
        mintId: "comp.provide-demo",
        mintKind: "component",
        mintParentId: "subsys.invoice",
        mintName: "Provide Demo Component",
      },
      {
        op: "create",
        mintId: "cap.provide-demo",
        mintKind: "capability",
        mintParentId: "subsys.invoice",
        mintName: "Provide Demo Capability",
      },
      {
        op: "provide",
        provideComponentId: "comp.provide-demo",
        provideCapabilityId: "cap.provide-demo",
        provideIsPrimary: true,
      },
    ],
  });
  await submitProposal(db, id);
  await approveProposal(db, id, "human:bob");

  const result = await applyProposal(db, id);
  assert.deepEqual(result.mintedIds, ["comp.provide-demo", "cap.provide-demo"]);
  assert.deepEqual(result.providedLinks, [
    { componentId: "comp.provide-demo", capabilityId: "cap.provide-demo" },
  ]);

  const { rows } = await db.query<{ is_primary: boolean }>(
    `select is_primary from architecture.element_provision
     where component_id = 'comp.provide-demo' and capability_id = 'cap.provide-demo'`,
  );
  assert.deepEqual(rows, [{ is_primary: true }]);
});

test("'provide' operation is rejected by the DB when it names an id of the wrong kind (kind-checked FK is the final word, §7.2)", async () => {
  const { id } = await draftProposal(db, {
    intent: "attempt to make a capability provide a capability",
    authoredBy: "human:a",
    operations: [
      {
        op: "provide",
        provideComponentId: "cap.invoice-discount", // wrong kind: a capability, not a component
        provideCapabilityId: "cap.invoice-export",
      },
    ],
  });
  await submitProposal(db, id);
  await approveProposal(db, id, "human:a");

  await assert.rejects(() => applyProposal(db, id));
});

test("full lifecycle: draft -> proposed -> approved -> applied mints an element transactionally", async () => {
  const { id } = await draftProposal(db, {
    intent: "add a discount-engine component providing the missing capability",
    authoredBy: "human:alice",
    operations: [
      {
        op: "create",
        mintId: "comp.discount-engine",
        mintKind: "component",
        mintParentId: "subsys.invoice",
        mintName: "Discount Engine",
      },
    ],
  });
  assert.match(id, /^acp\.[0-9A-HJKMNP-TV-Z]{26}$/);

  await submitProposal(db, id);
  await approveProposal(db, id, "human:bob");

  const result = await applyProposal(db, id);
  assert.deepEqual(result.mintedIds, ["comp.discount-engine"]);
  assert.deepEqual(result.retiredIds, []);
  assert.deepEqual(result.releasedTaskIds, []);

  const { rows } = await db.query<{ kind: string; status: string }>(
    `select kind, status from architecture.element where id = 'comp.discount-engine'`,
  );
  assert.deepEqual(rows[0], { kind: "component", status: "active" });

  const { rows: proposalRows } = await db.query<{ state: string; applied_at: string | null }>(
    `select state, applied_at from architecture.change_proposal where id = $1`,
    [id],
  );
  assert.equal(proposalRows[0]?.state, "applied");
  assert.notEqual(proposalRows[0]?.applied_at, null);
});

test("state machine rejects out-of-order transitions", async () => {
  const { id } = await draftProposal(db, {
    intent: "x",
    authoredBy: "human:a",
    operations: [{ op: "create", mintId: "comp.oo1", mintKind: "component", mintParentId: "subsys.invoice", mintName: "X" }],
  });

  await assert.rejects(
    () => approveProposal(db, id, "human:a"), // still draft, not proposed
    (err) => err instanceof IllegalProposalTransitionError,
  );
  await assert.rejects(
    () => applyProposal(db, id), // still draft, not approved
    (err) => err instanceof IllegalProposalTransitionError,
  );

  await submitProposal(db, id);
  await assert.rejects(
    () => submitProposal(db, id), // already proposed
    (err) => err instanceof IllegalProposalTransitionError,
  );
  await assert.rejects(
    () => approveProposal(db, id, "run:agent-1"), // must be a human principal
    (err) => err instanceof InvalidProposalError,
  );
});

// Finding 2 (docs/history/iteration-1/REPORT.md, "Interpretive decision:
// rejectProposal's allowed source states"): §5.2's state machine notation
// (`draft → proposed → approved → applied | rejected`) is genuinely
// ambiguous about whether `rejected` is reachable from `approved`. This
// implementation reads rejection as a pre-approval review outcome only —
// see the reasoning on `rejectProposal` itself (src/proposal/proposal.ts)
// and in REPORT.md for what would need to change if a future iteration
// decides the other reading is correct.
test("rejectProposal is legal from draft and proposed, but not from approved (§5.2, an ambiguous line — see REPORT.md Finding 2)", async () => {
  const { id } = await draftProposal(db, {
    intent: "x",
    authoredBy: "human:a",
    operations: [{ op: "create", mintId: "comp.oo2", mintKind: "component", mintParentId: "subsys.invoice", mintName: "X" }],
  });

  await approveProposal(db, id, "human:a").catch(() => {}); // no-op: still draft, approve would fail first
  await rejectProposal(db, id); // legal: draft -> rejected

  const { id: id2 } = await draftProposal(db, {
    intent: "y",
    authoredBy: "human:a",
    operations: [{ op: "create", mintId: "comp.oo3", mintKind: "component", mintParentId: "subsys.invoice", mintName: "Y" }],
  });
  await submitProposal(db, id2);
  await rejectProposal(db, id2); // legal: proposed -> rejected

  const { id: id3 } = await draftProposal(db, {
    intent: "z",
    authoredBy: "human:a",
    operations: [{ op: "create", mintId: "comp.oo4", mintKind: "component", mintParentId: "subsys.invoice", mintName: "Z" }],
  });
  await submitProposal(db, id3);
  await approveProposal(db, id3, "human:a");
  await assert.rejects(
    () => rejectProposal(db, id3), // not legal under the chosen reading: approved -> rejected
    (err) => err instanceof IllegalProposalTransitionError,
  );
});

test("unknown proposal id raises ProposalNotFoundError", async () => {
  await assert.rejects(
    () => submitProposal(db, "acp.00000000000000000000000000"),
    (err) => err instanceof ProposalNotFoundError,
  );
});

test("apply is transactional: a failing operation rolls back every operation in the proposal", async () => {
  const { id } = await draftProposal(db, {
    intent: "mint one legal component, then one illegal one",
    authoredBy: "human:a",
    operations: [
      { op: "create", mintId: "comp.rollback-ok", mintKind: "component", mintParentId: "subsys.invoice", mintName: "OK" },
      // illegal containment: a component cannot be minted under a domain
      { op: "create", mintId: "comp.rollback-bad", mintKind: "component", mintParentId: "dom.billing", mintName: "Bad" },
    ],
  });
  await submitProposal(db, id);
  await approveProposal(db, id, "human:a");

  await assert.rejects(() => applyProposal(db, id));

  const { rows } = await db.query(
    `select id from architecture.element where id in ('comp.rollback-ok', 'comp.rollback-bad')`,
  );
  assert.equal(rows.length, 0, "neither element should exist after a rolled-back apply");

  const { rows: proposalRows } = await db.query<{ state: string }>(
    `select state from architecture.change_proposal where id = $1`,
    [id],
  );
  assert.equal(proposalRows[0]?.state, "approved", "proposal state must not advance to 'applied' on rollback");
});

test("retirement is refused when a non-terminal Task still affects the capability (§5.6)", async () => {
  const { id } = await draftProposal(db, {
    intent: "retire a capability a live task still affects",
    authoredBy: "human:a",
    operations: [{ op: "retire", targetId: "cap.invoice-discount" }],
  });
  await submitProposal(db, id);
  await approveProposal(db, id, "human:a");

  await assert.rejects(
    () => applyProposal(db, id),
    (err) => err instanceof RetirementRefusedError,
  );

  const { rows } = await db.query<{ status: string }>(
    `select status from architecture.element where id = 'cap.invoice-discount'`,
  );
  assert.equal(rows[0]?.status, "active", "retirement must not have partially applied");
});

test("retirement is refused when an active repository still implements the component (§5.6)", async () => {
  const { id } = await draftProposal(db, {
    intent: "retire a component an active repository still implements",
    authoredBy: "human:a",
    operations: [{ op: "retire", targetId: "comp.invoice-service" }],
  });
  await submitProposal(db, id);
  await approveProposal(db, id, "human:a");

  await db.query(`update repo.repository set bootstrap_state = 'active' where id = 'repo.billing-service'`);

  await assert.rejects(
    () => applyProposal(db, id),
    (err) => err instanceof RetirementRefusedError,
  );
});

test("retirement succeeds when the same proposal supplies succession (§5.6 escape hatch)", async () => {
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name) values ('cap.retire-me', 'capability', 'subsys.invoice', 'Retire Me')`,
  );
  const { id } = await draftProposal(db, {
    intent: "supersede a capability with no live references",
    authoredBy: "human:a",
    operations: [
      {
        op: "create",
        mintId: "cap.retire-me-v2",
        mintKind: "capability",
        mintParentId: "subsys.invoice",
        mintName: "Retire Me v2",
        supersedesId: "cap.retire-me",
      },
      { op: "retire", targetId: "cap.retire-me" },
    ],
  });
  await submitProposal(db, id);
  await approveProposal(db, id, "human:a");
  const result = await applyProposal(db, id);

  assert.deepEqual(result.mintedIds, ["cap.retire-me-v2"]);
  assert.deepEqual(result.retiredIds, ["cap.retire-me"]);

  const { rows } = await db.query<{ id: string; status: string }>(
    `select id, status from architecture.element where id in ('cap.retire-me', 'cap.retire-me-v2') order by id`,
  );
  assert.deepEqual(rows, [
    { id: "cap.retire-me", status: "retired" },
    { id: "cap.retire-me-v2", status: "active" },
  ]);

  const { rows: successionRows } = await db.query(
    `select predecessor_id, successor_id from architecture.element_succession where proposal_id = $1`,
    [id],
  );
  assert.deepEqual(successionRows, [
    { predecessor_id: "cap.retire-me", successor_id: "cap.retire-me-v2" },
  ]);
});

test("end to end: a Work Package gate failure blocks a Task, a proposal unblocks it, and generation then succeeds", async () => {
  // Seed: a task affecting an unprovided capability — buildWorkPackage's gate refuses it.
  await db.query(
    `insert into work.work_item (id, kind, parent_id, title, status) values ('task.needs-export', 'task', 'feat.invoice-discounts', 'Needs export capability', 'ready')`,
  );
  await db.query(
    `insert into work.work_item_capability (work_item_id, capability_id) values ('task.needs-export', 'cap.invoice-export')`,
  );
  await db.query(
    `insert into work.acceptance_criterion (id, work_item_id, statement, ordinal) values ('ac.needs-export', 'task.needs-export', 'stmt', 0)`,
  );

  const gateFailure = await buildWorkPackage(db, "task.needs-export", "wpp.implementation").catch(
    (e) => e,
  );
  assert.ok(gateFailure instanceof WorkPackageGateError);
  assert.equal((gateFailure as WorkPackageGateError).reason, "unprovided-capability");

  // confirmed unprovided before any proposal is applied (Alignment, §8.5)
  const unprovidedBefore = await unprovidedCapabilities(db);
  assert.ok(unprovidedBefore.some((c) => c.capability_id === "cap.invoice-export"));

  // "generation gate refuses -> draft ArchitectureChangeProposal -> Task status -> blocked" (§5.4)
  // Iteration 12: the proposal now mints the component *and* wires it to
  // provide the missing capability in the same governed, atomic step —
  // previously only the mint was possible, leaving the capability
  // unprovided after apply (see docs/history/iteration-12/SCOPE.md).
  const { id: proposalId } = await draftProposal(db, {
    intent: "provide cap.invoice-export from a new component",
    authoredBy: "run:demo-agent",
    operations: [
      {
        op: "create",
        mintId: "comp.export-service",
        mintKind: "component",
        mintParentId: "subsys.invoice",
        mintName: "Export Service",
      },
      {
        op: "provide",
        provideComponentId: "comp.export-service",
        provideCapabilityId: "cap.invoice-export",
        provideIsPrimary: true,
      },
    ],
  });
  await blockTask(db, "task.needs-export", proposalId);
  const blocked = (
    await db.query<{ status: string }>(`select status from work.work_item where id = 'task.needs-export'`)
  ).rows[0];
  assert.equal(blocked?.status, "blocked");

  // human reviews, approves in Nexus -> application, in one transaction (§5.4)
  await submitProposal(db, proposalId);
  await approveProposal(db, proposalId, "human:reviewer");
  const applied = await applyProposal(db, proposalId);
  assert.deepEqual(applied.releasedTaskIds, ["task.needs-export"]);
  assert.deepEqual(applied.providedLinks, [
    { componentId: "comp.export-service", capabilityId: "cap.invoice-export" },
  ]);

  // ProposalApplied -> blocked Tasks released for re-gating (now 'draft')
  const released = (
    await db.query<{ status: string; blocked_by_proposal_id: string | null }>(
      `select status, blocked_by_proposal_id from work.work_item where id = 'task.needs-export'`,
    )
  ).rows[0];
  assert.equal(released?.status, "draft");
  assert.equal(released?.blocked_by_proposal_id, null);

  // the capability is no longer unprovided, confirmed via the same
  // Alignment query, not merely by re-reading the row this test just wrote
  const unprovidedAfter = await unprovidedCapabilities(db);
  assert.ok(!unprovidedAfter.some((c) => c.capability_id === "cap.invoice-export"));

  // a repository mapping still has no authoring path of its own (out of
  // this iteration's scope, see SCOPE.md's Explicit Deferrals) — inserted
  // directly so the demonstration can reach a real, generated Work Package
  await db.query(
    `insert into repo.repository_component (repository_id, component_id, is_primary)
     values ('repo.billing-service', 'comp.export-service', false)`,
  );

  // Task links the new capability, returns to ready (§5.4) — it already
  // affects cap.invoice-export from before it was blocked, so only the
  // AC-bearing draft->ready transition remains.
  await markReady(db, "task.needs-export");

  // Work Package generated (§5.4, closing the loop)
  const wp = await buildWorkPackage(db, "task.needs-export", "wpp.implementation");
  assert.equal(wp.created, true);
  assert.deepEqual(wp.payload.capabilities, ["cap.invoice-export"]);
  assert.deepEqual(wp.payload.components, ["comp.export-service"]);
});
