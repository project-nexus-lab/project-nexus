# Iteration 15 Scope — can Technology Profiles be represented and resolved as governed configuration, without redesign later?

This is a scope document, not a report. Nothing described here has been
built. It follows an architecture-clarification session (not an
iteration) that revised the roadmap's original Iteration 15 sketch — a
flat Product→profile attachment reusing the Decision/governance
mechanism — after multi-category tech stacks (backend/frontend/
infrastructure/data) showed that shape was wrong. This scope adopts that
session's conclusions as given, does not re-argue them, and makes the
two decisions that session left explicitly open: the smallest viable
`TechnologyProfile` field set, and which governance mechanism creates
and assigns one.

---

## Question Under Test

Can a Technology Profile be represented as `Product × Category →
Technology Profile` configuration, resolved by reusing the existing,
already-validated `ancestry()` traversal (§8.4, `src/graph/traversals.ts`)
— with no new traversal, no new architecture-taxonomy concept, and no
general conflict-resolution mechanism — while remaining governed (every
profile assignment attributable and reviewable, not a bare data seed)?

---

## What We Know

Adopted from the architecture-clarification session as established,
not re-argued here:

- **One Nexus instance serves exactly one organization**; no
  `tenant_id`/`organization_id` exists or is needed
  (`docs/MVP_ARCHITECTURE_V2.md`, Instance Scope).
- **Product is the highest architecture ownership boundary.** Every
  `architecture.element` reaches exactly one Product through containment
  ancestry, mechanically enforced today by `element_root_parent` and
  `check_legal_containment` (`docs/NEXUS_CONSTITUTION.md`;
  `apps/backend/db/migrations/0002_architecture.sql`).
- **Repository/Task single-Product ownership is unenforced.**
  `repo.repository_component` and `work.work_item_capability` are plain
  many-to-many joins with no constraint tying either side to a shared
  Product ancestor (`docs/PROJECT_KNOWLEDGE.md`, Unproven). Technology
  Profile resolution in this iteration is scoped to **Product ×
  Category**, not Repository or Task, so it does not depend on that
  question being resolved — named here so a future reader doesn't
  mistake this iteration for having resolved it.
- **Categories are Architecture-context facts about a Component's role**
  (backend/frontend/infrastructure/data), not a Repository concern, and
  must not be a hardcoded, CHECK-constrained enum — the same "no future
  redesign" requirement `architecture.legal_containment` already
  satisfies for containment rules, by being a small data-driven
  reference table rather than a fixed list baked into a constraint.
- **A flat, single composite profile per Product was rejected.**
  Composite catalog ids (e.g. `tech.java24-spring-react-postgres-azure`)
  are prose wearing an identifier's clothes: they don't decompose into
  queryable facts, violate "prefer structured knowledge"
  (`docs/NEXUS_CONSTITUTION.md`), and grow combinatorially with every new
  stack element. Category-scoped assignments avoid this: each
  `(Product, Category)` pair points at one profile scoped to that
  category alone.
- **`ancestry()` (`src/graph/traversals.ts:17`) already walks any element
  up to its Product**, validated and in production use since §8.4.
  Resolving a Component's Technology Profile is: call `ancestry()` to
  find the Product, then look up `(product_id, category)` — no new
  traversal function, and no nearest-ancestor-wins resolution logic,
  because there is exactly one attachment point (the Product), not a
  chain of possible overriding ancestors the way `decision_scope` allows
  for Decisions.
- **`architecture.decision`
  (`apps/backend/db/migrations/0002_architecture.sql:134`) has no
  governed creation path today.** It has a `status` check
  (`proposed`/`accepted`/`superseded`) but no proposal, no
  `change_operation` linkage, no `authored_by` — every row that exists
  was written by direct insert (the YAML importer), the same disclosed
  gap Iteration 12 found and explicitly left open for Decisions when it
  closed the equivalent gap for Elements via the `provide` operation
  (`docs/history/iteration-12/LESSONS.md`).
