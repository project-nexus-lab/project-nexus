# Iteration 17 Scope — does provisioning success predict push/branch/PR success against a real repository?

This is a scope document, not a report. Nothing described here has been
built. It resolves `docs/PROJECT_KNOWLEDGE.md`'s oldest still-open
Unproven item, on record since Iteration 5: *"the bootstrap mechanism's
success provisioning a real repository predicts success for the rest of
§10.2's flow — pushing `generateProjection`'s output, creating a branch,
opening a PR."* Iteration 5 explicitly deferred this exact question
(`docs/history/iteration-5/SCOPE.md` §4, §7) and named it the
second-highest-value open experiment in its own risk assessment. It has
sat untouched through Iterations 6–16.

---

## Question Under Test

Does `§10.2` step 5's remaining, never-attempted half — writing
`generateProjection`'s already-rendered files to a real branch, pushing
it, and opening a real PR — succeed against a real GitHub repository the
way step 3's provisioning already did (Iteration 5), or are these
genuinely different operations against a different part of GitHub's
surface with their own untested failure modes, as Iteration 5's own
Unproven entry already hypothesized rather than assumed?

---

## What We Know

Checked directly against the actual code, not carried over from
Iteration 5's prose:

- **`VcsProvider` (`src/repository/vcs-provider.ts`) has exactly one
  method today: `create()`.** Nothing in the port models a push, a
  branch, or a PR. `provisionRepository` is its only caller.
- **`generateProjection` (`src/repository/lifecycle.ts`, step 5) already
  renders real file content** — `.nexus/repository.json`,
  `.nexus/architecture.snapshot.json`,
  `.github/workflows/nexus-alignment.yml` (`src/repository/generate.ts`)
  — hashes each file's managed region into `repo.generated_region`, and
  transitions `bootstrap_state` to `'bootstrapped'`. It calls
  `VcsProvider` **zero times**. Its own module comment states this
  plainly: it "stands in for 'files rendered; branch nexus/bootstrap;
  PR opened' (§10.2)" — nothing writes these files to disk, commits
  them, or pushes anything, even though a real `VcsProvider` has existed
  since Iteration 5.
- **`activateRepository` (step 6) is a bare state transition** — no
  CI-green check, no PR-merge check, matching §10.2 step 6's own
  precondition ("Human merges PR") being entirely unimplemented.
- **No `RepositoryActivated` event or Task-re-gating mechanism exists at
  all.** `lifecycle.ts`'s own module comment discloses this directly:
  "only `blocked_by_proposal_id` exists, tied to proposals, not
  repositories." Unrelated to this iteration's question — a Work/
  Execution-context concern, not Repository — and not addressed here.
- **`GhCliVcsProvider` (Iteration 5) already established the adapter
  discipline this iteration extends**: shell out via `child_process`
  (no new npm dependency), real error mapping via stderr-pattern
  matching rather than trusting `--json` (`gh repo create` has none —
  found the hard way, before Iteration 5 wrote a line of adapter code),
  and a `deleteRepository` cleanup helper outside the port itself
  (§10.2 never describes deletion).
- **Cleanup already has a known failure mode, disclosed once and
  directly reusable**: `deleteRepository` requires the `delete_repo`
  OAuth scope, which `gh auth login`'s default `repo` scope does not
  grant (`docs/PROJECT_KNOWLEDGE.md`, Invalidated). `verify-github.ts`
  already handles this by checking `gh auth status` up front and
  printing a manual cleanup command instead of silently leaving a
  repository behind — the same discipline applies here, and deleting
  the whole repository removes its branches and PRs with it, so no
  separate branch/PR cleanup step is needed.
- **`repo.repository`'s schema already separates Nexus's own `id` from
  `provider_ref`** (Iteration 0 foresight, confirmed real by Iteration
  5) — nothing about this iteration's question requires touching that
  schema.

---

## What We Only Believe

1. **That a freshly `gh repo create`d repository can support a feature
   branch and PR at all.** A repository created this way starts with
   zero commits and no branches — `git checkout -b` has nothing to
   diverge from until the default branch has at least one commit.
   Whether a one-line fix (e.g. `gh repo create --add-readme`, or
   pushing a single empty initial commit before branching) is
   sufficient, or whether this needs more, is unknown until attempted.
   This is the single largest concrete unknown this iteration exists to
   resolve — named here precisely so it cannot be quietly discovered and
   patched over without being reported.
