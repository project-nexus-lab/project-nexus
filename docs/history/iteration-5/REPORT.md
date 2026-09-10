# Iteration 5 Report — real GitHub-backed VcsProvider

Status: complete for the scope agreed in `docs/history/iteration-5/SCOPE.md`,
with one acceptance criterion not fully met and disclosed precisely below
rather than glossed over. 110 `node:test` cases pass (up from Iteration
4's 102; all still hermetic, offline, zero network access). One live,
real validation run against GitHub was also executed and its full output
is reproduced in this report, not summarized from memory.

## Scope completed

1. **`GhCliVcsProvider implements VcsProvider`** —
   `src/repository/gh-cli-vcs-provider.ts`. Shells out to `gh repo create`
   via `child_process.execFile`; no new npm dependency, per SCOPE.md §5's
   recommendation.
2. **Real error mapping** — `mapGhError`, classifying failures into
   `not-installed`, `not-authenticated`, `name-taken`, `network`, or
   `unknown`, from `gh`'s stderr text (there is no structured error code
   to check instead — see "A finding before any code was written," below).
3. **The existing state machine driven, unmodified, against a real
   repository** — `declareRepository → provisionRepository(GhCliVcsProvider)
   → registerMapping → generateProjection → activateRepository`, via
   `src/cli/verify-github.ts` (`npm run verify:github`, deliberately not
   part of `npm test` — real network access and real `gh` credentials
   would break the hermetic property every other test in this project has
   kept since Iteration 0).
4. **One deliberately-triggered real failure** — a genuine name collision
   against GitHub's own API, not a simulated one.
5. **Cleanup, attempted** — see "What did not fully succeed," below.
6. **Tests** — `test/gh-cli-vcs-provider.test.ts` (8 cases, hermetic:
   pure-function URL parsing and error classification against
   representative fixtures, no network).

## A finding before any code was written

