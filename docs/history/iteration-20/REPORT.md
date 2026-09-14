# Iteration 20 Report — the generated CI workflow is finally valid YAML, confirmed by GitHub itself

Status: complete for the scope agreed in `docs/history/iteration-20/SCOPE.md`,
with a clean result and the strongest real-world evidence this project's
repository-generation work has produced yet. 207 `node:test` cases pass
(up from Iteration 19's 203: 4 new in `test/repository.test.ts`), fully
hermetic, zero network access. In addition, a real repository was
provisioned, the fixed workflow pushed via Iteration 17's real
push/branch/PR mechanism unmodified, the PR merged onto the default
branch, and GitHub's own Actions API queried directly — it now lists
the workflow with `"state": "active"`, definitive external confirmation
that GitHub Actions itself, not only this project's local `yaml`
package, accepts the fixed file.

## The bug, and how it was found

`.github/workflows/nexus-alignment.yml`, generated since Iteration 4 and
pushed for real in Iterations 17 and 19, was not valid YAML as actually
committed. `wrapManagedRegion()` wraps every generated file in the same
HTML-comment-style markers regardless of format — harmless for the
three `.nexus/*.json` files (nothing but Nexus's own unwrap-aware code
ever reads them) but not for the CI workflow, whose only real consumer
is GitHub Actions, an external system that never unwraps Nexus's custom
markers and simply tries to parse the raw file as YAML. Verified
directly, before any fix was written: parsing the exact real content
this project has generated since Iteration 4 through this project's own
`yaml` package (`^2.9.0`, already a dependency, used in
`src/import/importAll.ts`) failed outright: *"Implicit keys need to be
on a single line at line 1, column 1."*

This was found while scoping what would otherwise have been the next
iteration (Technology Profile-driven scaffolding synthesis) — not
discovered by a test, a live run, or a user report. Every prior
verification (Iterations 17 and 19's own live demonstrations) checked
that the pushed content matched `render()`'s own output byte-for-byte —
a real, correct check, but one that cannot detect a file that is
internally self-consistent and *also* invalid in its own format. The
bug survived two real, live pushes to real GitHub repositories,
undetected, because nothing had ever asked GitHub Actions itself whether
it could read the file.

## Scope completed

1. **`src/repository/generate.ts`**: a second, YAML-native marker pair
   (`# nexus:begin generated · do not edit` / `# nexus:end generated`)
   alongside the original HTML-comment pair. `wrapManagedRegion(body,
   style)` gains an optional `style` parameter defaulting to `"html"` —
   every existing call site (the three JSON files) needed zero changes.
   `extractManagedRegion()`/`hashManagedRegion()` keep their exact
   signatures and try both marker styles internally (HTML first, then
   YAML) — the same "try the specific thing, fall back" shape Iteration
   18 established for `readJsonBody()`. `render()`'s one YAML call site
   now passes `"yaml"` explicitly.
2. **No change to `src/http/server.ts`, `POST /alignment/verify`, or
   `checkDrift()`'s signatures.** All three already call the now-dual-style-aware
   `extractManagedRegion()`/`hashManagedRegion()` unchanged and get the
   right behavior for free — confirmed by their full existing test
   suites passing unmodified.
3. **No change to `generateProjection()`'s hashing loop** — it already
   iterates every `ManagedFile` uniformly.
4. **`src/cli/verify-github-workflow-valid.ts`** (new): provisions a
   real repository, drives the existing, unmodified `generateProjection()`
   and `openPullRequestWithChanges()` (Iteration 17), merges the real PR
   onto the default branch (workflows triggered by `pull_request` are
   read from the base branch, not the head — merely opening a PR, as
   Iterations 17/19 both did, never actually exercises this), and queries
   `gh api repos/.../actions/workflows` directly to confirm GitHub
   registered the workflow as `active`. `npm run verify:github-workflow-valid`,
   same `--keep` convention as every prior real-GitHub script this
   session.

## What survived contact, precisely

- **The fix was verified before it was written, not after.** Both the
  bug and the proposed `#`-marker fix were tested directly against the
  real `yaml` package before any production code changed — the first
  iteration this session where pre-implementation verification meant
  `/review` found no new bugs in the implementation itself, only
  confirmed the design held.
- **The real, live demonstration succeeded on the first attempt**: a
  real repository, a real push, a real merge, and GitHub's own Actions
  API confirming `state: "active"` for the `nexus-alignment` workflow —
  the strongest possible evidence, not a proxy for it.
- **Every existing test in this project's history — `repository.test.ts`,
  `alignment-verify.test.ts`, `http.test.ts`'s `/alignment/verify`
  suite — passed unmodified**, confirming the fix's backward
  compatibility directly rather than by inspection of the diff alone.

## What this does not settle

Whether any other currently-generated file has the same class of
format/consumer mismatch this iteration found for the CI workflow. The
three `.nexus/*.json` files were checked directly for this iteration
and confirmed self-consumed, unwrap-aware by construction — but this is
the first time this project has asked "who really reads this file, in
what raw form" of its own generated output at all; a future generated
file (real language/build scaffolding, still deferred) will need to ask
the same question again for itself, not inherit this iteration's answer
by default.

## Scope deferred

Exactly as `docs/history/iteration-20/SCOPE.md` listed: auditing every
future generated file for the same mismatch class in advance; a runtime
self-check inside `render()` validating its own YAML output (validity
is established by tests and the real demonstration, not a defensive
check baked into generation); any change to what the CI workflow's
content actually does (this iteration fixes validity, not behavior).

## Technical debt intentionally created

None. This iteration paid down a real, disclosed correctness bug in
full — no new debt, no partial fix.

## Demonstrations and verification

```
npm run typecheck                                  # clean
npm test                                           # 207/207, fully hermetic, zero network access
npm run verify:github-workflow-valid -- --keep     # real run: ALL CHECKS PASSED
```

The real run's own decisive line, from GitHub's own Actions API, not
this project's own claim about itself:

```
"name": "nexus-alignment",
"path": ".github/workflows/nexus-alignment.yml",
"state": "active"
```

`/review` applied this session against every file this iteration
touched: Constitution, Domain Integrity, Simplicity Reviewers PASS;
Evidence Reviewer findings recorded in `LESSONS.md`; Consistency Auditor
found no discrepancies — the first pass this session to close this
cleanly; Architecture Critic considered whether the "html-first, then
yaml" try-order in `extractManagedRegion()` could ever misfire against
the four real files that exist today and found it cannot, given each
file's marker style is unambiguous by construction.

**A real, disposable GitHub repository from this session's live run
remains live on the developer's account** (to inspect before cleanup,
matching this session's established pattern):
`ketilaa/nexus-iter20-workflow-valid-1789388625988`. Not deleted by this
Report or this close.

## Recommended next-step validation

None specifically raised by this iteration beyond what `SCOPE.md`
already disclosed (auditing future generated files for the same
mismatch class, as each is built). This clears the way for Technology
Profile-driven scaffolding synthesis (the fuller half of Iteration 15's
own deferred "Phase 4") to proceed without an already-broken generation
pipeline underneath it.
