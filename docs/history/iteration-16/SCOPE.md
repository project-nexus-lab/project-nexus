# Iteration 16 Scope — can Decisions get a real, governed creation path, the same way Elements already have one?

This is a scope document, not a report. Nothing described here has been
built. It closes `docs/PROJECT_KNOWLEDGE.md`'s Open Question #7,
disclosed during Iteration 15 and not resolved by it: Technology Profile
governance requires citing an existing, `accepted` `architecture.decision`
row, but nothing governs how that row came to exist — every Decision in
this project's history, including Iteration 15's own
`adr.backend-stack-java24-gradle`, is a direct insert. This is the same
gap Iteration 12 found and closed for **Elements** (a mint existed, but
nothing made a minted element *usable* — closed via a new `provide`
operation); Iteration 16 applies that identical pattern to **Decisions**
(a decision-creation SQL statement exists in principle, but no governed
path produces it).

---

## Question Under Test

Can `architecture.decision` gain a real, governed creation path —
attributable, human-approved, reviewable before it takes effect — by
extending the existing `ArchitectureChangeProposal` mechanism, rather
than by building a second, parallel proposal-and-approval lifecycle
purpose-built for Decisions alone?

---

## What We Know

Checked directly against the actual schema and code, not carried over
from prior iterations' prose:

- **`architecture.decision` (`db/migrations/0002_architecture.sql:134`)
  has no attribution columns and no FK to any proposal.** `id`, `title`,
  `status` (`proposed`/`accepted`/`superseded`, default `accepted`),
  `statement` — nothing else. Every row that exists today, across every
  iteration, was written by a direct `insert` (the YAML seed importer,
  or a hand-written statement in an investigate script/test) — never
  through code that checks who is proposing it or requires a second
  party to approve it.
- **`architecture.change_proposal` and `architecture.change_operation`
  already are exactly this mechanism, for a different payload.**
  `change_proposal` carries `state` (`draft → proposed → approved →
  applied | rejected`), `authored_by`, `approved_by` — real attribution,
  real review gating, already validated since Iteration 1. Its own
  header comment states the intent directly: *"A proposal is to
  architecture what a pull request is to code"* (§5.2). A new Decision
  is exactly this kind of change — Iteration 12 already added `provide`
  as a third operation type to the same table for a narrower gap;
  nothing about `change_operation`'s shape assumes only Elements can be
  its subject.
- **A minted Element is created *only at apply time*, already in its
  live, terminal status** (`element.status` defaults to `'active'`;
  `applyProposal`'s `create` branch inserts directly, no `'draft'`
  element status exists). The proposal's own state machine *is* the
  draft/review mechanism; the domain object underneath only exists once
  approved and applied. The same pattern, applied to Decisions, means a
  new Decision row would be inserted at apply time already `'accepted'`
  — `decision.status`'s own `'proposed'` value would remain exactly as
  unreached by this mechanism as `element.status`'s own `'deprecated'`
  value already is today. Not a gap this iteration creates — a pattern
  it inherits and stays consistent with.
- **`architecture.change_operation`'s check constraint is
  presence-only, not presence-and-absence, disclosed as debt in
  Iteration 12's own `/review`**
  (`docs/history/iteration-12/LESSONS.md`): *"before a fourth operation
  type is added: decide... a mutual-exclusivity check across all column
  groups... or the discriminated `jsonb` payload."* Adding `decide` as
  a fourth operation type is the exact trigger that finding named —
  this iteration cannot add a fourth type and leave that debt
  unaddressed without knowingly making the disclosed problem worse.
- **Attribution for a minted Element is never stored on the Element
  itself — it is discoverable only by joining back through
  `change_operation`/`change_proposal`** (there is no
  `element.created_by_proposal_id` column). The same indirection
  already works for Decisions with zero new columns needed on
  `architecture.decision`: `select proposal_id from
  architecture.change_operation where op = 'decide' and decide_id =
  $1`.
