# Iteration 11 Lessons

Not a status report (`docs/history/iteration-11/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 11 asked whether a backend-derived signal exists that
correctly distinguishes a task-blocking refusal from one the agent
legitimately worked around — Iteration 9's own paired Unproven entry.
Scoping the question first (before writing any code) found that neither
of Iteration 9's own two named candidates, nor a third the scoping
process itself surfaced, could work: a refusal is, by construction,
always for an element outside `McpGrant`'s own widening radius, so no
graph-proximity or declared-membership signal could ever fire on a real
refusal. What survived that analysis — declaring relevance structurally
in the Work Package itself, rather than inferring it from anything
observed at runtime — was built, and validated cleanly: both of
Iteration 9's own real scenarios, re-run live with the new field
populated, now classify correctly. Iteration 9's own naive rule is kept,
unconditionally, for any Work Package that declares nothing.

---

## Validated

### Assumption

A backend-derived signal — the Work Package's own declared
`relatedElements` field, checked against which specific element a
refusal targeted — correctly distinguishes a task-blocking refusal from
one the agent legitimately worked around, without any reliance on
agent-authored text.

### Status

VALIDATED

### Evidence

Two real, live re-runs of Iteration 9's own scenarios, not new ones:
Run 1 (`docs/history/iteration-11/REPORT.md`) reproduces the relevant
refusal (`comp.iter8-upstream`, declared `required: true`) and correctly
produces `RunBlocked`, decided by the declared-relevance check alone
(the agent's text also matched the `BLOCKED:` convention, but was not
consulted for the decision). Run 3 reproduces the irrelevant refusal
(`comp.iter9-related`, declared `required: false`) — the exact scenario
Iteration 9's own naive rule over-triggered on — and correctly produces
`RunCompleted`. Both checked at the protocol level (`h.toolResults`'
`elementId` field, correlated from real tool calls), not inferred from
either run's prose.

### Consequence

Closes Iteration 9's own paired Unproven entry directly: a backend
signal exists, given the current schema, that correctly classifies both
previously-adversarial cases simultaneously. `docs/PROJECT_KNOWLEDGE.md`
Open Question #5 is resolved for the mechanism; see Unproven, below, for
what remains open about populating it correctly.

---

## Invalidated

### Assumption

That a refined backend-derived signal could be built purely from
observable runtime facts — graph proximity to the declared scope, or
membership in the declared `components`/`capabilities` fields — without
requiring the Work Package to declare anything new. Named as two
candidate directions in `docs/history/iteration-9/REPORT.md`'s own
"Recommended next-step validation," plus a third (graph proximity via
`impactOf`) explored while scoping this iteration.

### Status

INVALIDATED — before any code was written, by reading the actual code.

### Evidence

`McpGrant.allowedElementIds` (`src/mcp/grant.ts`) is built as `declared
capabilities ∪ declared components ∪ impactOf(components,
profile.context_depth + 1)` — the grant itself already grants everything
within that graph-proximity radius. A real `GrantRefusedError` is
therefore, by construction, always for an element that is graph-distant
or graph-disconnected from the declared scope at that depth — a
proximity-based signal can never produce a positive match for a genuine
refusal, and declared-membership alone is circular for the same reason.
Confirmed directly against the function, not inferred.

### Resolution

Not a partial fix — the entire direction was set aside before
implementation, in favor of declared (not inferred) relevance, which the
evidence above shows is the only viable path given today's schema.

### Consequence

This narrows what future work on `RunBlocked` classification should even
attempt: any future refinement should assume declared metadata is the
right shape, not spend further effort on inferring relevance from graph
structure or grant membership, both now shown structurally incapable of
it, not merely untested.

---

## Unproven

### Assumption

Work Package generation (`buildWorkPackage()`), or a future PO/architect
authoring tool, can populate `relatedElements` correctly for a real
task — deciding which out-of-grant elements are genuinely required
versus merely worth checking.

### Why It Remains Unproven

This iteration's own two scenarios had their "correct answer" decided by
this iteration's author, matching what each scenario's acceptance-criteria
prose already said — the same hand-authoring `investigate-*.ts` scripts
already do for `acceptanceCriteria` itself. Nothing in this iteration
tests whether that judgment can be made reliably, automatically, or by a
real architect working from a real task.

### How To Validate

Squarely Iteration 12's own scoped territory (incremental architecture
authoring) and the roadmap's next step: once a real authoring path
exists, check whether `relatedElements` populated through it — rather
than hand-authored to match a known-correct answer — still classifies
correctly.

---

## Biggest Surprise

Not that the mechanism worked — that scoping this iteration correctly
before writing any code required discovering that the two most obvious
candidate signals (graph proximity, declared-scope membership) were not
merely risky but *logically incapable* of ever firing, because the grant
that produces refusals is itself already built by widening through
exactly that same graph proximity. This was not visible from Iteration
9's own Report, which named both candidates without testing either — it
only became visible by reading `src/mcp/grant.ts` directly while writing
this iteration's scope, the same "checked directly, not assumed"
discipline this project applies to code, applied here to a *design*
premise before any code existed to check.

---

## Final Verdict

**What does Project Nexus now know?** That `RunBlocked` (reason
`context-insufficient`) can be classified correctly for both a
task-blocking and a legitimately-worked-around refusal simultaneously,
using a Work-Package-declared `relatedElements` field and zero
agent-text parsing — confirmed against the same two real scenarios that
previously could not be classified correctly at the same time by any
prior approach. That graph proximity and declared-scope membership are
not viable signals for this question, structurally, not just untested.

**What does Project Nexus still only believe?** That this field can be
populated correctly outside of hand-authoring a known answer — untested
against any real task or authoring process.

**What architectural bets remain highest risk?** Whether Work Package
generation, or a future authoring surface, can reliably decide
required-vs-optional relevance is now the most concrete open question
with a clear next iteration already named (Iteration 12) — more concrete
than `ArtifactProduced` (still gated on the undeferred real output path)
or `architecture-change-required`/`mapping-missing` (still gated on tools
that do not exist).
