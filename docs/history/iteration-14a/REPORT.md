# Iteration 14a Report — relatedElements now has a real, declared authoring path

Status: complete for the scope agreed in `docs/history/iteration-14a/SCOPE.md`,
with a clean result. 163 `node:test` cases pass (up from Iteration 13's
161, plus 2 new cases this iteration; all still hermetic, offline, zero
network access). Two live agent runs were executed this iteration,
reusing Iteration 9's and Iteration 11's own reusable scenarios exactly,
to confirm the mechanism change didn't alter either's validated
classification outcome.

## Scope completed

1. **`work.work_item_related_element` added** (migration
   `0013_work_related_elements.sql`): `work_item_id`, `element_id`
   (live FK to `architecture.element(id)`, no kind restriction), `required`
   — matching `work.work_item_capability`'s existing shape exactly.
2. **`WorkPackagePayload` gains `relatedElements`**
   (`src/workpackage/build.ts`), populated by a new step reading the
   table and mapped to `{ elementId, required }` — the first real
   connection between `buildWorkPackage()` and this field, which has
   existed only as hand-typed JS literals in investigate scripts since
   Iteration 11. Omitted entirely from the payload when no rows are
   declared, so every existing test and every Work Package generated
   before this iteration is byte-for-byte unaffected — confirmed by all
   161 pre-existing tests passing unmodified.
3. **Explicit `order by element_id`** in the new query, with a comment
   explaining why: `canonicalize()` (`canonicalize.ts`) only sorts
   arrays whose elements are all primitives, and this array holds
   objects — nothing downstream would have sorted it otherwise, which
   would have silently broken `buildWorkPackage()`'s own purity
   guarantee (§11.1) for exactly this field.
4. **Two new hermetic tests** (`test/workpackage.test.ts`): the omitted-
   when-empty case, and a populated case seeded out of `element_id`
   order to prove the sort is real, not incidental.
5. **A new investigate script**
   (`npm run investigate:related-elements-authoring`) reproduces both of
   Iteration 9/11's own reusable scenarios end-to-end: real declared
   rows → real `buildWorkPackage()` call → confirmed the resulting
   `relatedElements` matches each scenario's known-correct value exactly
   → that real payload fed into a live agent run → confirmed
   classification is unchanged (`RunBlocked` for the required case,
   `RunCompleted` for the optional case). Both scenarios: **PASS**.
6. **`docs/WORK_PACKAGE_SPEC.md` updated** — the note that
   `buildWorkPackage()` "does not yet populate this field" was accurate
   through Iteration 13 and false as of this iteration; corrected rather
   than left to silently drift from the code.

## The decision this iteration was required to make, and the evidence behind it

`docs/history/iteration-14a/SCOPE.md` required deciding between automatic
derivation and human declaration before any code was written. Checked
directly against both reusable scenarios' actual seed data (not carried
over from Iteration 11's prose): `comp.iter8-target`/`comp.iter8-upstream`
and `comp.iter9-target`/`comp.iter9-related` are each siblings under the
same subsystem, connected by zero `element_dependency` rows and zero
shared `element_provision` rows — in *both* the required scenario and
the optional one, identically. No graph-structural signal distinguishes
them; the only place the distinction ever existed is acceptance-criteria
prose. Automatic derivation was therefore ruled out before implementation
began, not left as an alternative design this iteration simply didn't
get to.

## What survived contact, precisely

- **The declared-table mechanism reproduces both known-correct values
  exactly**, confirmed by direct comparison inside the investigate
  script, not merely "the run completed."
- **Classification is genuinely unaffected by the switch.** Both live
  runs produced the same final event kind Iteration 11 already
  validated — the only thing that changed between this iteration's runs
  and Iteration 11's own is *how* `relatedElements` reached the agent's
  Work Package (real declaration + real `buildWorkPackage()` call, vs. a
  hand-typed literal); `buildPrompt()` still never reads the field
  either way, exactly as disclosed in `SCOPE.md`.
- **The sort discipline was a real, not theoretical, risk.** Seeding the
  two declared rows out of `element_id` order in the hermetic test
  directly exercises the one place this project's usual "canonicalize
  sorts everything" guarantee doesn't apply — worth having tested
  explicitly rather than assumed.

## What this does not settle

Whether the Iteration 11 fail-safe risk (an incomplete `relatedElements`
set silently falling through to the weaker `BLOCKED:` text convention
rather than failing loudly) behaves differently now that the set is
populated from a real, human-fallible declared table rather than a
scenario-matched literal. Not tested here — see Scope deferred.

## Scope deferred

Exactly as `docs/history/iteration-14a/SCOPE.md` listed: a human-facing
authoring API or UI for the new table (direct inserts prove the
mechanism, matching Iteration 12's own precedent before Iteration 13
built an API on top of it); automatic derivation from graph structure
(ruled out, not merely postponed); the Iteration 11 fail-safe question
(an incomplete declared set) — genuinely not tested this iteration, named
directly here rather than silently dropped, since testing it would need
a third scenario with a real refusal landing on an undeclared element,
which neither reused scenario provides; Iteration 14's UI work; the
`change_operation` schema debt (Iteration 12); Technology Profiles
(Iteration 15).

## Technical debt intentionally created

One real gap, found during this iteration's own `/review` pass, not at
implementation time: `relatedElements` is the only array in
`WorkPackagePayload` that bypasses `resolveAndCheckRetired`.
`capabilities` and `components` are both translated forward through
succession and rejected if retired without one; `relatedElementRows`
returns `element_id` raw. If a declared related element is later
superseded, `relatedElements` keeps naming the old, inactive id
indefinitely, and a real refusal on the component's *current* id would
silently stop matching it — no error, no test. Not fixed here: reusing
`resolveAndCheckRetired` verbatim would import its
`retired-without-succession` gate failure onto optional metadata, which
could fail an entire Work Package's generation over a stale
"check this too" reference — a real design choice among silent
translation, no resolution (today's behavior), or a softer error, not a
reflexive one-line fix. Recorded in `docs/PROJECT_KNOWLEDGE.md` as a new
Unproven item rather than fixed on discovery.

## Demonstrations and verification

```
npm run typecheck                          # clean
npm test                                    # 163/163, fully hermetic, zero network access
npm run investigate:related-elements-authoring  # 2/2 real live-run scenarios PASS
```

## Recommended next-step validation

The Iteration 11 fail-safe question — whether an incomplete, human-
authored `relatedElements` set can cause a genuine task-blocking refusal
to be silently misclassified as `RunCompleted` — is the one concretely
named, untested thread this iteration leaves behind. It needs a new
scenario (a task with a declared set that omits a genuinely necessary
element, and a real refusal landing on the omission), not a re-run of
either scenario reused here. Whether that belongs to Iteration 14 or its
own iteration is not decided by this Report.
