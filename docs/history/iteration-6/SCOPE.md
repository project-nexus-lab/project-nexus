# Iteration 6 Scope — a real Claude SDK Adapter

This is a scope document, not a report. Nothing described here has been
built. Per `docs/REVIEW_PRINCIPLES.md`'s Change Acceptance Rule, the five
reviewers were applied to the scope decision itself before it was
finalized — their findings are woven into §4 and §5 below rather than
listed separately, the same convention `docs/history/iteration-5/SCOPE.md`
used.

---

# 1. Question Under Test

**Does the `AgentRuntimeAdapter` port (§12.2), validated in Iteration 2
against two deliberately trivial adapters, correctly abstract over a real
agent runtime — one with actual behavioral complexity (streaming
translation, real tool-call routing, vendor-specific configuration) —
without requiring the port interface to change, and does registering it
still cost close to "one row, one class" (§12.7)?**

This is `docs/PROJECT_KNOWLEDGE.md`'s current Open Question #2, open since
Iteration 2, and the oldest of the three "does a no-op-validated mechanism
survive contact with the real thing" instances this project has tracked
(Open Question #5). The other two have both now resolved favorably —
`VcsProvider` in Iteration 5, MCP grant direct-call-target enforcement in
Iteration 3 — and both did so by building the one real thing, not by this
document's own analysis predicting the answer. This iteration applies the
same discipline to the last of the three, and the one closest to the
Constitution's own top-line principle: agent-runtime independence.

Secondarily, and only to the extent it falls directly out of building a
real adapter at all: does a grant-checked MCP tool call actually work when
driven by a real agent through a real MCP protocol exchange, not a direct
function call or an HTTP request written for a test? This is Iteration
3's own named Unproven item, unresolved since it was recorded and never
independently scoped — this iteration does not chase it as a separate
goal, but does not look away from it either, since building any real
Claude SDK Adapter necessarily touches it.

---

# 2. What We Know

From `docs/PROJECT_KNOWLEDGE.md` (Validated) and prior iteration reports:

- The port (`src/runtime/port.ts`) is small and stable: `capabilities()`,
  `start(runId, workPackage, grant)`, `events(handle):
  AsyncIterable<RunEvent>`, `cancel(handle)`. Unedited since Iteration 2.
- The six-event vocabulary (`RunStarted`, `ContextRequested`,
  `ArtifactProduced`, `RunBlocked`, `RunFailed`, `RunCompleted`) has never
  been exercised by anything but two adapters that emit a fixed, hardcoded
  sequence — `NoopAdapterA`'s happy path and `NoopAdapterB`'s
  `RunBlocked`, neither derived from anything a real runtime actually
  emitted.
- `registerAdapter` writes one `runtime.adapter_registration` row (id,
  display_name, `config jsonb` — "model, prompt template, tool policy",
  schema comment since Iteration 0) and one `runtime.adapter_role_support`
  row per supported role. Both tables have existed, empty until Iteration
  2, unchanged since.
- `src/mcp/grant.ts#buildGrant` and `src/mcp/tools.ts` (`getAncestry`,
  `getCapabilitiesOf`) are real, tested, grant-enforcing functions —
  called directly by tests and over HTTP, never by anything resembling a
  real MCP client.
- No Orchestrator exists (§12.4, deferred since Iteration 1). Nothing here
  proposes building one — every prior iteration that needed to stand in
  for the Orchestrator's role (issuing a grant, driving a run) did so with
  a caller-supplied `runId` and a script driving the sequence directly;
  this iteration uses the same stand-in pattern, not a new one.
- **Checked directly in this environment before writing this scope**:
  `@anthropic-ai/claude-agent-sdk` (npm, current version 0.3.267) is the
  real "Claude SDK" §12.7 names. Its `query()` function's default spawn
  behavior locates and shells out to a local `claude` CLI executable
  (`pathToClaudeCodeExecutable`, checked in the SDK's own type
  definitions) — the same CLI already installed and authenticated in this
  development environment (`claude --version` → `2.1.267 (Claude Code)`),
  the same session this scope document is being written in. This is the
  same "reuse the already-authenticated CLI" pattern Iteration 5 used for
  `gh`, not a new credential-acquisition problem.
- **Also checked directly**: the SDK exports `createSdkMcpServer` and
  `tool()` — a real, documented mechanism for hosting an **in-process**
  MCP server that `query()`'s `mcpServers` option can be pointed at,
  without a separately-running network process. This means Nexus's
  existing grant-checked tool wrappers (`getAncestry`,
  `getCapabilitiesOf`) can be exposed to a real agent through a real MCP
  protocol exchange without this project first having to build the
  standalone, externally-reachable MCP server §9.2–9.4 describe — a
  smaller, real slice of that larger deferred surface.

---

# 3. What We Only Believe

Concrete, specific, each with a stated reason it is not yet known:

1. **That the SDK's real streaming event shapes translate cleanly into
   the existing six `RunEvent` kinds**, the way `docs/PROJECT_KNOWLEDGE.md`
   currently only has evidence for two adapters that hand-authored their
   own event sequence rather than translating one. A real agent's actual
   turn — text, tool calls, thinking, completion — may not map onto
   `RunStarted → ContextRequested → ArtifactProduced → RunCompleted`
   without leftover detail the port's vocabulary has no slot for.
2. **That a grant-checked MCP tool, exposed via `createSdkMcpServer`, is
   actually called by a real agent the way this project's own tests have
   only ever called it directly.** Untested until this iteration — no
   real MCP client has ever existed in this project before.
3. **That `GrantRefusedError` (thrown by `assertInGrant` when a tool call
   targets an out-of-grant element) surfaces to the real agent as a
   sensible tool-call failure**, not an unhandled exception that crashes
   the run — MCP's own error-reporting contract for a failed tool call has
   never been exercised end-to-end in this project.
4. **That registering `ClaudeSdkAdapter` still costs close to "one row,
   one class."** A real adapter needs, at minimum, a system-prompt
   translation step and an MCP-server-construction step neither no-op
   adapter needed — whether that stays inside one class or forces a
   second file is precisely the open question, not assumed either way.
5. **That `RunBlocked` can be produced from a live run at all, on
   demand, for testing purposes.** `NoopAdapterB` emits it because it is
   hardcoded to. A real agent only "decides" to signal
   architecture-change-required in response to its own reasoning about a
   real prompt — not something this iteration can force deterministically
   without either faking it (defeating the point) or accepting
   non-determinism in a validation run.
6. **That a handful of real API calls (routed through the already-
   authenticated local `claude` CLI, not a separately billed key) has a
   negligible, acceptable cost for architectural validation** — believed
   because Iteration 5 used the same framing for one disposable GitHub
   repository, not because this iteration's actual cost has been measured
   in advance.

---

# 4. Recommended Iteration 6 Scope

**One real `AgentRuntimeAdapter` implementation, exercising all four port
methods against one real, minimal agent run, including one real
grant-checked MCP tool call.**

1. `ClaudeSdkAdapter implements AgentRuntimeAdapter` —
   `src/runtime/adapters/claude-sdk.ts`, a new sibling to
   `adapters/noop-a.ts` / `noop-b.ts`, not a new bounded context.
2. **Real translation, not a passthrough**: `start()` builds a minimal
   system prompt from the `OpaqueWorkPackage` payload (task id, affected
   capabilities/components — no new template engine, string
   interpolation is sufficient for one role) and constructs an in-process
   MCP server via `createSdkMcpServer`/`tool()` wrapping `getAncestry` and
   `getCapabilitiesOf`, both closed over the run's own `McpGrant` — the
   grant is baked into the server's configuration for that run, matching
   §12.7's "MCP grant → MCP server configuration and tool allowlist"
   directly, not simulated.
3. **Real event mapping**: `events()` consumes `query()`'s actual
   streaming output and maps it onto the six `RunEvent` kinds —
   `RunStarted` on session start, `ArtifactProduced` if the agent's
   response contains one, `RunCompleted` on a normal finish, `RunFailed`
   on an SDK-reported error. Any SDK event that does not map cleanly onto
   one of the six is named directly in the Report, not silently dropped
   without comment.
4. **One real, grant-checked tool call, both directions**: the live
   run's prompt directs the agent to call `getAncestry` on an in-grant
   element (expect success, and confirm — via the SDK's own event stream,
   not just "no crash" — that the real agent actually received real
   traversal data back) and, separately, on an out-of-grant element
   (expect the call to fail as a tool error the agent can observe, not an
   unhandled exception that kills the process).
5. **Registration**: `registerAdapter(db, new ClaudeSdkAdapter(), {...})`
   against the real `runtime.adapter_registration` /
   `adapter_role_support` tables — no changes to `registry.ts` or its
   schema, the same claim Iteration 2 already tested for the trivial
   adapters, retested here for a real one.
6. **A verification script**, `src/cli/verify-claude-adapter.ts`, in the
   same family as `verify.ts` (Iteration 0) and `verify-github.ts`
   (Iteration 5) — narrated, run explicitly, **not part of `npm test`**,
   since it requires a real `claude` CLI invocation and therefore real
   network access, the same reason `verify-github.ts` is excluded.
7. **`RunBlocked` validated structurally, not elicited live.** A unit
   test constructs a `RunBlocked`-shaped event and confirms the port's
   type accepts it from this adapter's `events()` return type — proving
   the adapter *can* emit one, not that a live run *did*. This is stated
   as a deliberate scope boundary in §3 item 5, not silently treated as
   equivalent to `NoopAdapterB`'s existing coverage.

**Not in scope:** a real Orchestrator, `RunBlocked` wired to actual
proposal-drafting, the full three-server MCP surface (§9.2–9.4) as a
standalone reachable process, the output path (§12.5 — branch push and PR
via `VcsProvider`, still deferred since Iteration 4), any role other than
`role.implementer`, and any adapter-selection or multi-adapter dispatch
logic (`listAdaptersForRole` already exists and is untouched by this
scope).

---

# 5. Proposed Design

### A. `@anthropic-ai/claude-agent-sdk`, in-process MCP server, local `claude` CLI credential reuse

- **Learning value: high.** The only option that exercises real
  streaming event translation, a real system-prompt construction step,
  and — via `createSdkMcpServer` — a real, non-simulated MCP tool call
  under grant enforcement. Directly answers §1 and makes real progress on
  Iteration 3's named Unproven item as a side effect, not a separate
  detour.
- **Implementation complexity: medium.** One new npm dependency
  (`@anthropic-ai/claude-agent-sdk`, confirmed installable and its
  relevant exports confirmed present before proposing this). No new
  credential handling — the SDK's default spawn behavior already finds
  and uses the local, already-authenticated `claude` executable.
- **Architectural risk: low–medium.** The same class of risk Iteration 5
  accepted for `gh`: depends on an external binary already assumed
  present by this project's own development environment (this project is
  built inside Claude Code), not a new operational precondition invented
  for this iteration. Real cost: a small number of real API calls,
  bounded by design to one short run.
