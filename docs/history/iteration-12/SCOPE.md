# Iteration 12 Scope — does the existing proposal mechanism already provide incremental authoring, and if not, what exactly is missing?

This is a scope document, not a report. Nothing described here has been
built. It follows `docs/ROADMAP.md`'s current sequence and directly
answers `docs/PROJECT_KNOWLEDGE.md` Open Question #6. The question this
document actually scopes is narrower, and differently shaped, than "a
write path to grow the graph" suggested going in — see "What We Know,"
below, for why.

---

## Question Under Test

Open Question #6, as recorded, reads: today's only authoring path is a
one-shot bulk YAML import via `importArchitecture`, which fails if
re-run against an already-populated graph. Read directly against the
actual code before writing anything else, that framing turns out to be
wrong about *where* the gap is. The real question this iteration tests:

**Given that `ArchitectureChangeProposal` (`src/proposal/proposal.ts`)
already mints a single element into an already-populated graph,
transactionally, under ADR-style governance — validated since Iteration
1 — what, specifically, stops a Product Owner or Architect from using it
to grow the graph into something *usable*, not just present? And is
closing that specific gap the smallest viable next step, rather than
building a new write mechanism from scratch?**

---

## What We Know

Checked directly against the actual code before writing anything else,
not carried over from the Open Question's own wording:

- **`applyProposal`'s `create` operation already does exactly what
  incremental authoring needs for a single element**: `insert into
  architecture.element (id, kind, parent_id, name) values (...)`
  (`src/proposal/proposal.ts`), running inside a transaction, against
  whatever graph already exists — not a bulk reload. This has been
  validated end-to-end since Iteration 1 (`docs/PROJECT_KNOWLEDGE.md`
  Validated table: "the Architecture Change Proposal lifecycle closes
  the loop it is designed to close"). `importArchitecture`
  (`src/import/architecture.ts`) is the seed path, not the only path —
  the Open Question's framing conflated "the seed importer has no
  conflict handling" with "no incremental path exists," and those are
  different claims.
- **`ArchitectureOperation`'s vocabulary is `create` and `retire`
  only** — checked against both the type (`ProposalOperationInput`,
  `proposal.ts`) and the schema (`architecture.change_operation`'s `op`
  check constraint, `db/migrations/0002_architecture.sql`). There is no
  operation for `Component provides Capability`
  (`element_provision`) or `Component dependsOn Component`
  (`element_dependency`) — the two behavioural, non-containment edges
  R2 defines (§4.2, `MVP_ARCHITECTURE_V2.md`) — nor for attaching a
  `Decision` or `Constraint` to an element, nor for updating an existing
  element's `name` (declared mutable by R-4, but no code path anywhere
  in `src/` ever issues an `update ... set name`).
