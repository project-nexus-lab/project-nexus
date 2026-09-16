# Iteration 21 Scope — resolving Open Question #7: repositories stop being Nexus clients

This is a scope document, not a report. Nothing described here has been
built. It resolves `docs/PROJECT_KNOWLEDGE.md`'s Open Question #7,
raised by a dedicated architecture review between Iterations 20 and 21:
should repositories be Nexus clients at all, or should verification stay
a Nexus-initiated concern? That review recommended a direction —
Nexus-initiated verification via GitHub's Checks/Commit Status API,
removing `nexusBaseUrl` and the repository-side call entirely — without
implementing or fully verifying it. This iteration makes the decision
real: it verifies the recommendation's own load-bearing assumption
before building anything, corrects it where it was wrong, and then
actually retires the repository-initiated mechanism rather than
building a second one alongside it.

---

## Question Under Test

Can Nexus verify a repository's alignment from *outside* — fetching the
repository's own committed state itself and posting a real, visible
result onto that repository's own commit, using only credentials this
project already has — and does doing so mean the repository no longer
needs to know Nexus exists at all?

---

## What We Know

Checked directly against real GitHub state this session, not carried
over from the architecture review's own (unverified) recommendation:

- **The Checks API requires GitHub App authentication.** The
  architecture review named "GitHub's Checks/Commit Status API" as one
  option without distinguishing between them. Tested directly against a
  real, disposable repository with this project's actual credentials
  (`gh`'s own classic OAuth token, `gho_*`, scopes `repo`, `workflow`,
  `delete_repo`, `read:org`, `gist`): `POST
  /repos/{owner}/{repo}/check-runs` returns `403 — "You must
  authenticate via a GitHub App."` This is not a scope this token could
  be granted; it requires registering and installing a GitHub App, a
  separate, materially larger undertaking this iteration does not
  attempt.
- **The Commit Status API works with the exact same credentials
  already in use.** Tested directly, same real repository: `POST
  /repos/{owner}/{repo}/statuses/{sha}` with `state`/`context`/`description`
  succeeds, and reading it back via `GET
  /repos/{owner}/{repo}/commits/{sha}/status` returns exactly what was
  posted. No new credential, no new scope, no GitHub App.
- **`verifyRepositoryAlignment(db, { repositoryId, componentIds })`
  (Iteration 18) already computes the exact verdict needed and does not
  care who calls it or over what transport** — it is a plain async
  function, not an HTTP-coupled one. `POST /alignment/verify` is a thin
  wrapper over it and needs no changes.
- **Nexus can already fetch a repository's own committed content
  itself**, using the same credentials `GhCliVcsProvider` already uses
  to create repositories and push branches (Iterations 5, 17) —
  demonstrated live in Iteration 18's own verification
  (`gh api repos/.../contents/...`) and reused conceptually, not
  re-invented, here.
- **`nexusBaseUrl` is dead data** (`docs/PROJECT_KNOWLEDGE.md`,
  Unproven, checked directly by the architecture review): written by
  `render()`, read by nothing — not the endpoint, not the workflow
  (which uses the `$NEXUS_BASE_URL` *environment variable*, a different
  value entirely), not any test.
- **The entire reason `.github/workflows/nexus-alignment.yml` exists is
  to make the repository call Nexus.** Under this iteration's own
  decision, that reason is gone — there is nothing else the file would
  do. Iteration 20 made this exact file valid YAML, confirmed by GitHub
  Actions itself (`state: "active"`); this iteration removes the file
  Iteration 20 fixed, not because Iteration 20 was wrong, but because
  the model that file existed to serve is the thing being retired here.
  This is named directly, not glossed over.
- **No real Nexus deployment exists.** `nexusBaseUrl` has defaulted to
  `https://nexus.invalid` since Iteration 4 for exactly this reason.
  Neither GitHub webhooks (requires inbound reachability) nor a
  scheduled poll (requires a running, long-lived Nexus process) are
  possible to build for real in this project today — there is nothing
  for GitHub to call, and nothing to keep a scheduler alive between
  sessions. This bounds what "Nexus-initiated" can mean *for this
  iteration*: proving the mechanism works when invoked, not solving how
  a real deployment decides when to invoke it.
- **Removing the CI workflow and `nexusBaseUrl` touches a real, counted
  amount of existing test surface** — checked directly, not estimated:
  seven references across `test/repository.test.ts` assert the current
  three/four-file list or exercise the workflow file specifically (its
  YAML validity, its drift-check); `src/cli/verify-github-workflow-valid.ts`
  (Iteration 20's own real-verification script) tests exactly the file
  this iteration removes and becomes obsolete in its current form.

---

## What We Only Believe

1. **That checking a repository's *default branch* HEAD is the right
   scope for v1**, not arbitrary open-PR branches. Checking a PR branch
   would require Nexus to discover open PRs first — a real, separate
   capability this iteration does not build. A real CI-like experience
   (a status visible *while a PR is open*, before merge) is therefore
   not what this iteration delivers — see Explicit Deferrals.
2. **That a plain Commit Status (state + context + description) is
   sufficient**, compared to the Checks API's richer output (line
   annotations, structured details) — plausible for the fail/warn list
   §10.5 already defines, untested against a real developer's reaction
   to a bare status line versus a rich check.
