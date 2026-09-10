import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPrompt, classifyResultMessage, mapMessage, parseBlockedSignal } from "../src/runtime/adapters/claude-sdk.js";
import type { RunEvent } from "../src/runtime/port.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Hermetic, offline tests of `ClaudeSdkAdapter`'s pure-function pieces:
 * prompt construction, SDK-message-to-RunEvent mapping, and (Iteration 9)
 * terminal-result classification. No network, no real `claude` CLI
 * invocation — that's `src/cli/verify-claude-adapter.ts`'s job (not part
 * of `npm test`; see `docs/history/iteration-6/REPORT.md`).
 *
 * Fixtures are cast through `as unknown as SDKMessage` rather than built
 * as fully conformant `BetaMessage` objects — this project is testing its
 * own switch logic against the message shapes it actually observed from
 * a real run (see the Report's probe transcripts), not re-asserting
 * Anthropic's own SDK type contract, which isn't this project's to test.
 */

function assistantMessage(content: Array<{ type: string; name?: string }>): SDKMessage {
  return {
    type: "assistant",
    message: { content },
  } as unknown as SDKMessage;
}

function resultMessage(fields: Record<string, unknown>): SDKMessage {
  return { type: "result", ...fields } as unknown as SDKMessage;
}

/** `classifyResultMessage` narrows to only `result`-typed messages; this casts the shared fixture builder to match. */
function asResultMessage(fields: Record<string, unknown>): Extract<SDKMessage, { type: "result" }> {
  return resultMessage(fields) as Extract<SDKMessage, { type: "result" }>;
}

function toolResults(...isErrorFlags: boolean[]): Array<{ isError: boolean }> {
  return isErrorFlags.map((isError) => ({ isError }));
}

test("buildPrompt names the task and lists affected capabilities and components", () => {
  const prompt = buildPrompt({
    task: "task.iter6-example",
    capabilities: ["cap.iter6-example"],
    components: ["comp.iter6-example"],
  });
  assert.match(prompt, /task\.iter6-example/);
  assert.match(prompt, /cap\.iter6-example/);
  assert.match(prompt, /comp\.iter6-example/);
  assert.match(prompt, /getAncestry/);
  assert.match(prompt, /getCapabilitiesOf/);
});

test("buildPrompt includes acceptanceCriteria verbatim when present — the only real channel for run-specific instructions, since start()'s only inputs are runId/workPackage/grant", () => {
  const prompt = buildPrompt({
    task: "task.iter6-example",
    acceptanceCriteria: ["Call getAncestry with elementId exactly \"comp.iter6-example\"."],
  });
  assert.match(prompt, /Call getAncestry with elementId exactly "comp\.iter6-example"\./);
});

test("buildPrompt falls back to generic guidance when acceptanceCriteria is absent, rather than silently omitting instructions", () => {
  const prompt = buildPrompt({ task: "task.iter6-example" });
  assert.match(prompt, /judge appropriate/);
});

test("buildPrompt degrades gracefully when the opaque payload is missing expected fields", () => {
  const prompt = buildPrompt({});
  assert.match(prompt, /\(unknown task\)/);
  assert.match(prompt, /\(none\)/);
});

test("buildPrompt always includes the BLOCKED: convention (Iteration 8) — a standing protocol instruction, present with or without acceptanceCriteria", () => {
  assert.match(buildPrompt({ task: "task.iter8-example" }), /BLOCKED: context-insufficient/);
  assert.match(
    buildPrompt({ task: "task.iter8-example", acceptanceCriteria: ["do the thing"] }),
    /BLOCKED: context-insufficient/,
  );
});

test("mapMessage: an assistant message calling a Nexus MCP tool maps to ContextRequested", () => {
  const event = mapMessage(
    assistantMessage([{ type: "tool_use", name: "mcp__nexus__getAncestry" }]),
  );
  assert.deepEqual(event, { kind: "ContextRequested" });
});

test("mapMessage: an assistant message with no tool call maps to nothing (absorbed, not a RunEvent)", () => {
  const event = mapMessage(assistantMessage([{ type: "text" }]));
  assert.equal(event, null);
});

test("mapMessage: a non-Nexus tool call does not map to ContextRequested", () => {
  const event = mapMessage(assistantMessage([{ type: "tool_use", name: "Bash" }]));
  assert.equal(event, null);
});

test("classifyResultMessage: a successful, non-error result with no refusals and no BLOCKED: text maps to RunCompleted", () => {
  const event = classifyResultMessage(asResultMessage({ subtype: "success", is_error: false, result: "done" }), toolResults());
  assert.deepEqual(event, { kind: "RunCompleted" });
});

test("classifyResultMessage: a real toolResults refusal maps to RunBlocked even with no BLOCKED: text at all (Iteration 9 — the actual behavior change)", () => {
  const event = classifyResultMessage(
    asResultMessage({ subtype: "success", is_error: false, result: "A completely normal-sounding final answer, no mention of being blocked." }),
    toolResults(false, true, false),
  );
  assert.deepEqual(event, { kind: "RunBlocked", reason: "context-insufficient" });
});

test("classifyResultMessage: a real toolResults refusal is authoritative even when the agent's own text explicitly claims otherwise (backend wins, per R-1's extension)", () => {
  const event = classifyResultMessage(
    asResultMessage({ subtype: "success", is_error: false, result: "Everything succeeded, no issues, definitely not blocked." }),
    toolResults(true),
  );
  assert.deepEqual(event, { kind: "RunBlocked", reason: "context-insufficient" });
});

test("classifyResultMessage: no toolResults refusal, but the BLOCKED: convention matches — the Iteration 8 fallback still works", () => {
  const text = "Some findings.\n\nBLOCKED: context-insufficient — needed to see comp.two-hops-away but was refused.";
  const event = classifyResultMessage(asResultMessage({ subtype: "success", is_error: false, result: text }), toolResults(false, false));
  assert.deepEqual(event, { kind: "RunBlocked", reason: "context-insufficient" });
});

test("classifyResultMessage: no toolResults refusal and no BLOCKED: text maps to RunCompleted, even with unrelated in-grant tool activity", () => {
  const event = classifyResultMessage(
    asResultMessage({ subtype: "success", is_error: false, result: "All checks passed." }),
    toolResults(false, false, false),
  );
  assert.deepEqual(event, { kind: "RunCompleted" });
});

test("parseBlockedSignal: matches the exact convention and captures the note", () => {
  const parsed = parseBlockedSignal("Report.\nBLOCKED: context-insufficient — could not access the dependency.");
  assert.deepEqual(parsed, { note: "could not access the dependency." });
});

test("parseBlockedSignal: an ordinary mention of the word blocked does not match — the convention is an exact line, not a loose keyword search", () => {
  assert.equal(parseBlockedSignal("Nothing here is blocked, everything worked fine."), null);
  assert.equal(parseBlockedSignal("blocked: context-insufficient — wrong case, must not match"), null);
});

test("parseBlockedSignal: returns null for text with no signal at all", () => {
  assert.equal(parseBlockedSignal("A normal, complete answer with no issues."), null);
});

test("classifyResultMessage: is_error true maps to RunFailed carrying the result text, regardless of toolResults", () => {
  const event = classifyResultMessage(asResultMessage({ subtype: "success", is_error: true, result: "the API call failed" }), toolResults(true));
  assert.deepEqual(event, { kind: "RunFailed", message: "the API call failed" });
});

test("classifyResultMessage: an error-subtype result maps to RunFailed carrying the joined errors", () => {
  const event = classifyResultMessage(
    asResultMessage({ subtype: "error_max_turns", is_error: true, errors: ["exceeded max turns"] }),
    toolResults(),
  );
  assert.deepEqual(event, { kind: "RunFailed", message: "exceeded max turns" });
});

test("mapMessage: no longer handles result messages at all (Iteration 9) — events() intercepts them before they would reach here", () => {
  assert.equal(mapMessage(resultMessage({ subtype: "success", is_error: false, result: "done" })), null);
});

test("mapMessage: every other SDK message kind (system, user, rate_limit_event, ...) is absorbed, not forced into a RunEvent", () => {
  assert.equal(mapMessage({ type: "system", subtype: "init" } as unknown as SDKMessage), null);
  assert.equal(mapMessage({ type: "user" } as unknown as SDKMessage), null);
  assert.equal(mapMessage({ type: "rate_limit_event" } as unknown as SDKMessage), null);
});

test("RunBlocked with reason architecture-change-required or mapping-missing remains a shape RunEvent accepts, but neither classifyResultMessage nor mapMessage has any path that ever produces either (SCOPE.md §2 for both Iterations 8 and 9 — neither is discoverable with today's two MCP tools) — a structural check only", () => {
  const architectureChange: RunEvent = { kind: "RunBlocked", reason: "architecture-change-required" };
  const mappingMissing: RunEvent = { kind: "RunBlocked", reason: "mapping-missing" };
  assert.equal(architectureChange.kind, "RunBlocked");
  assert.equal(mappingMissing.kind, "RunBlocked");
  // context-insufficient is the one reason this codebase can actually
  // produce, and as of Iteration 9 it is produced by classifyResultMessage
  // reading real toolResults, not by mapMessage — see the dedicated tests
  // above, which exercise it for real rather than merely checking the
  // type accepts it.
});
