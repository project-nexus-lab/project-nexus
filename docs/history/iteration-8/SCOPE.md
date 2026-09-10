# Iteration 8 Scope — can a real agent's `RunBlocked` signal actually be captured?

This is a scope document, not a report. Nothing described here has been
built. Per `docs/REVIEW_PRINCIPLES.md`'s Change Acceptance Rule, the five
reviewers were applied to the scope decision itself before it was
finalized — their findings are woven into §4 and §5 below, the same
convention every prior SCOPE document in this project has used.

---

# 1. Question Under Test

**Does the six-event `RunEvent` vocabulary (§12.2) hold once a scope
actually needs `RunBlocked`, not only the three kinds
(`RunStarted`, `ContextRequested`, `RunCompleted`/`RunFailed`) Iteration
6's real adapter ever exercised?**

This is `docs/PROJECT_KNOWLEDGE.md`'s current Open Question #1, narrowed
after Iteration 6 and left exactly where that iteration's own Unproven
entry put it: "build a scope that actually needs `ArtifactProduced`...
or a real `RunBlocked` signal, and see whether the six kinds still
suffice." Between the two, this iteration targets `RunBlocked` — see §4
for why, not `ArtifactProduced`, which needs the still-deferred real
output path (push/branch/PR) and would be a substantially larger claim.

Stated precisely: `ClaudeSdkAdapter.mapMessage()` today has no path that
ever produces a `RunBlocked` event — `NoopAdapterB`'s existing coverage
of that event kind is a hardcoded, canned emission, not a translation of
anything real (`docs/history/iteration-6/LESSONS.md` already names this
distinction explicitly). This iteration asks: when a real agent hits a
real, legitimate reason to stop and say "I cannot proceed reliably with
what I have," can that be translated into a real `RunBlocked` event —
and does a real agent even produce a signal clean enough to translate?

---

# 2. What We Know

From `docs/PROJECT_KNOWLEDGE.md` (Validated) and the current code,
checked directly before writing this scope:

- `RunBlocked`'s shape (`src/runtime/port.ts`) is exactly §12.2's:
  `{ reason: "architecture-change-required" | "mapping-missing" |
  "context-insufficient", proposalDraft?: { intent, operations[] } }`.
  Unedited since Iteration 2.
- A real `GrantRefusedError` — the mechanism this iteration's scenario
  depends on — is already validated three times over (Iterations 3, 6,
  7) as a real, protocol-level refusal a real agent genuinely receives
  and can read, not a simulated one.
- Of the three `RunBlockedReason` values, only `context-insufficient` is
  discoverable with the two MCP tools this project has built
  (`getAncestry`, `getCapabilitiesOf`): a call refused for being outside
  the grant is precisely what "I need more context than I was given"
  looks like from the agent's own vantage point. `architecture-change-required`
  would need a scenario where a capability the agent can see has zero
  providers — buildable, but requires either a gate-bypassing
  transitive-dependency scenario (Iteration 0's own `buildWorkPackage`
  gate already rejects a task whose *own* affected capability has zero
  providers, before a run would ever be dispatched) or new MCP surface.
  `mapping-missing` needs Repository MCP (§9.4), which does not exist —
  no current tool can tell an agent whether a component has a mapped
  repository. Neither is buildable this iteration without a larger
  addition than this scope calls for.
- `buildPrompt()` (Iteration 6, corrected the same iteration after a
  real harness bug) is the one real channel this project has for giving
  an agent standing instructions — proven to work reliably once the
  instruction is actually wired to the model, not merely intended.
- Iteration 6's own "Biggest Surprise" is directly relevant precedent: a
  plausible-looking result ("the agent behaved unexpectedly") was, on
  inspection, actually a harness bug. This scope is written to avoid
  repeating that mistake — the scenario must give the agent a genuine
  reason to encounter the refusal as a side effect of real work, the
  same discipline Iteration 7 used for its own disclosure scenario, not
  a contrived setup built only to produce the answer this iteration
  wants.

---

# 3. What We Only Believe

Concrete, specific, each with a stated reason it is not yet known:

1. **That a real agent, told a specific textual convention for signaling
   "blocked" and given a real, legitimate reason to use it, will use it
   reliably rather than working around the refusal, guessing, or
   silently proceeding with incomplete information.** Untested — no
   prior iteration has ever asked a real agent to communicate something
   as structured as "stop and signal X," only to call tools and report
   findings in free text.
2. **That the refusal itself (a `GrantRefusedError` surfacing as an
   `isError` MCP tool result) is something the agent correctly
   interprets as "I need broader access," rather than as an ordinary
   failed lookup to route around or ignore.** Both readings are
   plausible from the agent's side; only a real run can show which one
   actually happens.
3. **That a textual convention parsed from the agent's final result text
   is a sufficient mechanism for this signal**, versus needing a
   dedicated MCP tool call (e.g. a `requestBlocked` tool) the agent
   invokes explicitly. A tool call would be more structured and less
   fragile to parse, but adds a new MCP surface (and a new question
   about whether such a tool is a "write," which R-1 constrains) this
   iteration's own scope may not need if the textual convention proves
   sufficient.

