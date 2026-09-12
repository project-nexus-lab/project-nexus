# Iteration 12 Report — closing the gap between minting an element and it being usable

Status: complete for the scope agreed in `docs/history/iteration-12/SCOPE.md`,
with a clean result. 153 `node:test` cases pass (up from Iteration 11's
151, plus 2 new cases this iteration; all still hermetic, offline, zero
network access) — a smaller test-count delta than most prior iterations,
because this iteration's real contribution is one additive column set
and one new branch in already-existing, already-tested functions, not a
new subsystem.

## Scope completed

1. **`provide` added as a third `ArchitectureOperation` op**, alongside
   `create` and `retire` — `architecture.change_operation` gained
   `provide_component_id`, `provide_capability_id`, and
   `provide_is_primary` (migration `0012_architecture_provide_operation.sql`),
   and its `op`/shape check constraints were extended to match.
2. **`draftProposal`/`applyProposal` (`src/proposal/proposal.ts`) handle
   `provide`** with the same validation and transactional discipline as
   `create`/`retire`: required-field validation in `validateOperation`,
   persisted in `draftProposal`, and applied inside `applyProposal`'s
   existing single transaction via `insert into
   architecture.element_provision`. `ApplyProposalResult` gained
   `providedLinks: Array<{ componentId, capabilityId }>`, mirroring
   `mintedIds`/`retiredIds`.
3. **No FK on `provide_component_id`/`provide_capability_id` in
   `change_operation`** — deliberately, for the same reason `mint_id`
   itself carries none: a `provide` operation may name a component or
   capability minted by an earlier `create` operation in the *same*
   proposal, which does not exist yet when the operation is drafted.
   Existence and kind are checked once, at apply time, by
   `element_provision`'s own kind-checked foreign keys — the same
   discipline `importArchitecture`'s comment already states for
   containment, applied here to provision.