- **`architecture.change_operation`
  (`apps/backend/db/migrations/0002_architecture.sql:107`) has a
  disclosed, not-mutually-exclusive schema**: one flat table, nullable
  columns per op, a `check` that only asserts *presence* of an op's own
  required fields, never *absence* of another op's fields. Iteration
  12's own `/review` named this directly: *"before a fourth operation
  type is added: decide... a mutual-exclusivity check... or a
  discriminated jsonb payload"* (`docs/history/iteration-12/LESSONS.md`).
  `create`/`retire`/`provide` are the three operations that exist today;
  Technology Profile governance would be a strong candidate for a fourth
  if routed through this table.
- **v1 populates only the `backend` category**, with one profile. Its
  fields must decompose into facts a real bootstrap step could someday
  consume (`repo.repository.template_version` and
  `render(repository, localSubgraph, templateVersion)` are the
  already-validated seam for that — Phase 4, explicitly not this
  iteration).

---

## What We Only Believe

1. **That `language` + `languageVersion` + `buildSystem` is the correct
   minimum field set for v1**, rather than something smaller or larger —
   argued below, but not yet tested against a second real category or a
   language needing a distinct runtime target.
2. **That a category reference table populated with exactly one row
   (`backend`) today is genuinely additive later**, rather than
   discovering some hidden coupling once `frontend`/`infrastructure`/
   `data` are actually populated — plausible by analogy to
   `legal_containment`'s own history, not directly tested yet.
3. **That routing Technology Profile governance through
   `architecture.decision` citation (see Decision, below) is sufficient
   attribution**, without needing `change_operation`'s proposal
   lifecycle (draft → proposed → approved → applied) — untested because
   this iteration doesn't build a rejection or amendment path, only
   creation.

---

## Decision 1: `TechnologyProfile` v1 field set

**`id`, `category`, `language`, `languageVersion`, `buildSystem` —
nothing else.** Each candidate field beyond this set was evaluated
against "does v1's own evidence require it," not "could it plausibly be
useful":

- **`runtime` / `runtimeVersion`** — rejected for v1, not deferred as an
  oversight. For the one seeded example, Java 24 *is* its own runtime
  version; splitting `language`/`languageVersion` from a separate
  `runtime`/`runtimeVersion` pair would model a distinction v1 has no
  case that needs (a JVM language targeting a different JVM version than
  its own language version, e.g. Kotlin on an older JVM). Revisit only
  when a real second profile actually needs the split — adding two
  nullable columns later is additive, not a migration risk.
- **`framework`** — rejected. Explicitly named in the architecture-
  clarification session as a dimension to keep out of v1's field set.
  One consequence worth flagging as a correction: the profile id used in
  the roadmap and prior discussion, `tech.java24-spring`, bakes an
  unmodeled dimension (Spring) into its identifier. This scope corrects
  the v1 example id to **`tech.java24-gradle`** — naming only fields
  that actually exist as columns, not fields the catalog id implies but
  the schema doesn't carry.
- **`ciProfile`, `containerization`** — rejected. Both are repository-
  generation concerns (Phase 4, already deferred), not facts a Product ×
  Category lookup needs to answer today. Adding them once repository
  generation actually consumes a profile is additive.
- **`database`** — rejected. Belongs to the `data` category, which v1
  does not populate. Adding it is exactly the kind of category-scoped
  extension this schema is designed to make additive, not a reason to
  add an unused column to `backend` rows now.

---

## Decision 2: governance mechanism

**Reuse `architecture.decision` as a required citation, not a new
lifecycle and not `change_operation`.** Concretely: creating or
modifying a `technology_profile` row requires an `authored_by` string
plus a `decision_id` foreign key to an existing, `status = 'accepted'`
row in `architecture.decision` — checked at write time, not merely
documented as a convention. *Assigning* an already-existing profile to a
`(product_id, category)` pair requires no new Decision (it's selecting
among governed options, the same "select needs no ADR, create/modify
does" split the architecture-clarification session already established
for the profile/category relationship itself).

Reasoned directly from the two options named in the clarification
session:

- **Option A (extend `architecture.change_operation`)** — rejected.
  This would make Technology Profile governance the fourth operation
  type sharing a table Iteration 12's own `/review` already flagged as
  needing a mutual-exclusivity fix *before* a fourth type arrives. Adding
  it now means either accepting that debt gets worse with no plan to pay
  it, or blocking this iteration on fixing `change_operation`'s schema —
  a change with a much larger blast radius than Technology Profiles
  need, and out of proportion to what this iteration is actually
  scoped to test.
