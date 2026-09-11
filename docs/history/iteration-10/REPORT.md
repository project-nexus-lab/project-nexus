# Iteration 10 Report — do the graph traversals hold up past toy scale?

Status: complete for the scope agreed in `docs/history/iteration-10/SCOPE.md`.
142 `node:test` cases pass (unchanged from Iteration 9 — this iteration
adds no new test file, only a new `investigate-*.ts` script). Two of the
scope document's own technical premises turned out to be wrong once
checked directly against the actual code, not just its own "What We
Know" section — both corrected during implementation, not silently, and
both change what this iteration's real findings mean.

## Scope completed

1. **`investigate-graph-scale.ts`** (new): a parameterized synthetic
   graph generator, used twice — once at "scale" (1,353 elements, 1,920
   provisions, 1,481 dependencies, 304 decisions+constraints, 50 tasks,
   50 repositories) and once at "toy" scale (13 elements, the same
   shape), so every timing comparison is the same query shape at two
   sizes, not two differently-shaped graphs.
2. **Correctness checked independently**, not merely "returns without
   error": every one of the eight named traversals, plus
   `governanceOfElements`, is checked against an expected result computed
   in plain TypeScript from the same generation parameters — a ground
   truth built independently of the SQL under test. **1,158 of 1,158
   checks passed** on the final run.
3. **Timing captured per traversal**, scale vs. toy, in the same script
   run, on the same machine — not an isolated absolute number.
4. **`governanceOfElements` exercised with a realistic multi-element
   anchor set** — see the correction below for what "realistic" turned
   out to mean.
5. No index was added. See "What was found," below — the evidence does
   not support one, so none was added speculatively, per the scope
   document's own explicit deferral.

## Two corrections made during implementation

Both found by reading the actual code this iteration touches, not
assumed from `docs/history/iteration-10/SCOPE.md`'s own "What We Know" —
which itself, in hindsight, stated plausible-sounding but not fully
verified claims. Disclosed here because both change what the resulting
measurements mean.

### 1. The "missing index" list was broader than the actual risk

The scope document said no index exists on `parent_id`, `from_id`,
`predecessor_id`, `element_provision`'s columns, `repository_component
.component_id`, and `decision_scope`/`element_constraint.element_id` —
true as a literal `create index` inventory, but incomplete as a
performance claim. Reading `db/migrations/0007_graph.sql` directly:
`ancestry`, `impactOf`, and `resolve` all join their recursive CTE
against the *leading* column of an existing composite primary key
(`element.id`, `element_dependency(from_id,to_id)`,
`element_succession(predecessor_id,successor_id)`) — each already gets
an index-backed lookup for free. `element_constraint.element_id` is
similarly already the leading column of its own PK. The genuinely
uncovered columns are `element_provision.capability_id` (PK leads with
`component_id`), `decision_scope.element_id` (PK leads with
`decision_id`), and `repository_component.component_id` (PK leads with
`repository_id`) — the three real suspects, not all eight traversals
equally.

### 2. `governanceOfElements`'s anchor set does not widen with profile `context_depth`

The scope document assumed a wide execution profile would widen the
governance anchor set via `impactOf`, creating a large N for the
N-sequential-round-trips pattern. Reading `src/workpackage/build.ts`
directly: Step 4's `impactOf`-widened `impactedComponents` set feeds a
separate field (documented in the code itself as existing "to feed a
future run-scoped MCP grant") and is **never merged into
`anchorElementIds`** (Step 6). The real lever for a large anchor set is
a task affecting many capabilities directly
(`work.work_item_capability`), not profile widening. The script was
rewritten to build the anchor set exactly the way `build.ts` does —
`resolvedCapabilities ∪ resolvedComponents` (primary provider per
capability, the default profile) — and to test two real shapes: a
typical single-capability task, and one task deliberately affecting many
capabilities (`task.scale-wide`, 40 capabilities), rather than an
`impactOf`-widened guess at what "realistic" meant.

## What was found

```
--- scale graph (1353 elements, 1920 provisions, 1481 dependencies, 304 decisions+constraints, 50 tasks) ---
ancestry:            avg 0.574ms/call over 150 calls
providersOf:         avg 0.338ms/call over 150 calls
capabilitiesOf:      avg 0.187ms/call over 150 calls
impactOf(depth=5):    avg 0.966ms/call over 150 calls
governanceOf:        avg 1.045ms/call over 150 calls
resolve:             avg 0.233ms/call over 150 calls
localSubgraph:       avg 1.056ms/call over 150 calls
implementationPath:  avg 0.460ms/call over 50 calls
governanceOfElements (typical, 2 anchors): avg 2.075ms/call over 5 calls
governanceOfElements (wide, 80 anchors):    78.983ms for 1 call

