# Iteration 10 Scope — do the graph traversals hold up past toy scale?

This is a scope document, not a report. Nothing described here has been
built. It answers `docs/PROJECT_KNOWLEDGE.md`'s Open Question #3,
unresolved since Iteration 0: every named traversal is correctness-proven
against small, hand-written fixtures, never measured against a graph
resembling a real organization's architecture. Prompted directly by this
session's own discussion of what a Product Owner / Architect interface to
Nexus would need — before building any authoring surface on top of the
graph, it is worth knowing whether the graph itself holds up once it is
not toy-sized. Per the user's own framing: validate foundational
assumptions before building higher-level functionality on top of them.

---

## Question Under Test

Do the eight named graph traversals (§8.4 of
`docs/MVP_ARCHITECTURE_V2.md`: `ancestry`, `providersOf`, `capabilitiesOf`,
`implementationPath`, `impactOf`, `governanceOf`, `resolve`,
`localSubgraph`) remain **correct** and **reasonably fast** against a
graph sized and shaped like a real organization's architecture, rather
than the handful of elements every existing test seeds?

---

## What We Know

Checked directly in this session, not carried over from memory:

- `graph.ancestry`, `graph.impact_of`, and `graph.resolve`
  (`apps/backend/db/migrations/0007_graph.sql`) are all recursive CTEs
  walking `parent_id`, `element_dependency.from_id`, and
  `element_succession.predecessor_id` respectively.
- No index exists on any of those columns, nor on
  `element_provision.component_id`/`capability_id`,
  `repository_component.component_id`, `decision_scope.element_id`, or
  `element_constraint.element_id` — confirmed by grepping every
  `create index` statement across `apps/backend/db/migrations/`. Only two
  indexes exist in the whole schema, both `unique` constraints for the
  "at most one primary provider" rule, not traversal support.
- `governanceOfElements` (`src/graph/traversals.ts`, used by Work Package
  generation's Step 6, `src/workpackage/build.ts`) calls `governanceOf`
  once per element **in a TypeScript loop**, not as one batched query —
  confirmed by reading the function directly. `anchorElementIds`
  (`build.ts`) is `resolvedCapabilities ∪ resolvedComponents`, which
  widens with a profile's `context_depth` (§11.2 step 4, `impactOf`) — a
  wide profile against a well-connected component graph means this loop
  runs many sequential round trips per single Work Package generation
  call, not one.
- `apps/backend/src/db/client.ts`'s own doc comment: PGlite (embedded,
  wire-compatible Postgres) is not a toy stand-in swapped out later for a
  "real" database — it is the actual database this project runs today,
  in both tests and `serve.ts`. A scale test against PGlite is testing
  the real thing, not a fake.
- Every existing test seeds single-digit to low-tens element counts, one
  subsystem deep, confirmed by the seed data in `test/*.test.ts` and the
  `investigate-*.ts` scripts read this session (`comp.iter8-target`,
  `comp.iter9-target`, etc.) — never anything wider or deeper.
- Containment depth (product → domain → subsystem →
  component/capability) is fixed by the kind hierarchy regardless of
  total element count — `ancestry`'s recursion depth does not grow with
  scale, only its per-level scan cost might. `impactOf`'s recursion depth
  is not fixed the same way — it depends on the real shape of
  `element_dependency`, which could be genuinely deep or highly
  fan-out at real scale. These are two different risks, not one, and
  should not be conflated in how results are read.

---

## What We Only Believe

1. **That the traversals remain correct, not only fast-or-slow, once the
   graph is large** — no traversal has ever been checked against an
   independently-computed expected answer at scale, only against small
   fixtures with obviously-correct-by-inspection results.
2. **That query latency stays acceptable as element count and dependency
   density grow** — genuinely unknown; not measured once, in either
   absolute terms or relative to a smaller-scale baseline.