4. **The real motivating scenario re-run end-to-end, live against
   PGlite** (this project's real database, not a stand-in — see
   Iteration 10's own note) in `test/proposal.test.ts`'s existing
   end-to-end test: an unprovided capability blocks `buildWorkPackage`'s
   gate (`unprovided-capability`) → a proposal with `create` + `provide`
   operations is drafted, approved, and applied in one atomic step → the
   same capability is confirmed no longer unprovided via
   `unprovidedCapabilities()` (Alignment, §8.5) → generation proceeds.
   Previously, this same test could only reach that end state by
   inserting into `element_provision` directly with raw SQL, with a
   comment naming it "a deliberate, disclosed scope boundary" — that
   workaround is now gone.
5. **Two new hermetic tests** in `test/proposal.test.ts`: a `create` +
   `provide` proposal minting *both* ends of the provision edge in one
   proposal (exercising the exact intra-transaction ordering risk named
   in `SCOPE.md`), and a DB-level rejection when `provide` names an id of
   the wrong kind (a capability where a component id is expected),
   confirming `element_provision`'s kind-checked FK is still the real
   enforcement, not any new application-level check.
6. **`docs/MVP_ARCHITECTURE_V2.md` updated** — §5.3's operations table
   and §7.3's `change_operation` DDL now both name `provide`, so the
   documented schema does not silently diverge from the implemented one
   (the same discipline the R-1 amendment between Iterations 8 and 9
   already established for this document).

## A real bug, caught by the test suite, worth recording precisely

The first implementation attempt gave `provide_component_id` and
`provide_capability_id` a foreign key to `architecture.element(id)`, by
analogy with `target_id`/`supersedes_id` (which correctly do reference
existing elements, since you cannot retire or supersede something that
does not exist yet). Running the test suite immediately surfaced this as
wrong: a proposal minting a component *and* making it provide a
capability in the same step — precisely this iteration's own motivating
scenario — failed with a real foreign-key violation, because the
component named by the `provide` operation does not exist until the
proposal is *applied*, not when it is *drafted*. The fix removed the FK
entirely, matching `mint_id`'s own precedent. This is exactly the
ordering risk `docs/history/iteration-12/SCOPE.md`'s "Failure modes"
section named in advance ("a `provide` operation naming a `mintId` from
an earlier `create` operation... before that id is visible") — caught
by writing the real test first, not by reasoning about it in the
abstract. See Lessons for the full account.

## What survived contact, precisely

- **`applyProposal`'s `create` operation already provided incremental,
  transactional element growth** — this was true since Iteration 1,
  confirmed by reading the code directly before writing anything new.
  Open Question #6's original framing (the seed importer's lack of
  conflict handling is the blocking gap) was the wrong target; the real
  gap was narrower and different in kind.
- **Extending the existing `create`/`retire` pattern to a third op was
  sufficient** — no discriminated `jsonb` payload was needed, contrary
  to one possibility `SCOPE.md` raised as a live design question. Three
  nullable-column pairs, one shared check constraint, one new
  transaction branch.
- **`element_provision`'s existing constraints needed zero changes** —
  its kind-checked FKs and at-most-one-primary-provider index correctly
  enforced provision validity the moment `provide` started writing to
  it, exactly as `SCOPE.md` predicted.

## What this does not settle

This iteration proves the *backend write path* closes the gap — it does
not prove a Product Owner or Architect can, or would, decide when to
draft a `create` + `provide` proposal, still less do so through any
interface friendlier than raw `POST /proposals` JSON. That is squarely
Iteration 13's territory (the authoring API), not attempted here.

## Scope deferred

Exactly as `docs/history/iteration-12/SCOPE.md` listed: a `depend`
operation (`element_dependency`) — structurally identical, no concrete
scenario has yet demonstrated the same gap for it; Decision/Constraint
attachment via proposal — a real gap, not this iteration's target;
renaming an existing element (`name`, mutable per R-4) — zero write path
exists anywhere, disclosed, not fixed; `move`/`split`/`merge` — already
deferred by `MVP_ARCHITECTURE_V2.md` §5.3 to its own later numbering; a
PO/architect-facing authoring API or UI — Iteration 13/14's territory;
auto-deriving Iteration 11's `relatedElements` — a separate mechanism;
Technology Profiles — unrelated, untouched.

## Technical debt intentionally created

No new *kind* of debt, but an existing one widened. `change_operation`'s
check constraint only asserts that the fields required by a given `op`
are present — it never asserts that the *other* operations' fields are
absent. A `provide` row could carry a non-null `mint_id` and the schema
would not reject it; the same looseness already existed between `create`
and `retire` before this iteration. Adding `provide` as a third operation
family to the same flat table extends that gap's surface (now three
column-groups sharing one under-constrained table) rather than
introducing a new one. The migration's own comment already anticipated
this pattern reaching a limit ("iteration 2, when move/split/merge
arrive, this likely becomes a discriminated jsonb payload") — three
operation types may already be that point. Not fixed here: the only
writer today (`draftProposal`) is disciplined about it, and a schema
redesign was judged out of scope for closing one demonstrated gap. Named
directly so it is a decision, not an oversight — worth revisiting before
a fourth operation type (e.g. `depend`) is added. The raw-SQL workaround
the previous end-to-end test carried (explicitly flagged as "a
deliberate, disclosed scope boundary") is removed, not replaced with a
new one.

## Demonstrations and verification

```
npm run typecheck   # clean
npm test             # 153/153, fully hermetic, zero network access
```

## Recommended next-step validation

The immediate next question is whether a real authoring API (Iteration
13) exposing `create`/`provide` (and eventually `retire`) as a coherent
PO/architect-facing surface is usable in practice — not whether the
backend mechanism works, which this iteration has now shown. A `depend`
operation should be added only if a concrete scenario, not speculation,
demonstrates the same "minted but unusable" gap for `dependsOn` that
motivated `provide` here.
