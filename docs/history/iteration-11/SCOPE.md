# Iteration 11 Scope — does a backend-derived signal for refusal relevance exist at all, given today's schema?

This is a scope document, not a report. Nothing described here has been
built. It follows the roadmap set after Iteration 10 closed ("Refined
`RunBlocked` classifier"), and directly answers `docs/PROJECT_KNOWLEDGE.md`
Open Question #5. The question this document actually scopes is narrower,
and differently shaped, than "refined classifier" suggested going in —
see "What We Know," below, for why.

---

## Question Under Test

Iteration 9 left one Unproven entry: a backend-derived signal that
correctly distinguishes a task-blocking refusal from one the agent
legitimately worked around, without reintroducing agent-text parsing.
Its own Report named two candidate directions, neither evaluated. Before
building either, this scope re-examined both against the actual code —
and found both, plus a third candidate explored while scoping, to be
structurally unworkable given the *current* Work Package schema. The
real question this iteration tests is therefore:

**Does any purely runtime-inferred, backend-observable signal exist for
this distinction at all — or does correctly making it require the Work
Package itself to *declare* relevance structurally, rather than have it
inferred from what happens during the run?**

---

## What We Know

Checked directly against the actual code before writing anything else,
not carried over from Iteration 9's own Report:

- **`McpGrant.allowedElementIds`** (`src/mcp/grant.ts`) is built as
  `declared capabilities ∪ declared components ∪ impactOf(components,
  profile.context_depth + 1)` — the grant already widens by graph
  proximity, one hop past whatever the Work Package itself resolved.
  Confirmed by reading the function directly, not assumed.
- **Consequence, not previously stated anywhere in this project's
  history**: any element within that widening radius is already
  *granted*, never refused. A real `GrantRefusedError` is therefore, by
  construction, always for an element that is graph-*distant* from, or
  graph-*disconnected* from, the declared scope at the configured depth.
  A "how graph-close is the refused element to what was declared or
  already accessed" signal — a natural-seeming third candidate, not one
  of Iteration 9's own two, explored while scoping this iteration —
  cannot logically ever produce a positive match for a genuine refusal.
  This isn't an assumption to test carefully; it follows directly from
  how the grant itself is built.
- **Neither Iteration 8's nor Iteration 9's own investigate scenario ever
  encoded the claimed relatedness as a real `architecture.element_dependency`
  edge** — re-read directly: `comp.iter8-target`/`comp.iter8-upstream`
  and `comp.iter9-target`/`comp.iter9-related` are connected only by
  acceptance-criteria *prose* ("has historically depended on...", "a
  separate component... that historically logged..."), never by a graph
  edge. The distinguishing fact that made one refusal relevant and the
  other not has only ever existed as text, in both scenarios, not as
  structured data — which is itself evidence for the conclusion below,
  not an oversight to fix by adding an edge.
- **`docs/WORK_PACKAGE_SPEC.md`'s Schema section is a fixed, authoritative
  field list** (`id`, `task`, `feature`, `capabilities`, `components`,
  `repositories`, `files`, `constraints`, `acceptanceCriteria`,
  `decisions`) — adding a new field is a real spec change, not a silent
  addition to the TypeScript type alone.
- Aside, not chased further here: the *real* `buildWorkPackage()`
  (`src/workpackage/build.ts`) populates `acceptanceCriteria` with
  `ac.*` **ids**, not statement text — every `investigate-*.ts` script
  that has ever exercised `buildPrompt()`'s acceptance-criteria handling
  bypassed `buildWorkPackage()` entirely and hand-supplied full text
  directly. Whether `buildPrompt()` would need to resolve ids to
  statements for a *real* production run is a real, disclosed gap this
  iteration does not investigate or fix — orthogonal to the classification
  question, named so it is not silently rediscovered later.

---

## What We Only Believe

1. **That no purely backend-observable, runtime-inferred signal exists
   for this distinction given today's schema.** A strong claim that
   follows from the analysis above for every candidate considered so
   far — not exhaustively proven; a fourth candidate this iteration has
   not thought of might exist.
2. **That the distinction genuinely requires *declared*, not inferred,
   relevance metadata** — e.g. the Work Package itself naming specific
   out-of-grant elements a task may need, each tagged required or
   optional, decided at Work Package generation time. Consistent with
   R-1's own principle (Nexus decides state from what is declared or
   observed, not inferred from prose) applied one level earlier than
   Iteration 9 applied it — to the Work Package's own construction, not
   only to run classification. Untested: never scoped, built, or
   evaluated.
3. **That such a field, hand-populated the same way `investigate-*.ts`
   scripts already hand-populate `acceptanceCriteria`, would correctly
   classify both of Iteration 9's own real scenarios.** Untested.

---

## Smallest Viable Investigation

Deliberately not a "build the fix" iteration — Iteration 9's own
evidence-before-redesign discipline applies here just as it did to the
over-trigger finding. This iteration tests whether declared relevance is
viable at all, using the smallest structural addition that could show it:

1. **Add one new, optional, additive field** to the Work Package payload
   — `relatedElements: Array<{ elementId: string; required: boolean }>` —
   naming specific elements outside the resolved/granted scope a task may
   need, each tagged required or optional. Update
   `docs/WORK_PACKAGE_SPEC.md`'s Schema section to document it (a real
   spec change, not a silent TypeScript-only addition — see "What We
   Know").
2. **Thread it onto `ClaudeSdkAdapterHandle`** at `start()` time, the same
   way `telemetryContext`/`telemetryGrant` are already threaded from the
   opaque payload.
3. **Extend `classifyResultMessage`** (or a sibling function) to check,
   for each `isError: true` `toolResults` entry, whether its target
   element id appears in `relatedElements` with `required: true`. Only
   such a match produces `RunBlocked`. A refusal for an element not named
   at all, or named with `required: false`, does not — falls through to
   the unchanged `BLOCKED:` text convention, same as today.
4. **Re-run both of Iteration 9's own scenarios live** —
   `investigate-run-blocked.ts` and `investigate-blocked-relevance.ts` —
   this time constructing the Work Package with `relatedElements`
   populated correctly (`comp.iter8-upstream`: required; `comp.iter9-related`:
   optional), and confirm the new field-driven check reproduces
   `RunBlocked` for the first and `RunCompleted` for the second — the
   same two real scenarios already on record, per Iteration 9's own
   Lessons ("two full real scenarios already on record to validate any
   candidate rule against, without needing new seed data or a new live
   run to get started").
5. **Only if both re-runs classify correctly**, wire the new check in as
   `classifyResultMessage`'s primary path for `context-insufficient`,
   ahead of the existing `toolResults.some(r => r.isError)` rule — decide
   whether the naive rule becomes a narrower fallback or is removed
   entirely based on what the evidence actually shows, not decided here
   in advance.

**Stays unchanged unless evidence demands otherwise**: `GrantRefusedError`,
`assertInGrant`, `McpGrant`'s own construction (`src/mcp/grant.ts`),
`buildPrompt()`'s standing `BLOCKED:` instruction, `parseBlockedSignal()`,
the Orchestrator (still unbuilt).

---

## Evidence Plan

**New evidence required:**
1. Does `relatedElements`, hand-populated correctly, let a new
   field-driven check distinguish both of Iteration 9's own scenarios
   correctly — with zero text-parsing?
2. Does adding this field require any change beyond an additive,
   optional Work Package field and its `WORK_PACKAGE_SPEC.md` entry — or
   does it turn out to need something structurally bigger (e.g. a new
   graph relationship, a new table) once actually attempted?

**Failure modes, named directly:**
- The field, even hand-populated with the "correct" answer known in
  advance, still fails to cleanly distinguish the two scenarios for some
  reason not yet anticipated — a real, informative negative result, not
  a wasted one, the same discipline Iteration 9's Run 2 established.
- Populating `relatedElements` correctly turns out to require the same
  judgment a human or architect would need to exercise carefully — which
  would not invalidate the mechanism, but would shift the open question
  from "can Nexus classify this" to "can Work Package generation populate
  this correctly," a different, narrower question for a future iteration
  (plausibly Iteration 12's own incremental-authoring territory).
- `docs/WORK_PACKAGE_SPEC.md`'s authors (this project's own review
  discipline) may judge an additive field an acceptable minimal spec
  change, or may judge it premature ahead of real authoring tooling —
  this is itself a `/review`-time question, not pre-decided here.

---

## Acceptance Criteria

1. `relatedElements` is added to the Work Package payload and documented
   in `docs/WORK_PACKAGE_SPEC.md`'s Schema section.
2. `classifyResultMessage` (or a sibling function) uses this field, not
   agent text, to decide `RunBlocked` for a named-and-required refusal —
   hermetically tested directly, matching `test/claude-sdk-adapter.test.ts`'s
   existing pattern.
3. Both Iteration 9 scenarios are re-run live with `relatedElements`
   populated, and both are classified correctly against real, captured
   transcripts — not assumed from the hermetic tests alone.
4. If evidence is clean, the new check is wired in as the primary
   `context-insufficient` classification path; if not, the naive
   `toolResults`-refusal rule remains as-is, and this iteration's Report
   states plainly which outcome occurred and why.
5. `npm test` remains fully hermetic; typecheck clean.

---

## Explicit Deferrals

- **A real authoring path for populating `relatedElements`** — Iteration
  12/13's own territory (incremental architecture authoring; a PO/architect
  authoring API). This iteration only tests whether a *hand-populated*
  field can drive correct classification, the same way `investigate-*.ts`
  scripts already hand-populate `acceptanceCriteria` — not whether it can
  be auto-derived from the graph.
- **Auto-deriving `relatedElements` from `buildWorkPackage()`** — a
  separate, larger design question (what should the platform infer as
  "possibly relevant but not guaranteed in grant" for a real task) not
  attempted here.
- **The `acceptanceCriteria`-ids-vs-text gap** named above — real,
  disclosed, unrelated to this iteration's question.
- **`architecture-change-required` and `mapping-missing`** — still
  unreachable with today's MCP tool catalog, still untouched.
- **Removing the naive `toolResults`-refusal fallback entirely** — only
  if the evidence in this iteration supports it; not decided in advance.
- **Incremental architecture authoring** (`docs/PROJECT_KNOWLEDGE.md`
  Open Question #6) — unrelated, untouched, still explicitly not
  prioritized this iteration.