--- toy graph (same shape, baseline) (13 elements, 5 provisions, 7 dependencies, 6 decisions+constraints, 3 tasks) ---
ancestry:            avg 0.290ms/call over 10 calls
providersOf:         avg 0.161ms/call over 5 calls
capabilitiesOf:      avg 0.277ms/call over 5 calls
impactOf(depth=5):    avg 0.242ms/call over 5 calls
governanceOf:        avg 0.507ms/call over 10 calls
resolve:             avg 0.234ms/call over 5 calls
localSubgraph:       avg 0.669ms/call over 5 calls
implementationPath:  avg 0.309ms/call over 3 calls
governanceOfElements (typical, 2 anchors): avg 1.027ms/call over 3 calls
governanceOfElements (wide, 8 anchors):    4.628ms for 1 call

--- Correctness ---
1158 passed, 0 failed
```

**Correctness holds at this scale**, for all eight traversals and
`governanceOfElements`, checked against independently computed expected
results — not assumed from "it ran without throwing."

**No single traversal shows a measurable degradation traceable to
indexing at this scale.** All eight remain under 1.1ms average, roughly
2–4x the toy baseline — consistent scaling, not a cliff. This holds even
for the three traversals identified above as genuinely lacking a
covering index (`providersOf`, `governanceOf`, `implementationPath`),
because their supporting join tables stay small at this element count:
`element_provision` (1,920 rows), `decision_scope`+`element_constraint`
(304 rows), `repository_component` (50 rows). This project's own domain
shape means these tables do not grow 1:1 with total element count — a
sequential scan of a few hundred to ~2,000 rows is not where an in-memory
engine's cost shows up. **No index was added**: the evidence does not
support one, and the scope document explicitly says not to add one
speculatively without a measured cause.

**`governanceOfElements`'s real cost is exactly what its own N-sequential-
round-trips design predicts, and nothing more**: ~1ms per round trip at
scale (matching `governanceOf`'s own average almost exactly — 78.983ms /
80 anchors ≈ 0.987ms, versus `governanceOf`'s measured 1.045ms average),
~0.58ms per round trip at toy scale. The typical case (one capability, 2
anchors) costs ~2ms — trivial. The deliberately wide case (40
capabilities, 80 anchors) costs ~79ms for one Work Package generation
call — real, measurable, and linear in anchor-set size, not a surprise
blowup. This is not an indexing problem — indexing would not reduce the
*number* of round trips — so the scope's conditional fix path ("if a
bottleneck is found and traced to a specific missing index, add it") does
not apply here. This is one of the SCOPE document's own named failure
modes materializing honestly: a real cause found, that is not indexing at
all.

## Scope deferred

Exactly as `docs/history/iteration-10/SCOPE.md` listed: any redesign of
the traversal layer (denormalization, materialized views,
pagination/streaming, a different database engine); the claim that the
synthetic graph matches any real organization's actual architecture (it
does not — a disclosed, stated approximation of scale and shape); the
refined `RunBlocked` backend signal (Iteration 9); `ArtifactProduced` and
the real output path. Incremental architecture/feature authoring
(`docs/PROJECT_KNOWLEDGE.md` Open Question #6) remains explicitly not
prioritized, unchanged by this iteration.

## Technical debt intentionally created

None from a code-change perspective — no index was added, no traversal
was modified. The debt this iteration leaves is a *named, evidenced* one:
`governanceOfElements`'s linear round-trip cost for a task affecting many
capabilities directly is real and unaddressed (batching it into one SQL
call, rather than N sequential calls, is the obvious next design — not
attempted here, since this iteration's job was to measure, not redesign).

## Demonstrations and verification

```
npm run typecheck               # clean
npm test                         # 142/142, fully hermetic, zero network access
npm run investigate:graph-scale # 1158/1158 correctness checks passed; see timings above
```

## Recommended next-step validation

Two real, narrower next steps, neither attempted here:
1. Whether `governanceOfElements`'s linear round-trip cost is actually a
   problem depends on how many capabilities a real task typically
   affects directly — unknown against real usage, only tested against
   this iteration's own synthetic 40-capability case. If real tasks
   rarely affect more than a handful of capabilities, this cost may never
   matter in practice.
2. Whether any traversal degrades at a meaningfully larger scale (10x or
   100x this iteration's ~1,350 elements) remains untested — this
   iteration answers "does it hold at ~1,350 elements," not "where is the
   actual breaking point."