- **Constitutional alignment: high.** §12.1: "Claude SDK Adapter (the
  only runtime-aware code in the system)" — this design keeps every
  Claude-specific detail (the SDK import, the CLI dependency, prompt
  construction) inside exactly one new file, the same isolation
  `AgentRuntimeAdapter` already enforces for the two no-op adapters.

### B. Raw `@anthropic-ai/sdk` (Messages API) with a hand-rolled tool-use loop

- **Learning value: medium, and arguably answering a different
  question.** §12.7 names "Claude SDK Adapter," not "Anthropic Messages
  API Adapter" — building a hand-rolled tool-use loop over the raw
  Messages API tests this project's own polling/looping code more than it
  tests whether the *actual* Claude SDK's abstractions survive contact
  with the port. Also does not exercise real MCP protocol at all — the
  Messages API's tool-use mechanism is not MCP, so Iteration 3's Unproven
  item would stay completely untouched.
- **Implementation complexity: higher.** Requires a separately-issued
  `ANTHROPIC_API_KEY` — checked directly in this environment, and none is
  set. This is a new credential-acquisition problem B has and A does not.
- **Constitutional alignment: medium.** Not a violation, but a
  narrower, harder-to-justify slice of "runtime independence" than what
  §12.7 actually describes building.

### C. A more elaborate simulated adapter (e.g. hand-authored fixture streams mimicking real SDK output)

