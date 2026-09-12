# Iteration 15 Report — Technology Profiles as governed configuration

Status: complete for the scope agreed in `docs/history/iteration-15/SCOPE.md`,
with a clean result. 177 `node:test` cases pass (up from Iteration 14's
163: 10 new in `test/technology-profile.test.ts`, 4 new in
`test/schema-constraints.test.ts`), fully hermetic, zero network access.
No live agent run — unlike the `relatedElements`/`RunBlocked` iterations,
nothing here touches `buildPrompt()` or classification, so PGlite-backed
`node:test` is the right and only evidentiary bar this scope set for
itself (Acceptance Criterion 5).

## Scope completed

1. **`architecture.technology_category`** (migration
   `0014_technology_profile.sql`): a plain reference table, seeded with
   `backend`/`frontend`/`infrastructure`/`data` as data rows — mirroring
   `architecture.legal_containment`'s own pattern rather than a
   CHECK-constrained enum. Verified directly: a fifth category (`mobile`)
   was added in a test with a single insert, no migration, no constraint
   edit.
2. **`architecture.technology_profile`**: `id` (`tech.*`, CHECK-constrained
   like every other authored id), `category` (FK to
   `technology_category`), `language`, `language_version`, `build_system`,
   `decision_id` (FK to `architecture.decision`, not null), `authored_by`
   (opaque `human:<id>` / `run:<id>`, matching `change_proposal`'s own
   convention). No `runtime`/`runtimeVersion`, `framework`, `ciProfile`,
   `containerization`, or `database` column — each was evaluated in
   `SCOPE.md`'s Decision 1 against v1's own evidence and rejected, not
   silently omitted.
3. **`architecture.product_technology_profile`**: `(product_id, category)`
   primary key — at most one profile per category per Product, by
   construction. `product_id` requires `kind = 'product'` via a composite
   FK to `architecture.element (id, kind)`, exactly the mechanism
   `element_provision`'s `component_kind`/`capability_kind` columns
   already use — reused, not reinvented.
4. **`product_technology_profile_category_match` trigger**: a profile
   assigned to `(product, category)` must actually carry that category
   itself — enforced the same way `check_legal_containment` enforces a
   cross-row rule no single FK can express. Verified as a real DB-level
   guarantee, not merely a wrapper-function check: `test/schema-constraints.test.ts`
   triggers it with a raw insert that bypasses the module entirely.
