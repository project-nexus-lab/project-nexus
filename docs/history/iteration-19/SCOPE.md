# Iteration 19 Scope — can a resolved Technology Profile actually reach a generated repository?

This is a scope document, not a report. Nothing described here has been
built. It is the first slice of Iteration 15's own deferred "Phase 4" —
repository generation actually consuming a Technology Profile — named
in `docs/ROADMAP.md`'s "Future, not yet scoped" section since Iteration
15 closed, and now attempted deliberately narrow rather than all at
once.

---

## Question Under Test

Can `resolveTechnologyProfile()` (Iteration 15, `src/architecture/technology-profile.ts`)
be wired into `generateProjection()` (`src/repository/lifecycle.ts`) so
a repository's generated projection reflects its Product's actual,
governed Technology Profile — additively, with zero effect on every
repository that has none assigned (which is every repository in this
project's real seed data today) — without yet attempting the larger,
separate claim that a resolved profile can drive *real* language/build/
CI scaffolding content?

---

## What We Know

Checked directly against the actual code, not carried over from
Iteration 15's own closing prose:

- **`resolveTechnologyProfile(db, componentId, category):
  Promise<ResolvedTechnologyProfile | null>` already exists, unchanged
  since Iteration 15, and needs no changes for this iteration.** It
  walks `componentId` to its Product via the existing `ancestry()`
  traversal and looks up `(product_id, category)` — `{ id, category,
  language, languageVersion, buildSystem, decisionId }` or `null` if
  unassigned.
- **`render()` (`src/repository/generate.ts`) is explicitly documented
  as a pure function** — `render(repository, localSubgraph,
  templateVersion) → managed regions` (§10.4) — and does no DB I/O
  itself. `generateProjection()` (`lifecycle.ts`) is the impure
  orchestrator that already resolves DB state (`repo.repository_component`,
  `localSubgraph()` per mapped component) and passes it into `render()`
  as already-resolved input. Technology Profile resolution belongs in
  `generateProjection()`, not `render()`, for the same reason
  `subgraphs` does.
- **`Repository → Architecture` is a declared-legal dependency
  direction** (`docs/MVP_ARCHITECTURE_V2.md` §2.3) — `lifecycle.ts`
  already imports `localSubgraph` from `../graph/traversals.js`
  (Architecture context); importing `resolveTechnologyProfile`/
  `ResolvedTechnologyProfile` from `../architecture/technology-profile.js`
  is the same, already-established direction, not a new one.
- **No schema change is needed to store or drift-check a fourth
  generated file.** `generateProjection()` already iterates every
  `ManagedFile` `render()` returns, hashing each into
  `repo.generated_region` uniformly (`repository_id`, `file_path`,
  `region_hash`) — confirmed by reading the function directly, not
  assumed. A fourth file is free.
- **`repo.repository_component` already has an `is_primary` flag**,
  the same disambiguation mechanism `element_provision.is_primary`
  already uses elsewhere — `generateProjection()`'s existing mapping
  query does not currently select it, but the column is already there.
- **Only the `backend` category has ever had real data** (Iteration
  15's own v1 scope), and even that assignment
  (`tech.java24-gradle` → `prod.trade-platform`) exists only inside one
  hermetic test's own transaction, not in the permanent seed YAML —
  every currently-seeded repository has no assigned Technology Profile
  today, for any category.
- **Which category a given Component or Repository itself belongs to
  has no schema field anywhere** — named directly as a disclosed,
  deliberately-unbuilt gap in the architecture-clarification session
  before Iteration 15 ("Component-level category classification...
  explicitly NOT built in Iteration 15") and never revisited since.
  This iteration does not build it either — see Decision, below.
- **The Iteration 17 Artifact Review's `nexusBaseUrl` finding is a live
  lesson, not abstract history, for this exact iteration**: a generated
  file mixing genuine Architecture-computed knowledge with
  environment/deployment configuration was flagged as a footprint smell
  worth avoiding in *future* generated content. This iteration adds a
  new generated file — the first real test of whether that lesson
  actually shaped anything.
- **`POST /alignment/verify` (Iteration 18) only ever checks
  `.nexus/repository.json`'s claims** (`repositoryId`, `componentIds`)
  — a new, fourth generated file is invisible to it by construction,
  since the CI workflow's own posted body never changes.

---

## What We Only Believe

1. **That resolving against the repository's *primary*-mapped
   component (`is_primary = true`) is the right anchor** for finding
   "the" Product to check a Technology Profile against — reasonable
   given Repository/Task single-Product ownership is the common,
   unenforced case today (`docs/PROJECT_KNOWLEDGE.md`, Unproven, since
   the Iteration 14a/15 architecture-clarification session), but this
   iteration doesn't test a repository whose mapped components span
   more than one Product.
2. **That hardcoding the `backend` category for this iteration's own
   resolution call is the right minimal choice**, rather than checking
   all four categories — plausible (it's the only category with any
   real precedent), but means this iteration produces zero new evidence
   about how multi-category resolution for a single repository would
   actually behave.
3. **That a repository with no primary-mapped component should simply
   skip Technology Profile generation silently**, the same way an
   unassigned Technology Profile does — rather than being treated as an
   error. Consistent with this project's own "absent ⇒ omitted, not a
   gate failure" pattern (`relatedElements`, Iteration 14a), but not
   tested against a real scenario demanding the opposite.

---

## Decision: project the resolved profile into a new, separate generated file — not a new field on `.nexus/repository.json`, not real scaffolding content

- **A new file, `.nexus/technology-profile.json`**, not an addition to
  `.nexus/repository.json`. Each existing generated file already has
  one concern — `repository.json` is repository identity,
  `architecture.snapshot.json` is local graph facts,
  `nexus-alignment.yml` is the CI hook. A resolved Technology Profile is
  a fourth, genuinely distinct concern, not a natural extension of
  repository identity — and keeping it separate means the CI workflow
  and `POST /alignment/verify`'s existing contract need zero changes,
  since neither has ever needed to know about it.
- **Contains only genuine Architecture-computed knowledge**: `{
  profileId, category, language, languageVersion, buildSystem,
  decisionId }` — the exact shape `resolveTechnologyProfile()` already
  returns, renamed only `id` → `profileId` for clarity in a file a
  human might read directly. No environment/deployment configuration of
  any kind goes into it — the direct, concrete answer to the Iteration
  17 Artifact Review's own lesson, checked as part of this iteration's
  own review, not merely stated as an intention.
- **Rejected: generating real language/build/CI scaffolding content**
  (a `build.gradle`, a `Dockerfile`, a CI matrix) driven by the resolved
  profile's `language`/`buildSystem`. That is §15's fuller "Phase 4"
  vision and a materially larger claim — templating real, tool-specific
  file formats this project has never generated before. This iteration
  answers the narrower, prerequisite question ("can the resolved fact
  reach the repository at all") before attempting the larger one
  ("can Nexus synthesize real scaffolding from it").
- **Rejected: a required, gating dependency on a Technology Profile
  existing.** Every currently-seeded repository has none; making
  generation fail or behave differently by default would be a breaking
  change to something this iteration has no evidence demands it.
  Additive only: present → a fourth file; absent → exactly today's
  three, unchanged.

---

## Recommended Iteration 19 Scope

1. **`src/repository/generate.ts`**: `RenderInput` gains an optional
   `technologyProfile?: ResolvedTechnologyProfile | null` (imported from
   `../architecture/technology-profile.js`). When present and non-null,
   `render()` returns a fourth `ManagedFile` at
   `.nexus/technology-profile.json`, wrapped in the same
   `wrapManagedRegion()` markers as every other generated file; when
   absent or `null`, `render()`'s return value is byte-identical to
   today's three files — confirmed by every existing test continuing to
   pass unmodified, not merely argued.
2. **`src/repository/lifecycle.ts`'s `generateProjection()`**: extends
   its existing mapping query to also select `is_primary`; if exactly
   one primary-mapped component exists, calls
   `resolveTechnologyProfile(db, primaryComponentId, "backend")` and
   passes the result into `render()`. No primary component mapped →
   passes `null`, exactly today's behavior. No new parameter on
   `generateProjection()`'s own signature — every existing caller is
   unaffected.
3. **No schema migration.** `repo.generated_region` already stores and
   drift-checks a fourth file for free, confirmed directly against
   `generateProjection()`'s existing loop.
4. **No change to `POST /alignment/verify`, `render()`'s existing three
   files, or the generated CI workflow.** This iteration is additive
   only.

---

## Acceptance Criteria

1. `render()`, given a real, non-null `technologyProfile`, returns
   exactly four files, the fourth containing `{ profileId, category,
   language, languageVersion, buildSystem, decisionId }` matching the
   input verbatim, wrapped in the standard managed-region markers.
2. `render()`, given `technologyProfile` omitted or `null`, returns
   exactly the same three files as before — every pre-existing
   `repository.test.ts` test passes unmodified, the actual proof this
   claim is additive rather than argued from the diff alone.
3. `generateProjection()` resolves a real Technology Profile end-to-end
   for a repository whose primary-mapped component's Product has one
   assigned (`backend` category), and the resulting fourth file is
   correctly hashed into `repo.generated_region` alongside the other
   three, using the existing mechanism unmodified.
4. A repository with no primary-mapped component (zero mappings, or
   mappings with no `is_primary = true` row) completes generation with
   exactly three files — not an error, not a fourth file with null
   content.
5. A repository whose Product has no assigned `backend` Technology
   Profile — every currently-seeded repository — completes generation
   with exactly three files, confirmed by the full existing
   `repository.test.ts` suite passing with zero modifications.
6. `POST /alignment/verify`'s full existing test suite passes
   unmodified — the new file is genuinely invisible to it, not merely
   assumed to be.
7. The new file's content is checked, during `/review`, to contain
   nothing but genuine Architecture-computed facts — no URL, no
   environment reference, no deployment configuration — a direct,
   concrete check against the Iteration 17 Artifact Review's own
   finding, not a restated intention.
8. The Report states plainly that the `backend` category is hardcoded,
   and that determining a repository's or component's own category
   remains an open, disclosed gap this iteration does not close.

---

## Explicit Deferrals

- **Generating real language/build/CI/container scaffolding content**
  from the resolved profile's `language`/`buildSystem` — the fuller
  "Phase 4" vision; this iteration only projects the resolved fact,
  it does not synthesize tool-specific file formats.
- **Determining which category a Component or Repository itself
  belongs to**, for when more than one category is ever populated —
  sidestepped by hardcoding `backend`, not solved. Still the same named
  gap from the Iteration 14a/15 architecture-clarification session.
- **Any change to `POST /alignment/verify`** to validate the new file's
  claims — the CI workflow doesn't post it; unrelated to this
  iteration's question.
- **Repository/Task single-Product ownership enforcement** — unrelated,
  untouched; this iteration's "primary component" heuristic inherits
  the same unenforced assumption every other repository-mapping
  consumer in this codebase already does.
- **Component-level Technology Profile overrides (Phase 2) and
  portfolio-wide reporting (Phase 3)** — unrelated, unchanged.
- **A repository whose mapped components span more than one category
  or Product** — no concrete scenario exists yet; not designed around
  speculatively.

---

## Risks

- **Hardcoding `backend` produces zero new evidence about multi-category
  resolution** for a single repository — a real, disclosed limit of
  "first iteration," not a flaw, but worth naming so a future reader
  doesn't mistake this iteration for having validated the general case.
- **The "primary component decides the Product" heuristic could be
  wrong for a repository whose mapped components genuinely span
  Products** — inherits, rather than introduces, the already-Unproven
  single-Product-ownership question; if that question resolves against
  enforcement later, this heuristic may need revisiting alongside it.
- **Because no real Technology Profile is assigned anywhere in this
  project's actual seed data**, this iteration's real-world effect is
  zero until someone assigns one for real — worth stating plainly
  rather than overselling what "wired end-to-end" means before a real
  assignment exists outside a test transaction.

---

## Why Iteration 19 Is The Right Next Step

This is the natural payoff of Iterations 15 through 18: Technology
Profiles resolve (15), Decisions govern them (16), a real repository
can receive real pushed content (17), and that content's alignment with
Nexus can be verified (18) — the one thing never actually connected end
to end is whether a resolved Technology Profile itself reaches a
generated repository at all. This iteration answers exactly that,
in the smallest possible increment (a pure projection, reusing every
existing mechanism — resolution, rendering, hashing, drift-checking —
unmodified), before attempting the substantially larger and riskier
claim that Nexus can synthesize real, tool-specific scaffolding content
from it. Matches this project's own bottom-up discipline: validate the
narrow slice before building the wider one on top of it.