---

# 4. Recommended Iteration 8 Scope

**One real, minimal mechanism for `RunBlocked` — reason
`context-insufficient` only — tested against one real, legitimate
scenario, `proposalDraft` explicitly out of scope.**

1. **`buildPrompt()` gains one standing instruction**, present on every
   run (not per-task `acceptanceCriteria`, since this is a protocol the
   `role.implementer` role should always follow, not a scenario-specific
   ask): if a tool call is refused because the target is outside the
   run's grant, and the agent judges that information genuinely
   necessary to complete the task correctly, end the response with an
   exact, parseable line — e.g. `BLOCKED: context-insufficient — <one
   sentence>` — instead of a normal completion.
2. **`mapMessage()` gains one new translation path**: when the terminal
   `result` message's text matches the `BLOCKED:` convention, emit
   `RunBlocked` (reason `context-insufficient`, the one-sentence text
   carried in a way the Report can quote) instead of `RunCompleted`.
   Every other message kind's mapping is unchanged.
3. **One real scenario**: a task legitimately needs to understand a
   component two containment/dependency hops away from what its grant
   covers (one hop past the grant's own one-hop widening, §9.5) to
   answer correctly. The agent calls a tool targeting that further
   component, is genuinely refused, and — per the new standing
   instruction — should conclude it cannot proceed reliably.
4. **Record precisely**: did the agent call the tool that gets refused
   at all (same protocol-level `toolCalls`/`toolResults` discipline
   Iterations 6 and 7 both used); did its final text follow the
   `BLOCKED:` convention; did `events()` correctly yield a real
   `RunBlocked` event as a result. All three are checkable facts, not
   impressions.

**Not in scope:** `proposalDraft` population (constructing real
`intent`/`operations[]` from agent text is a separate, larger parsing
and design problem — deferred explicitly, not attempted partially);
`architecture-change-required` or `mapping-missing` (neither is
discoverable with today's MCP tool coverage, per §2); a dedicated
`requestBlocked` MCP tool (named in §3 item 3 as a real alternative, not
built here); any Orchestrator-side handling of a received `RunBlocked`
event (§12.4's "raises the `RunBlocked` domain event — Architecture
drafts the proposal, Work blocks the Task" remains exactly as deferred
as it has been since Iteration 1).

---

# 5. Proposed Mechanism Design

### A. A parsed textual convention in the final result (recommended)

- **Learning value: high.** Tests the actual question with the smallest
  possible mechanism — if a real agent can't reliably produce even a
  simple, explicit text convention when genuinely blocked, that is
  itself important evidence about what the six-event vocabulary would
  need to become reliable in practice.
- **Implementation complexity: low.** One new paragraph in
  `buildPrompt()`, one new branch in `mapMessage()`. No new MCP tool, no
  new dependency, no schema change.
- **Risk: the convention is fragile by construction** — a differently-
  worded refusal acknowledgment that doesn't match the exact `BLOCKED:`
  line would be missed and silently fall through to `RunCompleted`
  (wrong) rather than erroring loudly. Named directly as a real
  limitation to disclose, not hidden; §8 treats "the agent tries to
  signal blocked but the convention doesn't match" as its own possible,
  reportable outcome, not conflated with "the agent didn't try."

### B. A dedicated MCP tool (e.g. `requestBlocked(reason, note)`)

- **Learning value: lower for this iteration's specific question.**
  Would produce a more structurally reliable signal, but tests a
  different thing — whether a real agent can be directed to call a
  specific tool when a condition is met, a capability already
  demonstrated in Iterations 6 and 7 for `getAncestry`/`getCapabilitiesOf`.
  The genuinely open question — can a *real, unstructured* agent output
  be reliably translated at all — goes untested if the mechanism is
  structured from the start.
- **A real design question deferred, not rejected**: is a tool an agent
  calls to say "I'm blocked" a write in the R-1 sense? It writes nothing
  to the graph, only signals the adapter — plausibly not a violation,
  but not decided here, since Option A does not need the question
  answered to proceed.
- **Rejected for this iteration**, named as the natural next step if
  Option A's mechanism proves too unreliable to trust.

### C. Ask the agent to emit structured JSON instead of a plain marker line

- **Learning value: marginal over A, complexity higher.** A JSON payload
  would carry more structure (useful for a future `proposalDraft`), but
  this iteration deliberately excludes `proposalDraft` — there is
  nothing extra for JSON to carry yet that a plain marker line cannot.
- **Rejected for this iteration**, worth revisiting only once
  `proposalDraft` population is actually in scope.

### Recommendation: **A.**

The smallest mechanism that actually tests the real, open question —
whether a real agent produces a legible enough signal at all — rather
than a more structured mechanism that would mostly test something this
project already knows works (directed tool use).

---

# 6. Acceptance Criteria

1. **The scenario gives the agent a genuine, legitimate reason to reach
   for the tool call that gets refused** — verified by recording the
   actual task/prompt given, not merely asserting it was legitimate.
2. **Whether the refused call happened at all is recorded precisely**,
   using the same protocol-level `toolCalls`/`toolResults` record
   Iterations 6 and 7 both built and relied on.
3. **Whether the agent's final text matches the `BLOCKED:` convention is
   recorded precisely**, quoting the real text, not paraphrased.
4. **If it matches, `events()` is confirmed to yield a real `RunBlocked`
   event** (not `RunCompleted`), checked directly against the actual
   event sequence a live run produces.
5. **The result is classified precisely** into one of three outcomes,
   each a complete and acceptable answer, not just one of them: the
   agent was refused and correctly signaled `BLOCKED:` (the mechanism
   works); the agent was refused but did not signal `BLOCKED:` (the
   agent's behavior, not the parsing, is the gap); the agent was never
   refused at all (the scenario did not create the intended condition,
   itself a reportable, fixable scenario-design finding, the same
   category of finding Iteration 6's `acceptanceCriteria` bug was).
6. **`npm test` remains fully hermetic** — the new `mapMessage()` branch
   gets hermetic fixture-based unit test coverage (matching
   `test/claude-sdk-adapter.test.ts`'s existing pattern), independent of
   whatever the live run actually produces.

---

# 7. Explicit Deferrals

- **`proposalDraft` population** — not required; a separate, larger
  parsing and design problem named but not attempted.
- **`architecture-change-required` and `mapping-missing`** — neither
  discoverable with today's MCP tool coverage; revisit once Repository
  MCP or a transitive-dependency-gap scenario is actually in scope.
- **A dedicated `requestBlocked` MCP tool** — named as Option B, not
  built; the natural next step only if Option A's textual convention
  proves unreliable.
- **Any Orchestrator-side reaction to a received `RunBlocked` event** —
  unchanged from every prior iteration's own deferral, since §12.4's
  Orchestrator itself remains unbuilt.
- **`ArtifactProduced`** — the other half of Open Question #1's own
  Unproven entry, deliberately left to a separate iteration once the
  real output path is in scope; conflating the two would blur what
  evidence actually answers which claim, the same Domain Integrity
  concern `docs/history/iteration-5/SCOPE.md` §4 raised for a different
  pair of claims.

---

# 8. Evidence Plan

**What would validate that the six-event vocabulary holds for
`RunBlocked`:** the agent is genuinely refused, recognizes it, and
signals it via the given convention, and `events()` correctly translates
that into a real `RunBlocked` event — all three checked directly, not
inferred.

**What would invalidate it, precisely** (each a specific, checkable
outcome):

- The agent is refused but does not signal `BLOCKED:` at all — it works
  around the gap, guesses, or reports the refusal only as prose without
  following the convention. This would mean a plain textual convention
  is not a reliable mechanism, motivating Option B (a dedicated tool)
  for a future iteration, not a redesign guessed at here.
- The agent signals something *close to* `BLOCKED:` but not an exact
  match, and `mapMessage()` misses it, silently falling through to
  `RunCompleted`. This is a distinct, worse failure mode than the one
  above — a real blocked condition reported as a success — and would be
  named precisely as such, not folded into "the agent didn't try."

**What would require a larger design change, not just an iteration-8
fix:** if the scenario itself cannot reliably produce a genuine refusal
without contrivance (e.g. every legitimate task path the agent takes
avoids the refused call entirely), that is evidence about how rarely
`context-insufficient` actually arises in practice — worth recording as
a finding about the grant-widening formula's own generosity (§9.5's
`context_depth + 1`), not about this iteration's mechanism.

---

# 9. Iteration Risk Assessment

Ranked by evidence value of resolving each next:

1. **This iteration's own question is `docs/PROJECT_KNOWLEDGE.md`'s
   current Open Question #1**, narrowed since Iteration 6 to exactly
   this — the last of the six `RunEvent` kinds never exercised against
   a real agent, aside from `ArtifactProduced`.
2. **If the textual convention proves unreliable, the fix (Option B, a
   dedicated tool) is unscoped** — a real new MCP surface, and a real
   R-1 question about whether such a tool counts as a write, neither
   designed here.
3. **Whether every current and future MCP tool needs the same category
   of grant-result filtering `getAncestry` now has** (open since
   Iteration 7) remains unaffected by this iteration either way — this
   scope reuses `getAncestry`/`getCapabilitiesOf` exactly as Iteration 7
   left them.
4. **`ArtifactProduced` and the real output path remain the other half
   of Open Question #1**, unresolved by this iteration on purpose —
   ranked below `RunBlocked` here for the reasons §4 already gives, not
   because it matters less architecturally.
5. **The real MCP protocol server, FileAnchor maintenance-over-time, and
   traversal-at-scale questions remain lowest-ranked**, unchanged from
   every prior iteration's own §9 — no amount of additional building on
   this iteration's own question moves any of them faster.
