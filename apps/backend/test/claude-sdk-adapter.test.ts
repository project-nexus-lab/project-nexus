import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPrompt, mapMessage } from "../src/runtime/adapters/claude-sdk.js";
import type { RunEvent } from "../src/runtime/port.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Hermetic, offline tests of `ClaudeSdkAdapter`'s two pure-function
 * pieces: prompt construction and SDK-message-to-RunEvent mapping. No
 * network, no real `claude` CLI invocation — that's
 * `src/cli/verify-claude-adapter.ts`'s job (not part of `npm test`; see
 * `docs/history/iteration-6/REPORT.md`).
 *
 * `mapMessage`'s fixtures are cast through `as unknown as SDKMessage`
 * rather than built as fully conformant `BetaMessage` objects — this
 * project is testing its own switch logic against the message shapes it
 * actually observed from a real run (see the Report's probe transcripts),
 * not re-asserting Anthropic's own SDK type contract, which isn't this
 * project's to test.
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

test("mapMessage: a successful, non-error result maps to RunCompleted", () => {
  const event = mapMessage(resultMessage({ subtype: "success", is_error: false, result: "done" }));
  assert.deepEqual(event, { kind: "RunCompleted" });
});

test("mapMessage: a result with is_error true maps to RunFailed carrying the result text", () => {
  const event = mapMessage(resultMessage({ subtype: "success", is_error: true, result: "the API call failed" }));
  assert.deepEqual(event, { kind: "RunFailed", message: "the API call failed" });
});

test("mapMessage: an error-subtype result maps to RunFailed carrying the joined errors", () => {
  const event = mapMessage(
    resultMessage({ subtype: "error_max_turns", is_error: true, errors: ["exceeded max turns"] }),
  );
  assert.deepEqual(event, { kind: "RunFailed", message: "exceeded max turns" });
});

test("mapMessage: every other SDK message kind (system, user, rate_limit_event, ...) is absorbed, not forced into a RunEvent", () => {
  assert.equal(mapMessage({ type: "system", subtype: "init" } as unknown as SDKMessage), null);
  assert.equal(mapMessage({ type: "user" } as unknown as SDKMessage), null);
  assert.equal(mapMessage({ type: "rate_limit_event" } as unknown as SDKMessage), null);
});

test("RunBlocked remains a shape events()'s declared return type (RunEvent) accepts — a structural check only, not a claim mapMessage ever produces one from a real run (docs/history/iteration-6/SCOPE.md §4 item 7)", () => {
  const blocked: RunEvent = { kind: "RunBlocked", reason: "architecture-change-required" };
  assert.equal(blocked.kind, "RunBlocked");
});