- **`ids.ts` already has a `decision` `AuthoredKind`** (prefix `adr`,
  `assertId(id, "decision")` already works) — `assertPrefixMatchesKind`
  does not cover it (it is scoped to Architecture-element and
  Work-item kinds only), so a new operation's validation calls
  `assertId` directly rather than needing a new helper.
- **`architecture.decision_scope`** (linking a Decision to the elements
  it governs) **remains exactly as unimplemented as Iteration 12 left
  it**: *"whether `depend`, Decision/Constraint attachment, or element
  renaming are ever actually needed, each deliberately left
  unimplemented pending a concrete scenario rather than built
  speculatively"* (`docs/history/iteration-12/LESSONS.md`, still listed
  in `docs/PROJECT_KNOWLEDGE.md`'s Open Questions). Iteration 16 does
  not change that — governing Decision *creation* and governing which
  elements a Decision *scopes to* are two separate gaps, and only the
  first is this iteration's target.

---

## Decision: extend `ArchitectureChangeProposal`, not a second lifecycle

Settled here, before any implementation, on the evidence above:

- **A new `decide` operation is added to `architecture.change_operation`**
  — three new nullable columns (`decide_id`, `decide_title`,
  `decide_statement`), the `op` check widened to include `'decide'`,
  mirroring `create`'s own `mint_id`/`mint_kind`/`mint_name` shape.
  `applyProposal`'s `decide` branch inserts into `architecture.decision`
  (`id`, `title`, `status = 'accepted'`, `statement`) at apply time — no
  new table, no new module, no new HTTP route (Iteration 13's existing
  `GET /proposals/:id` surfaces any operation `toOperationDetail` knows
  how to shape, unchanged since Iteration 12 added `provide` with zero
  route changes).
- **Rejected: a dedicated `DecisionProposal` mechanism**, parallel to
  `ArchitectureChangeProposal`. This would duplicate a state machine
  (draft → review → approve) for a change that is not, in any
  substantive way, a different *kind* of architecture change from
  `create`/`retire`/`provide` — it would cost a new table, new
  attribution columns, new error classes, and a second thing to keep
  consistent with the first, for no capability the existing mechanism
  lacks. `CLAUDE.md`'s own Design Rules — "prefer centralized authority,"
  "avoid duplicate sources of truth" — argue directly against it, and
  the Simplicity Reviewer's "can two concepts become one?" question
  answers itself: proposing a Decision and proposing an Element mint
  are the same concept (a reviewed architecture change) with a
  different payload, not two concepts.
- **Rejected: driving `architecture.decision.status`'s own existing
  `proposed`/`accepted`/`superseded` vocabulary directly**, without
  going through `change_proposal` at all (adding `authored_by`/
  `accepted_by` columns to `architecture.decision` itself and a small
  set of functions to transition its `status`). Smaller in raw column
  count than it first appears, but strictly larger in *new surface*
  than the chosen option: a new module, new error classes, and a
  second independent draft/review concept living beside
  `change_proposal`'s, for governance this project has already built
  once. Rejected on the same "prefer one source of truth" grounds as
  the option above, not because it is unworkable.
- **The mutual-exclusivity fix is resolved as part of this decision,
  not deferred again**: the `change_operation_check` constraint is
  rewritten so each `op` branch asserts both presence of its own
  required fields **and** absence of every other operation's fields —
  a single, larger `case` expression, no new column, no query change
  anywhere that reads `change_operation`. The `jsonb`-payload
  alternative Iteration 12's migration comments anticipated since
  Iteration 1 is rejected for this iteration specifically because it
  would touch every existing reader of `change_operation`'s typed
  columns (`applyProposal`, `getProposalDetail`, `toOperationDetail`)
  for a benefit (schema flexibility for operation types not yet
  imagined) this iteration's own evidence does not yet demand.

---

## What We Only Believe

