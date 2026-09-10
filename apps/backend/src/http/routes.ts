import type { NexusDb } from "../db/client.js";
import { ancestry, capabilitiesOf, implementationPath } from "../graph/traversals.js";
import { buildGrant, type McpGrant } from "../mcp/grant.js";
import { getAncestry, getCapabilitiesOf } from "../mcp/tools.js";
import {
  applyProposal,
  approveProposal,
  draftProposal,
  type DraftProposalInput,
  rejectProposal,
  submitProposal,
} from "../proposal/proposal.js";
import { blockTask, linkCapability, markReady } from "../work/lifecycle.js";
import { buildWorkPackage } from "../workpackage/build.js";
import { Router } from "./router.js";

/**
 * Iteration 1's REST surface — deliberately thin. Every handler is a
 * one-to-one wrapper over a function that already exists and is already
 * tested; nothing here adds logic. This is enough to drive the
 * Architecture Change Proposal lifecycle (§5.4) and Work Package
 * generation (§11) from outside the process — not the full §16 1a scope.
 */
export function buildRoutes(db: NexusDb): Router {
  const router = new Router();

  router.get("/health", async () => ({ status: 200, body: { ok: true } }));

  // --- Architecture / Work traversals (read-only wrappers, §8.4) ---------

  router.get("/architecture/:id/ancestry", async (ctx) => ({
    status: 200,
    body: await ancestry(db, ctx.params.id as string),
  }));

  router.get("/architecture/:id/capabilities", async (ctx) => ({
    status: 200,
    body: await capabilitiesOf(db, ctx.params.id as string),
  }));

  router.get("/tasks/:id/implementation-path", async (ctx) => ({
    status: 200,
    body: await implementationPath(db, ctx.params.id as string),
  }));

  // --- Work Package generation (§11) --------------------------------------

  router.get("/work-packages/:taskId/:profileId", async (ctx) => {
    const wp = await buildWorkPackage(db, ctx.params.taskId as string, ctx.params.profileId as string);
    return { status: wp.created ? 201 : 200, body: wp };
  });

  // --- Task lifecycle (§3.5, §5.4) ----------------------------------------

  router.post("/tasks/:id/block", async (ctx) => {
    const { proposalId } = ctx.body as { proposalId: string };
    await blockTask(db, ctx.params.id as string, proposalId);
    return { status: 200, body: { blocked: true } };
  });

  router.post("/tasks/:id/capabilities", async (ctx) => {
    const { capabilityId } = ctx.body as { capabilityId: string };
    await linkCapability(db, ctx.params.id as string, capabilityId);
    return { status: 200, body: { linked: true } };
  });

  router.post("/tasks/:id/ready", async (ctx) => {
    await markReady(db, ctx.params.id as string);
    return { status: 200, body: { ready: true } };
  });

  // --- Architecture Change Proposal lifecycle (§5) ------------------------

  router.post("/proposals", async (ctx) => {
    const input = ctx.body as DraftProposalInput;
    const proposal = await draftProposal(db, input);
    return { status: 201, body: proposal };
  });

  router.post("/proposals/:id/submit", async (ctx) => {
    await submitProposal(db, ctx.params.id as string);
    return { status: 200, body: { state: "proposed" } };
  });

  router.post("/proposals/:id/approve", async (ctx) => {
    const { approvedBy } = ctx.body as { approvedBy: string };
    await approveProposal(db, ctx.params.id as string, approvedBy);
    return { status: 200, body: { state: "approved" } };
  });

  router.post("/proposals/:id/reject", async (ctx) => {
    await rejectProposal(db, ctx.params.id as string);
    return { status: 200, body: { state: "rejected" } };
  });

  router.post("/proposals/:id/apply", async (ctx) => {
    const result = await applyProposal(db, ctx.params.id as string);
    return { status: 200, body: result };
  });

  // --- MCP grant enforcement (§9.5) ---------------------------------------
  // Enabling layer, same status as §10.5 in Iteration 1: makes a refusal
  // demonstrable by hand, not the full §16 1e MCP surface (three servers,
  // real MCP protocol). No ExecutionRun dispatch exists yet (§16 1f) to
  // issue a grant automatically — POST /grants stands in for that step,
  // the same way POST /tasks/:id/block stands in for an Orchestrator
  // reacting to RunBlocked.

  router.post("/grants", async (ctx) => {
    const { taskId, profileId, runId } = ctx.body as {
      taskId: string;
      profileId: string;
      runId: string;
    };
    const wp = await buildWorkPackage(db, taskId, profileId);
    const grant = await buildGrant(db, wp, runId);
    return { status: 201, body: grant };
  });

  router.post("/mcp/architecture/ancestry", async (ctx) => {
    const { grant, elementId } = ctx.body as { grant: McpGrant; elementId: string };
    return { status: 200, body: await getAncestry(db, grant, elementId) };
  });

  router.post("/mcp/architecture/capabilities", async (ctx) => {
    const { grant, componentId } = ctx.body as { grant: McpGrant; componentId: string };
    return { status: 200, body: await getCapabilitiesOf(db, grant, componentId) };
  });

  return router;
}