2. **That `git push` succeeds using whatever credential state `gh auth
   login` already established**, the same reuse Iteration 5 already
   validated for `gh`'s own HTTPS API calls. `gh` can configure a git
   credential helper (`gh auth setup-git`), but whether this
   environment already has it configured, or whether the adapter must
   call it defensively before every push, is untested.
3. **That `gh pr create` behaves the same, uneventfully, against a
   from-scratch personal-account repository** with no branch protection,
   no required reviewers, and no prior PR history — plausible for a
   disposable validation repository, not yet checked against a real
   account's actual defaults.
4. **That shelling out to the `git` binary directly (clone, checkout,
   commit, push) — not only `gh` — is an acceptable dependency**, the
   same way `gh` itself was accepted in Iteration 5: assumed present
   alongside `gh` in any real development environment, not a new
   dependency this project is choosing to add.

---

## Recommended Iteration 17 Scope

**One new `VcsProvider` port method, validated first against
`NoopVcsProvider`, then against reality — the same "no-op stand-in
first" sequencing this project has now used four times
(`AgentRuntimeAdapter`, MCP grants, `VcsProvider.create()`, and now
this).**

1. **`VcsProvider` gains one method**:
   `openPullRequestWithChanges(input: { providerRef, branch, baseBranch,
   files: Array<{ path, content }>, title, body }): Promise<{ prUrl:
   string }>` — one method per §10.2 step, matching `create()`'s own
   correspondence to step 3. Not two finer-grained methods
   (`pushBranch`/`openPullRequest` separately): §10.2's own table
   describes "files rendered; branch nexus/bootstrap; PR opened" as one
   step's effect, not three.
2. **`NoopVcsProvider` implements it trivially** (returns a fixed fake
   URL, no real I/O) — purely additive; no existing hermetic test calls
   this method today, so nothing already passing is put at risk by its
   addition.