- **Consequence, checked directly against `buildWorkPackage`'s own
  gate** (`src/workpackage/build.ts`, reason `unprovided-capability`) and
  `unprovidedCapabilities()` (`src/graph/alignment.ts`, already exercised
  by `src/cli/verify.ts` against the seeded `cap.invoice-export`
  example): a proposal that mints a new Component to satisfy a missing
  Capability — `MVP_ARCHITECTURE_V2.md` §5.1's own motivating example,
  "implement invoice discounts, which needs a new
  `comp.discount-engine`" — **cannot, in the same governed step, also
  make that Component provide the Capability**. After such a proposal
  applies, the capability remains unprovided; `buildWorkPackage`'s gate
  still refuses with `unprovided-capability`; `unprovidedCapabilities()`
  still flags it. The §5.4 unblocking flow ("Task links the new
  capability, returns to ready") is structurally incomplete for its own
  textbook scenario — not a hypothetical gap, a real one, previously
  unnoticed because no iteration has driven a `create` operation all the
  way through to a subsequent `buildWorkPackage` call.
- **The REST surface for the proposal lifecycle already exists**
  (`POST /proposals`, `/submit`, `/approve`, `/reject`, `/apply` in
  `src/http/routes.ts`) — a PO/architect authoring API (Iteration 13)
  has a real, tested backend to sit in front of once this gap closes,
  not a green field.
- **`element_provision`'s own shape is simple and already
  constrained**: `(component_id, capability_id, is_primary)`, FK-checked
  by `(id, kind)` against `architecture.element` (§7.2's kind-checked
  reference pattern), with a partial unique index enforcing "at most one
  primary provider." Adding a `provide` operation does not need new
  invariants — the existing table and its constraints are the final
  word, the same discipline `importArchitecture`'s own comment states
  for containment.

---

## What We Only Believe

1. **That extending `ArchitectureOperation` with a `provide` op is the
   smallest change that closes the demonstrated gap.** Follows from the
   analysis above, but not yet attempted — validating operation ordering
   inside a single proposal (does `create` then `provide` against a
   not-yet-committed-until-transaction-end id work correctly inside one
   Postgres transaction?) is untested.
2. **That a `depend` operation (`element_dependency`, the other R2
   behavioural edge) is *not* needed this iteration.** No concrete
   scenario in this project's history has yet shown a proposal that
   mints two interdependent Components and needs to wire the dependency
   in the same governed step — unlike `provide`, which the project's own
   architecture document uses as its running example. Structurally
   near-identical to `provide` if evidence later demands it, but adding
   it now, without a demonstrated need, would be exactly the "solving a
   hypothetical future problem" the Simplicity Reviewer exists to catch.
3. **That renaming an existing element (mutable `name`, R-4) and
   attaching a Decision/Constraint via proposal are real gaps, but not
   this iteration's gap.** Both are disclosed here so they are not
   silently rediscovered later (the same discipline Iteration 9's Report
   applied to the `acceptanceCriteria` ids-vs-text gap), not because
   either is believed urgent.

---

## Smallest Viable Investigation

Not a ground-up authoring mechanism — one additive operation type,
proven against the real scenario the architecture document itself uses:

1. **Extend `architecture.change_operation`** (migration): widen the
   `op` check constraint to include `provide`; add nullable columns
   `provide_component_id`, `provide_capability_id`,
   `provide_is_primary boolean not null default false`. No change to
   `element_provision` itself — the operation writes into the existing
   table unchanged.
2. **Extend `ProposalOperationInput` and `validateOperation`**
   (`src/proposal/proposal.ts`) to accept and validate `op: "provide"`
   (`provideComponentId`, `provideCapabilityId`, optional
   `provideIsPrimary`) — required-field checks only; kind-correctness is
   left to the existing FK, matching how `create`/`retire` already defer
   to the DB rather than duplicating its checks.
3. **Extend `applyProposal`'s transaction loop** to handle `op ===
   "provide"`: `insert into architecture.element_provision (...)`,
   inside the same transaction as any `create` operations preceding it
   in the same proposal — so "mint the component, then make it provide
   the capability" is one atomic, all-or-nothing change, not two.
4. **Reproduce §5.1's own motivating example end-to-end**, live against
   the real gate, not only a hermetic unit test: seed a Task affecting an
   unprovided `cap.*`; confirm `buildWorkPackage` currently refuses with
   `unprovided-capability`; draft a proposal with a `create` operation
   (mint `comp.*`) followed by a `provide` operation (wire it to the
   capability); submit → approve → apply; re-run `buildWorkPackage` and
   confirm the gate now passes (or advances to a *different*, expected
   gate reason such as `mapping-missing` if no repository is mapped —
   acceptable, since resolving that is Repository Bootstrap's concern,
   not this one); confirm `unprovidedCapabilities()` no longer lists the
   capability.
5. **Only if step 4 is clean**, consider whether `retire`'s existing
   §5.6 retirement-refusal check needs any adjustment now that a
   capability can gain a provider through the same proposal mechanism
   that might later retire it — decide from evidence, not in advance.

**Stays unchanged unless evidence demands otherwise**: `importArchitecture`
(the seed path is not being touched or fixed — see "What We Know"),
`element_provision`'s schema and constraints, the legal-containment
trigger, `assertRetirementAllowed`, `buildWorkPackage`'s gate logic
itself (only its *outcome* for this scenario should change, not its
code), the REST routes (no new endpoint — `POST /proposals` already
accepts arbitrary `operations[]`).

---

## Evidence Plan

**New evidence required:**
1. Does a `provide` operation, added to the existing proposal
   mechanism, let a `create` + `provide` proposal make a real,
   previously-unprovided capability provided, in one atomic apply?
2. Does that change the outcome of a real `buildWorkPackage` call on a
   real Task against that capability, from `unprovided-capability` to
   something further along the gate?
3. Does adding this require anything beyond one migration and the
   already-established `create`/`retire` code pattern — or does it turn
   out, once attempted, to need something structurally bigger (e.g. a
   discriminated payload the way §7.3's own comment anticipates for
   `move`/`split`/`merge`)?

**Failure modes, named directly:**
- Ordering within one transaction turns out not to work cleanly — e.g. a
  `provide` operation naming a `mintId` from an earlier `create`
  operation in the same proposal, before that id is visible to a
  same-transaction FK check. A real risk worth testing directly, not
  assuming Postgres's read-your-own-writes semantics inside one
  transaction make this a non-issue.
- The gate's *next* failure mode after `unprovided-capability` (most
  likely `mapping-missing`, since no repository would yet be mapped to a
  freshly minted component) turns out to obscure whether this
  iteration's actual fix worked — the acceptance criteria below account
  for this explicitly rather than requiring a full green
  `buildWorkPackage` result.
- `docs/REVIEW_PRINCIPLES.md`'s Domain Integrity Reviewer may judge that
  `provide` belongs in a discriminated operation payload now rather than
  a fourth pair of nullable columns bolted onto `change_operation` — a
  real design question this iteration surfaces, not pre-decided here.

---

## Acceptance Criteria

1. `architecture.change_operation` accepts a `provide` operation
   alongside `create`/`retire`, schema-validated the same way the
   existing two are.
2. `draftProposal`/`applyProposal` handle `provide` with the same
   validation and transactional discipline as `create`/`retire`,
   hermetically tested in `test/proposal.test.ts`'s existing style.
3. The real §5.1 scenario (unprovided capability → gate refuses → propose
   `create` + `provide` → apply → gate re-evaluated) is run live and its
   before/after `buildWorkPackage` outcome and `unprovidedCapabilities()`
   result are both captured, not assumed from the unit tests alone.
4. `depend`, Decision/Constraint attachment, and element rename remain
   explicitly unimplemented — this iteration's Report states plainly
   that they were considered and deferred, not silently forgotten.
5. `npm test` remains fully hermetic; typecheck clean; no change to
   `importArchitecture` or the seed YAML format.

---

## Explicit Deferrals

- **`depend` operation** (`element_dependency`) — structurally identical
  to `provide`, no concrete scenario has yet demonstrated the same gap
  for it; add only when one does.
- **Decision/Constraint attachment via proposal** — a real gap (both
  still only enter the graph through the one-shot YAML importer), but
  not the one blocking the §5.4 unblocking flow; not this iteration's
  target.
- **Renaming an existing element** (`name`, mutable per R-4) — zero
  write path exists anywhere today; disclosed, not fixed here.
- **`move` / `split` / `merge` operations** — already explicitly
  deferred by `MVP_ARCHITECTURE_V2.md` §5.3 to its own later iteration
  numbering (distinct from this project's roadmap numbering);
  unaffected.
- **A PO/architect-facing authoring API or UI** — Iteration 13/14's own
  territory. This iteration only closes a gap in the existing backend
  write path; it does not add a new endpoint, form, or screen.
- **Auto-deriving Iteration 11's `relatedElements` field from the
  graph** — Iteration 11's own named Unproven item; tempting to combine
  since both are "authoring," but a separate mechanism and question, not
  attempted here.
- **Technology Profiles** (`docs/PROJECT_KNOWLEDGE.md` Open Question #7,
  `docs/ROADMAP.md` Iteration 15) — unrelated, untouched.
