# Iteration 9 Scope — should `context-insufficient` be classified from backend observations rather than agent-authored text?

This is a scope document, not a report. Nothing described here has been
built. It follows directly from two architecture reviews conducted
between Iterations 8 and 9 ("Should Nexus rely on the agent to make
workflow-state decisions?" and its follow-up), both preserved in this
session's own record rather than in a separate `docs/history/` entry,
since neither modified code. This document, `docs/PROJECT_KNOWLEDGE.md`,
and `docs/MVP_ARCHITECTURE_V2.md`'s R-1 (extended alongside this
document) are the durable artifacts those reviews produced.

---

## Question Under Test

Should `context-insufficient` be classified from backend observations —
a real `GrantRefusedError`, already recorded in `ClaudeSdkAdapter`'s
`toolResults` — rather than from agent-authored text (the `BLOCKED:`
convention Iteration 8 built)?

This tests recommendation B from the architecture review: introduce
backend classification for deterministically observable reasons, retain
agent-provided signals only where deterministic evidence does not yet
exist. `context-insufficient` is the one reason with both a deterministic
mechanism already present in code and validated evidence (Iteration 8)
to compare against. `architecture-change-required` and `mapping-missing`
are explicitly out of scope — see Explicit Deferrals.

---

## What We Know

- `GrantRefusedError` (`src/mcp/grant.ts`) fires deterministically and
  synchronously inside Nexus's own code, Validated since Iteration 3,
  exercised again in Iterations 6, 7, and 8.
- `ClaudeSdkAdapter`'s `toolResults: Array<{toolUseId, isError, text}>`
  already records every refusal as a side effect of tracking built in
  Iteration 6 — confirmed by direct code read, never consulted for
  `RunEvent` classification.
- `mapMessage(message: SDKMessage): RunEvent | null`
  (`src/runtime/adapters/claude-sdk.ts`) is a pure, single-message
  function with no access to `toolResults` — confirmed directly, not
  assumed. The classification decision must move into `events()`, the
  stateful method that already holds the accumulated record.
- `GrantRefusedError.reason` (`"expired" | "out-of-grant"`) is caught in
  `buildMcpServer`'s handlers but discarded — only `.message` is threaded
  through to the tool result today.
- Iteration 8 validated, twice, that a real agent correctly narrates
  blockage via the `BLOCKED:` convention when a refusal is genuinely
  relevant to its task. This evidence is not superseded by this
  iteration — it is preserved as a fallback (see Smallest Viable
  Refactoring).
- Both of Iteration 8's real runs involved a refusal that was relevant to
  task completion, by design (`docs/history/iteration-8/SCOPE.md` §5.A).
  No run has ever tested a refusal the agent encountered and then
  completed the task without needing.

---

## What We Only Believe

1. **That "a refusal occurred, and the run otherwise completed cleanly"
   is sufficient grounds for `RunBlocked`, without producing new false
   positives for refusals the agent successfully worked around.**
   Untested — this is the iteration's actual open question, named in
   `docs/PROJECT_KNOWLEDGE.md` Open Questions as "can deterministic
   backend classification over-trigger compared to agent-reported
   blockage?"
2. **That backend classification will reproduce Iteration 8's own
   validated outcome exactly, not merely coincidentally.** A real
   regression risk to check, not assume.
3. **That `context-insufficient` specifically needs no agent input at
   all**, as distinct from needing a weaker corroborating signal. This
   iteration's design is a bet on the stronger claim; the bet itself is
   what is being tested, not just the mechanism's plumbing.

---

## Smallest Viable Refactoring

**Stays unchanged**: `GrantRefusedError`, `assertInGrant`, all of
`src/mcp/tools.ts`, the §11.2 gate (`src/workpackage/build.ts`),
`RunEvent`/`RunBlockedReason`'s shape in `src/runtime/port.ts`,
`AgentRuntimeAdapter`'s four-method contract, `buildPrompt()`'s standing
instruction, `parseBlockedSignal()`, the Orchestrator (still unbuilt).

**Moves**: the success-branch classification decision, out of
`mapMessage(message)` and into `events()`, which already holds
`h.toolResults` in scope. `GrantRefusedError.reason` gets threaded into
each `toolResults` entry (one small, typed field, reusing the existing
`GrantRefusalReason` type from `src/mcp/grant.ts`) instead of being
discarded at the point of catch.

