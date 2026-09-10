import type {
  AdapterCapabilities,
  AdapterHandle,
  AgentRuntimeAdapter,
  McpGrant,
  OpaqueWorkPackage,
  RunEvent,
} from "../port.js";

/**
 * The first of two adapters built to test one claim (§12.7): that adding a
 * *second* adapter costs "one row, one class." This one does no real work —
 * it emits a canned, always-succeeds event sequence. Its only purpose is to
 * exist first, so `noop-b.ts` has something to be the "second" one against.
 */
export class NoopAdapterA implements AgentRuntimeAdapter {
  readonly id = "adapter-noop-a";

  capabilities(): AdapterCapabilities {
    return { supportedRoles: ["role.implementer"], streaming: false, tools: [] };
  }

  async start(runId: string, _workPackage: OpaqueWorkPackage, _grant: McpGrant): Promise<AdapterHandle> {
    return { runId };
  }

  async *events(handle: AdapterHandle): AsyncIterable<RunEvent> {
    yield { kind: "RunStarted" };
    yield { kind: "ArtifactProduced", artifactRef: `https://example.invalid/pr/${handle.runId}` };
    yield { kind: "RunCompleted" };
  }

  async cancel(_handle: AdapterHandle): Promise<void> {}
}
