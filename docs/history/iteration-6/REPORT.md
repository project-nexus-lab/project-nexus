# Iteration 6 Report — a real Claude SDK Adapter

Status: complete for the scope agreed in `docs/history/iteration-6/SCOPE.md`.
All six acceptance criteria pass. 122 `node:test` cases pass (up from
Iteration 5's 110; all still hermetic, offline, zero network access). One
live, real validation run against a real Claude agent was also executed
and its full output is reproduced in this report, not summarized from
memory — including a real bug this iteration's own harness had, found and
fixed before the run could produce trustworthy evidence.

## Scope completed

1. **`ClaudeSdkAdapter implements AgentRuntimeAdapter`** —
   `src/runtime/adapters/claude-sdk.ts`. Uses `@anthropic-ai/claude-agent-sdk`'s
   `query()`, with all built-in tools disabled (`tools: []`) and only a
   real, in-process MCP server (`createSdkMcpServer`/`tool()`) exposing
   this project's existing grant-checked `getAncestry`/`getCapabilitiesOf`
   wrappers (`src/mcp/tools.ts`, unchanged).
2. **Real event translation** — `mapMessage()` maps the SDK's actual
   streaming output onto the six `RunEvent` kinds: a Nexus MCP tool call
   → `ContextRequested`, a clean result → `RunCompleted`, an error result
   → `RunFailed`. Every other SDK message kind (`system`, `user`/tool
   results, `rate_limit_event`, intermediate `assistant` messages with no
   tool call) is absorbed with no `RunEvent` counterpart — see "What
   survived contact," below, for why this matters.
3. **Real error mapping through the MCP boundary** — a `GrantRefusedError`
   thrown by the existing `assertInGrant` is caught inside the MCP tool
   handler and returned as an `isError: true` MCP tool result, not
   rethrown to crash the run.
4. **Three probe scripts, run and discarded, before writing the adapter**
   — confirmed directly, not assumed: (a) `query()`'s default spawn
   authenticates using this environment's already-authenticated `claude`
   CLI, no `ANTHROPIC_API_KEY` needed; (b, c) `createSdkMcpServer`/`tool()`
   genuinely drive real MCP tool calls headlessly, both a success and an
   `isError` refusal, without hanging on a permission prompt, using
   `allowedTools: ["mcp__<server>__<tool>"]`. See "Three probes before any
   adapter code," below, for the transcripts.
5. **`src/cli/verify-claude-adapter.ts`** — real-run verification, in the
   same family as `verify.ts` (Iteration 0) and `verify-github.ts`
   (Iteration 5), **not part of `npm test`**, for the same reason:
   `npm run verify:claude-adapter`.
6. **Tests** — `test/claude-sdk-adapter.test.ts` (12 cases, hermetic: pure
   unit tests of `buildPrompt` and `mapMessage` against fixture data
   mirroring the shapes actually observed from a real run, no network).

## Three probes before any adapter code

Run once each, then deleted — not committed, since they tested the SDK
itself, not this project's code:

```
$ node probe.mjs   # a trivial query() call, no tools
{"type":"result", ..., "result":"PONG", "total_cost_usd":0.011355}

$ node probe2.mjs  # createSdkMcpServer + tool(), one successful call
TOOL_USE: mcp__nexus__getAncestry {"elementId":"comp.probe-widget"}
FINAL RESULT: "parent_id: prod.probe-root"

$ node probe3.mjs  # same, with an isError:true tool result
TOOL_RESULT: {"type":"tool_result","content":"...","is_error":true,...}
FINAL RESULT: "REFUSED"
```

This confirmed `docs/history/iteration-6/SCOPE.md`'s central credential
and MCP-wiring assumptions *before* any adapter code existed, the same
discipline Iteration 5 applied by running `gh repo create --help` first.

## A real bug this iteration's own verification script had, found and fixed

The first two live runs both showed the agent calling `getCapabilitiesOf`
with the **wrong** component id — the in-grant one, not the deliberately
out-of-grant one the run was supposed to test. The natural first read was
"the agent doesn't reliably follow literal instructions." That read was
wrong, and checking it precisely — instead of accepting a plausible
explanation — found the actual cause: `verify-claude-adapter.ts` built a
`prompt` string with the exact call-by-call instructions, but
`adapter.start()` had already been called *before* that string was
constructed, and `ClaudeSdkAdapter.start()` builds its own prompt
internally from the opaque Work Package via `buildPrompt()` — which had
no field for run-specific instructions at all. The carefully-worded
`prompt` variable was printed to the console and never sent to the model.
Given only generic context ("this run's Work Package affects component
comp.iter6-instrument-panel... use the tools as instructed in the rest of
this prompt" — a dangling reference to instructions that did not exist),
the agent reasonably investigated the one component it had actually been
told about, twice, in two differently-worded but equally disconnected
attempts.

**The fix**: `buildPrompt()` now reads `acceptanceCriteria` — a real field
in `WorkPackagePayload` (`src/workpackage/build.ts`) that already exists
for exactly this purpose — and includes it verbatim in the constructed
prompt. `verify-claude-adapter.ts` was corrected to pass its instructions
through `workPackage.acceptanceCriteria` instead of a local variable that
was never wired to anything. After the fix, the agent called both tools
with the exact ids specified, first try. This is recorded as a real
finding, not smoothed over: `start(runId, workPackage, grant)`'s only
inputs mean a Work Package with no `acceptanceCriteria` gives the real
adapter no reliable way to direct a run beyond the ids the payload itself
already names — worth knowing before a real Orchestrator has to build
Work Packages that actually carry the instructions a role needs.

## The live validation run, in full (after the fix)

```
[PASS] registerAdapter wrote exactly one adapter_registration row, no schema change — {"id":"claude-sdk","enabled":true}
[PASS] listAdaptersForRole('role.implementer') finds claude-sdk with zero changes to registry.ts — ["claude-sdk"]
event: {"kind":"RunStarted"}
event: {"kind":"ContextRequested"}
event: {"kind":"ContextRequested"}
event: {"kind":"RunCompleted"}
[PASS] events() started with RunStarted and ended with RunCompleted, not RunFailed
[PASS] at least one real MCP tool call was translated into ContextRequested
[PASS] the agent actually called getAncestry with the in-grant element id
[PASS] that in-grant call succeeded and its real result names the cockpit subsystem
[PASS] the agent actually called getCapabilitiesOf with the out-of-grant component id
[PASS] that out-of-grant call was refused as a typed grant refusal, not a crash or a silently-allowed answer

=== ALL CHECKS PASSED ===
```

The agent's real final answer (unedited):

> **Call 1 — getAncestry("comp.iter6-instrument-panel"):** Succeeded.
> Immediate parent: **`subsys.iter6-cockpit`** (Cockpit subsystem).
>
> **Call 2 — getCapabilitiesOf("comp.iter6-fuel-gauge"):** Refused. The
> MCP server denied the call for run `run.iter6-verify` with the reason:
> *"element comp.iter6-fuel-gauge is not in this grant"* — i.e., this
> run's grant/scope only covers `comp.iter6-instrument-panel` (and
> related affected elements), and `comp.iter6-fuel-gauge` falls outside
> that authorized scope, so the call was blocked rather than returning
> data.

Every check is against the protocol-level record (`toolCalls`/
`toolResults`, captured directly off the real SDK message stream), not
the agent's own prose summary — the two earlier runs are the concrete
reason this project no longer trusts prose alone as evidence of what a
real agent actually did.

## What survived contact, precisely

- **`AgentRuntimeAdapter` (`src/runtime/port.ts`) required zero changes.**
  Confirmed by `git diff --stat` showing zero lines touched in that file
  this iteration, not by intention.
- **`registerAdapter`/`listAdaptersForRole` (`src/runtime/registry.ts`)
  required zero changes**, also confirmed by an empty diff — the same
  claim Iteration 2 tested for two trivial adapters, now tested for a
  real one.
- **The runtime schema (`db/migrations/`) required zero changes.**
- **A real, grant-checked MCP tool call — both a success and a refusal —
  works through the actual protocol the SDK uses**, not a direct function
  call or an HTTP request written for a test. This is real, if partial,
  progress on Iteration 3's own named Unproven item ("a real adapter can
  actually use a grant to drive genuine MCP protocol calls").
- **A `GrantRefusedError` surfaces to a real agent as a normal, recoverable
  tool failure**, not an unhandled exception — the agent read the refusal
  reason and reported it accurately, rather than the run crashing or the
  agent fabricating an answer.

## What did not survive contact cleanly — the honest exceptions

**1. `ContextRequested` is the only one of the six `RunEvent` kinds this
adapter's real translation actually reaches, in this scope.** Most of
what the SDK emits — `system`/`init`, `rate_limit_event`, every
intermediate `assistant` message with no tool call, the `user`-typed
tool-result messages — has no corresponding `RunEvent` kind and is
silently absorbed by `mapMessage()`. This is not a defect in the six-kind
vocabulary (§12.2 always said "anything a runtime emits that does not map
to these six is the adapter's problem," and that is exactly what this
adapter does), but it is worth recording precisely: a real adapter's
actual translation surface, in this iteration's minimal scope, touches
three of the six kinds (`RunStarted`, `ContextRequested`, `RunCompleted`/
`RunFailed`) and never needed `ArtifactProduced` or `RunBlocked` at all.

**2. `RunBlocked` was validated structurally only, exactly as
`docs/history/iteration-6/SCOPE.md` §4 item 7 scoped it — not elicited
from a live run.** `mapMessage()` has no path that produces one; nothing
in this iteration's design gives a real agent a way to signal
"architecture-change-required" that this adapter would recognize. A unit
test confirms the type system still accepts a `RunBlocked`-shaped event
from wherever `events()` might one day emit one; no live run ever produced
one. This is stated precisely, not implied to be equivalent to
`NoopAdapterB`'s existing runtime coverage.

**3. Registering `ClaudeSdkAdapter` cost more than "one row, one class,"
stated precisely rather than rounded to fit.** It is still exactly one
class in one new file (`registry.ts` and the schema are both untouched,
same as the trivial adapters), but that class needed: a constructor
parameter (`SqlExecutor`) neither no-op adapter needed, since neither
called real domain code; a private MCP-server-construction method; and a
handle carrying four fields (`query`, `lastResultText`, `toolCalls`,
`toolResults`) where the trivial adapters' handles carried one (`runId`).
One new npm dependency (`@anthropic-ai/claude-agent-sdk`) was also added —
something neither no-op adapter needed. "One row, one class" holds at the
level of *files touched outside the adapter itself* (zero); it does not
hold at the level of *what the adapter needs to be*, which is
substantially more than either no-op adapter required.

## Scope deferred

Exactly as `docs/history/iteration-6/SCOPE.md` §7 listed: a real
Orchestrator, `RunBlocked` wired to real proposal-drafting, the full
three-server MCP surface as a standalone reachable process (this
iteration's MCP server is real but in-process, hosted by the SDK
transport, not independently reachable), the other five Architecture MCP
tools and all of Work/Repository MCP, the output path (branch push and PR
via `VcsProvider`), multiple roles, and adapter-selection logic.

## Architectural deviations

None from the design in `SCOPE.md`. The two honest exceptions above were
both anticipated as open questions in `SCOPE.md` §3 and §8 (translation
completeness, and "one class" not being exact), not discovered as
surprises requiring a redesign.

## Technical debt intentionally created

- **`mapMessage()`'s coverage is narrow** — three of six `RunEvent` kinds
  ever produced by this adapter in this scope. Extending it to cover
  `ArtifactProduced` (once a real output path exists) and any future
  `RunBlocked` signal is unscoped future work, not a defect in what exists.
- **`lastResultText`, `toolCalls`, `toolResults` on `ClaudeSdkAdapterHandle`
  are not part of `AgentRuntimeAdapter`** — added only so this iteration's
  own verification script could assert precisely on what a real run did,
  disclosed directly in the file's own comments. A real Orchestrator would
  have no reason to reach into them; they exist for this iteration's
  evidence-gathering, not as a pattern future adapters must follow.
- **`buildPrompt()`'s reliance on `acceptanceCriteria` is minimal** — one
  field, joined as a bullet list. A real role-specific system-prompt
  template (§12.7: "WorkPackage + role → system prompt, from
  `runtime.adapter_registration.config`") is not built here; `config` on
  `runtime.adapter_registration` still holds only `{}` in this iteration's
  registration call.

## Demonstrations and verification

```
npm run typecheck              # clean
npm test                        # 122/122, fully hermetic, zero network access (confirmed 3 consecutive runs after one unrelated flake in workpackage.test.ts, an area this iteration did not touch)
npm run verify:claude-adapter   # requires real gh-authenticated claude CLI + network; output reproduced above
```

## Recommended next-step validation

Per `SCOPE.md` §9 item 2: if a future iteration needs `ArtifactProduced`
or a real `RunBlocked` signal from a live agent, that is where the
six-event vocabulary's actual sufficiency gets tested next — this
iteration deliberately did not need either. Per §9 item 3, the MCP grant
"can still learn X exists" question (Open Question #1) is unaffected by
anything here — the two tool wrappers exercised this iteration return
the same unfiltered results they always have. The clearest next
validation target this iteration's own finding suggests: a real
Orchestrator (§12.4) that actually constructs `acceptanceCriteria` from a
Task's own domain data, since this iteration proved that field is not
optional in practice — a Work Package without it gives a real adapter no
reliable way to direct what the agent does.
