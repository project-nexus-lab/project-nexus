# Iteration 21 Report — repositories stop being Nexus clients

Status: complete for the scope agreed in `docs/history/iteration-21/SCOPE.md`.
214 `node:test` cases pass (207 at the end of Iteration 20, minus 2 removed
with the retired CI workflow file, plus 9 new hermetic tests added during
this iteration's own `/review`), fully hermetic, zero network access. In
addition, a real, disposable repository was provisioned, pushed with the
new, smaller projection, merged onto its default branch, and
`verifyAndPublishAlignment` was run against it twice — once while aligned,
once after live Nexus state was changed out from under it — with both a
real `success` and a real `failure` Commit Status independently confirmed
via `gh api repos/.../commits/{sha}/status`, not merely this project's own
return values.

## What this resolves

`docs/PROJECT_KNOWLEDGE.md`'s Open Question #7, raised by a dedicated
architecture review between Iterations 20 and 21: should repositories be
Nexus clients at all, or should verification stay a Nexus-initiated
concern? That review recommended a direction — Nexus-initiated
verification via GitHub's Checks/Commit Status API, removing
`nexusBaseUrl` and the repository-side call entirely — without
distinguishing between those two APIs or implementing anything. This
iteration tested the recommendation's own load-bearing assumption before
writing any production code, corrected it, and then retired the
repository-initiated mechanism entirely rather than building a second one
alongside it.

**The correction**: the architecture review named "GitHub's Checks/Commit
Status API" as one option. Tested directly against a real, disposable
repository with this project's actual `gh` credentials (classic OAuth,
`gho_*`): the Checks API (`POST .../check-runs`) returns a flat `403 — "You
must authenticate via a GitHub App"` — not obtainable with this project's
current credentials at all. The Commit Status API (`POST
.../statuses/{sha}`) works with those same credentials, unchanged. This
iteration is built entirely on the Commit Status API; the Checks API was
ruled out by direct evidence before any code was written, not by
preference.

## Scope completed

1. **`src/repository/generate.ts`**: `nexusBaseUrl` and
   `.github/workflows/nexus-alignment.yml` removed entirely — not
   deprecated alongside a replacement. `render()`'s baseline drops from
   three files to two (three with a Technology Profile resolved, as
   before). `repositoryJson`'s `schemaVersion` bumped 2 → 3 to reflect
   the real shape change.