- **Learning value: low, rejected outright.** This is what
  `NoopAdapterA`/`NoopAdapterB` already are. Iteration 6 exists
  specifically because Open Question #2 says the trivial-adapter evidence
  is not sufficient — building a third trivial adapter, however more
  elaborately faked, produces zero new evidence toward the actual
  question under test.

### Recommendation: **A.**

Highest learning value, no new credential problem (the existing `claude`
CLI session this project is developed inside already solves it, the same
way Iteration 5 treated existing `gh` credentials as a given rather than
a new integration point), and the only option that makes real progress on
a second open item (real MCP protocol tool-calling) as a natural
consequence of doing A properly, not as scope creep bolted on. Evidence
Reviewer: A is also the option most likely to surface a genuine mismatch
between the port's six-event vocabulary and what a real agent actually
emits — which is precisely the failure mode §1 asks about, and precisely
what B and C would each fail to surface for different reasons.

---

# 6. Acceptance Criteria

1. **`AgentRuntimeAdapter` (`src/runtime/port.ts`) requires zero
   interface changes.** If it does need a change, that is not a failure —
   it is the answer to §1, and must be recorded as precisely as a pass:
   what changed, why, and what about the six-event vocabulary or the
   `start()`/`events()`/`cancel()` shape didn't anticipate it.
