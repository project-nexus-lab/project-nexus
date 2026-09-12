# Iteration 14a Lessons

Not a status report (`docs/history/iteration-14a/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 14a closed Open Question #5, whose stated precondition ("a
real authoring path exists") had been satisfied since Iteration 12 but,
checked directly, turned out to be a different authoring path than the
one this question actually needed — Architecture element authoring, not
a way to populate a Work Package field. Deciding between automatic
derivation and human declaration was this iteration's first job, settled
by direct evidence before any code was written: neither of Iteration
9/11's own reusable scenarios encodes its required/optional distinction
as a graph edge, so automatic derivation cannot work, not merely wasn't
tried. A plain declared table, read by `buildWorkPackage()` for the
first time, reproduces both scenarios' known-correct values exactly and
leaves their already-validated classification outcomes unchanged,
confirmed by two live agent runs.

---

## Validated

### Assumption

A plain, human-declared table (`work.work_item_related_element`), read
by `buildWorkPackage()` for the first time, correctly populates
`relatedElements` and leaves Iteration 9/11's own validated `RunBlocked`
classification outcomes unchanged.

### Status

VALIDATED

### Evidence

`investigate-related-elements-authoring.ts`: both of Iteration 9's and
Iteration 11's own reusable scenarios were reproduced with fresh
elements/tasks, declared through the new table instead of a hand-typed
literal. `buildWorkPackage()`'s real output matched each scenario's
known-correct `relatedElements` value exactly (checked by direct
comparison, not "returned without error"). That real payload was then
fed into a live agent run for each scenario: the required case produced
`RunBlocked` (reason `context-insufficient`); the optional case produced
`RunCompleted` — the same outcomes Iteration 11 validated with a
hand-typed literal, now reproduced with nothing hand-typed anywhere in
the `relatedElements` path itself.

### Consequence

Closes `docs/PROJECT_KNOWLEDGE.md` Open Question #5's core claim: a real
mechanism for populating `relatedElements` exists, is connected to
`buildWorkPackage()`, and does not change the classification behavior
already proven correct.

---

## Invalidated

### Assumption

That automatic derivation of `relatedElements` from graph structure was
an open design alternative to human declaration, undecided pending
implementation experience.

### Status

INVALIDATED — before any code was written, by reading both reusable
scenarios' actual seed data directly.

### Evidence

`comp.iter8-target`/`comp.iter8-upstream` (required) and
`comp.iter9-target`/`comp.iter9-related` (optional) are each siblings
under the same subsystem, with zero `element_dependency` rows and zero
shared `element_provision` rows between the target and the related
component — in *both* scenarios, identically. The two scenarios are
structurally indistinguishable from each other; only acceptance-criteria
prose ever recorded which one was required. Any heuristic keyed on
`dependsOn`, `impactOf`, or shared containment would treat both
scenarios identically, unable to reproduce the correct split for either.

### Resolution

Not a partial fix — automatic derivation was set aside entirely before
implementation, in favor of a declared table, on the grounds that no
graph-structural signal exists to derive from in the only evidence this
iteration was required to reuse.

### Consequence

This is the second time this exact shape of finding has occurred in
this project's history — Iteration 11 found `McpGrant`'s own widening
radius made graph-proximity structurally incapable of ever matching a
genuine refusal; this iteration finds the *population* question has the
same structural ceiling, for the same underlying reason: the fact that
distinguishes relevance from irrelevance in this project's own test
scenarios has only ever existed as prose, never as a graph edge. Any
future iteration proposing a graph-structural signal for anything in
this neighborhood should check for a real edge in its own evidence
first, not assume one can be added without changing what's being tested.

---

## Unproven

### Assumption

An incomplete, human-authored `relatedElements` set — one that omits a
genuinely necessary element — will not cause `classifyResultMessage` to
misclassify a task-blocking refusal as `RunCompleted`, now that the set
comes from a real, human-fallible table rather than a scenario-matched
literal.

### Why It Remains Unproven

This is Iteration 11's own named fail-safe risk (discovered during that
iteration's `/review`, not its implementation), and it remains exactly
as untested as it was then. Both of this iteration's own live runs used
declared sets that were, by construction, complete for their scenario —
neither tests a refusal landing on an element the declared set omits.
Making the population mechanism real (rather than hand-typed to a known
answer) makes incompleteness a more realistic failure mode than before —
a human can simply forget to declare something — but this iteration did
not construct a scenario to test it.

### How To Validate

Build a third scenario: a task whose declared `relatedElements` names
some elements but omits one that a real refusal will land on, and check
directly whether the `BLOCKED:` text fallback still catches it or the
run is incorrectly classified `RunCompleted`. Neither of Iteration 9/11's
own reusable scenarios can be reused for this — both are complete by
construction.

---

### Assumption

`relatedElements` is safe to leave unresolved through succession, the
same way every other `WorkPackagePayload` array is guaranteed to be.

### Why It Remains Unproven

Discovered during `/review`, not during implementation. `capabilities`
and `components` are both run through `resolveAndCheckRetired` — an id
that has been superseded is translated forward, and one retired without
succession fails the gate outright. The new `relatedElementRows` query
returns `element_id` raw, with neither. A related element superseded
after being declared would leave `relatedElements` naming a permanently
stale id, silently unable to ever match a real refusal again.

### How To Validate

Not an experiment to run blind — a design decision to make with a
concrete scenario (declare a related element, supersede it via a real
proposal, call `buildWorkPackage()` again, observe what `relatedElements`
contains and whether classification still works): silent translation
through `resolve()` alone, no resolution at all (today's behavior), or a
distinct error that doesn't gate the whole Work Package the way
`retired-without-succession` does for required fields. Whichever
`buildWorkPackage()`-touching iteration is next should decide this
deliberately, not by continuing to extend the function without deciding.

---

## Biggest Surprise

Not the derivation-vs-declaration decision — `docs/history/iteration-14a/SCOPE.md`
settled that before any code was written, from evidence already sitting
in both scenarios' own seed data. The surprise was smaller and more
mechanical: `canonicalize()` (`canonicalize.ts`) only sorts arrays whose
elements are all primitives, checked while writing the new query, not
assumed from the existing pattern every other array field
(`capabilities`, `components`, `decisions`, ...) already relies on.
`relatedElements` holds objects, so it is the first `WorkPackagePayload`
array `buildWorkPackage()`'s own `order by` clause has ever had to make
deterministic by itself, rather than trusting `canonicalize()` to do it
downstream. Untested, this would have been a real, silent violation of
§11.1's purity guarantee — a Work Package whose `relatedElements` order
depended on Postgres's own unspecified row order rather than graph
state. Caught by reading `canonicalize()` directly while writing the
new step, and confirmed by a hermetic test that seeds the two rows out
of order on purpose.

---

## Final Verdict

**What does Project Nexus now know?** That `relatedElements` has a real,
working authoring path — a plain declared table, not graph derivation —
and that connecting it to `buildWorkPackage()` for the first time does
not disturb the classification mechanism Iteration 11 already validated.
Open Question #5 is resolved for the mechanism that was actually
missing, not the one its own precondition text assumed was missing.

**What does Project Nexus still only believe?** That this mechanism's
fail-safe behavior under a genuinely incomplete declared set matches
Iteration 11's own naive-rule fallback correctly — entirely untested,
carried forward unchanged from Iteration 11's own `/review` finding.

**What architectural bets remain highest risk?** Whether a real
PO/architect, given this table and nothing more, reliably declares
complete `relatedElements` sets in practice — this iteration proves the
mechanism works when the declaration is correct, not that correct
declarations are what a real author will actually produce.