- **Option B (a dedicated `TechnologyProfileProposal` mechanism)** —
  rejected as over-engineering for what this iteration actually needs.
  `change_proposal`'s draft → proposed → approved → applied lifecycle
  exists because Architecture element changes cascade (`create` mints
  an id other rows can reference; `retire` requires checking nothing
  live still depends on the target). A Technology Profile assignment
  has no such cascade — it is a single row naming a single category
  fact for a single Product. Building a parallel state machine for it
  duplicates real machinery to govern something with none of the
  complexity that machinery exists to manage.
- **Option C (require citation of an existing `architecture.decision`
  row)** — adopted. It reuses a mechanism that already exists, adds
  exactly one FK check, and gives every profile row genuine
  attribution (which Decision authorized this stack choice) without
  inventing new lifecycle states or touching `change_operation` at all.

**The caveat this decision does not paper over:** `architecture.decision`
itself has no governed creation path (see "What We Know," above) — every
Decision row today is a direct-inserted YAML seed. Routing Technology
Profile governance through a citation of *that* table means v1's own
evidence will show only that the citation check works against a
pre-seeded, already-`accepted` Decision — not a real, end-to-end "a
Product Owner proposes a new technology stack and it becomes governed"
workflow. That gap is inherited, not solved, by this decision. It is the
same gap Iteration 12 named and explicitly left open for Decisions; this
iteration does not close it, and should not be read as having done so.

---

## Recommended Iteration 15 Scope

1. **`architecture.technology_category`** — a small reference table
   (`category text primary key`), seeded with exactly the four known
   values (`backend`, `frontend`, `infrastructure`, `data`) as data rows,
   mirroring `legal_containment`'s own pattern: adding a fifth category
   later is one insert, not a schema change or a CHECK-constraint edit.
2. **`architecture.technology_profile`** — `id` (text primary key,
   `tech.*` id pattern), `category` (references
   `technology_category(category)`), `language`, `language_version`,
   `build_system`, `decision_id` (references `architecture.decision(id)`,
   not null), `authored_by` (text, not null, opaque `human:<id>` /
   `run:<id>` string matching `change_proposal.authored_by`'s existing
   convention).
3. **`architecture.product_technology_profile`** —
   `product_id` (references `architecture.element(id)`, and — enforced
   at the application layer, since a bare FK can't check `kind`, the
   same limitation `element_provision`'s `component_kind`/
   `capability_kind` columns work around today — must be a `kind =
   'product'` element), `category` (references
   `technology_category(category)`), `profile_id` (references
   `technology_profile(id)`), primary key `(product_id, category)` — one
   profile per category per Product, by construction.
4. **A resolution function**, `resolveTechnologyProfile(db, componentId,
   category)`: call the existing `ancestry()` to find `componentId`'s
   Product, then look up `product_technology_profile(product_id,
   category)`, returning the profile row or `null` if unassigned. No new
   traversal; no override or nearest-ancestor logic — one lookup at one
   fixed point (the Product).
5. **A minimal write path enforcing the Decision-citation requirement**:
   creating a `technology_profile` row requires an existing `status =
   'accepted'` `architecture.decision` row (checked at write time, not
   merely documented); assigning a profile to `(product_id, category)`
   requires only that the profile and category both already exist.
   Direct function calls / direct inserts are sufficient evidence for
   this iteration, matching the precedent Iteration 12 and 14a both
   set (prove the mechanism before building an API surface for it).
6. **Seed and demonstrate the v1 example end-to-end**: one Decision
   (`adr.backend-stack-java24-gradle`, `status = 'accepted'`), one
   Technology Profile (`tech.java24-gradle`, `category = 'backend'`,
   citing that Decision), assigned to one real seeded Product (reusing
   an existing Product from prior iterations' seed data, not inventing
   a new one), resolved via `resolveTechnologyProfile()` starting from
   one of that Product's real Components.

---

## Acceptance Criteria

1. `architecture.technology_category` exists with all four values
   seeded as data rows, and adding a hypothetical fifth (exercised only
   in a test, not left in seed data) requires no schema or CHECK-constraint
   change.
2. `architecture.technology_profile` rejects, at write time, an attempt
   to create a profile citing a `decision_id` that does not exist or
   whose `status` is not `accepted` — checked with a real failing
   attempt, not merely asserted.
