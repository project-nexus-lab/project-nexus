import { createSdkMcpServer, query, tool, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { SqlExecutor } from "../../db/sql-executor.js";
import { GrantRefusedError } from "../../mcp/grant.js";
import { getAncestry, getCapabilitiesOf } from "../../mcp/tools.js";
import type {
  AdapterCapabilities,
  AdapterHandle,
  AgentRuntimeAdapter,
  McpGrant,
  OpaqueWorkPackage,
  RunEvent,
} from "../port.js";

/**
 * The real adapter — Iteration 6 (`docs/history/iteration-6/SCOPE.md`).
 * Everything the two no-op adapters (Iteration 2) never had to do: a real
 * system prompt built from the Work Package, a real in-process MCP server
 * exposing this project's own grant-checked tool wrappers
 * (`src/mcp/tools.ts`, unchanged) to a real agent, and a real translation
 * from `@anthropic-ai/claude-agent-sdk`'s actual streaming output into the
 * six `RunEvent` kinds — not a hardcoded sequence.
 *
 * Two things checked directly in this environment before writing any of
 * this, not assumed from `docs/history/iteration-6/SCOPE.md`'s own
 * reasoning: `query()`'s default process spawn authenticates using
 * whatever this environment's `claude` CLI already has (no
 * `ANTHROPIC_API_KEY` needed, none is set here), and `createSdkMcpServer`
 * / `tool()` genuinely drive real, non-simulated MCP tool calls headlessly
 * — including an `isError` tool result surfacing to the model as a normal,
 * recoverable failure rather than crashing the run. See
 * `docs/history/iteration-6/REPORT.md` for the probe transcripts that
 * confirmed both before this file was written.
 *
 * Needs a `SqlExecutor` at construction — the first thing either no-op
 * adapter never needed, since neither called real domain code. That is
 * itself evidence toward §1 of the scope document, not an implementation
 * detail to gloss over.
 */

/**
 * `lastResultText` is not part of `AdapterHandle` (§12.2) — the port
 * carries no such field, and no other adapter has one. It exists only so
 * `src/cli/verify-claude-adapter.ts` can assert precisely on what the real
 * agent concluded (e.g. that a specific ancestor id it fetched via a real,
 * grant-checked tool call actually appears in its final answer), since the
 * six-event `RunEvent` vocabulary itself carries no payload on
 * `RunCompleted` to check that against — a real, disclosed limitation of
 * the port's own vocabulary for verification purposes, not worked around
 * silently. `events()` sets it as a side effect while iterating; nothing
 * in `AgentRuntimeAdapter`'s interface exposes or requires it.
 */
export interface ClaudeSdkAdapterHandle extends AdapterHandle {
  readonly query: Query;
  lastResultText?: string;
  /**
   * Same disclosed exception as `lastResultText`: not part of the port,
   * populated only so a verification script can check *exactly* which
   * tool calls, with which arguments, a real run made — at the protocol
   * level, rather than trusting the agent's own prose summary of what it
   * did. Not because the agent's prose has been found to misdescribe its
   * own real actions (it has not, in this project's own runs — see
   * `docs/history/iteration-6/LESSONS.md`, "Biggest Surprise," for a case
   * where the *harness* was wrong and the agent's report of what it
   * actually did was accurate both times); this exists because asserting
   * on ground truth is simply stronger evidence than asserting on a
   * summary, independent of how trustworthy that summary happens to be.
   */
  toolCalls: Array<{ id: string; name: string; input: unknown }>;
  /** The matching real MCP tool results, keyed the same way the SDK keys them (`tool_use_id`) — lets a verification script check a *specific* call's outcome directly, rather than trusting the agent's own prose summary of it. */
  toolResults: Array<{ toolUseId: string; isError: boolean; text: string }>;
}

export class ClaudeSdkAdapter implements AgentRuntimeAdapter {
  readonly id = "claude-sdk";

  constructor(private readonly db: SqlExecutor) {}

  capabilities(): AdapterCapabilities {
    return { supportedRoles: ["role.implementer"], streaming: true, tools: ["getAncestry", "getCapabilitiesOf"] };
  }

  async start(runId: string, workPackage: OpaqueWorkPackage, grant: McpGrant): Promise<ClaudeSdkAdapterHandle> {
    const server = this.buildMcpServer(grant);
    const q = query({
      prompt: buildPrompt(workPackage),
      options: {
        mcpServers: { nexus: server },
        // No built-in tools at all — the agent's only capability this run
        // is whatever the grant-checked MCP server above exposes. This is
        // §12.7's "MCP grant → MCP server configuration and tool
        // allowlist" applied literally, not simulated with a mock.
        tools: [],
        allowedTools: ["mcp__nexus__getAncestry", "mcp__nexus__getCapabilitiesOf"],
        maxTurns: 8,
      },
    });
    const handle: ClaudeSdkAdapterHandle = { runId, query: q, toolCalls: [], toolResults: [] };
    return handle;
  }

  async *events(handle: AdapterHandle): AsyncIterable<RunEvent> {
    const h = handle as ClaudeSdkAdapterHandle;
    yield { kind: "RunStarted" };

    for await (const message of h.query) {
      if (message.type === "result" && message.subtype === "success" && !message.is_error) {
        h.lastResultText = message.result;
      }
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "tool_use") h.toolCalls.push({ id: block.id, name: block.name, input: block.input });
        }
      }
      if (message.type === "user" && Array.isArray(message.message?.content)) {
        for (const block of message.message.content) {
          if (block.type === "tool_result") {
            h.toolResults.push({
              toolUseId: block.tool_use_id,
              isError: block.is_error === true,
              text: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
            });
          }
        }
      }
      const mapped = mapMessage(message);
      if (mapped) yield mapped;
    }
  }

  async cancel(handle: AdapterHandle): Promise<void> {
    await (handle as ClaudeSdkAdapterHandle).query.interrupt();
  }

  /**
   * The grant is baked into the server's tool handlers via closure, not
   * passed to the model or the SDK at all — the agent never sees
   * `allowedElementIds`, only the pass/refuse outcome of a call it makes.
   * Both tool wrappers are `src/mcp/tools.ts`'s existing, already-tested
   * functions — this adapter adds no new grant-enforcement logic of its
   * own, only a real transport in front of what already existed.
   */
  private buildMcpServer(grant: McpGrant) {
    const db = this.db;
    return createSdkMcpServer({
      name: "nexus",
      version: "0.1.0",
      tools: [
        tool(
          "getAncestry",
          "Return the containment ancestry chain (this element up to its root) for a Nexus Architecture element id.",
          { elementId: z.string() },
          async ({ elementId }) => {
            try {
              const rows = await getAncestry(db, grant, elementId);
              return { content: [{ type: "text" as const, text: JSON.stringify(rows) }] };
            } catch (err) {
              if (err instanceof GrantRefusedError) {
                return { content: [{ type: "text" as const, text: err.message }], isError: true };
              }
              throw err;
            }
          },
        ),
        tool(
          "getCapabilitiesOf",
          "Return the capabilities a Nexus Architecture component provides, for a component id.",
          { componentId: z.string() },
          async ({ componentId }) => {
            try {
              const rows = await getCapabilitiesOf(db, grant, componentId);
              return { content: [{ type: "text" as const, text: JSON.stringify(rows) }] };
            } catch (err) {
              if (err instanceof GrantRefusedError) {
                return { content: [{ type: "text" as const, text: err.message }], isError: true };
              }
              throw err;
            }
          },
        ),
      ],
    });
  }
}

