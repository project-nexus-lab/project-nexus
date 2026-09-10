/**
 * The Agent Runtime Adapter port — MVP_ARCHITECTURE_V2 §12.2.
 *
 * Architecturally, this interface is owned by Execution (§12.1: "Execution
 * context ... AgentRuntimeAdapter (port)") — it's what an Orchestrator
 * would call. Concrete adapters implementing it belong to Runtime
 * Integration, the one context permitted to know that a runtime is Claude,
 * OpenAI, or anything else (§2.1). Both live in this one small module for
 * Iteration 2 rather than splitting into a near-empty `src/execution/`
 * just to hold one interface — a deliberate simplification, not an
 * ownership claim; see `docs/history/iteration-2/REPORT.md`.
 *
 * No orchestrator exists yet (§16 1f, still deferred) and nothing here
 * assumes one. This module exists to answer one question:
 * docs/PROJECT_KNOWLEDGE.md's #1 Open Question — does adding a *second*
 * adapter against this port actually cost only "one row, one class" (§12.7),
 * or does the port itself need to grow to accommodate a second
 * implementation? See `src/runtime/adapters/` for the two adapters that
 * test this directly, and `test/runtime.test.ts` for how.
 */

export type AdapterId = string;

/** §9.5's run-scoped grant shape. No enforcement exists yet (Open Question #2,
 * MCP grants) — this is the type contract `start()` needs from the port, not
 * a claim that grants are checked anywhere yet. */
export interface McpGrant {
  runId: string;
  workPackageId: string;
  allowedElementIds: string[];
  allowedRepositoryIds: string[];
  expiresAt: string; // ISO timestamp
}

export interface AdapterCapabilities {
  supportedRoles: string[]; // role.* ids, from runtime.agent_role
  streaming: boolean;
  tools: string[];
}

export interface AdapterHandle {
  readonly runId: string;
}

/**
 * The runtime-neutral event vocabulary (§12.2) — the full six, unchanged
 * since v2 added `RunBlocked`. Nothing a runtime emits that doesn't map to
 * one of these six crosses this boundary; that translation is the
 * adapter's problem, not the port's.
 */
export type RunBlockedReason =
  | "architecture-change-required"
  | "mapping-missing"
  | "context-insufficient";

export type RunEvent =
  | { kind: "RunStarted" }
  | { kind: "ContextRequested" }
  | { kind: "ArtifactProduced"; artifactRef: string }
  | {
      kind: "RunBlocked";
      reason: RunBlockedReason;
      proposalDraft?: { intent: string; operations: unknown[] };
    }
  | { kind: "RunFailed"; message: string }
  | { kind: "RunCompleted" };

/**
 * A minimal, opaque stand-in for a WorkPackage payload — `start()` takes
 * whatever `buildWorkPackage` produced (`src/workpackage/build.ts`), but
 * this port does not depend on that module's types. The adapter layer
 * should not need to know the payload's shape, only pass it through to
 * whatever runtime it wraps.
 */
export type OpaqueWorkPackage = Readonly<Record<string, unknown>>;

export interface AgentRuntimeAdapter {
  readonly id: AdapterId;
  capabilities(): AdapterCapabilities;
  start(runId: string, workPackage: OpaqueWorkPackage, grant: McpGrant): Promise<AdapterHandle>;
  events(handle: AdapterHandle): AsyncIterable<RunEvent>;
  cancel(handle: AdapterHandle): Promise<void>;
}