3. `architecture.product_technology_profile` enforces at most one
   profile per `(product_id, category)` via its primary key, and a
   second assignment attempt for the same pair is rejected or requires
   an explicit replace — checked directly, not assumed from the primary
   key definition alone.
4. `resolveTechnologyProfile()` returns the correct profile for a real
   Component reached through at least two containment levels (Component
   → Subsystem → Domain → Product, reusing `ancestry()`), and returns
   `null` for a Product with no assignment in a given category — both
   checked against real seeded data, not a mocked ancestry result.
5. The full v1 example (one Decision, one Profile, one assignment, one
   resolution call from a real Component) runs end-to-end against
   PGlite in the hermetic test suite.
6. No existing table, function, or route is modified — `element`,
   `change_proposal`, `change_operation`, `decision`, `decision_scope`,
   every §8.4 traversal, and every Iteration 13 HTTP route are all
   unchanged. This iteration is additive only.
7. The Report states plainly which of "What We Only Believe" (above)
   remain untested at close, rather than silently dropping them.

---

## Explicit Deferrals

- **Repository generation actually consuming a resolved Technology
  Profile** (Phase 4) — stays behind Repository Bootstrap's own
  still-Unproven push/branch/PR-at-scale question
  (`docs/PROJECT_KNOWLEDGE.md`, Unproven).
- **Component-level Technology Profile overrides** (Phase 2) — no
  override, inheritance, or conflict-resolution mechanism of any kind is
  built; resolution is a single fixed lookup at the Product, full stop.
- **Portfolio-wide reporting over profiles** (Phase 3) — no aggregate
  query, dashboard, or cross-Product view.
- **`frontend` / `infrastructure` / `data` category population** — the
  category table carries all four values from day one; only `backend`
  gets an actual profile and assignment this iteration.
- **Any HTTP route, UI, or authoring surface for Technology Profiles** —
  direct function calls and direct inserts are this iteration's own
  evidence, matching Iteration 12/14a's precedent; a real authoring
  surface, if ever needed, is later, separately evidence-justified work.
- **A governed creation path for `architecture.decision` itself** —
  named directly under Decision 2, above, as an inherited gap, not
  solved here.
- **Repository/Task single-Product ownership enforcement** — unrelated
  to Product × Category resolution; stays exactly as unresolved as
  `docs/PROJECT_KNOWLEDGE.md`'s Unproven entry already states.
- **`change_operation`'s disclosed mutual-exclusivity debt** — named as
  the reason Option A was rejected, not fixed here; whoever eventually
  adds a fourth real operation type to that table still needs to resolve
  it first.

---

## Risks

- **The Decision-citation requirement could read as governance theater**
  if `architecture.decision` itself has no real creation path — mitigated
  only by disclosing this plainly (see Decision 2's caveat), not by
  pretending the citation proves more than it does.
- **A future second profile might invalidate the "runtime is redundant
  with language" call** (e.g., a JVM language needing a runtime version
  independent of its language version) — named directly in Decision 1;
  the fix (adding two nullable columns) is additive, not a redesign, but
  is a real risk of under-fitting v1's field set to a single example.
- **The application-layer `kind = 'product'` check on
  `product_technology_profile.product_id`** (a bare FK can't enforce
  this, mirroring `element_provision`'s existing workaround) could be
  bypassed by a future direct insert that skips the application layer —
  the same class of risk `element_provision` already accepts today, not
  a new one introduced here.

---

## Why Iteration 15 Is The Right Next Step

The architecture-clarification session already did the harder work of
ruling out the wrong shape (flat Product→profile) before any schema was
written — this scope's job is only to make the two decisions that
session deliberately left open (field set, governance mechanism) and
turn "category-scoped assignments, reusing `ancestry()`" from a
conclusion into a tested, additive schema. Doing that now, before
Repository generation (Phase 4) or component-level overrides (Phase 2),
follows the same bottom-up discipline this project has applied since
Iteration 10: validate the smallest resolvable slice (one category, one
profile, one Product, one lookup) against real seeded data before
building anything that depends on it working. It also settles the
governance-mechanism question explicitly, rather than letting a future
iteration inherit it as unstated debt the way `change_operation`'s own
mutual-exclusivity gap was inherited before Iteration 12's `/review`
finally named it.
