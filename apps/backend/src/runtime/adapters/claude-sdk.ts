import { createSdkMcpServer, query, tool, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { SqlExecutor } from "../../db/sql-executor.js";
import {
  deriveGrantContextFacts,
  deriveWorkPackageContextFacts,
  recordRunTelemetry,
} from "../../execution/telemetry.js";
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
 *
 * Since Iteration 6 closed: `events()` also records one
 * `execution.run_telemetry` row per run (`src/execution/telemetry.ts`) —
 * a focused enhancement, not part of Iteration 6 itself. See
 * `apps/backend/README.md`, "Execution telemetry."
 *
 * Since Iteration 8 closed: `RunBlocked` (reason `context-insufficient`)
 * is now classified from `toolResults` directly — a real `GrantRefusedError`
 * observed during the run — rather than from parsing the agent's final
 * text (Iteration 9, `docs/history/iteration-9/SCOPE.md`; see
 * `docs/MVP_ARCHITECTURE_V2.md` R-1's extension to workflow-state
 * classification). The `BLOCKED:` convention Iteration 8 built is kept,
 * not deleted — it remains the fallback for a run where the backend has
 * no deterministic signal to classify from.
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
  /**
   * The matching real MCP tool results, keyed the same way the SDK keys
   * them (`tool_use_id`) — lets a verification script check a *specific*
   * call's outcome directly, rather than trusting the agent's own prose
   * summary of it. This is what `events()` now reads directly (Iteration
   * 9) to classify `RunBlocked`, instead of parsing the agent's final
   * text for it — `isError` alone is sufficient and unambiguous for that:
   * `GrantRefusedError` is the only thing that ever produces `isError:
   * true` here (`buildMcpServer`'s tool handlers re-throw anything else,
   * crashing the run), so there is exactly one real cause to distinguish,
   * not several. `docs/history/iteration-9/SCOPE.md` described also
   * threading `GrantRefusedError`'s own typed `reason` field
   * (`"expired" | "out-of-grant"`) through this record; implementing it
   * found that unnecessary — both reasons already map to the same
   * `RunBlockedReason` (`context-insufficient`), and the SDK's `tool()`
   * handler signature (`extra: unknown`) has no reliable way to correlate
   * a handler invocation back to its own `tool_use_id` without relying on
   * an untyped value — a disclosed simplification from the scope, not a
   * silent one; see `docs/history/iteration-9/REPORT.md`.
   */
  toolResults: Array<{ toolUseId: string; isError: boolean; text: string }>;
  /**
   * Telemetry inputs gathered at `start()` time, carried through to the
   * single `recordRunTelemetry` call in `events()`'s `finally` block (see
   * `src/execution/telemetry.ts`). Not part of the port; adapter-internal
   * bookkeeping for a focused enhancement, same disclosed-exception shape
   * as everything else on this handle.
   */
  telemetryStartedAt: Date;
  telemetryWorkPackageId: string;
  telemetryContext: ReturnType<typeof deriveWorkPackageContextFacts>;
  telemetryGrant: ReturnType<typeof deriveGrantContextFacts>;
  telemetryUsage?: { input_tokens: number; output_tokens: number };
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
    const handle: ClaudeSdkAdapterHandle = {
      runId,
      query: q,
      toolCalls: [],
      toolResults: [],
      telemetryStartedAt: new Date(),
      telemetryWorkPackageId: grant.workPackageId,
      telemetryContext: deriveWorkPackageContextFacts(workPackage),
      telemetryGrant: deriveGrantContextFacts(grant),
    };
    return handle;
  }

  async *events(handle: AdapterHandle): AsyncIterable<RunEvent> {
    const h = handle as ClaudeSdkAdapterHandle;
    yield { kind: "RunStarted" };

    try {
      for await (const message of h.query) {
        if (message.type === "result") {
          h.telemetryUsage = { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens };
          if (message.subtype === "success" && !message.is_error) {
            h.lastResultText = message.result;
          }
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
        // Iteration 9: the terminal result's classification is decided
        // here, not inside mapMessage() — this is the one place in the
        // loop with the accumulated toolResults record in scope, which a
        // pure, single-message function structurally cannot have. See
        // classifyResultMessage's own doc comment for what changed and why.
        if (message.type === "result") {
          const classified = classifyResultMessage(message, h.toolResults);
          if (classified) yield classified;
          continue;
        }
        const mapped = mapMessage(message);
        if (mapped) yield mapped;
      }
    } finally {
      // Runs on normal completion *and* on an in-process exception, so a
      // run that dies mid-stream still leaves the facts known up to that
      // point (see src/execution/telemetry.ts's own disclosed limit: a
      // hard process kill that skips `finally` entirely is not covered).
      // A telemetry write failure must not be allowed to mask or replace
      // whatever the run itself actually did — logged, not thrown.
      try {
        await this.recordTelemetry(h);
      } catch (err) {
        console.error(`[claude-sdk telemetry] failed to record run ${h.runId}:`, err);
      }
    }
  }

  private async recordTelemetry(h: ClaudeSdkAdapterHandle): Promise<void> {
    const completedAt = new Date();
    const accessedElementIds = new Set(
      h.toolCalls
        .filter((c) => !h.toolResults.find((r) => r.toolUseId === c.id)?.isError)
        .map((c) => (c.input as { elementId?: string; componentId?: string }).elementId
          ?? (c.input as { elementId?: string; componentId?: string }).componentId)
        .filter((id): id is string => typeof id === "string"),
    );
    await recordRunTelemetry(this.db, {
      runId: h.runId,
      workPackageId: h.telemetryWorkPackageId,
      runtimeAdapterId: this.id,
      startedAt: h.telemetryStartedAt,
      completedAt,
      durationMs: completedAt.getTime() - h.telemetryStartedAt.getTime(),
      inputTokens: h.telemetryUsage?.input_tokens ?? null,
      outputTokens: h.telemetryUsage?.output_tokens ?? null,
      totalTokens: h.telemetryUsage ? h.telemetryUsage.input_tokens + h.telemetryUsage.output_tokens : null,
      workPackageSizeBytes: h.telemetryContext.workPackageSizeBytes,
      workPackageSizeTokens: h.telemetryContext.workPackageSizeTokens,
      capabilityCount: h.telemetryContext.capabilityCount,
      componentCount: h.telemetryContext.componentCount,
      repositoryCount: h.telemetryContext.repositoryCount,
      grantElementCount: h.telemetryGrant.grantElementCount,
      grantRepositoryCount: h.telemetryGrant.grantRepositoryCount,
      accessedElementCount: accessedElementIds.size,
      // No repository-scoped MCP tool exists yet (only getAncestry and
      // getCapabilitiesOf, both element-scoped) — see telemetry.ts.
      accessedRepositoryCount: null,
    });
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
    // A standing protocol instruction (Iteration 8,
    // docs/history/iteration-8/SCOPE.md), not a per-task acceptance
    // criterion — this is how role.implementer should always behave when
    // genuinely blocked, the same way a real system prompt built from
    // runtime.adapter_registration.config (§12.7) would carry it, not
    // something scenario-specific.
    'If a tool call is refused because its target is outside this run\'s grant, and you judge that information genuinely necessary to complete this task correctly, do not guess or work around it. End your entire response with exactly one line, verbatim: BLOCKED: context-insufficient — <one sentence explaining what you needed and could not access>. Do not include this line unless you were actually refused and genuinely could not proceed without the refused information.',
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
 * Iteration 8 (`docs/history/iteration-8/SCOPE.md`): the standing
 * `BLOCKED:` convention `buildPrompt()` now always includes. Deliberately
 * a plain, exact-match line, not free-form parsing of "does this text
 * sound like a refusal" — a looser match would risk classifying an
 * ordinary mention of the word "blocked" as a real signal.
 *
 * Since Iteration 9: no longer the primary path for `context-insufficient`
 * — `classifyResultMessage` below checks real `toolResults` first. This
 * remains the *only* path for `architecture-change-required` and
 * `mapping-missing` (still not discoverable with the two MCP tools this
 * project has, per `docs/history/iteration-9/SCOPE.md` §"Explicit
 * Deferrals"), and the fallback for `context-insufficient` on a run where
 * no `toolResults` entry happens to be `isError: true` but the agent
 * still judges itself blocked for some other reason.
 */
const BLOCKED_LINE = /^BLOCKED: context-insufficient — (.+)$/m;

export function parseBlockedSignal(text: string): { note: string } | null {
  const match = BLOCKED_LINE.exec(text);
  return match && match[1] ? { note: match[1].trim() } : null;
}

/**
 * Iteration 9 (`docs/history/iteration-9/SCOPE.md`): classifies the
 * terminal SDK `result` message into a `RunEvent`, given the run's real,
 * accumulated `toolResults` — the actual answer to the architecture
 * review's question, "should `context-insufficient` be classified from
 * backend observations rather than agent-authored text?"
 *
 * A real `GrantRefusedError` observed anywhere during the run
 * (`toolResults.some(r => r.isError)`) is authoritative: it produces
 * `RunBlocked` unconditionally, before the `BLOCKED:` text convention is
 * even consulted. `GrantRefusedError` is the only thing that ever
 * produces `isError: true` here today, so this check needs no further
 * disambiguation. Per `docs/MVP_ARCHITECTURE_V2.md` R-1's extension to
 * workflow-state classification: when a deterministic classifier exists,
 * it wins over an agent-reported signal, not the other way around.
 *
 * Whether "any refusal ⇒ blocked" over-triggers for a refusal the agent
 * successfully worked around is exactly what this iteration's live
 * scenarios test — not assumed correct by this function's own existence.
 * See `docs/history/iteration-9/REPORT.md`.
 */
export function classifyResultMessage(
  message: Extract<SDKMessage, { type: "result" }>,
  toolResults: ReadonlyArray<{ isError: boolean }>,
): RunEvent {
  if (message.subtype === "success" && !message.is_error) {
    if (toolResults.some((r) => r.isError)) {
      return { kind: "RunBlocked", reason: "context-insufficient" };
    }
    const blocked = parseBlockedSignal(message.result);
    if (blocked) return { kind: "RunBlocked", reason: "context-insufficient" };
    return { kind: "RunCompleted" };
  }
  const detail = message.subtype === "success" ? message.result : message.errors.join("; ") || message.subtype;
  return { kind: "RunFailed", message: detail };
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
 *
 * Since Iteration 9: no longer handles `result` messages at all — that
 * classification moved to `classifyResultMessage`, called directly from
 * `events()`, because it needs the run's accumulated `toolResults`, which
 * this function — deliberately pure and single-message — structurally
 * cannot see. `events()` intercepts every `result` message before it
 * would reach here.
 */
export function mapMessage(message: SDKMessage): RunEvent | null {
  if (message.type === "assistant") {
    const calledNexusTool = message.message.content.some(
      (block) => block.type === "tool_use" && block.name.startsWith("mcp__nexus__"),
    );
    return calledNexusTool ? { kind: "ContextRequested" } : null;
  }

  return null;
}
