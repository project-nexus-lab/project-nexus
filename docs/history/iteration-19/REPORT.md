# Iteration 19 Report — a resolved Technology Profile reaches a real, generated repository

Status: complete for the scope agreed in `docs/history/iteration-19/SCOPE.md`,
with a clean result and a real, live demonstration. 203 `node:test`
cases pass (up from Iteration 18's 198: 5 new in `test/repository.test.ts`),
fully hermetic, zero network access. In addition, a real Decision, a
real Technology Profile, and a real repository were created this
session: `generateProjection()` produced four real files (including the
new `.nexus/technology-profile.json`), pushed via Iteration 17's real
push/branch/PR mechanism unmodified, and independently verified via
`gh pr view`/`gh api` to carry byte-identical content to what was
actually rendered.

## Scope completed

1. **`src/repository/generate.ts`**: `RenderInput` gains an optional
   `technologyProfile?: ResolvedTechnologyProfile | null`. When present
   and non-null, `render()` returns a fourth `ManagedFile` at
   `.nexus/technology-profile.json` (`{ profileId, category, language,
   languageVersion, buildSystem, decisionId }`, wrapped in the same
   managed-region markers as every other generated file); when absent
   or `null`, `render()`'s output is byte-identical to every call before
   this iteration — confirmed by every pre-existing `repository.test.ts`
   test passing unmodified.
2. **`src/repository/lifecycle.ts`'s `generateProjection()`**: extends
   its existing mapping query to also select `is_primary`; resolves a
   Technology Profile via `resolveTechnologyProfile()` (Iteration 15)
   against the repository's primary-mapped component and a hardcoded
   `backend` category, only when *exactly one* component is marked
   primary. No new parameter on `generateProjection()`'s own signature.
3. **No schema migration.** `repo.generated_region` already hashes and
   drift-checks whatever `render()` returns; a fourth file needed
   nothing new, confirmed directly rather than assumed.
4. **No change to `POST /alignment/verify`** (Iteration 18) — it only
   ever checked `.nexus/repository.json`'s claims; the new file is
   invisible to it by construction, since the CI workflow's own posted
   body is unchanged. Confirmed by Iteration 18's own full test suite
   passing unmodified.
5. **`src/cli/verify-github-technology-profile.ts`** (new): creates a
   real, accepted Decision and a real Technology Profile, assigns it to
   a real Product's `backend` category, provisions one real repository,
   drives the existing, unmodified `generateProjection()`, pushes via
   Iteration 17's `openPullRequestWithChanges()` unmodified, and
   independently verifies both the PR's real file list and the real
   pushed content of `.nexus/technology-profile.json` via `gh pr view`
   and `gh api`. `npm run verify:github-technology-profile`, same
   `--keep` convention as Iteration 17's own script.

## A real bug found and fixed during `/review`, not at implementation time

**`repository_component_primary_uq` prevents the *same* component from
being marked primary for two different repositories — it does not
prevent one repository from marking two of its own *distinct*
components primary.** The original implementation used
`mappings.find((m) => m.is_primary)`, which would have silently picked
whichever primary-marked component sorted first in that case, with no
diagnostic. Fixed: Technology Profile resolution now requires *exactly
one* primary-mapped component, falling back to no resolution (not an
error) when zero or more than one exist — the same ambiguity-averse
pattern this project already uses elsewhere
(`allow_ambiguous_repo`/`WorkPackageProfile`). Covered by a new
regression test seeding two distinct primary-mapped components for one
repository and confirming exactly three files result, not a silently
arbitrary fourth.

## What survived contact, precisely

- **The real, live end-to-end run succeeded on the first attempt.** A
  real Decision (`adr.iter19-backend-stack`), a real Technology Profile,
  a real assignment to a real Product, a real repository, a real
  four-file `generateProjection()` output, a real push and PR — every
  step using an already-existing, unmodified mechanism from a prior
  iteration (15, 16, 17), composed for the first time in this exact
  combination.
- **The new file's real, pushed content contains only genuine
  Architecture-computed facts** — confirmed directly against the actual
  content fetched via `gh api` during the live run, not merely argued
  from the code: `{profileId, category, language, languageVersion,
  buildSystem, decisionId}`, nothing environment- or deployment-shaped.
  The direct, checked answer to the Iteration 17 Artifact Review's own
  `nexusBaseUrl` finding.
- **`repo.generated_region`'s existing mechanism needed zero changes**
  to cover a fourth file — confirmed by a real row appearing for
  `.nexus/technology-profile.json` after a real `generateProjection()`
  call, not assumed from reading the loop.

## What this does not settle

Whether the "primary component decides the Product" heuristic holds for
a repository whose mapped components genuinely span more than one
Product — untested, inherits rather than resolves the already-Unproven
single-Product-ownership question. Whether hardcoding the `backend`
category is the right long-term choice, or whether determining a
repository's/component's own category needs a real schema field —
unresolved, exactly as disclosed in `SCOPE.md`.

## Scope deferred

Exactly as `docs/history/iteration-19/SCOPE.md` listed: generating real
language/build/CI/container scaffolding content from the resolved
profile (the fuller "Phase 4" vision — this iteration only projects the
resolved fact); determining which category a Component or Repository
itself belongs to, for when more than one category is ever populated;
any change to `POST /alignment/verify` to validate the new file's
claims; Repository/Task single-Product ownership enforcement;
component-level Technology Profile overrides (Phase 2) and
portfolio-wide reporting (Phase 3); a repository whose mapped components
span more than one category or Product.

## Technical debt intentionally created

None beyond what `SCOPE.md` already named as deferred. The one real bug
found during `/review` (the primary-mapping ambiguity) was fixed in
this same session, not carried forward.

## Demonstrations and verification

```
npm run typecheck                              # clean
npm test                                       # 203/203, fully hermetic, zero network access
npm run verify:github-technology-profile -- --keep   # real run: ALL CHECKS PASSED
```

`/review` applied this session against every file this iteration
touched: Constitution, Domain Integrity, Simplicity Reviewers PASS;
Evidence Reviewer findings recorded in `LESSONS.md`; Consistency Auditor
found and fixed the primary-mapping-ambiguity bug above before this
Report was written; Architecture Critic considered whether hardcoding
the `backend` category hides a real decision and found it named,
commented, and required to be disclosed in this Report rather than
buried.

**A real, disposable GitHub repository and PR from this session's live
run remain live on the developer's account at their own request** (to
inspect before cleanup): `ketilaa/nexus-iter19-tech-profile-1789387101790`,
PR #1. Not deleted by this Report or this close.

## Recommended next-step validation

Whether a repository whose mapped components genuinely span more than
one Product produces a sensible result (silently no profile, per this
iteration's own ambiguity-averse design) or whether that needs its own
explicit handling is the one concretely named, untested thread this
iteration leaves behind. Beyond that, the two structural deferrals
(real scaffolding synthesis; component/repository category
determination) are the natural next candidates for whoever picks up
Phase 4's remaining half.