1. **That a mutual-exclusivity `case` expression, covering four
   operation types' worth of columns, stays readable** rather than
   becoming the kind of check constraint nobody wants to extend a fifth
   time — untested; if a fifth operation type is ever proposed, this is
   the first place to check whether the `jsonb` alternative's cost has
   finally been earned.
2. **That leaving `decision_scope` unpopulated by this mechanism is the
   right cut**, rather than a real Technology Profile / real Decision
   workflow needing both created together atomically. No concrete
   scenario has demanded this yet (mirroring Iteration 12's own
   reasoning for leaving it deferred), but Iteration 16 is the second
   iteration in a row to touch Decision governance without closing it —
   worth naming as a real, accumulating question, not a permanently
   settled one.
3. **That no Decision anywhere in this project's history ever needs to
   start `'proposed'` and sit un-accepted** — plausible (nothing today
   exercises that state), but this iteration doesn't test it either;
   see Explicit Deferrals.

---

## Recommended Iteration 16 Scope

1. **Migration**: add `decide_id text`, `decide_title text`,
   `decide_statement text` to `architecture.change_operation`; widen
   `change_operation_op_check` to `op in ('create', 'retire', 'provide',
   'decide')`; rewrite `change_operation_check` so each `op` branch
   requires its own fields **and** forbids every other operation's
   fields (the mutual-exclusivity fix, covering `create`/`retire`/
   `provide` retroactively as well as the new `decide` branch — not a
   new debt scoped only to the newest operation).
2. **`src/proposal/proposal.ts`**: `ProposalOperationInput` gains `op:
   "decide"` plus `decideId?`, `decideTitle?`, `decideStatement?`;
   `validateOperation` requires all three when `op === "decide"` and
   calls `assertId(op.decideId, "decision")`; `applyProposal`'s
   transaction gains a `decide` branch inserting into
   `architecture.decision` with `status = 'accepted'`; `toOperationDetail`
   gains the matching optional fields, following `mintId`/`mintKind`/
   `mintName`'s existing pattern exactly.
3. **No new table, no new module, no new HTTP route.** `GET
   /proposals/:id` (Iteration 13) surfaces a `decide` operation for free
   once `toOperationDetail` knows its shape, the same way it started
   surfacing `provide` in Iteration 12 with zero route changes.
4. **Demonstrate the concrete acceptance-criterion loop this closes**:
   draft a proposal with one `decide` operation → submit → approve →
   apply → a real `architecture.decision` row now exists, created
   through governance, not a direct insert → call
   `createTechnologyProfile` (Iteration 15,
   `src/architecture/technology-profile.ts`) citing that row's id →
   succeeds. This is the real, end-to-end evidence that Open Question
   #7's gap is closed, not merely that a `decide` operation exists in
   isolation.

---

## Acceptance Criteria

1. A proposal containing a `decide` operation is rejected by
   `validateOperation` when any of `decideId`/`decideTitle`/
   `decideStatement` is missing, or when `decideId` fails
   `assertId(..., "decision")` — checked with real failing attempts,
   not asserted from the code alone.
2. `applyProposal` on an approved proposal with a `decide` operation
   inserts exactly one `architecture.decision` row, `status =
   'accepted'`, and the proposal reaches `applied` — checked against
   the real row, not merely "the call did not throw."
3. The rewritten `change_operation_check` rejects a raw insert that
   supplies fields belonging to more than one operation on the same row
   (e.g., both `mint_id` and `provide_component_id` set) — checked
   directly against the DB, covering at least one cross-contamination
   case for each pair of operation types, not only the new `decide`
   branch.
