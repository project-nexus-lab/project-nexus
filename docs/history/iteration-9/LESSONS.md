# Iteration 9 Lessons

Not a status report (`docs/history/iteration-9/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 9 asked whether `context-insufficient` should be classified
from backend observations rather than agent-authored text — the direct
outcome of two architecture reviews between Iterations 8 and 9. The
mechanism works exactly as designed: a real `GrantRefusedError`, already
recorded in `toolResults` since Iteration 6, now drives `RunBlocked`
classification directly, confirmed by a real live run where the backend
path demonstrably decided the outcome, independent of the agent's own
text.

The more important result is the one this iteration's own acceptance
criteria specifically asked for and got: real, not hypothetical,
evidence that the naive version of this rule — any observed refusal,
unconditionally, means blocked — over-triggers. A real agent, given an
explicitly optional, genuinely not-required check, attempted it, was
refused, correctly reasoned that the refusal did not affect its actual
task, and concluded the task was complete and ready. The backend
classifier marked the run `RunBlocked` anyway. This is not a defect
introduced by carelessness — it is exactly the risk the architecture
review named and this iteration was scoped to test, discovered because
the test was actually run, not because it was assumed away or assumed
present.

---

## Validated

### Assumption

`RunBlocked` (reason `context-insufficient`) can be classified
deterministically from a run's accumulated `toolResults`, independent of
whether the agent's own final text matches the `BLOCKED:` convention.

### Status

VALIDATED

### Evidence

Hermetic: `classifyResultMessage`, given `toolResults` containing an
`isError: true` entry and final text that does *not* contain the
convention at all, still produces `RunBlocked`. Live: Run 1
(`docs/history/iteration-9/REPORT.md`) reproduces Iteration 8's own
scenario and confirms, by inspecting `h.toolResults` directly rather than
only the resulting event, that the backend observation is what actually
decided the classification — the agent's text also happened to match the
convention this time, but is not what the decision depended on.

### Consequence

Satisfies the architecture review's recommendation B for
`context-insufficient` specifically: Nexus, not the agent, now determines
this workflow-state transition. Closes the mechanical half of
`docs/PROJECT_KNOWLEDGE.md`'s prior Unproven entry on this topic — see
Invalidated, below, for the half that did not survive.

---

## Invalidated

### Assumption

Treating any observed grant refusal as sufficient, unconditional grounds
for `RunBlocked` avoids introducing new false positives relative to the
agent-reported approach — the working hypothesis this iteration's own
`SCOPE.md` set out to test, stated precisely as Unproven going in
(`docs/PROJECT_KNOWLEDGE.md`, "Workflow-state authority should reside in
Nexus... without introducing new false positives").

### Status

INVALIDATED

### Evidence

Run 3 (`docs/history/iteration-9/REPORT.md`): a real agent, given a task
with an explicitly optional, genuinely not-required secondary check,
attempted it, was refused, explicitly reasoned in its own final text that
the refusal did not affect task completion, and concluded "Readiness
confirmed." The backend classifier marked this run `RunBlocked` anyway.
By any reasonable human judgment, this was a successful, complete run
misclassified as blocked. Not a contrived edge case — the scenario
required no adversarial framing, only an honestly optional check a real
task might plausibly offer.

### Resolution

Not resolved in this iteration, deliberately — `docs/history/iteration-9/SCOPE.md`
scoped this as evidence-gathering, not redesign. The naive rule
(`toolResults.some(r => r.isError)` ⇒ blocked) remains implemented,
because Run 1 shows it is also *correct* for the relevant-refusal case;
reverting it would discard validated behavior to avoid a now-named,
evidenced risk rather than address it. See the new Open Question, below.

### Consequence

The architecture review's broader principle — Nexus should determine
workflow state from observations, not agent text — is not invalidated by
this finding. What is invalidated is one specific, naive rule for
*deriving* that state from observations. The distinction matters:
this iteration's own evidence argues for a *better* backend rule, not
for reverting to agent-authored text as the source of authority.

---

## Unproven

### Assumption

A backend-derived signal exists that correctly distinguishes a
task-blocking refusal from one the agent legitimately worked around,
without reintroducing reliance on agent-authored text.

### Why It Remains Unproven

This iteration deliberately did not attempt to design or implement one —
consistent with `docs/history/iteration-9/SCOPE.md`'s own "smallest
viable" constraint, and with this project's evidence-before-redesign
discipline. Two directions were named in `docs/history/iteration-9/REPORT.md`'s
"Recommended next-step validation" (correlating a refusal with the
agent's own stated need for it; scoping refusals to only the Work
Package's own declared `components`/`capabilities`) but neither was
evaluated, chosen, or built.

### How To Validate

A future iteration would need to implement one candidate signal and
re-run both this iteration's scenarios (Run 1's relevant refusal, Run
3's irrelevant one) to check whether it correctly classifies both —
`RunBlocked` for the first, `RunCompleted` for the second — which
neither the pure agent-text approach (Iteration 8) nor the naive backend
rule (this iteration) achieves simultaneously today.

---

## Biggest Surprise

Not that over-triggering occurred — the review that scoped this
iteration named it as a real, live possibility, not a formality. The
surprise is how little manufacturing it took, and how much it took to
*avoid* manufacturing it. The first attempt at the irrelevant-refusal
scenario (Run 2) was too honest: framing the check as "entirely optional,
skip if you like" produced an agent that correctly never attempted it at
all — a real, good result, but not evidence about the question being
asked. Only a smaller rhetorical shift — "worth checking as a matter of
good practice" instead of "skip if you like," the *same underlying facts*
— was enough to produce the over-trigger. This says something worth
carrying forward distinctly from the over-trigger finding itself: whether
this specific risk manifests may depend more on how an instruction is
phrased than on the task's actual structure, which is its own kind of
fragility, not fully captured by classifying the outcome as simply
"over-triggers" or "does not."

---

## Final Verdict

**What does Project Nexus now know?** That `context-insufficient` can be,
and now is, classified from real backend observations rather than agent
text, confirmed by a live run where the backend path demonstrably
decided the outcome. That the simplest possible backend rule for doing
so — any observed refusal, unconditionally — is real, demonstrated,
too coarse: it misclassified a genuinely successful, complete run as
blocked, in a scenario that required no contrivance to produce.

**What does Project Nexus still only believe?** That a better rule
exists that avoids this over-triggering while remaining backend-derived
— named as a direction, not designed or built. That the two candidate
directions sketched in the Report would actually work — neither was
attempted.

**What architectural bets remain highest risk?** The refined
backend-classification rule is now the most concrete, immediately
actionable open question in the project — more concrete than
`ArtifactProduced` (still gated on the undeferred real output path) or
`architecture-change-required`/`mapping-missing` (still gated on tools
that do not exist), because this one has two full real scenarios already
on record to validate any candidate rule against, without needing new
seed data or a new live run to get started.
