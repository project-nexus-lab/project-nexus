# Iteration 21 Lessons

Not a status report (`docs/history/iteration-21/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 21 resolved `docs/PROJECT_KNOWLEDGE.md`'s Open Question #7 by
correcting the architecture review's own unverified recommendation before
building on it: GitHub's Checks API requires a GitHub App and is not
reachable with this project's actual credentials, but the Commit Status
API is. Repositories no longer call Nexus at all; Nexus now fetches a
repository's own committed state and posts a real result onto it. Getting
to a clean result required finding and fixing two real bugs during this
iteration's own live verification and `/review` — both are evidence that
this iteration's late-stage discipline (live testing, then formal review,
then closing the gap the review found) worked as intended, not evidence
of sloppier initial work than prior iterations.

---

## Invalidated

### Assumption

The architecture review's recommendation — "GitHub's Checks/Commit
Status API" — names one real, buildable mechanism.

### Status

INVALIDATED

### Evidence

Tested directly against a real, disposable repository with this
project's actual `gh` credentials (classic OAuth, scopes `repo`,
`workflow`, `delete_repo`, `read:org`, `gist`): `POST
/repos/{owner}/{repo}/check-runs` returns a flat `403 — "You must
authenticate via a GitHub App."` This is not a scope this token could be
granted under any circumstance — it requires registering and installing
a GitHub App, a materially larger undertaking. The Commit Status API
(`POST /repos/{owner}/{repo}/statuses/{sha}`) works with the exact same
credentials, tested the same way, confirmed by reading the posted status
back via `GET .../commits/{sha}/status`.

### Consequence

This iteration is built entirely on the Commit Status API. Had this not
been tested before writing code, the natural first implementation
attempt (following the review's own unexamined phrasing) would have
built against the Checks API and failed only once real GitHub
credentials were involved — exactly the kind of late, expensive failure
this project's "verify before implementing" discipline (established
concretely since Iteration 20) exists to prevent.

---

## Invalidated

### Assumption

GitHub *truncates* a commit status `description` past some length limit.

### Status

INVALIDATED

### Evidence

A real, disposable probe repository was created during this iteration's
own `/review`, a real commit pushed, and a 200-character description
posted against it via `gh api .../statuses/{sha}`. GitHub did not
truncate it — it rejected the request outright: `Validation failed:
Description is too long (maximum is 140 characters) (Validation
Failed)`. A first attempt at reading GitHub's own published REST API
docs for this endpoint, made in the same review pass, did not even
surface a length limit — the fact was established only by testing
against the real API, not by documentation.

### Consequence

The code (`COMMIT_STATUS_DESCRIPTION_MAX_LENGTH`, `src/graph/alignment.ts`)
already sliced descriptions to 140 characters before this was checked —
so the mitigation was already correct. What was wrong was the *reasoning*
recorded next to it: a comment claiming "GitHub truncates... verified
against the API docs" that had neither been verified nor was describing
the real failure mode (rejection, not truncation). Fixed by testing the
actual behavior and rewriting the comment to state only what was checked.
This is itself a small, concrete instance of the Consistency Auditor's
purpose — a claim that reads plausibly and was never independently
checked, caught only because reviewing this change meant re-verifying its
claims rather than trusting them.

---

## Validated

### Assumption

Nexus can verify a repository's alignment from outside — fetching the
repository's own committed state itself and posting a real, visible
result onto that repository's own commit — using only credentials this
project already holds, and can do so where the repository plays no part
in the process at all.

### Status

VALIDATED

### Evidence

A real, disposable repository was provisioned, pushed with the new,
two-file projection, and merged onto its default branch.
`verifyAndPublishAlignment` was then run against it twice: once while
genuinely aligned (posted a real `success` status, independently
reconfirmed via `gh api .../commits/{sha}/status`), and once after live
Nexus state was changed to no longer match the already-pushed file
(posted a real `failure` status naming the actual mismatch, likewise
reconfirmed). At no point did the repository itself do anything — no
workflow ran, no script inside the repository executed. The repository
was purely a target being read from and written to.

### Consequence

Open Question #7 is answered with evidence, not merely a chosen
direction: repositories do not need to be Nexus clients for alignment
verification to happen for real.

---

## Validated

### Assumption

`getFileAtRef` needs to resolve `ref` to an exact commit SHA before
fetching content at that SHA, rather than fetching directly at `ref` and
trusting whatever SHA the content response implies.

### Status

VALIDATED

### Evidence

The Contents API's own response includes a `sha` field, but it is the
*blob* SHA of the file's content, not the commit SHA — a commit status
can only be posted against a commit. The two-step approach (resolve
`ref` → commit SHA via `gh api repos/.../commits/{ref}`, then fetch
content at that exact SHA) was exercised for real: `getFileAtRef` against
the live demonstration repository returned a real 40-character commit
SHA (confirmed by pattern, `/^[0-9a-f]{40}$/`), and that same SHA is what
both the `success` and `failure` Commit Statuses were later confirmed
posted against.

### Consequence

Resolving first also closes a real, if narrow, race: fetching content
directly at a branch name and then separately asking "what commit is
this branch at now" could observe two different commits if the branch
moved in between. Resolving once, up front, and using that same SHA for
everything downstream avoids the question entirely.

---

## Unproven

### Assumption

No other repository, anywhere, still depends on the removed CI workflow
or `nexusBaseUrl` existing.

### Why It Remains Unproven

True for every repository this project has generated and disposed of in
a live demonstration (Iterations 17, 19, 20, 21) — none are still live
except the one this iteration deliberately kept for inspection, and that
one was created *after* the removal, so it never carried the old
mechanism. Not tested against a real, persistent repository that predates
this decision, because none exists in this project's actual history.

### How To Validate

Only testable if a real, long-lived Nexus deployment with real,
persistent generated repositories comes to exist — at that point,
regenerating against the new baseline and confirming nothing external
depended on the removed workflow would be the concrete check.

---

## Unproven

### Assumption

`verifyAndPublishAlignment` belongs in the Alignment context rather than
Repository, given that §2.1 characterizes Alignment as owning no state
beyond "named queries plus one verify endpoint" and this function is
neither.

### Why It Remains Unproven

SCOPE.md's placement rests on a specific, disclosed reading of §2.3
("Alignment → all (read-only)" governs writes to another context's own
Postgres aggregates, not writes to an external system) that is
consistent with `provisionRepository`'s own precedent (Repository writing
to GitHub through its own port) but is not something §2.1 or §2.3 states
outright. `/review`'s Architecture Critic pass named this as the one
substantive architectural tension in the change; it was disclosed, not
resolved, because resolving it means either amending the architecture
document or moving the orchestration to Repository (which would invert
today's dependency: Repository would need to import
`verifyRepositoryAlignment` from Alignment).