4. `GET /proposals/:id` (Iteration 13's existing route, unmodified)
   returns a `decide` operation's `decideId`/`decideTitle`/
   `decideStatement` in its `operations[]` array once
   `toOperationDetail` is extended — confirmed over real HTTP, not only
   at the `proposal.ts` unit level.
5. The full end-to-end loop in "Recommended Scope" item 4 passes: a
   Decision created through a real, applied proposal is then
   successfully cited by `createTechnologyProfile`, closing the loop
   Iteration 15 left open.
6. Every existing proposal test (`create`/`retire`/`provide`, all three
   already covering the pre-existing check constraint's behavior)
   continues to pass unmodified against the rewritten
   `change_operation_check` — the mutual-exclusivity fix must not
   narrow what `create`/`retire`/`provide` are already legally allowed
   to do.
7. The Report states plainly that `decision_scope` (which elements a
   Decision governs) remains unimplemented by this mechanism, and that
   `decision.status`'s `'proposed'` value remains unreached by it — both
   disclosed, not silently dropped.

---

## Explicit Deferrals

- **`architecture.decision_scope` population** — governing which
  elements a newly created Decision applies to stays exactly as
  unimplemented as Iteration 12 left it; a real scenario needing it,
  not this iteration's own momentum, should be what finally scopes it.
- **Superseding or amending an existing Decision** (a `decision`
  analogue to `element_succession` / `retire`) — this iteration only
  adds governed *creation*; modifying or retiring a Decision once
  accepted is untouched and undesigned.
- **Driving `decision.status` through `'proposed'`** — every Decision
  this mechanism creates is inserted already `'accepted'`, at apply
  time, matching how minted Elements are inserted already `'active'`.
  Whether a real workflow ever needs a Decision to exist in a
  not-yet-accepted state is not addressed here.
- **The `jsonb`-discriminated-payload alternative** for
  `change_operation` — rejected for this iteration specifically (see
  Decision, above), not ruled out permanently; revisit if a fifth
  operation type's own scoping finds the mutual-exclusivity `case`
  expression has become unreadable.
- **Any HTTP write route for proposing a Decision directly** (as
  opposed to as one operation inside an existing
  `POST`-proposal-drafting flow, which does not yet exist over HTTP for
  *any* operation type — Iteration 13 only ever added read routes).
  Unrelated to this iteration; direct function calls remain this
  iteration's own evidence, matching every governed-mechanism iteration
  since Iteration 12.

---

## Risks

- **The mutual-exclusivity constraint could reject a legitimate row
  shape nobody anticipated**, if any existing operation type's
  "required" vs. "must be absent" boundary was drawn incorrectly while
  retrofitting `create`/`retire`/`provide` into the same rewritten
  check — mitigated by Acceptance Criterion 6 (every existing test must
  keep passing unmodified) and Criterion 3 (explicit cross-
  contamination tests), not merely by code review.
- **Indirect attribution (joining through `change_operation` to find
  who authored a Decision) could prove insufficient** once a real
  reviewer actually needs "who decided this, and when" as a first-class,
  directly queryable fact rather than a join — the same indirection
  already accepted for Elements, inherited here rather than newly
  introduced, but worth naming since Decisions are arguably more
  scrutiny-worthy artifacts than an arbitrary minted Component.
- **This still does not make Technology Profile governance "real" in
  the fullest sense** — it closes the mechanical gap (a Decision can now
  be created through review, not only by direct insert), but does not
  itself guarantee any real PO/architect will use it correctly, the
  same category of residual risk every governed-mechanism iteration in
  this project has disclosed rather than claimed to eliminate.

---

## Why Iteration 16 Is The Right Next Step

This is the exact scenario Iteration 12's own `/review` predicted and
named as the point at which `change_operation`'s disclosed schema debt
would have to be paid: *"before a fourth operation type is added."*
Closing Open Question #7 requires exactly a fourth operation type, so
this iteration is where that debt comes due — better paid now,
deliberately and with full test coverage of the retrofit, than
discovered as an accidental side effect of some future, unrelated
change. It also directly extends Iteration 12's own precedent (mint →
usable, via `provide`) to the one remaining ungoverned architecture
primitive this project has — Decisions — using the same mechanism
already validated for that exact purpose, rather than inventing a
second one. And it gives Iteration 15's Technology Profile governance
its first real, end-to-end demonstration: a Decision created through
actual review, not a pre-seeded YAML fixture, successfully cited by a
real Technology Profile.
