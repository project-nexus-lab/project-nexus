# Iteration 14a Scope — can `relatedElements` be populated correctly, and by what mechanism?

This is a scope document, not a report. Nothing described here has been
built. It resolves the roadmap-reconciliation question raised this
session: Open Question #5's stated precondition ("a real authoring path
exists") has been satisfied since Iteration 12, but — checked directly
below — not in the way that precondition assumed. Context: Execution
(`src/workpackage/build.ts`), not Architecture authoring and not a UI.

---

## Question Under Test

Can `relatedElements` be populated correctly for a real task — and,
specifically, **by which mechanism**: automatic derivation from graph
structure, or human declaration? `docs/PROJECT_KNOWLEDGE.md`'s Open
Question #5 left this undecided; deciding it is this scope document's
first job, before anything else.

---

## What We Know

Checked directly against the actual code and the actual seed data both
of Iteration 9's and Iteration 11's own reusable scenarios use — not
assumed from either iteration's prose:

- **`buildWorkPackage()` (`src/workpackage/build.ts`) has no
  `relatedElements` field at all.** `WorkPackagePayload` lists `id`,
  `schemaVersion`, `profile`, `task`, `feature`, `capabilities`,
  `components`, `repositories`, `files`, `constraints`,
  `acceptanceCriteria`, `decisions` — nothing else. `docs/WORK_PACKAGE_SPEC.md`
  says so explicitly: *"As of Iteration 11, `buildWorkPackage()` does not
  yet populate this field from the graph."* The precondition "a real
  authoring path exists" (Iteration 12/13) is about **Architecture**
  element authoring — minting components/capabilities via governed
  proposals. It has no connection to `relatedElements` at all, which is
  an **Execution** (Work Package) field. Satisfying Open Question #5's
  literal precondition text did not, and could not, close this gap on
  its own.
- **Every real use of `relatedElements` to date is hand-authored,
  bypassing `buildWorkPackage()` entirely.** Both
  `investigate-run-blocked.ts` and `investigate-blocked-relevance.ts`
  construct their own `workPackage` object as a plain JS literal, with
  `relatedElements` typed in by hand, and pass it directly to
  `adapter.start()` — the same disclosed gap Iteration 11's own Lessons
  named for `acceptanceCriteria` (ids vs. text), now confirmed to apply
  identically to `relatedElements`.