### How To Validate

Only resolved by an explicit architectural decision, not by more
implementation: either amend §2.1's text to acknowledge Alignment now
includes one side-effecting publish operation, or relocate
`verifyAndPublishAlignment` into Repository and confirm the resulting
dependency direction is still coherent under §2.3.

---

## Biggest Surprise

Not that a bug existed — every repository-generation iteration this
session has found one via contact with reality (Iteration 5's `--json`
flag, Iteration 17's empty-repo `HEAD`, Iteration 19's primary-mapping
ambiguity, Iteration 20's invalid YAML). The surprise this time was where
the bug hid: not in the new adapter code that talks to GitHub (which
worked correctly on its first live attempt, once the verification
script's own setup gaps were fixed), but in the *return value* of the
orchestration function — a value that matched everything else about the
real, posted status except the one field GitHub itself silently
constrains. Nothing about that mismatch would have been visible from
reading the code; it was only visible because the live script
independently re-fetched what was actually posted and compared it,
rather than trusting `verifyAndPublishAlignment`'s own return value about
itself. The same discipline that caught Iteration 1's "Biggest Surprise"
(a report claiming a test count the suite didn't produce) caught this
one too, one layer down, inside a single function's own self-report
rather than across a whole document.

---

## Final Verdict

**What does Project Nexus now know?** That Nexus can verify a
repository's alignment entirely from outside, using only credentials it
already holds, with the repository doing nothing — confirmed by two real
Commit Statuses independently reconfirmed against GitHub's own API. That
the Checks API is unreachable with this project's current credentials,
and the Commit Status API is the correct, and only currently buildable,
mechanism. That GitHub rejects, rather than truncates, an over-long
commit status description, and that this project's own client-side
truncation was already handling that correctly for the wrong stated
reason until this iteration's review caught it.

**What does Project Nexus still only believe?** That placing
`verifyAndPublishAlignment` in the Alignment context, rather than
Repository, is the right call — a disclosed, reasoned choice, not a
settled one. That no persistent, real-world repository still depends on
the removed mechanism — true for everything this project has ever
actually generated, untested against anything that could exist outside
this project's own live demonstrations.

**What architectural bets remain highest risk?** The §2.1 tension named
above: Alignment now performs one real external write, and the
architecture document's own description of that context hasn't caught up
to say so. Low risk today (nothing else calls `verifyAndPublishAlignment`
yet, and it composes entirely from already-existing, already-tested
pieces), but a real decision — amend the document, or move the code — is
owed before this pattern is repeated for anything else.
