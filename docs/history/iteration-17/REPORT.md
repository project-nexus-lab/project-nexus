# Iteration 17 Report — provisioning success predicted push/branch/PR success, once two real gaps were closed

Status: complete for the scope agreed in `docs/history/iteration-17/SCOPE.md`,
with a clean result **and** a real, live demonstration against an actual
GitHub repository — not only typecheck and the hermetic suite. 185
`node:test` cases pass (up from Iteration 16's 184: one new hermetic
test for `NoopVcsProvider.openPullRequestWithChanges`), fully hermetic,
zero network access. In addition, `npm run verify:github-bootstrap`
was run for real this session, twice (the first run surfaced a real bug,
fixed before the second): a real branch was pushed, a real PR opened,
and its contents independently verified via `gh pr view` to match
`generateProjection`'s real output exactly.

## Scope completed

1. **`VcsProvider` gains one new method**, `openPullRequestWithChanges`
   (`src/repository/vcs-provider.ts`) — matching §10.2 step 5's own
   granularity (files rendered + branch + PR as one step's effect, not
   three separate methods). `NoopVcsProvider` implements it trivially
   (a fixed fake URL, no I/O); `create()` and `provisionRepository` are
   both untouched.
2. **`GhCliVcsProvider` implements it for real**
   (`src/repository/gh-cli-vcs-provider.ts`): clones into a fresh
   `os.tmpdir()` directory, establishes an initial commit on the base
   branch when the repository has none yet, creates and checks out the
   feature branch, writes the given files, commits, pushes, and runs
   `gh pr create`, returning the real PR URL. `GhCliError`'s reason
   vocabulary extended with `push-rejected` and `pr-exists`; `mapGhError`
   now disambiguates "already exists" between a repo-name collision
   (`gh repo create`) and an already-open PR (`gh pr create`) by
   inspecting the command string, rather than writing a second, divergent
   mapper.
