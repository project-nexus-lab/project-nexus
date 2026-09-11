# Iteration 10 Lessons

Not a status report (`docs/history/iteration-10/REPORT.md` is) and not a
roadmap. What this iteration's investigation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 10 asked whether the eight named graph traversals hold up past
toy scale — Open Question #3, unresolved since Iteration 0. They do, at
the scale tested (~1,350 elements): all eight, plus `governanceOfElements`,
remain correct (1,158/1,158 independently-verified checks) and fast
(sub-1.1ms average per call). More interesting than the headline result:
two of this iteration's own scope document's specific technical
predictions — which columns lack index coverage, and how
`governanceOfElements`'s anchor set grows — turned out to be based on
plausible-sounding readings of the code that did not survive a closer
read of the actual SQL and TypeScript, caught only during implementation.
The traversals held up not because those specific instincts were right,
but because this domain's supporting join tables stay naturally small
relative to total element count — a different, more precise reason than
the one originally suspected.

---

## Validated

### Assumption

The eight named graph traversals, plus `governanceOfElements`, remain
correct and fast (sub-1.1ms average per call) against a synthetic graph
of realistic mid-size-organization scale (~1,350 elements, ~1,920
provisions, ~1,481 dependencies, ~304 decisions+constraints).

### Status

VALIDATED — for the specific scale tested.

### Evidence

`investigate-graph-scale.ts`: 1,158 of 1,158 correctness checks passed,
each checked against an expected result computed independently in plain
TypeScript from the same generation parameters, not against the SQL
traversal's own logic re-derived. Timing captured for every traversal at
both scale and toy size, in the same run, on the same machine.

### Consequence

Resolves the mechanical half of Open Question #3 for the tested scale.
The traversal layer requires no design change to hold at this scale — see
Unproven, below, for what "at this scale" does not cover.

---

## Invalidated

### Assumption 1

No index exists on `parent_id`, `from_id`, `predecessor_id`, and several
other named columns, implying a real performance risk for `ancestry`,
`impactOf`, and `resolve` at scale — stated as "What We Know" in
`docs/history/iteration-10/SCOPE.md`.

### Status

INVALIDATED (corrected, not merely unproven)

### Evidence

Reading `db/migrations/0007_graph.sql` directly during implementation:
all three traversals join their recursive CTE against the *leading*
column of an existing composite primary key, already index-backed. The
genuinely uncovered columns are narrower — `element_provision
.capability_id`, `decision_scope.element_id`, and `repository_component
.component_id` — and even those show no measurable effect at the tested
scale, because their backing tables stay small (hundreds to ~2,000 rows).

### Consequence

The scope document's own technical premise was wrong, not merely
untested. This is recorded as Invalidated rather than silently corrected
in the Report alone, because it is exactly the kind of claim
`docs/PROJECT_KNOWLEDGE.md` exists to track precisely.

### Assumption 2

`governanceOfElements`'s anchor set widens with a wide execution
profile's `context_depth` (via `impactOf`), making a wide profile the
real driver of its N-sequential-round-trips cost.

### Status

INVALIDATED

### Evidence

Reading `src/workpackage/build.ts` directly: Step 4's `impactOf`-widened
`impactedComponents` set feeds a separate field (documented in the code
as existing "to feed a future run-scoped MCP grant") and is never merged
into the governance anchor set built in Step 6. The real lever is a task
affecting many capabilities directly, not profile widening.

### Consequence

The underlying concern (an N-sequential-round-trips pattern with a real,
linear cost) is still real and still confirmed — see the new Unproven
entry, below — but the *cause* named in the original scope was wrong.
Corrected in `investigate-graph-scale.ts` before drawing conclusions from
it, not left to produce a measurement of the wrong thing.

---

## Unproven

### Assumption

`governanceOfElements`'s linear per-round-trip cost (~1ms/anchor,
confirmed) is not a real problem in practice, because real tasks rarely
affect enough capabilities directly for the anchor set to grow large.

### Why It Remains Unproven

This iteration measured the cost curve (2 anchors ≈ 2ms; 80 anchors ≈
79ms) against a synthetic 40-capability task it constructed itself, not
against any real usage pattern. Whether real tasks commonly affect enough
capabilities to make this cost matter is unknown.

### How To Validate

Once real Work Packages exist at any volume, measure the actual
distribution of capabilities-affected-per-task; if a meaningful fraction
affect dozens, batching `governanceOfElements` into one SQL call (instead
of N sequential ones) becomes a concrete, evidenced next step rather than
a speculative optimization.

### Assumption (carried forward, narrower)

Whether the traversal layer holds at a scale meaningfully larger than
this iteration's ~1,350 elements — 10x or 100x — remains untested.

### Why It Remains Unproven

This iteration deliberately tested one stated scale
(`docs/history/iteration-10/SCOPE.md`'s own disclosed limit), not the
true breaking point.

### How To Validate

Re-run `investigate-graph-scale.ts` with larger `GraphParams` if and when
a concrete reason to expect a real project might approach that scale
exists — not speculatively, per this project's evidence-before-redesign
discipline.

---

## Biggest Surprise

Not that the traversals held up — that the two most specific, most
confidently-stated technical claims in this iteration's own scope
document (which columns lack index coverage; how the governance anchor
set grows) were both wrong in ways only caught by reading the actual
code during implementation, not during scoping. The scope document was
not careless — both claims were plausible, internally consistent, and
went unchallenged through the scope's own review — but neither had been
checked against the literal SQL join conditions or the literal call
graph in `build.ts` before being written down as "What We Know." This is
itself evidence for a narrower version of this project's own standing
discipline: a claim about *why* code behaves a certain way needs the same
"checked directly, not assumed" standard as a claim about *whether* it
does.

---

## Final Verdict

**What does Project Nexus now know?** That its graph traversals are
correct and fast at a synthetic, mid-size-organization-shaped scale
(~1,350 elements) — not because of any index or design decision but
because this domain's supporting join tables (provisions, governance
attachments, repository mappings) stay naturally small relative to total
element count. That `governanceOfElements`'s N-sequential-round-trips
design has a real, linear, well-understood cost (~1ms/round-trip),
currently trivial for a typical task and measurable (~79ms) for a task
affecting dozens of capabilities directly.

**What does Project Nexus still only believe?** That this cost does not
matter in practice — dependent on real task shape this project has no
data on yet. That the traversal layer would still hold at a much larger
scale — untested in either direction.

**What architectural bets remain highest risk?** The refined `RunBlocked`
backend signal (Iteration 9) remains the most concrete open question with
existing real-run evidence to validate against. Graph scale is no longer
the most pressing open question at this iteration's tested size, but
narrows, rather than closes, into two smaller questions: real task
capability-count distribution, and behavior at a meaningfully larger
scale.
