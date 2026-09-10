# Iteration 6 Lessons

Not a status report (`docs/history/iteration-6/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 6 asked the last of three "does a no-op-validated abstraction
survive contact with a real implementation" questions
(`docs/PROJECT_KNOWLEDGE.md`, Open Question #5) and got a clean answer for
the specific claim under test: yes, the `AgentRuntimeAdapter` port and
`runtime.adapter_registration`/`adapter_role_support` both survive contact
with a real agent runtime, unmodified — a real Claude agent was driven
through a real in-process MCP server exposing this project's own
grant-checked tools, and both a success and a refusal were exercised
through the actual protocol the SDK uses, not simulated. This closes
Open Question #2 (open since Iteration 2) for the scope this iteration
actually covered, while leaving a real, narrower question open about
whether the six-event vocabulary is sufficient once a real adapter needs
`ArtifactProduced` or `RunBlocked`, which this iteration's minimal scope
never needed.

It also produced the sharpest instance yet of this project's own "check
before trusting" discipline catching a mistake in its *own* verification
harness, not just in an assumption about an external system. The first
two live runs looked like evidence that a real agent does not reliably
follow instructions — a plausible, almost-accepted conclusion that turned
out to be entirely wrong: the instructions were never sent to the model at
all, because of a real bug in how the verification script wired the
Work Package to the adapter. Catching this changes what this iteration is
evidence *for* — not "real agents are unreliable," but "a Work Package
with no `acceptanceCriteria` gives a real adapter nothing reliable to act
on," a materially different and more useful finding.

---

## Validated

### Assumption

The `AgentRuntimeAdapter` port's four methods (`capabilities()`,
`start()`, `events()`, `cancel()`) and the six-event `RunEvent` vocabulary,
validated in Iteration 2 against two deliberately trivial adapters,
require no changes to accommodate a real adapter with genuine behavioral
complexity — real streaming translation, real tool-call routing through a
real MCP protocol exchange, real vendor-specific configuration.

### Status

VALIDATED

### Evidence

`ClaudeSdkAdapter implements AgentRuntimeAdapter` with the exact interface
Iteration 2 shipped. `src/runtime/port.ts` was not edited at all this
iteration — checked directly (`git diff --stat` shows zero lines changed
in that file), not claimed from intention. A real run completed end to
end: `start()` constructed a real in-process MCP server and issued a real
`query()` call; `events()` translated the SDK's actual streaming output,
not a hardcoded sequence, into `RunStarted → ContextRequested →
ContextRequested → RunCompleted`; `cancel()`'s implementation
(`query.interrupt()`) type-checks against the real SDK's own cancellation
mechanism, though this iteration's short run never needed to call it.

### Consequence

This is the third and last of the three "real X" instances this project
has tracked since Iteration 2 (`AgentRuntimeAdapter`, MCP grant
enforcement, `VcsProvider`), and the one most directly tied to the
Constitution's agent-independence principle. All three have now resolved
favorably for the scope each iteration actually tested — see Open
Questions, below, for what "favorably" does and does not mean precisely
for this one.

---

### Assumption

A grant-checked MCP tool, exposed through a real, in-process MCP server
(`createSdkMcpServer`/`tool()`), is genuinely enforced against a real
agent making a real protocol call — not only against a direct function
call or an HTTP request written for a test, which is all Iteration 3 ever
exercised.

### Status

VALIDATED

### Evidence

Two probe scripts (run once each, not committed) confirmed the mechanism
in isolation before any adapter code existed: a real MCP tool call headless,
and a real `isError: true` tool result surfacing without crashing the
process. The live verification run then exercised both directions against
this project's own real `assertInGrant`/`GrantRefusedError`
(`src/mcp/grant.ts`, unchanged): `getAncestry` on an in-grant element
succeeded, and the real ancestry data it returned was checked directly
against the protocol-level tool result (not the agent's prose); a separate
call to `getCapabilitiesOf` on a deliberately out-of-grant element was
refused, checked the same way — `isError: true`, the real
`GrantRefusedError` message text, both captured off the SDK's own message
stream via `toolResults`, not inferred from what the agent said happened.

### Consequence

Real, if partial, progress on Iteration 3's own named Unproven item ("a
real adapter can actually use a grant to drive genuine MCP protocol
calls") — partial because this iteration's MCP server is real but
in-process, not the standalone, externally-reachable server §9.2–9.4
describe. See Unproven, below, for the precise boundary.

---

### Assumption

`docs/history/iteration-6/SCOPE.md`'s own credential-reuse claim — that
`@anthropic-ai/claude-agent-sdk`'s `query()` authenticates using this
environment's already-authenticated `claude` CLI, with no
`ANTHROPIC_API_KEY` needed — checked directly, not assumed from the SDK's
own documentation.

### Status

VALIDATED

### Evidence

`env | grep -i anthropic` found no `ANTHROPIC_*` variable set in this
environment before any adapter code was written. A minimal probe script
(`query({prompt: "...PONG"})`) completed successfully on the first try,
returning real output at a real, small cost (`total_cost_usd: 0.011355`
for one trivial call) — confirmed by running it, not by reading the SDK's
own type definitions and trusting the doc comment ("Uses the built-in
executable if not specified" turned out to describe a *bundled*
executable, not necessarily the same one `claude --version` reports —
which one actually ran was never disambiguated, but it does not matter:
whichever it was, it authenticated without new credentials).

### Consequence

The same "reuse what the development environment already has" pattern
Iteration 5 used for `gh` generalizes to a second, structurally different
kind of external dependency (a process-spawning SDK, not a CLI wrapped
directly) — worth naming as a pattern now confirmed twice, not
re-litigating each time a new real integration is scoped.

---

## Invalidated

### Assumption

A real agent, given clear, literal, mechanical instructions in a prompt
(down to "do not substitute different ids, do not reason about which call
would make more sense"), will follow them — implicitly assumed while
writing the first version of `verify-claude-adapter.ts`, never stated as
a hypothesis because it seemed too obvious to name.

### Status

INVALIDATED — but not for the reason it first appeared to be

### Evidence

The first two live runs both showed the agent calling `getCapabilitiesOf`
with the wrong component id. Checking precisely (per this project's own
Consistency Auditor discipline) rather than accepting "LLMs are
unreliable" as sufficient explanation found the real cause:
`ClaudeSdkAdapter.start(runId, workPackage, grant)`'s only inputs are
those three parameters; `buildPrompt()` builds the entire prompt from
`workPackage` alone. The verification script's own `prompt` variable,
containing the specific instructions, was constructed *after*
`adapter.start()` was already called, and was only ever passed to
`console.log` — never to the adapter. The agent was actually given only
generic context and a dangling reference to "instructions" that were not
present, and it inferred a reasonable target from the Work Package's own
declared `components` field, twice, consistently.

### Resolution

`buildPrompt()` now reads and includes `workPackage.acceptanceCriteria` —
a real field already defined in `WorkPackagePayload`
(`src/workpackage/build.ts`) — verbatim in the constructed prompt.
`verify-claude-adapter.ts` now passes its instructions through that field
instead of an unused local variable. After the fix, the agent called both
tools with the exact specified ids, first attempt, both live runs since.

### Consequence

The real, corrected finding is more useful than the one it replaced: this
project cannot yet claim "a real agent reliably follows a Work Package's
instructions" as a general fact, because this iteration never actually
tested that — it tested, by accident, "a real agent given no specific
instructions behaves reasonably given what context it does have," which
is a different and also true finding, then separately confirmed "a real
agent given specific instructions through the one real channel available
(`acceptanceCriteria`) follows them." Worth carrying forward: a Work
Package's `acceptanceCriteria` field is not decorative — a real adapter
has no other way to direct a run's specifics, and an Orchestrator that
does not populate it meaningfully will produce runs the agent has to
improvise through.

---

## Unproven

### Assumption

The six-event `RunEvent` vocabulary (§12.2) is sufficient for a real
adapter's full translation surface, not only the three kinds
(`RunStarted`, `ContextRequested`, `RunCompleted`/`RunFailed`) this
iteration's minimal scope ever exercised.

### Why It Remains Unproven

`ArtifactProduced` was never emitted — nothing in this iteration's scope
produces a real artifact (the output path stays deferred, per
`SCOPE.md` §7). `RunBlocked` was validated structurally only (a unit test
confirms the type is still accepted by `events()`'s return type), never
elicited from a live run — `mapMessage()` has no path that produces one,
and this iteration's design gives a real agent no mechanism to signal
"architecture-change-required" that the adapter would recognize.
Most of what the real SDK actually emits (`system`/`init`,
`rate_limit_event`, intermediate `assistant` messages, `user`-typed tool
results) has no `RunEvent` counterpart at all and is silently absorbed —
correct per §12.2's own framing ("anything a runtime emits that does not
map to these six is the adapter's problem"), but never stress-tested
against a scope that actually needs a seventh kind of information to
cross the boundary.

### How To Validate

Build a scope that actually needs `ArtifactProduced` (real output,
requiring the deferred push/PR path) or a real `RunBlocked` signal (would
need a real agent to have some way to request architecture-change — e.g.
a third MCP tool this iteration deliberately did not build) and see
whether the six kinds still suffice, or whether translating a real
scenario into them starts losing information the way `mapMessage()`
already silently discards several real SDK message kinds today.

---

### Assumption

This iteration's in-process MCP server (`createSdkMcpServer`, hosted by
the SDK's own transport within the same process) is equivalent evidence to
a standalone, externally-reachable MCP server (§9.2–9.4) for the claim "a
real adapter can drive genuine MCP protocol calls."

### Why It Remains Unproven

The MCP protocol exchange this iteration exercised is real — real
request/response framing, real tool schemas, a real `isError` result path
— but it never left one Node process, and no separate MCP client/server
network boundary was ever crossed. Whether the same grant-enforcement
approach holds unmodified against a real, independently-running MCP
server (with its own process lifecycle, its own connection handling) is a
different, larger claim this iteration did not attempt.

### How To Validate

Build the standalone MCP server §16 1e describes, point a real adapter's
`mcpServers` config at it as an external process (not `createSdkMcpServer`),
and re-run the same in-grant/out-of-grant check against that boundary
instead.

---

## Biggest Surprise

Not that a real agent occasionally does something unexpected — every
iteration involving real external systems has found something. The
surprise is how close this iteration came to recording the *wrong*
lesson from a correct observation. "The agent called the wrong tool
twice" was true, reproducible, and looked exactly like the kind of
real-world finding this project exists to surface honestly rather than
smooth over. Accepting it at that description would have produced a
plausible-sounding, false conclusion in `docs/PROJECT_KNOWLEDGE.md` — a
worse outcome than a bug that simply fails loudly, because it would have
looked like validated evidence rather than an error. Only inspecting the
actual data flow (what was really sent to the model, not what the script
merely printed) surfaced the real cause. Worth naming precisely because
this project's own discipline — check the actual source, not a plausible
adjacent explanation — is what caught it, the same discipline that caught
`gh repo create`'s missing `--json` flag in Iteration 5 and the
Architecture-reading-Work-tables violation in Iteration 1. This is that
discipline applied to this project's own test harness, not just to an
external system's documentation.

---

## Final Verdict

**What does Project Nexus now know?** That the `AgentRuntimeAdapter` port
and the runtime registration tables both survive contact with a real
Claude agent, unmodified, for a scope touching three of the six
`RunEvent` kinds. That a grant-checked tool, exposed through a real
in-process MCP server, is genuinely enforced against a real agent's real
protocol calls — both a success and a refusal, checked at the protocol
level, not by trusting the agent's own summary. That reusing an
already-authenticated local credential (this time an SDK's process-spawn
model, not a CLI directly) generalizes past the one instance Iteration 5
established. That a Work Package's `acceptanceCriteria` field is not
optional in practice — a real adapter has no other channel for
run-specific direction, and this iteration only produced correct agent
behavior once that field was actually populated and read.

**What does Project Nexus still only believe?** That the six-event
vocabulary remains sufficient once a real scope needs `ArtifactProduced`
or a real `RunBlocked` signal — never tested here. That this iteration's
in-process MCP server is equivalent evidence to the standalone MCP server
§9.2–9.4 describe — it is real, but narrower. Everything else in
`docs/PROJECT_KNOWLEDGE.md` untouched by this iteration, including the
"can the grant model bound what an agent can *learn*" question (Open
Question #1) and the still-fully-deferred output path.

**What architectural bets remain highest risk?** With all three tracked
"real X" instances now resolved favorably for their tested scope, the
project's own recurring pattern (Open Question #5) has run its course as
originally framed — every instance attempted has favored the port design,
not disproven it. The next highest-value open question is less about
whether abstractions survive contact and more about completeness: does
the six-event vocabulary survive contact with a scope that actually needs
`ArtifactProduced` or `RunBlocked`, and does a real Orchestrator
populating `acceptanceCriteria` from actual domain data produce runs a
real agent can execute without the kind of improvisation this iteration's
own first two runs accidentally demonstrated.