- **Neither reusable scenario encodes its required/optional distinction
  as a graph edge.** Re-read directly against both scripts' own seed
  inserts: `comp.iter8-target`/`comp.iter8-upstream` and
  `comp.iter9-target`/`comp.iter9-related` are each siblings under the
  same subsystem, connected by **zero** `element_dependency` rows and
  **zero** shared `element_provision` rows, in *both* scenarios equally.
  The two scenarios are structurally identical to each other — same
  shape, no edge, same subsystem — yet one is `required: true` and the
  other `required: false`. The only place the distinction exists is
  acceptance-criteria prose ("has historically depended on...", "a
  separate component... that historically logged..."). Iteration 11's
  own `SCOPE.md` already flagged this ("evidence for the conclusion...
  not an oversight to fix by adding an edge"); this scope re-confirms it
  directly against the actual seed data rather than carrying the claim
  forward from memory.
- **Consequence: automatic derivation from graph structure cannot
  reproduce the correct answer on the very evidence this iteration is
  required to reuse.** Any heuristic keyed on `dependsOn` edges,
  `impactOf` reachability, or shared containment would either flag both
  scenarios' related component identically (false positive on the
  optional one) or neither (false negative on the required one) — there
  is no structural feature that differs between them. This is not "our
  heuristic wasn't good enough" — it is the same "structurally
  incapable, not merely untested" finding Iteration 11 reached for the
  *classification* signal, now shown to hold for the *population*
  question too, on the same grounds.
- **`work.work_item_capability` and `work.work_item_repository`
  (`db/migrations/0003_work.sql`) already establish the pattern this
  needs**: a plain join table declaring a Task's relationship to
  specific Architecture elements, live-FK-checked, populated by
  whatever writes to Work today (currently the YAML importer and
  `linkCapability`/task lifecycle functions — themselves already
  "human declaration," just for a different field).
- **`buildPrompt()` never reads `relatedElements`** (confirmed in both
  investigate scripts' own comments) — the agent's prompt is unaffected
  by this field regardless of how it's populated. This means resolving
  this question does **not** require a new live agent run to re-prove
  classification (Iteration 11 already did that); it requires proving
  that a *real*, declared value reaches `buildWorkPackage()`'s real
  output correctly.

---

## Decision: human declaration, not automatic derivation

Settled here, before any implementation, on the evidence above — not
left open for an implementer to guess:

- **Automatic derivation from graph structure is ruled out**, not
  deferred as unproven. It cannot be validated against Iteration 9/11's
  own reusable scenarios (there is nothing in the graph to derive from),
  and building a *new* scenario with a real dependency edge just to give
  automatic derivation something to key on would abandon the "reuse
  Iteration 9/11" evidence requirement rather than satisfy it.
- **Human declaration is the mechanism to test.** Concretely: a new,
  plain declared-relationship table in the `work` schema — provisionally
  `work.work_item_related_element (work_item_id, element_id, required)`
  — matching `work.work_item_capability`'s existing shape exactly, and
  `buildWorkPackage()` gains a step reading it and populating
  `WorkPackagePayload.relatedElements` for real, for the first time.
  Naming and exact column shape are open to refinement at implementation
  time; the *mechanism* (a declared table Execution reads, not a graph
  heuristic) is not.
- **This scope deliberately does not include a human-facing authoring
  API or UI for writing to that table.** Iteration 12/13's own
  discipline applies here identically: prove the mechanism first (a
  direct write, the same way `importArchitecture` and the Iteration 12
  end-to-end test both used direct inserts before any API existed), and
  let a real authoring surface for it — if ever needed — be its own,
  later, evidence-justified iteration rather than assumed necessary now.

---

## What We Only Believe

1. **That a plain join table is the right shape**, rather than something
   richer (e.g., a reason/note field, or scoping by profile). No
   evidence yet demands more than `(work_item_id, element_id, required)`
   — the exact shape both reusable scenarios already use.
2. **That reading this table once, inside `buildWorkPackage()`'s
   existing pipeline, is sufficient** — untested whether it interacts
   awkwardly with anything else in the nine-step build (§11.2), since
   nothing has read a Task-scoped declared table into the payload before
   except `acceptanceCriteria`/`capabilities`, both of which are
   required inputs, not an optional additive field like this one.
3. **That fixing the *population* gap doesn't reopen the *fail-safe*
   gap Iteration 11's own `/review` pass found** (discovered during
   Iteration 11's review, not its implementation): an incomplete
   `relatedElements` set — one that omits a genuinely necessary element —
   falls through to the weaker `BLOCKED:` text convention rather than
   failing loudly. A real declared table makes incompleteness a live
   possibility (a human can simply forget to declare something) in a
   way a hand-authored, scenario-matched literal never could. Untested
   here unless evidence from the smallest viable investigation below
   makes it cheap to check in passing.

---

## Smallest Viable Investigation

1. **Add the declared table** (migration, exact shape per "Decision"
   above), matching `work.work_item_capability`'s existing pattern —
   live FK to `architecture.element(id)`, no kind restriction (a related
   element could be any kind, not only a component — `docs/WORK_PACKAGE_SPEC.md`'s
   own example names a component, but nothing in the spec restricts it).
2. **Extend `WorkPackagePayload`** with an optional `relatedElements:
   Array<{ elementId: string; required: boolean }>` field, and add a
   step to `buildWorkPackage()` reading the new table for the given
   `taskId` and populating it — additive, so every existing Work
   Package (no rows in the new table) gets an empty array, byte-for-byte
   compatible with every existing test fixture and Iteration 9's own
   unconditional fallback rule.
3. **Re-seed Iteration 9/11's own two scenarios through the new table
   instead of a hand-authored JS literal** — the same
   `comp.iter8-target`/`comp.iter8-upstream` (required) and
   `comp.iter9-target`/`comp.iter9-related` (optional) elements and
   tasks, declared via real inserts into
   `work.work_item_related_element` this time — and call the real
   `buildWorkPackage()` against each. Confirm the returned
   `WorkPackagePayload.relatedElements` matches exactly what was
   previously hand-typed into each investigate script.
4. **Feed that real, `buildWorkPackage()`-produced payload into a live
   agent run**, reusing the same two scenarios' grants and acceptance
   criteria, and confirm `events()` still classifies `RunBlocked`
   (iter8, required) and `RunCompleted` (iter9, optional) exactly as
   Iteration 11 already validated — this time with nothing hand-typed
   anywhere in the `relatedElements` path. This is the strongest
   available evidence: real declaration → real `buildWorkPackage()` →
   real live run → real classification, no hand-authored literal at any
   step.

**Stays unchanged unless evidence demands otherwise**: `classifyResultMessage`,
`parseRelatedElements`, `buildPrompt()` (still never reads
`relatedElements`), the six-event `RunEvent` vocabulary, every other
`WorkPackagePayload` field's construction, any HTTP route (no authoring
surface for the new table is in scope).

---

## Evidence Plan

**New evidence required:**
1. Does `buildWorkPackage()`, extended to read the new declared table,
   reproduce Iteration 9/11's own known-correct `relatedElements` values
   for both reusable scenarios, from a real declared source rather than
   a hand-typed literal?
2. Does a live run, fed that real payload, still classify both
   scenarios exactly as Iteration 11 validated?

**Failure modes, named directly:**
- The new table's shape turns out insufficient once actually
  implemented (e.g., a task needing the same element declared with
  different requiredness under different profiles) — a real,
  informative narrowing, not a wasted attempt.
- Re-seeding through the table produces a `relatedElements` array in a
  different key order or shape than the hand-authored literal, without
  being *wrong* — worth normalizing the comparison (e.g., sort before
  comparing) rather than treating an order difference as a failure.
- The live run step surfaces that something *does* depend on
  `relatedElements` reaching the agent's prompt after all (contradicting
  "buildPrompt() never reads it") — would mean this iteration's own
  "What We Know" was wrong on a checkable point, and should be corrected
  visibly, not quietly worked around.