3. **`src/cli/verify-github-bootstrap.ts`** (new, separate from Iteration
   5's own `verify-github.ts`): provisions one real, disposable
   repository, calls the existing, unmodified `generateProjection` for
   real rendered files, calls the new port method against the same real
   repository, independently verifies the PR via `gh pr view` (state,
   branches, and file list — not only the adapter's own return value),
   deliberately triggers one real failure (a second call for the same
   branch), and — unless `--keep` is passed — deletes the repository
   afterward, mirroring `verify-github.ts`'s own auth-scope-aware cleanup
   discipline. `npm run verify:github-bootstrap`.
4. **No changes to `lifecycle.ts`, `repo.repository`'s schema, or
   `bootstrap_state`'s existing semantics** — exactly as scoped. This
   iteration produces the evidence a decision to tighten those semantics
   would need; it does not make that decision.

## The two real gaps this iteration's own live run found, and fixed

Both are named directly in `docs/history/iteration-17/SCOPE.md`'s "What
We Only Believe" before implementation began, then actually resolved by
running the real script, not by reasoning alone:

1. **A freshly `gh repo create`d repository has zero commits and no
   branches.** The first real run failed immediately: `git rev-parse
   --abbrev-ref HEAD` raises `fatal: ambiguous argument 'HEAD': unknown
   revision or path not in the working tree` against such a repository —
   it requires HEAD to resolve to a real commit, which doesn't exist yet.
   Fixed by reading the ref directly instead: `git symbolic-ref --short
   HEAD`, which needs no history. This is exactly the "What We Only
   Believe" #1 unknown this iteration was scoped to resolve, resolved
   concretely rather than left open.
2. **A second `openPullRequestWithChanges` call for an already-bootstrapped
   branch fails as a push rejection, not a "PR already exists" error.**
   The implementation always branches fresh from the base branch's
   current tip; a repeat call therefore diverges from what the remote
   already has for that branch name, and `git push` is rejected as
   non-fast-forward before `gh pr create` is ever reached. Confirmed by
   the real second run in this session's own live verification, not
   assumed. The verify script's own test initially asserted the wrong
   expected reason (`pr-exists`); corrected during `/review` to match
   the real, observed behavior (`push-rejected`) rather than silently
   patching the assumption without recording what actually happened.
   Repeat/incremental bootstrap pushes were already an explicit
   deferral — this confirms repeating the operation fails cleanly, as a
   typed condition, which is the bar Acceptance Criterion 5 actually set.

## What survived contact, precisely

- **The single new port method's shape needed no revision.** `create()`
  and `provisionRepository` required zero changes, confirmed directly —
  Acceptance Criteria 1 and 2 both hold.
- **The real PR's contents matched `generateProjection`'s real output
  exactly** — checked as an actual file-list comparison via `gh pr view
  --json files`, not merely "the PR exists." Acceptance Criterion 3 holds
  on real, not inferred, evidence.
- **`gh auth setup-git`, called defensively before every push, did not
  interfere with an already-working credential setup** — this session's
  own `gh auth status` already showed a configured HTTPS git protocol,
  and the defensive call added no observable friction.

## What this does not settle

Whether the defensive `gh auth setup-git` call is actually load-bearing
in a real environment that does *not* already have git-credential
integration configured — this session's environment already had it, so
the call's own necessity was never isolated as its own test. More
significantly: **this session's own script's auto-delete branch
(`deleteRepository` plus re-verification) was never executed.** The user
explicitly asked to inspect the real repository before any cleanup
(`--keep`), so only that code path ran end-to-end. The delete path
reuses Iteration 5's own already-validated `deleteRepository` function
verbatim, so confidence is reasonable by inheritance — but this
iteration's own integration of it (calling it after a real push/PR
cycle, not just after a bare `create()`) has not itself been directly
demonstrated. Recorded as Unproven, not silently assumed to work.

## Scope deferred

Exactly as `docs/history/iteration-17/SCOPE.md` listed: whether
`bootstrap_state`'s own semantics should change to require a real,
verified PR; real CI integration (whether the generated
`.github/workflows/nexus-alignment.yml` actually runs once it exists on
a real branch); `RepositoryActivated` event wiring; real PR review
workflows, merge-conflict handling, and branch protection rules;
incremental/repeat bootstrap pushes (confirmed, not merely assumed, to
fail cleanly rather than silently corrupt anything); repository
generation actually consuming a Technology Profile (Iteration 15's
"Phase 4").

## Technical debt intentionally created

None beyond what `SCOPE.md` already named as deferred. One real,
disclosed gap survives this iteration's own close, named in "What This
Does Not Settle" above rather than silently dropped: this session's
script-level auto-delete path was not itself exercised end-to-end.

## Demonstrations and verification

```
npm run typecheck               # clean
npm test                        # 185/185, fully hermetic, zero network access
npm run verify:github-bootstrap -- --keep   # real run: PASS on every check but one
```

The one real-run check that initially failed (the duplicate-PR-attempt
assertion) was a wrong expectation in the test itself, corrected during
`/review` to match the actually-observed `push-rejected` behavior — not
a defect in the mechanism, which caught the real failure as a typed
condition exactly as required.

`/review` applied this session against every file this iteration
touched: Constitution, Domain Integrity, Simplicity Reviewers PASS;
Evidence Reviewer findings recorded in `LESSONS.md`; Consistency Auditor
found and fixed two real staleness issues (a file-level doc comment that
no longer described the file, and the wrong expected error `reason` in
the verify script's own test) before this Report was written; Architecture
Critic found that the new port method's "branch must be brand-new"
constraint existed only in the implementation's comments, not on the
port interface itself, and it is now documented directly on
`VcsProvider.openPullRequestWithChanges`.

**A real, disposable GitHub repository and PR from this session's second
live run remain live on the developer's account at their own request**
(to inspect before cleanup): `ketilaa/nexus-iter17-bootstrap-1789375649168`,
PR #1. Not deleted by this Report or this close — cleanup is the
developer's own action, per their explicit instruction this session.

## Recommended next-step validation

The auto-delete path's own end-to-end execution (see "What This Does Not
Settle") is the one concretely named, untested thread this iteration
leaves behind — the next real run of `verify:github-bootstrap` without
`--keep` would close it. Beyond that, this iteration's own explicit
deferrals (repository generation actually consuming a Technology
Profile, real CI integration, and whether `bootstrap_state`'s semantics
should tighten to require a verified PR) are the natural next
candidates, in the order the roadmap already lists them.
