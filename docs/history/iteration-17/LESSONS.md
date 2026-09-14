# Iteration 17 Lessons

Not a status report (`docs/history/iteration-17/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 17 closed `docs/PROJECT_KNOWLEDGE.md`'s oldest still-open
Unproven item — raised at Iteration 5, untouched through eleven
iterations — by actually running the real experiment Iteration 5's own
Unproven entry proposed: write `generateProjection`'s files to disk,
commit, push a branch, and open a PR against a real repository. The
answer is a qualified yes: provisioning success predicted push/branch/PR
success, but only after two real, previously-unknown gaps were found by
contact with reality and fixed — a freshly created repository's total
absence of history, and the real failure mode of a repeat push. Both
were named as concrete unknowns in `docs/history/iteration-17/SCOPE.md`
before implementation began; neither was guessed correctly in advance,
and both were resolved by actually running the script against a real
GitHub repository, not by reasoning about it.

---

## Validated

### Assumption

Provisioning success (Iteration 5) predicts success for the remainder
of §10.2 step 5 — pushing a real branch and opening a real PR against
the same real repository.

### Status

VALIDATED, for a single, first-ever bootstrap push.

### Evidence

Two real, live runs of `verify:github-bootstrap` against a real,
disposable GitHub repository (`ketilaa/nexus-iter17-bootstrap-1789375649168`
on the second, successful run). A real branch (`nexus/bootstrap`) was
pushed and a real PR (#1) opened; `gh pr view --json state,headRefName,
baseRefName,files` independently confirmed the PR was `OPEN`, correctly
targeted `main`, and — checked as an actual file-list comparison, not
merely "a PR exists" — carried exactly the three files
`generateProjection` rendered (`.nexus/repository.json`,
`.nexus/architecture.snapshot.json`,
`.github/workflows/nexus-alignment.yml`).

### Consequence

Closes the specific question `docs/PROJECT_KNOWLEDGE.md` has carried
since Iteration 5. Repository generation actually consuming a Technology
Profile (Iteration 15's deferred "Phase 4") no longer rests on an
unvalidated assumption about this layer — though see Unproven, below,
for what a single successful run does not yet establish.

---

### Assumption

A freshly `gh repo create`d repository needs an explicit initial commit
before a feature branch can be created and pushed — the concrete
unknown `SCOPE.md` named as "What We Only Believe" #1.

### Status

VALIDATED as true (the prerequisite is real), by direct failure and fix,
not by reasoning about it in advance.

### Evidence

The first live run failed immediately on `git rev-parse --abbrev-ref
HEAD` against such a repository: `fatal: ambiguous argument 'HEAD':
unknown revision or path not in the working tree` — that command
requires HEAD to resolve to a real commit, which a brand-new repository
does not have. Fixed by reading the symbolic ref directly instead
(`git symbolic-ref --short HEAD`, which needs no history) and, when no
commit exists yet, pushing an empty initial commit to the base branch
before branching. The second live run, with this fix in place, succeeded
completely.

### Consequence

This was the single largest concrete unknown `SCOPE.md` flagged before
implementation, and it was real — not a false alarm. Any future adapter
or script that clones a repository immediately after `gh repo create`
inherits this same prerequisite and should not assume a resolvable HEAD
exists.

---

### Assumption

A second `openPullRequestWithChanges` call for a branch that already has
a bootstrap commit on the remote fails cleanly, as a typed condition,
rather than silently corrupting anything or crashing unhandled — the
bar Acceptance Criterion 5 actually set, independent of which specific
error `reason` results.

### Status

VALIDATED — with the specific mechanism corrected mid-review from an
initially wrong guess.

### Evidence

The real second live run's own deliberately-triggered second call failed
as a genuine `git push` non-fast-forward rejection (`! [rejected]
nexus/bootstrap -> nexus/bootstrap (non-fast-forward)`), caught by
`mapGhError` and surfaced as a typed `GhCliError` with reason
`push-rejected` — not an unhandled exception, and not the `pr-exists`
reason the verify script's test had assumed in advance. The test's own
expectation was wrong, not the mechanism; corrected during `/review` to
assert `push-rejected`, matching what was actually observed.

### Consequence

This implementation's real, current contract — a branch must not
already exist on the remote — was undocumented at the port level before
this iteration's own `/review` (Architecture Critic pass) caught it;
`VcsProvider.openPullRequestWithChanges`'s own JSDoc now states this
explicitly, not only `GhCliVcsProvider`'s implementation comment and the
verify script's test. Incremental/repeat bootstrap pushes remain a named,
explicit deferral, not a silently working feature.

---

## Unproven

### Assumption

This iteration's own script-level auto-delete path (`deleteRepository`
plus re-verification, the `else` branch of `verify-github-bootstrap.ts`
taken when `--keep` is not passed) actually works end-to-end.

### Why It Remains Unproven

The user explicitly asked to inspect the real repository before any
cleanup happened this session, so every live run used `--keep`; the
delete branch was never executed. It reuses Iteration 5's own
already-validated `deleteRepository` function verbatim (same function,
same `gh repo delete` call, same scope-check discipline in
`ghAuthStatus`), so confidence is reasonable by direct inheritance — but
this iteration's own integration of it, specifically calling it after a
real push/PR/branch cycle rather than only after a bare `create()`, has
not itself been directly exercised.

### How To Validate

Run `npm run verify:github-bootstrap` without `--keep` once, against a
fresh disposable repository, and confirm the same way Iteration 5 did:
an independent `gh repo view` failing afterward, or the manual-cleanup
fallback printing correctly if the `delete_repo` scope is ever missing.

---

### Assumption

The defensive `gh auth setup-git` call, made unconditionally before
every real push, is actually necessary in some real environments — not
merely harmless overhead in one that already has git-credential
integration configured.

### Why It Remains Unproven

This session's own environment already reported a configured HTTPS git
protocol (`gh auth status`) before either live run, so the call's
presence or absence was never isolated as its own variable — both runs
would very likely have succeeded with or without it. Calling it
unconditionally is cheap and idempotent regardless, so this is a minor,
not a load-bearing, open question.

### How To Validate

Run the same script in an environment `gh auth setup-git` has never
touched (a fresh container or fresh `gh auth login`), once with the
defensive call removed and once with it present, and confirm whether
`git push` actually depends on it.

---

## Invalidated

None. Both concrete unknowns this iteration set out to resolve
(`SCOPE.md`'s "What We Only Believe" #1 and #3) turned out to be real
prerequisites/behaviors, not false alarms — nothing this iteration
believed going in was disproven; two things it was genuinely unsure
about were confirmed true, in each case only after a real failure and a
real fix.

---

## Biggest Surprise

Not that a fresh repository lacks a resolvable `HEAD` — `SCOPE.md`
already named that as the single largest concrete unknown before any
code was written, so the *fact* itself wasn't a surprise, only its
exact failure signature (`git rev-parse --abbrev-ref HEAD`'s specific
"ambiguous argument" error, rather than some other symptom). The real
surprise was smaller and more mechanical, discovered only during
`/review`, not during implementation: the deliberately-triggered
second-call test's own author (this session) had guessed the wrong
failure mode (`pr-exists`) for a scenario `SCOPE.md` itself had already
correctly reasoned through as a git-level, not a `gh`-level, concern —
a reminder that even a carefully-scoped prediction about which *layer*
a failure occurs at is still worth checking against the real error,
not assumed correct just because the broader shape ("it fails cleanly")
was right.

---

## Final Verdict

**What does Project Nexus now know?** That a real branch can be pushed
and a real PR opened against a real, freshly-provisioned repository,
carrying exactly the content `generateProjection` computed — closing
this project's oldest standing Unproven item. That doing so requires
handling a repository with no commit history yet, a real and necessary
step, not an edge case safe to skip. That repeating the operation for
an already-bootstrapped branch fails cleanly as a typed condition,
specifically a push rejection, and that this constraint needed stating
on the port interface itself, not only in one implementation's comments.

**What does Project Nexus still only believe?** That this iteration's
own auto-delete cleanup path works end-to-end (inherited, not directly
demonstrated, this session); that `gh auth setup-git`'s defensive call
is load-bearing in some real environment, rather than harmless overhead
in every environment tested so far.

**What architectural bets remain highest risk?** Whether
`bootstrap_state`'s existing semantics should now be tightened to
actually require a verified PR before `'bootstrapped'` — this iteration
produced exactly the evidence that decision would need (a real push/PR
cycle now demonstrably works) without making the decision itself. That
remains the next real fork in this area, not a foregone conclusion.