2. **`src/repository/vcs-provider.ts`**: `VcsProvider` gains
   `getFileAtRef(providerRef, path, ref)` (returns real content and the
   exact commit SHA it was read at, or `null` — not a throw — when the
   file doesn't exist there) and `postCommitStatus(providerRef, sha,
   input)`. Added to the port, not left `GhCliVcsProvider`-only, so
   `NoopVcsProvider` (and, this iteration, a small test-only fake) can
   stand in for hermetic tests — the same reason
   `openPullRequestWithChanges` was added to the port in Iteration 17
   rather than bolted onto one adapter.
3. **`src/repository/gh-cli-vcs-provider.ts`**: real implementations.
   `getFileAtRef` resolves `ref` to an exact commit SHA first (`gh api
   repos/.../commits/{ref}`) before fetching content at that SHA — the
   Contents API's own `.sha` field is a *blob* SHA, not a *commit* SHA,
   and a commit status must be posted against a commit; resolving first
   also avoids a race where a branch ref moves between the two calls.
   `postCommitStatus` shells out to the Commit Status API. Both reuse
   `mapGhError` for genuine failures; a new `isNotFound()` helper
   distinguishes a real 404 (an unbootstrapped or not-yet-pushed
   repository — a real, expected state) from everything else.
4. **`src/graph/alignment.ts`**: new `verifyAndPublishAlignment(db,
   repositoryId, vcsProvider)`. Resolves the repository's own
   `provider_ref`/default branch, fetches `.nexus/repository.json` at
   that branch's current commit, reuses `verifyRepositoryAlignment()`
   (Iteration 18) completely unmodified against the extracted managed
   region, maps the result to a Commit Status (`ok: true` → `success`;
   `ok: false` → `failure`; any of six "can't even evaluate this"
   conditions — unknown repository, unprovisioned repository, missing
   file, missing managed region, invalid JSON, wrong shape — → `error`,
   posting nothing in that last case), and posts it.
5. **`test/repository.test.ts`**: all seven references to the old
   three/four-file list or the removed workflow file updated to the new,
   smaller shape; the two tests whose entire subject was the removed
   file (its YAML validity, its drift-check) removed outright, not left
   failing or retargeted at a file that no longer exists.
6. **`src/cli/verify-github-workflow-valid.ts`** retired (it tested
   exactly the file this iteration removes); **`src/cli/verify-github-alignment-publish.ts`**
   added, demonstrating the new mechanism for real (see below).
7. **`test/alignment-publish.test.ts`** (new, added during this
   iteration's own `/review` — see "What `/review` found," below): nine
   hermetic tests giving `verifyAndPublishAlignment` the same complete
   branch coverage `test/alignment-verify.test.ts` already gives
   `verifyRepositoryAlignment`.

## What `/review` found, and what changed as a result

`/review` was run against the full implementation before this close.
Five reviewers plus the Architecture Critic were applied; two produced
findings, both resolved before this Report was written:

- **Consistency Auditor, fixed**: `verifyAndPublishAlignment` posted a
  GitHub-truncated `description` but returned the *untruncated* string in
  its result — caught by the live verification script's own independent
  `gh api` check, which showed the posted description didn't match the
  returned one. Fixed by truncating once and reusing the same string for
  both the post and the return value.
- **Consistency Auditor, fixed**: the code comment justifying that
  truncation claimed *"GitHub truncates a commit status description past
  this length — verified against the API docs, not assumed."* Neither
  half held up: a real, disposable probe repository, created and deleted
  during `/review`, confirmed GitHub does not truncate a description over
  140 characters — it **rejects the request outright with a 422**
  (`"Description is too long (maximum is 140 characters)"`). The claimed
  API-docs verification also hadn't actually happened (a first attempt at
  reading GitHub's own published REST docs during that same review didn't
  even surface the limit). The comment now states what was actually
  checked, and notes that the client-side truncation is load-bearing —
  `verification.failures` can concatenate an unbounded number of
  messages, and without it a repository with only two or three real
  alignment failures already risks a thrown error instead of a posted
  status.
- **Evidence Reviewer, resolved**: `verifyAndPublishAlignment` has eight
  possible outcomes (six `error` conditions plus `success`/`failure`);
  before this fix, only `success` and `failure` had ever been exercised,
  and only by the live script, which isn't part of `npm test`. The six
  `error` branches had zero coverage, hermetic or live.
  `test/alignment-publish.test.ts` now covers all eight, plus the
  140-character truncation boundary itself, using `NoopVcsProvider` (its
  own always-`null` `getFileAtRef` conveniently exercises the
  "file missing" branch for free) and one small test-only fake
  `VcsProvider` for the rest.
- **Domain Integrity Reviewer, disclosed, not resolved by code
  change** — see "Architectural deviations," below.

## Architectural deviations (disclosed, not silently absorbed)

Two, both already anticipated by `docs/history/iteration-21/SCOPE.md`'s
own Explicit Deferrals, plus one surfaced only during `/review`:

1. **`MVP_ARCHITECTURE_V2.md` §10.5's literal text** — *"The workflow
   posts `.nexus/repository.json` to `POST /alignment/verify`"* — now
   describes a mechanism this iteration retires. Not amended here, per
   SCOPE.md's own deferral: amending the authoritative architecture
   document is a separate, more deliberate act than this iteration's own
   implementation scope. This is the same file Iteration 20 had just
   made valid YAML; removing it now is not a contradiction of that work
   — Iteration 20 correctly fixed the *old* model's own artifact,
   validated end-to-end against real GitHub Actions; this iteration
   correctly retires the model that artifact existed to serve, once real
   evidence (not merely the architecture review's recommendation) showed
   a viable alternative exists. Both are true at once.
2. **§2.1's characterization of the Alignment context** — *"Alignment
   owns no state: named queries plus one verify endpoint"* — is stretched
   by `verifyAndPublishAlignment`. Every other function in `alignment.ts`
   fits that sentence exactly: a named query or a pure computation over
   already-fetched data. `verifyAndPublishAlignment` is a third kind of
   thing: an orchestration that performs a real external write
   (`postCommitStatus`) through a port owned and typed by the Repository
   context (`src/repository/vcs-provider.ts`). SCOPE.md's own
   justification — `§2.3`'s "Alignment → all (read-only)" is read as
   governing writes to another context's own Postgres aggregates, not
   writes to an external system — is a reasonable, deliberate argument,
   the same distinction `provisionRepository`'s own GitHub writes already
   rely on (Repository writing to GitHub through its own port).
   But it is the iteration's own gloss on §2.3, not something §2.1 or
   §2.3 states outright, and `/review`'s Architecture Critic pass named
   it as the one substantive architectural tension in this change. Not
   fixed here, because fixing it means one of two real decisions this
   iteration deliberately did not make: amend §2.1's own text to
   acknowledge Alignment now includes one side-effecting publish
   operation, or relocate the orchestration into the Repository context
   (which would mean Repository importing `verifyRepositoryAlignment`
   from Alignment instead, the reverse dependency `§2.3` already
   forbids). Left as a named, open tension for whichever iteration next
   revisits either context's boundary — not absorbed silently into
   `alignment.ts`'s own module doc comment as though already settled.

## Technical debt intentionally created

None beyond the two deviations above, both disclosed. No partial
implementation, no deferred test, no known-broken path left in place.

## Demonstrations and verification

```
npm run typecheck                                     # clean
npm test                                              # 214/214, fully hermetic, zero network access
npm run verify:github-alignment-publish -- --keep     # real run: ALL CHECKS PASSED
```

The real run's own decisive evidence, independently re-fetched from
GitHub's API rather than trusted from this project's own return values:

```
"context": "nexus/alignment", "state": "success",
  "description": "repository is aligned with live Nexus state"