2. **One real run completes**, with `events()` yielding a real
   `RunStarted` followed by a real terminal event (`RunCompleted` or
   `RunFailed`) derived from the SDK's own actual output — not a
   hardcoded sequence.
3. **At least one real, grant-checked MCP tool call succeeds** through
   the in-process server, verified by the real data returned appearing in
   the agent's own observed output — not only by the absence of an error.
4. **At least one real, grant-checked MCP tool call targeting an
   out-of-grant element is refused**, and the run does not crash — the
   refusal surfaces as a tool-level failure the agent can see, verified
   directly, not inferred.
5. **`registerAdapter` requires zero changes** to `registry.ts` or the
   `runtime.adapter_registration` / `adapter_role_support` schema.
6. **`npm test` remains fully hermetic** — zero network access, unchanged
   pass count plus whatever new unit tests this iteration adds for
   structural claims (e.g. the `RunBlocked` shape test in §4 item 7).
   `verify-claude-adapter.ts` (or equivalent name) stays outside it,
   confirmed the same way `verify-github.ts` was in Iteration 5.
7. **The actual cost of registering `ClaudeSdkAdapter`** (files touched,
   new abstractions introduced beyond the adapter class itself — e.g. the
   MCP-server-construction helper) is stated precisely in the Report,
   not rounded up or down to fit "one row, one class" if it doesn't
   land exactly there.

If (1) requires a change, or the cost in (7) is genuinely more than "one
class," Iteration 6 is still complete and successful *as an experiment* —
the acceptance bar is a precise answer, not a predetermined one.

---

# 7. Explicit Deferrals

- **A real Orchestrator** — not required. This iteration drives
  `start()`/`events()`/`cancel()` directly from a verification script,
  the same stand-in every prior iteration has used for the Orchestrator's
  role; building the Orchestrator itself is a distinct, larger claim
  (run-state persistence, dispatch policy, `RunBlocked` → proposal
  wiring) untouched here.