3. **That the missing indexes are the actual bottleneck, if one exists**
   — plausible from the schema alone, but not confirmed; a different
   cause (e.g. `governanceOfElements`'s N sequential round trips) could
   dominate before any single recursive CTE's cost does.
4. **That a single chosen scale is representative** — this iteration
   tests one stated scale, not the true breaking point; if it passes
   cleanly, that says less about "traversals hold at scale" in general
   than it says about "traversals hold at *this* scale," and should be
   reported as such.

---

## Smallest Viable Investigation

A new `investigate-graph-scale.ts` (outcome unknown, per this project's
`investigate-*.ts` naming convention — not `verify-*.ts`):

- Generates one synthetic architecture graph at a stated scale: on the
  order of **1,000–2,000 elements** total across products / domains /
  subsystems / components / capabilities, with several hundred
  `dependsOn` edges including some genuine multi-hop chains (to exercise
  `impactOf` at `depth > 1` meaningfully, not just depth 1), and a
  handful of decisions/constraints attached at varying containment
  depths. This is a disclosed judgment call about "realistic mid-size
  organization" shape, not evidence-backed itself — named as a limit,
  not hidden.
- Runs all eight traversals against it, including `governanceOfElements`
  invoked with a realistic multi-element `anchorElementIds` set (not a
  single id), to exercise the real N-round-trip shape Work Package
  generation actually produces.
- Checks correctness against an independently computed expected answer
  for each traversal (e.g. a known ancestry chain length and ordering, a
  known set of providers/dependents), not merely "it returned without
  error."
- Times each traversal and compares against the same traversal run
  against a small baseline graph (the shape of today's existing test
  fixtures) — the finding is about the *scaling curve*, not one
  unanchored absolute number, since PGlite may simply be slower than a
  networked Postgres regardless of indexing.

**Stays unchanged unless evidence demands otherwise**: the traversal
SQL itself, the schema, `governanceOfElements`'s call shape,
`workpackage/build.ts`.

**May change, only if measurement shows a clear, specific cause**: add
an index (a purely additive, low-risk DB change) to the column(s) shown
to matter — the same investigate-then-fix pattern Iteration 7 used for
`getAncestry`'s redaction, not a speculative index added without a
measured cause.

---

## Evidence Plan

**New evidence required:**
1. Do all eight traversals still produce correct results at the tested
   scale?
2. What is each traversal's wall-clock cost at the tested scale, relative
   to the existing toy-scale baseline?
3. Does `governanceOfElements`'s N-round-trip pattern become a measurable
   bottleneck before, at the same time as, or after any single recursive
   CTE's own cost does?
4. If a bottleneck is found, does adding the relevant index(es) resolve
   it, re-measured on the same graph — not assumed to work because it is
   the obvious fix?

**Failure modes, named directly:**
- A traversal degrades unacceptably and the cause is not indexing at all
  (e.g. `impactOf`'s CTE walking an unexpectedly dense dependency graph,
  or `governanceOfElements`'s round-trip count itself) — in which case
  adding an index would not fix it, and the real cause becomes a named
  follow-up, not force-fit into this iteration's smallest viable fix.
- The chosen scale (1,000–2,000 elements) turns out too small to surface
  anything — a real, informative negative result, not a wasted one; it
  would narrow, not answer, the Open Question, the same way Iteration 8's
  Run 2 narrowed rather than answered its own question.
- PGlite itself (not the schema) turns out to be the dominant cost at
  scale — a finding about this project's current database choice, not
  about the traversal design, and should be reported as that distinction
  precisely.

---

## Acceptance Criteria

1. A synthetic graph generator produces a graph at the stated scale with
   the stated shape (fixed containment depth, real breadth, a non-trivial
   multi-hop dependency graph).
2. Each of the eight traversals is checked for correctness against an
   independently computed expected result at that scale, not merely
   "returns without throwing."
3. Wall-clock timing is captured per traversal and compared against a
   toy-scale baseline run in the same script, in the same session, on the
   same machine — not compared against an assumed or remembered number.
4. `governanceOfElements` is exercised with a realistic multi-element
   `anchorElementIds` set, matching how Work Package generation actually
   calls it, not a single-element call.
5. If a genuine bottleneck is found and traced to a specific missing
   index, the index is added and the same measurement is re-run to
   confirm the fix — not assumed to have worked.
6. `npm test` remains fully hermetic and unaffected — the scale
   investigation is a standalone `investigate-*.ts` script, the same
   pattern every prior investigation this project has run, not folded
   into the existing test suite's fixtures.

---

## Explicit Deferrals

- **Incremental architecture/feature authoring** (a write path letting a
  Product Owner or Architect grow an existing graph over time, rather
  than the current one-shot bulk YAML import) — raised this session as
  the next concrete step toward a real PO/architect interface, but
  explicitly **not prioritized now**: this project validates foundational
  assumptions before building higher-level functionality on top of them,
  and whether the graph itself holds at real scale is more foundational
  than whether it can be authored incrementally. Recorded as a new Open
  Question in `docs/PROJECT_KNOWLEDGE.md`, not scoped here.
- Any redesign of the traversal layer itself (denormalization,
  materialized views, pagination/streaming for large result sets, a
  different database engine) — out of scope unless this iteration's own
  evidence shows an index-only fix is clearly insufficient, in which case
  it becomes a named follow-up, not attempted inside this iteration.
- Claiming the synthetic graph matches any real organization's actual
  architecture — it does not; it is a stated, disclosed approximation of
  scale and shape, not a claim about any specific customer's data.
- The refined backend signal for `RunBlocked` over-triggering (Iteration
  9's own Unproven entry) — unrelated, untouched.
- `ArtifactProduced` and the real output path — unrelated, untouched.