`docs/history/iteration-5/SCOPE.md` (§5) assumed `gh repo create` would
support a `--json` flag, the same way this project had already used
`gh repo view --json` in its own design reasoning. Checked directly
against `gh repo create --help` before writing `GhCliVcsProvider`: it does
not. `gh repo create` prints a bare repository URL to stdout on success
and nothing structured. The adapter's error mapping is therefore
necessarily stderr-text-pattern-based — inherently more fragile than a
structured field would be, and disclosed as such directly in the code
(`gh-cli-vcs-provider.ts`'s own doc comment) rather than left implicit.
This is the first piece of evidence the iteration produced, and it arrived
before the adapter existed.

## The live validation run, in full

Executed via `npm run verify:github` against the real, authenticated
`ketilaa` GitHub account (private repository visibility, confirmed by
`gh repo view --json isPrivate` returning `true`):

```
[PASS] gh is authenticated
[PASS] provisionRepository stored a real provider_ref — "ketilaa/nexus-iter5-validation-1789041699868"
[PASS] bootstrap_state advanced to 'provisioned'
[PASS] gh repo view independently confirms the repository exists — {"nameWithOwner":"ketilaa/nexus-iter5-validation-1789041699868"}
[PASS] state machine reached 'active' with zero changes to lifecycle.ts
[PASS] the collision is caught as a typed GhCliError with reason 'name-taken' — "... GraphQL: Name already exists on this account (createRepository)"
[PASS] the failed repository's bootstrap_state remains 'declared' — not silently advanced
[PASS] retrying provisionRepository on a still-declared repository is legal
[MANUAL CLEANUP REQUIRED] could not delete automatically — see below

=== ALL CHECKS PASSED ===
```

Every acceptance criterion in SCOPE.md §6 that could be automatically
checked, passed. One could not be — see below, reported as a finding, not
folded silently into "ALL CHECKS PASSED."

## What survived contact, precisely

- **The port's type signature required zero changes.**
  `VcsProviderCreateInput { name, defaultBranch }` and
  `VcsProviderCreateResult { providerRef }`, exactly as Iteration 4 shipped
  them, were sufficient for `GhCliVcsProvider.create()` to provision a
  real, verifiable GitHub repository.
- **`src/repository/lifecycle.ts` required zero changes.** Confirmed
  literally, not by intention: no line of that file was touched this
  iteration. `registerMapping`, `generateProjection`, and
  `activateRepository` ran against the real repository exactly as they
  run against `NoopVcsProvider` in every existing test.
- **The deliberately-triggered failure answered Iteration 4's own named
  Unproven question directly**: `provisionRepository`'s two-step sequence
  (call the provider, then write `provider_ref` and `bootstrap_state`) is
  safe under a real failure. The repository stayed cleanly at `declared`,
  not in an inconsistent in-between state, and — checked, not assumed —
  a retry against the same (still-colliding) name was accepted by the
  state machine rather than permanently stuck.
- **Nexus's `id` (`repo.<slug>`) and the real `provider_ref`
  (`owner/name`) never needed to be the same string.** The repository
  name given to GitHub (`nexus-iter5-validation-<timestamp>`) and the
  Nexus-minted id (`repo.iter5-validation-<timestamp>`) differ in every
  character before the shared timestamp; GitHub raised no objection to
  either. The schema's decision, made in Iteration 0, to keep `id` and
  `provider_ref` as two separate columns was confirmed necessary, not
  merely cautious.

## What did not survive contact cleanly — two honest exceptions

**1. Visibility is not part of the port's per-call input; it is adapter
configuration.** SCOPE.md §3 predicted `{name, defaultBranch}` might be
insufficient — specifically naming a visibility flag as the likely gap.
That prediction was correct, but the resolution is worth stating
precisely rather than claiming "no port change was needed" without
qualification: `GhCliVcsProvider`'s constructor takes
`visibility: "private" | "public"`, fixed once per provider instance, not
passed through `create()`'s input. The port's *type* is unchanged; the
*decision* visibility represents was moved to a place the port doesn't
model at all. This works for this iteration (one provider instance, one
visibility, one call) and is disclosed as a real design choice with a real
consequence: provisioning repositories with different visibility through
the same running process would currently need multiple provider
instances, not one call-site decision. Whether visibility belongs on the
port's input, on the `Repository` aggregate itself, or stays
adapter-level is not decided here — named as a real question, not
resolved by default.

**2. Cleanup requires a GitHub OAuth scope (`delete_repo`) that repository
*creation* does not, and the current `gh` authentication does not have
it.** Checked directly against `gh repo delete --help` before running
anything, and confirmed live: the automated cleanup step failed with
`HTTP 403: Must have admin rights to Repository... This API operation
needs the "delete_repo" scope`. SCOPE.md §6's acceptance criterion 5
("the real repository is deleted after the run, verified") was not met
automatically. `verify-github.ts` was written to handle this
gracefully — it prints the exact manual cleanup command rather than
silently leaving an unexplained repository — but graceful failure is
still failure of that specific criterion, not a pass. One real,
authenticated GitHub repository (private, empty,
`ketilaa/nexus-iter5-validation-1789041699868`) was left on the
developer's account at the time this report was written, disclosed
directly to the developer in-session with two cleanup options, not
discovered later by them independently.

**Resolved, after this report was first written**: the developer granted
`delete_repo` on the authenticated `gh` credential (`gh auth refresh -h
github.com -s delete_repo`); `gh repo delete
ketilaa/nexus-iter5-validation-1789041699868 --yes` then succeeded, and
`gh repo view` on the same name confirms it no longer resolves. No live
artifact remains. This does not change the finding above — the automated
cleanup step in `verify-github.ts` still cannot delete under the
credential scope it was run with, and manual cleanup is what actually
happened, exactly as the finding says. Recorded here so this document
does not read as though an unresolved leftover still exists.

## Scope deferred

Exactly as SCOPE.md §7 listed: GitHub App support, OAuth flows, multi-user
support, permission management, real CI integration, real PR review
workflows, repository synchronization, advanced repository templates.
None were touched. Also, per SCOPE.md §4: no branch was pushed, no PR was
opened — `generateProjection`'s output was computed but never written to
the real repository. That remains a distinct, larger, undesigned claim.

## Architectural deviations

None from the design in SCOPE.md. The visibility-as-adapter-configuration
choice (above) was anticipated as a possible gap in SCOPE.md §3 and §8,
not discovered as a surprise requiring a redesign.

## Technical debt intentionally created

- **`mapGhError`'s classification is stderr-text-pattern-based**, and is
  shared between `create()` (its intended target) and `deleteRepository()`
  (added only for this iteration's own cleanup convenience, not part of
  the `VcsProvider` port). The 403/missing-scope deletion failure fell
  through to the `unknown` category, which is correct behavior (nothing
  crashed, nothing was misclassified as a different real category) but
  confirms the mapping was designed around `create()`'s failure modes
  specifically, not deletion's.
- **`deleteRepository` is not part of the `VcsProvider` port.** §10.2
  never describes deletion as part of the bootstrap flow; it exists solely
  so `verify-github.ts` can attempt to clean up after itself. If a future
  iteration needs real deletion as a first-class operation, it does not
  yet have a place in the port's contract.
- **The visibility question named above** is left open, not resolved by
  default in either direction.

## Demonstrations and verification

```
npm run typecheck        # clean
npm test                  # 110/110, fully hermetic, zero network access
npm run verify:github     # requires real gh auth + network; output reproduced above
```

## Recommended next-step validation

Per SCOPE.md §9, unaffected by this iteration's outcome: the real Claude
SDK Adapter question (open since Iteration 2) remains the highest-value
open experiment in the project. This iteration's own two honest
exceptions — visibility's place in the model, and the `delete_repo` scope
gap — are new, narrower findings; neither requires the kind of
architecture-level change SCOPE.md §8 described as the higher bar (no new
intermediate bootstrap state was needed; the state machine held).