- **`RunBlocked` wired to real proposal-drafting** — not required, and
  not newly deferred: this has been open since Iteration 1
  (`docs/PROJECT_KNOWLEDGE.md`, Unproven: "the in-process,
  direct-function-call form of `RunBlocked`/`ProposalApplied` will still
  be the right shape once a real Orchestrator exists").
- **The full three-server MCP surface (§9.2–9.4) as a standalone,
  externally-reachable process** — not required. This iteration's
  in-process `createSdkMcpServer` is a real, non-simulated MCP protocol
  exchange, but a narrower slice than a network-reachable MCP server
  independent processes could connect to. Stated precisely so it is not
  overclaimed as resolving the whole surface.
- **The other five Architecture MCP tools, all Work MCP, all Repository
  MCP** — unchanged from Iteration 3's own deferral; this iteration
  reuses the same two tool wrappers, does not grow the catalog.
- **The output path (§12.5 — branch push and PR via `VcsProvider`)** —
  unchanged from Iteration 4/5's deferral. `ArtifactProduced` may be
  emitted by this iteration's adapter, but nothing consumes it to
  actually push content anywhere real.
- **Multiple roles, multiple adapters, or adapter-selection logic** — not
  required. `role.implementer` only; `listAdaptersForRole` is exercised
  incidentally (the adapter is registered against it) but not tested
  freshly — Iteration 2 already covers that query.
- **Rate limiting, retries, or cost controls** — not required for one
  short, bounded validation run.

---

# 8. Evidence Plan

**What would validate the abstraction:** all seven acceptance criteria in
§6 pass as stated — zero port changes, a real run producing real
translated events, a real grant-checked tool call succeeding and another
correctly refused, zero registry changes, hermetic `npm test` unaffected,
and a precise (not rounded) statement of what registering the adapter
actually cost.

**What would invalidate the abstraction** (each a specific, checkable
outcome):

- The SDK's real event stream contains something that does not map onto
  any of the six `RunEvent` kinds without loss or distortion — meaning
  the vocabulary itself, not just this one adapter, is incomplete.
- A grant-checked tool call's refusal does not surface as something the
  agent (or this project's own code observing the run) can distinguish
  from a generic failure — meaning `assertInGrant`'s `GrantRefusedError`
  needs a real MCP-shaped error contract it does not currently have.
- Registering the adapter demonstrably requires more than "one class" in
  a way that isn't just the MCP-server-construction nuance already named
  in §3 item 4 — e.g. if `port.ts` or `registry.ts` themselves need
  edits, not just a new sibling file.

**What would require an architecture change, not just an iteration-6 code
fix:**

- If MCP tool refusal cannot be made to look like a normal, recoverable
  tool failure to a real agent without either the port or the grant
  model growing a new concept (e.g. a distinct "refused" `RunEvent` kind,
  where today a refusal is just an exception inside `events()`), that is
  a real question about whether six events remain sufficient, not an
  adapter-level workaround.
- If the SDK's own process-spawn model turns out to be incompatible with
  how this project would need to run adapters concurrently or
  long-running (e.g. inside a real Orchestrator later), that is a finding
  about `AgentRuntimeAdapter`'s `start()`/`events()`/`cancel()` shape
  itself, worth recording precisely even if this iteration's own
  single-run script never needs to face it.

---

# 9. Iteration Risk Assessment

Ranked by evidence value of resolving each next, not by size of the
feature gap:

1. **This iteration's own question is now the single highest-value open
   experiment in the project** — the last of the three "real X" instances,
   and the one most tied to the Constitution's agent-independence
   principle. Nothing ranks above it.
2. **If the six-event vocabulary proves insufficient, the fix is
   unscoped** — a new event kind, or a restructured `events()` contract,
   would itself become the next highest risk, larger than anything else
   here, and is not designed in advance per the constraint against
   designing Iteration 7.
3. **Does the MCP grant model bound what an agent can *learn*, not only
   what it can *directly query*?** (`docs/PROJECT_KNOWLEDGE.md` Open
   Question #1, open since Iteration 3.) Unaffected by this iteration
   either way — the two tool wrappers exercised here return the same
   unfiltered ancestry chain they always have; nothing about driving them
   through a real MCP server changes what they return.
4. **The disclosed YAML-import-bypasses-the-bootstrap-state-machine
   tension (Iteration 4) remains exactly as open as Iteration 5 left it**
   — untouched by anything in Runtime Integration.
5. **The real output path (§12.5 — push, branch, PR) and repository-
   resolution-ambiguity / FileAnchor-maintenance-over-time questions
   remain lowest-ranked**, for the same reason Iteration 5's own §9
   ranked them last: no amount of additional building moves them faster
   than elapsed real usage would.