**Remains agent-driven**: which tool calls the agent chooses to make —
its own exploration strategy still shapes what gets observed, which is
legitimate influence, not authority over the resulting state. The
`BLOCKED:` convention remains the sole channel for
`architecture-change-required`, untouched.

**Becomes backend-determined**: whether a `context-insufficient`
`RunBlocked` fires, and its reason — derived from
`h.toolResults.some(r => r.isError)` at the terminal-result point,
checked *before* the text-convention fallback. If the backend observes a
refusal, it is authoritative; the agent's text is consulted only when the
backend has nothing to go on for this run.

---

## Evidence Plan

**Validated evidence, reused, not re-proven**: `GrantRefusedError`'s
reliability (Iterations 3, 6, 7); `toolResults`' accuracy as a
protocol-level record (Iterations 6, 7, 8); the agent's ability to
narrate blockage via text (Iteration 8, twice — retained as fallback,
not discarded).

**New evidence required**:
1. Does the backend-only path reproduce Iteration 8's own scenario's
   `RunBlocked` outcome, independent of whether the agent's text matches
   the convention?
2. Does a genuinely-irrelevant-refusal scenario over-trigger under the
   new rule?

**Failure modes, named directly, not discovered later**:
- The backend rule fires on a refusal that turns out to be irrelevant to
  completion — over-triggering, the core open question.
- The backend signal and the fallback text convention disagree — resolved
  by design, not left ambiguous: the backend-observed signal wins,
  consistent with the R-1 extension adopted alongside this scope
  (`docs/MVP_ARCHITECTURE_V2.md` R-1: "an agent-reported signal may stand
  in [only] where Nexus has not yet built a deterministic classifier").
- A downstream consumer implicitly assumed `RunBlocked` always co-occurs
  with `BLOCKED:` text — checked, not found: `handle.lastResultText` is
  captured independently of classification and is unaffected either way.

---

## Acceptance Criteria

1. **The existing Iteration 8 scenario still succeeds**, and the run's
   `RunBlocked` is confirmed to originate from the backend path
   specifically — not merely coincide with the agent also saying
   `BLOCKED:`. The demonstration must distinguish *which* path fired, not
   only that the correct event resulted.
2. **`RunBlocked` can be emitted without relying on `BLOCKED:` text** —
   demonstrated hermetically: construct `toolResults` containing an
   `isError: true` entry paired with final result text that does *not*
   contain the convention at all, and confirm the classifier still
   produces `RunBlocked`. No live run required for this specific claim.
3. **A refusal that is genuinely irrelevant to task completion becomes a
   real test case** — a new scenario where the agent is refused on a call
   its actual task does not depend on, and the run would otherwise
   complete correctly without that information.
4. **Evidence is gathered about potential over-triggering** — scenario
   3's real outcome is classified precisely (over-triggered / did not
   over-trigger / ambiguous) against actual captured output, the same
   discipline `investigate-ancestry-disclosure.ts` and
   `investigate-run-blocked.ts` already established, not summarized
   loosely.
5. **`npm test` remains fully hermetic** — the new classification logic
   gets hermetic fixture-based unit test coverage (matching
   `test/claude-sdk-adapter.test.ts`'s existing pattern), independent of
   whatever the live runs actually produce.

---

## Explicit Deferrals

- `architecture-change-required`, `mapping-missing` — untouched, per
  constraint; no backend mechanism exists for either yet.
- Repository MCP, any new MCP tool — not introduced.
- The Orchestrator — not introduced.
- A general-purpose workflow-state framework or rules engine — not
  introduced; the change is one small, typed check, the same shape as
  the existing gate, not a new kind of mechanism.
- `proposalDraft` population — unrelated to this iteration's question,
  untouched.
- Resolving the over-triggering question with certainty — this iteration
  gathers one real data point on it, consistent with this project's own
  "one scenario is evidence, not a demonstrated pattern" discipline
  (see `docs/history/iteration-8/LESSONS.md`, Unproven); it does not
  claim to settle the question for every future scenario.
- Any change to `RunCompleted`/`RunFailed` classification for reasons
  unrelated to `context-insufficient` — out of scope.
- Further R-1/Constitution edits — the extension this scope depends on
  was made alongside it, not as part of this iteration's own code work.