3. **That no other repository, anywhere, still depends on the removed
   CI workflow or `nexusBaseUrl` existing.** True for every repository
   this project has ever generated and disposed of in a live
   demonstration (17, 19, 20) — none are still live. Not tested against
   a real, persistent repository that predates this decision, because
   none exists.

---

## Decision: retire the repository-initiated mechanism; Nexus verifies from outside, using the Commit Status API

- **`render()` no longer generates `.github/workflows/nexus-alignment.yml`
  or `nexusBaseUrl`.** Not deprecated alongside a new mechanism —
  removed. Leaving both in place would mean Open Question #7 stays
  open in practice regardless of what gets written down; every newly
  generated repository would keep carrying dead configuration and a
  workflow whose only job was calling a model this iteration retires.
- **A new function, `verifyAndPublishAlignment(db, repositoryId,
  vcsProvider)`, in `src/graph/alignment.ts`** (Alignment context,
  alongside `verifyRepositoryAlignment` — not Repository, even though it
  calls a `VcsProvider`: §2.3 already permits `Alignment → all
  (read-only)`, and posting a status to GitHub is a write to an
  *external* system, not to another context's own Postgres aggregates,
  the same distinction `provisionRepository`'s GitHub writes already
  rely on). Resolves the repository's default branch to a real commit
  SHA, fetches `.nexus/repository.json` at that exact SHA, reuses
  `verifyRepositoryAlignment()` unmodified, and posts a real Commit
  Status onto that SHA.
- **`VcsProvider` gains two new methods** — `getFileAtRef` and
  `postCommitStatus` — added to the port (not a `deleteRepository()`
  -style bare export) specifically so `NoopVcsProvider` can stand in for
  hermetic tests, the same reason `openPullRequestWithChanges` was
  added to the port rather than left `GhCliVcsProvider`-only.
- **Rejected: the Checks API.** Ruled out by direct evidence, not
  preference — see What We Know.
- **Rejected: keeping both mechanisms side by side "to be safe."**
  Would not resolve Open Question #7; it would just add a second,
  correct mechanism next to a first one already known to be wrong.
- **Rejected: solving "how Nexus learns when to check" in this
  iteration.** No real deployment exists to receive a webhook or run a
  scheduler. This iteration proves the verification mechanism itself;
  invocation timing is explicitly deferred.
- **`POST /alignment/verify` (Iteration 18) is untouched.** It remains a
  general-purpose, directly-callable check — useful on its own terms,
  independent of who or what triggers `verifyAndPublishAlignment`.

---

## Recommended Iteration 21 Scope

1. **`src/repository/generate.ts`**: remove `nexusBaseUrl` from
   `RenderInput` and the rendered `repository.json`; remove the
   `alignmentWorkflowYaml` block and its file entry. `render()`'s
   baseline drops to two files (`.nexus/repository.json`,
   `.nexus/architecture.snapshot.json`), three when a Technology Profile
   resolves.