5. **`src/architecture/technology-profile.ts`**: `createTechnologyProfile`
   (rejects a `decisionId` that doesn't exist or isn't `accepted` —
   the one rule a bare FK can't express, checked here before the insert),
   `assignTechnologyProfile` (rejects a non-`product` `productId` with a
   precise error before the DB's own composite-FK violation would; an
   `on conflict (product_id, category) do update` upsert — a second
   assignment for the same pair is an explicit replace, not silently
   duplicated), and `resolveTechnologyProfile` (walks a Component to its
   Product via the existing, already-validated `ancestry()` (§8.4), then
   looks up `(product_id, category)` — no new traversal, no
   nearest-ancestor-wins logic, because there is exactly one attachment
   point).
6. **`tech` added to `ids.ts`'s `AuthoredKind`/`AUTHORED_PREFIX` table** —
   the same dual enforcement (`assertId` in TypeScript, CHECK constraint
   in the DB) every other authored id already has.
7. **The full v1 example, end-to-end**: one Decision
   (`adr.backend-stack-java24-gradle`, `accepted`), one Profile
   (`tech.java24-gradle`, category `backend`, citing that Decision),
   assigned to the seed's own `prod.trade-platform`, resolved from
   `comp.invoice-service` — three containment levels away
   (Component → Subsystem → Domain → Product) — through `ancestry()`,
   not a direct `product_id` lookup. Matches `SCOPE.md`'s own worked
   example exactly, including the corrected id: `tech.java24-gradle`,
   not the earlier `tech.java24-spring` sketch, which baked an unmodeled
   framework dimension into the identifier (caught and fixed in the
   architecture-clarification commit that preceded this iteration, not
   here).

## The two decisions this iteration was required to make

`docs/history/iteration-15/SCOPE.md` left the v1 field set and the
governance mechanism open, deliberately, ahead of any implementation.
Both are settled in code exactly as `SCOPE.md`'s "Decision 1" and
"Decision 2" recorded them, not approximated:

- **Field set**: `id`, `category`, `language`, `languageVersion`,
  `buildSystem` only. Every rejected candidate (`runtime`, `framework`,
  `ciProfile`, `containerization`, `database`) is absent from the schema
  itself, not merely undocumented — there is no nullable column sitting
  unused.
- **Governance**: citing an existing `accepted` `architecture.decision`
  row, checked in TypeScript before the insert (a bare FK can only
  assert the decision exists, not that its status is `accepted`).
  Neither `architecture.change_operation` (would have been a fourth
  operation type on a table already flagged, in Iteration 12's own
  `/review`, for a mutual-exclusivity fix before a fourth type arrives)
  nor a dedicated proposal lifecycle (over-engineered for an assignment
  with no cascading side effects) was used.

## What survived contact, precisely

- **The category-mismatch trigger is a real, DB-enforced guarantee**,
  not a convention the TypeScript wrapper happens to respect —
  confirmed by a raw insert that bypasses `assignTechnologyProfile`
  entirely and still fails.
- **The composite-FK "must be a product" mechanism, reused verbatim from
  `element_provision`, worked exactly as that precedent predicted** —
  no adaptation needed, confirmed by both an app-layer test (a friendly
  `ProductNotFoundError`) and a raw-DB test (the composite FK itself).
- **`ancestry()` needed no changes at all** to resolve a Technology
  Profile three containment levels away — the traversal Iteration 15's
  own scoping bet on being reusable was, in fact, reusable, unmodified,
  on the first real call.

## Scope deferred

Exactly as `docs/history/iteration-15/SCOPE.md` listed: repository
generation actually consuming a resolved profile (Phase 4, still behind
Repository Bootstrap's own Unproven push/branch/PR-at-scale question);
component-level overrides (Phase 2) and portfolio reporting (Phase 3) —
no override, inheritance, or conflict-resolution logic of any kind
exists; population of `frontend`/`infrastructure`/`data` with a real
profile (the category rows exist; no profile cites them); any HTTP
route, UI, or authoring surface (direct function calls are this
iteration's own evidence, matching Iteration 12/14a's precedent); a
governed creation path for `architecture.decision` itself (named
directly in `SCOPE.md`'s Decision 2 as an inherited, not solved, gap —
now `docs/PROJECT_KNOWLEDGE.md` Open Question #7); Repository/Task
single-Product ownership enforcement (unrelated, untouched).

## Technical debt intentionally created

None found during this iteration's own `/review` pass beyond what
`SCOPE.md` already named as deferred. One imprecise error message was
found and fixed during review, not left as debt:
`resolveTechnologyProfile`'s not-found error originally read "ancestry()
returned no 'product' ancestor," which implies a structural anomaly in
an existing element's containment chain — the overwhelmingly common
real trigger is simply a nonexistent `componentId`. Corrected to name
both cases honestly before this Report was written.

## Demonstrations and verification

```
npm run typecheck   # clean
npm test            # 177/177, fully hermetic, zero network access
```

`/review` applied this session against every file this iteration
touched (migration, module, `ids.ts`, both test files): Constitution,
Domain Integrity, and Simplicity Reviewers PASS; Evidence Reviewer
findings recorded in `LESSONS.md`; Consistency Auditor PASS (test
counts and every code comment checked directly, not trusted); Architecture
Critic considered whether `product_technology_profile` carrying no
attribution of its own was a hidden-attribution gap and found it matches
`element_provision`/`element_dependency`'s own existing precedent
exactly, not a deviation.

## Recommended next-step validation

Two threads this iteration leaves behind, both named rather than
silently dropped:

1. **Open Question #7** (`docs/PROJECT_KNOWLEDGE.md`): whether citing an
   `architecture.decision` row gives Technology Profile governance real
   attribution, given Decisions themselves have no governed creation
   path. Not this iteration's to resolve — resolving it means building
   a governed Decision-creation path for reasons broader than Technology
   Profiles alone.
2. **Scale and a second real category**, both entirely untested here:
   whether `resolveTechnologyProfile` holds up at anything beyond this
   project's own toy seed, and whether a second populated category
   (not just `backend`) surfaces anything this schema's shape didn't
   anticipate. Neither is a reason to doubt what was built — both are
   simply outside what a single-category, single-profile v1 example can
   exercise.