---

## Acceptance Criteria

1. The declared table exists, is populated for both reusable scenarios,
   and `buildWorkPackage()`'s real, unmodified-elsewhere pipeline
   produces the correct `relatedElements` array from it — checked
   against Iteration 9/11's own known-correct values, not merely
   "returns an array."
2. At least one live run (reusing Iteration 9/11's own two scenarios)
   confirms classification is unaffected by the switch from hand-typed
   to declared-and-derived-by-`buildWorkPackage()` — the mechanism
   changed; the validated outcome did not.
3. Every existing Work Package (no declared rows) continues to produce
   an empty `relatedElements` array and Iteration 9's own unconditional
   fallback rule is exercised unchanged — no existing test's behavior
   changes.
4. `npm test` remains fully hermetic for the new table/field wiring;
   the live-run step is, as with every prior `RunBlocked`-related
   iteration, a separate `investigate-*.ts`/`verify-*.ts` script, not
   folded into the hermetic suite.
5. The Report states plainly whether the Iteration 11 fail-safe question
   (an incomplete declared set) was tested, and if not, names it as an
   explicit, disclosed deferral rather than a silently dropped thread.

---

## Explicit Deferrals

- **A human-facing authoring API or UI for the new table** — direct
  inserts prove the mechanism, the same discipline Iteration 12 used
  before Iteration 13 built an API on top of it; a real authoring
  surface for `relatedElements` specifically is not assumed necessary
  until evidence says a real user needs one.
- **Automatic derivation from graph structure** — ruled out by this
  scope's own evidence, not merely postponed; revisit only if a future
  scenario demonstrates a real structural signal neither reusable
  scenario happened to carry.
- **The Iteration 11 fail-safe question** (incomplete declared sets
  silently falling through) — tested only if cheap to add to the same
  investigation; otherwise named as a disclosed, separate follow-up.
- **Iteration 14's own UI work** — entirely unrelated; this iteration
  does not touch `apps/frontend`, HTTP routes, or discovery/ergonomics
  questions from Iteration 13.
- **`change_operation`'s disclosed schema looseness** (Iteration 12) and
  **Technology Profiles** (Iteration 15) — unrelated, untouched.