...
"context": "nexus/alignment", "state": "failure",
  "description": "alignment failed: posted componentIds [comp.iter21-validation]
    do not match the live mapping [comp.iter21-extra, comp.iter21-validation]; co"
```

(the second description's abrupt cut-off is the real, confirmed 140-character
limit at work, not a copy error in this Report.)

`getFileAtRef` was also confirmed directly against real GitHub state: a
real commit SHA and real content for `.nexus/repository.json`, and `null`
for a path that does not exist at that ref.

Getting to this clean result took two real, live failures along the way,
both found and fixed during this iteration rather than glossed over:

- The first live run failed on a genuine setup gap in the verification
  script itself (the seeded test component provided no capability, so
  even the "aligned" case reported `component-provides-nothing`) and on a
  real lifecycle-ordering conflict (the script tried to `registerMapping`
  again after `generateProjection` had already advanced the repository
  past the state that allows it). Both were script bugs, not
  `alignment.ts` bugs, fixed by giving the test component a real
  capability and by writing directly to `repo.repository_component` to
  simulate live drift, rather than routing a state-machine violation
  through `registerMapping`.
- The second live run surfaced the two real product/consistency findings
  described above under "What `/review` found."

**Three real, disposable GitHub repositories were created and deleted
during this iteration's own testing** (two failed verification-script
attempts, one 140-character-limit probe created during `/review`) — all
three confirmed deleted. **One real repository remains live for
inspection**, at the developer's established preference:
`ketilaa/nexus-iter21-alignment-publish-1789542805181`. Not deleted by
this Report or this close.

## Scope deferred

Exactly as `docs/history/iteration-21/SCOPE.md` listed: how Nexus learns
*when* to check a repository (webhook or polling — no real, reachable
Nexus deployment exists to receive either); verifying open-PR branches
rather than only the default branch; the Checks API or any GitHub App
registration (ruled out by direct evidence, not postponed); amending
`MVP_ARCHITECTURE_V2.md` §10.5's own text; any change to `POST
/alignment/verify` itself (untouched, its full existing test suite
passes unmodified); rich Checks-API-style output (line annotations,
structured per-failure detail) beyond a plain Commit Status's
`state`/`context`/`description`.

## Recommended next-step validation

- Whichever iteration next revisits context boundaries should resolve
  the §2.1 tension named above — either by amending the architecture
  document's characterization of Alignment, or by relocating the publish
  orchestration into Repository.
- No real trigger exists for `verifyAndPublishAlignment` yet — today it
  runs exactly as often as someone runs `verify:github-alignment-publish`
  or calls it directly. A real deployment, when one exists, will need a
  real answer to "when," not assumed to fall out of this iteration's own
  scope.
