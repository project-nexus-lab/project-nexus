import type {
  AdapterCapabilities,
  AdapterHandle,
  AgentRuntimeAdapter,
  McpGrant,
  OpaqueWorkPackage,
  RunEvent,
} from "../port.js";

/**
 * The second adapter — this file is the actual experiment. Its only
 * imports are from the port (and, transitively, nothing else): no
 * dependency on `architecture`, `work`, `repo`, or `execution`/`workpackage`
 * code. `test/runtime.test.ts` asserts that statically, not just by this
 * file happening to compile.
 *
 * Deliberately emits `RunBlocked` rather than duplicating adapter A's
 * happy path — exercising the one event kind v2 added over v1 (§12.2),
 * and proving two adapters can express genuinely different outcomes
 * through the same six-event vocabulary without the port needing to know
 * anything adapter-specific.
 */
export class NoopAdapterB implements AgentRuntimeAdapter {
  readonly id = "adapter-noop-b";

  capabilities(): AdapterCapabilities {
    return { supportedRoles: ["role.implementer"], streaming: false, tools: [] };
  }

  async start(runId: string, _workPackage: OpaqueWorkPackage, _grant: McpGrant): Promise<AdapterHandle> {
    return { runId };
  }

  async *events(_handle: AdapterHandle): AsyncIterable<RunEvent> {
    yield { kind: "RunStarted" };
    yield { kind: "RunBlocked", reason: "architecture-change-required" };
  }

  async cancel(_handle: AdapterHandle): Promise<void> {}
}