3. **`GhCliVcsProvider` implements it for real**: clone the repository
   into a fresh `os.tmpdir()` directory; establish an initial commit on
   the default branch if one does not already exist (resolving "What We
   Only Believe" item 1, concretely, one way or the other); create and
   check out `branch`; write the given files; commit; push; run `gh pr
   create`; parse and return the real PR URL. Extends `GhCliError`'s
   existing reason vocabulary for whatever new failure modes surface
   (at minimum: push rejected, PR already exists for this branch).
4. **`src/cli/verify-github-bootstrap.ts`** (new — Iteration 5's own
   `verify-github.ts` is explicitly scoped to Iteration 5 and stays
   unmodified): provisions one real, disposable repository, calls the
   existing, unmodified `generateProjection` to obtain real rendered
   files, then calls the new port method with those exact files against
   the same real repository, independently verifies the PR exists via
   `gh pr view` (not only the adapter's own return value), deliberately
   triggers one real failure (e.g. a second `openPullRequestWithChanges`
   call for the same branch), and deletes the whole repository
   afterward — mirroring `verify-github.ts`'s own structure and
   auth-scope-aware cleanup discipline exactly. `npm run
   verify:github-bootstrap`, kept outside `npm test`, same as Iteration
   5's script.
5. **No changes to `lifecycle.ts`, `repo.repository`'s schema, or the
   meaning of `bootstrap_state`'s existing values.** This iteration
   produces the evidence a decision to tighten `'bootstrapped'`/
   `'active'`'s semantics would need; it does not make that decision
   itself — see Explicit Deferrals.

---

## Acceptance Criteria

1. `VcsProvider`'s new method requires no change to `create()`,
   `VcsProviderCreateInput`, or `VcsProviderCreateResult`; `provisionRepository`
   is untouched.
2. Adding `NoopVcsProvider`'s implementation requires zero changes to
   any existing test — confirmed by `npm test` passing unmodified,
   the same bar Iteration 5's own Acceptance Criterion 2 set for
   `lifecycle.ts`.
3. A real branch is pushed to a real, disposable repository and a real
   PR is opened, independently verified via `gh pr view` — and the
   files actually present on that branch are checked to match exactly
   what `generateProjection` rendered (a real content comparison, not
   merely "the call did not throw").
4. "What We Only Believe" item 1 (initial-commit prerequisite) is
   resolved one way or the other and stated precisely in the Report,
   whichever mechanism the implementation ends up needing.
5. At least one deliberately triggered failure is caught as a typed,
   distinguishable `GhCliError`, not an unhandled exception — verified
   by asserting on the error's `reason`, the same bar Iteration 5 set
   for the name-collision case.
6. The real repository — branch, PR, and commits included — is fully
   deleted after the run, verified the same way Iteration 5 verified
   deletion (an independent `gh repo view` failing afterward); if the
   `delete_repo` scope is missing, the same manual-cleanup-instructions
   fallback Iteration 5 already established, not a silent leak.
7. `npm test` remains fully hermetic and unaffected — the real-GitHub
   path exists only in `verify:github-bootstrap`.
8. The Report states plainly whether provisioning success actually
   predicted push/branch/PR success, or exactly where it didn't — the
   specific question this iteration exists to answer, not a vaguer
   "it worked."

---

## Explicit Deferrals

- **Whether `bootstrap_state`'s own semantics should change** to
  actually require a real, verified PR before reaching `'bootstrapped'`
  (matching §10.2's literal step-5 effect more strictly than today's
  disclosed narrowing does) — this iteration produces the evidence that
  decision would need; it does not make the decision.
- **Real CI integration** — whether `.github/workflows/nexus-alignment.yml`
  (generated since Iteration 4, never yet pushed anywhere) actually runs
  and passes once it exists on a real branch — a distinct, larger claim,
  deferred the same way Iteration 5 deferred it.
- **`RepositoryActivated` event wiring, or re-gating Tasks blocked on a
  missing repository** — no such state exists in the schema yet
  (`lifecycle.ts`'s own disclosed gap); unrelated to this iteration.
- **Real PR review workflows, merge-conflict handling, branch
  protection rules** — this iteration creates and verifies exactly one
  PR against one from-scratch repository; it does not test review or
  merge mechanics, matching Iteration 5's own equivalent deferral.
- **Incremental/repeat bootstrap pushes** — re-running this against an
  already-bootstrapped repository with new content is a different,
  future question; only a single, first-ever bootstrap push is in
  scope here.
- **Repository generation actually consuming a Technology Profile**
  (Iteration 15's deferred "Phase 4") — this iteration is a
  precondition for that work, not that work itself.

---

## Risks

- **The single biggest risk**, named directly rather than glossed over:
  if establishing an initial base ref for a freshly created,
  zero-commit repository turns out to need more than a one-line fix,
  this iteration's real complexity could grow past "one new port
  method" — exactly the kind of finding worth reporting precisely
  (per Iteration 5's own precedent for an invalidated assumption),
  not a reason to quietly expand scope without naming it.
- **`git`'s credential integration with `gh` is unverified in this
  environment.** If `gh auth setup-git` has not already been run, the
  first real `git push` in this project's history could fail for a
  reason unrelated to anything this iteration is actually testing —
  worth checking and handling defensively, not discovering mid-run.
- **`gh pr create`'s real behavior against this specific developer
  account's defaults is unverified** — branch protection, required
  reviewers, or organization-specific settings could surface a failure
  mode this scope did not anticipate. If so, that is itself real
  evidence about §10.2's assumptions, not a bug in this iteration.

---

## Why Iteration 17 Is The Right Next Step

This is the single longest-standing Unproven item in
`docs/PROJECT_KNOWLEDGE.md` — raised at Iteration 5, explicitly
deferred there, ranked as that iteration's own second-highest-value
open experiment, and untouched through eleven iterations since. It is
also the literal precondition standing between Iterations 15 and 16's
governance work and the payoff the roadmap has pointed at since
Iteration 15: repository generation actually consuming a Technology
Profile (Phase 4). This project's own bottom-up discipline — validate
the layer below before building on it, the same reasoning that held
incremental architecture authoring back until Iteration 10 validated
graph scale — argues for closing this gap now, deliberately and in
isolation, rather than discovering push/branch/PR's real failure modes
for the first time inside a larger, more complex feature that also
depends on them working.