2. **`src/repository/vcs-provider.ts`**: `VcsProvider` gains
   `getFileAtRef(providerRef, path, ref): Promise<{ content: string;
   sha: string } | null>` (`null`, not a throw, when the file doesn't
   exist at that ref — matches this project's "absent ⇒ handled
   gracefully" pattern) and `postCommitStatus(providerRef, sha, input:
   { state: "success" | "failure" | "error" | "pending"; context: string;
   description: string }): Promise<void>`. `NoopVcsProvider` implements
   both trivially, doing no real I/O.
3. **`src/repository/gh-cli-vcs-provider.ts`**: real implementations —
   `getFileAtRef` resolves `ref` to an exact commit SHA first (`gh api
   repos/.../commits/{ref}`), then fetches the file at that SHA (`gh api
   repos/.../contents/{path}?ref={sha}`), returning both; `postCommitStatus`
   shells out to `gh api repos/.../statuses/{sha}`. Both reuse
   `mapGhError` for error classification, unchanged.
4. **`src/graph/alignment.ts`**: `verifyAndPublishAlignment(db,
   repositoryId, vcsProvider)` — looks up the repository's `provider_ref`
   and default branch, calls `getFileAtRef` for `.nexus/repository.json`,
   extracts the managed region (`extractManagedRegion`, unchanged) and
   parses it, calls `verifyRepositoryAlignment()` unmodified, maps the
   result to a Commit Status (`ok: true` → `success`; `ok: false` →
   `failure`; file missing/unparseable → `error`, with a clear
   description either way), and calls `postCommitStatus`.
5. **Update every existing test that asserted the old file list or
   exercised the removed workflow file** (seven references in
   `test/repository.test.ts`, counted directly) to the new, smaller file
   list; remove the two tests whose entire subject was the now-removed
   file (its YAML validity, its drift-check).
6. **Retire `src/cli/verify-github-workflow-valid.ts`** (Iteration 20's
   own script, which tests exactly the file this iteration removes);
   add a new `src/cli/verify-github-alignment-publish.ts` demonstrating
   the new mechanism for real: push a real repository with the new,
   smaller projection, then call `verifyAndPublishAlignment` against it
   and confirm via `gh api repos/.../commits/{sha}/status` that a real,
   correct Commit Status appears — the same real-external-confirmation
   bar Iteration 20 held itself to.

---

## Acceptance Criteria

1. `render()` no longer includes `nexusBaseUrl` anywhere in its output,
   and no longer generates `.github/workflows/nexus-alignment.yml` —
   confirmed by inspecting real output, not by absence of a test
   failure alone.
2. `render()`'s file list is exactly two files with no Technology
   Profile resolved, three with one — the same additive shape Iteration
   19 established, now starting from a smaller baseline.
3. `getFileAtRef` against a real, disposable repository returns the
   real content and a real commit SHA for a file that exists, and
   `null` for one that doesn't — both checked against real GitHub state.
4. `postCommitStatus` against a real commit is independently verified
   via `gh api repos/.../commits/{sha}/status` to show exactly the
   state, context, and description that were posted — the same
   independent-verification discipline every real-GitHub iteration this
   session has used, not merely that the call didn't throw.
5. `verifyAndPublishAlignment`, run against a real repository whose
   projection matches live Nexus state, posts a real `success` status;
   against one that doesn't match, posts a real `failure` status with a
   description naming the actual mismatch.
6. `POST /alignment/verify`'s full existing test suite passes
   unmodified — it is not touched by this iteration.
7. Every existing `repository.test.ts` test is updated to the new file
   shape and passes; the two tests specific to the removed workflow file
   are removed, not left failing or skipped.
8. The Report states plainly that this iteration removes a file
   Iteration 20 had just fixed, and why that is the correct
   consequence of resolving Open Question #7 rather than a
   contradiction of Iteration 20's own work.

---

## Explicit Deferrals

- **How Nexus learns *when* to check a repository** (webhook, polling,
  or something else) — requires a real, reachable Nexus deployment,
  which does not exist. This iteration proves the verification
  mechanism works when invoked; it does not decide or build the trigger.
- **Verifying open-PR branches**, not just the default branch — checking
  a PR *before* merge (the actual CI experience the old model
  approximated) requires Nexus to discover and track open PRs, a real,
  separate capability not built here.
- **The Checks API, or any GitHub App registration** — ruled out by
  direct evidence this session, not merely postponed.
- **Amending `MVP_ARCHITECTURE_V2.md` §10.5's own literal text** ("The
  workflow posts `.nexus/repository.json` to `POST /alignment/verify`"),
  which this iteration's own decision now contradicts. Recorded as a
  disclosed architectural deviation in the Report, per this project's
  own Iteration Discipline — amending the authoritative architecture
  document itself is a separate, more deliberate act than this
  iteration's own scope.
- **Removing or changing `POST /alignment/verify` itself** — stays
  exactly as built in Iteration 18, a general-purpose capability
  independent of this iteration's own new trigger path.
- **Rich Checks-API-style output** (line annotations, structured
  per-failure detail) — a plain Commit Status's `state`/`context`/`description`
  is all this iteration provides.

---

## Risks

- **This iteration removes real, working functionality** (a valid,
  GitHub-confirmed CI workflow, Iteration 20's own result) **as a
  deliberate consequence of a direction decision, not a bug fix** — if
  that direction decision is later reconsidered, reintroducing a
  repository-initiated path is a real, non-trivial reversal, not a
  one-line revert.
- **No real trigger exists**, so after this iteration, alignment
  verification for a real repository only happens when someone (a
  script, eventually a scheduler) explicitly calls
  `verifyAndPublishAlignment` — today, that means it happens exactly as
  often as this project's own verify scripts are run, which is to say,
  rarely and manually. This is a real, disclosed regression in
  *automatic* coverage compared to the (never-actually-working) CI
  model, traded for a mechanism that is at least correct when invoked.
- **Checking only the default branch means no status appears on open
  PRs at all** — a materially different, weaker developer experience
  than the CI-workflow model was designed to provide, even though that
  model never actually worked. Named directly, not minimized.

---

## Why Iteration 21 Is The Right Next Step

Open Question #7 was raised specifically to stop a real generated
artifact (`nexusBaseUrl`, the CI workflow) from continuing to encode an
assumption nobody had verified — and the architecture review's own
recommendation was itself unverified until this iteration's own,
directly-tested finding (Checks API requires a GitHub App; Commit
Status does not) corrected it before a single line of production code
was written. Resolving the question now, rather than letting it sit
open while further generation-heavy work (real scaffolding synthesis)
builds on an undecided foundation, is exactly the sequencing the
architecture review itself recommended. Removing what Iteration 20 just
fixed is not a contradiction of that work — Iteration 20 correctly
made the *old* model's own artifact valid; this iteration correctly
retires the model that artifact existed to serve, once real evidence
(not merely a review's recommendation) showed a viable alternative
exists.