/**
 * Deliberately generic reads off the opaque payload (`port.ts`'s own
 * `OpaqueWorkPackage` — "the adapter layer should not need to know the
 * payload's shape"). Only the fields this iteration's minimal prompt
 * actually needs, read defensively rather than by importing
 * `WorkPackagePayload`'s type from `src/workpackage/build.ts`.
 */
export function buildPrompt(workPackage: OpaqueWorkPackage): string {
  const task = typeof workPackage.task === "string" ? workPackage.task : "(unknown task)";
  const capabilities = Array.isArray(workPackage.capabilities) ? workPackage.capabilities : [];
  const components = Array.isArray(workPackage.components) ? workPackage.components : [];
  const acceptanceCriteria = Array.isArray(workPackage.acceptanceCriteria) ? workPackage.acceptanceCriteria : [];
  const lines = [
    `You are acting as role.implementer for Nexus task ${task}.`,
    `This run's Work Package affects capabilities: ${capabilities.join(", ") || "(none)"}.`,
    `It affects components: ${components.join(", ") || "(none)"}.`,
    "You have exactly two tools available: getAncestry and getCapabilitiesOf.",
  ];
  // The real WorkPackagePayload field (`src/workpackage/build.ts`) this
  // run's actual instructions belong in — not a side channel invented for
  // verification. An earlier version of this adapter had no way for a
  // caller-supplied instruction to reach the model at all (`start()`'s
  // only inputs are runId/workPackage/grant); a run driven with generic
  // context and no concrete task produced a real, reproducible instance of
  // the agent inferring its own target ids from context instead of being
  // told them — see docs/history/iteration-6/REPORT.md for the transcript
  // this caught, twice, before this field was wired in.
  if (acceptanceCriteria.length > 0) {
    lines.push("Acceptance criteria for this run:");
    for (const criterion of acceptanceCriteria) lines.push(`- ${criterion}`);
  } else {
    lines.push("Use them as you judge appropriate, then report back concisely.");
  }
  return lines.join("\n");
}

/**
 * The actual, checked answer to part of §1: most of what
 * `@anthropic-ai/claude-agent-sdk` emits (system/init, rate-limit events,
 * the tool_result carried on a `user` message, every intermediate
 * `assistant` message that isn't the final one) has no corresponding
 * `RunEvent` kind at all and is silently absorbed here — not a bug, but
 * the concrete shape of "translation is the adapter's problem" (§12.2)
 * once a real runtime exists to translate. `ContextRequested` is emitted
 * when the agent calls either Nexus MCP tool — a real, observed
 * translation (see the Report's probe transcripts), not a guess at what
 * the event ought to mean.
 */
export function mapMessage(message: SDKMessage): RunEvent | null {
  if (message.type === "assistant") {
    const calledNexusTool = message.message.content.some(
      (block) => block.type === "tool_use" && block.name.startsWith("mcp__nexus__"),
    );
    return calledNexusTool ? { kind: "ContextRequested" } : null;
  }

  if (message.type === "result") {
    if (message.subtype === "success" && !message.is_error) {
      return { kind: "RunCompleted" };
    }
    const detail = message.subtype === "success" ? message.result : message.errors.join("; ") || message.subtype;
    return { kind: "RunFailed", message: detail };
  }

  return null;
}
