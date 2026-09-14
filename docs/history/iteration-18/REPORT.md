# Iteration 18 Report — `POST /alignment/verify` works against what Nexus actually generates

Status: complete for the scope agreed in `docs/history/iteration-18/SCOPE.md`,
with a clean result and a real, live demonstration. 198 `node:test`
cases pass (up from Iteration 17's 185: 10 new in a new
`test/alignment-verify.test.ts`, 3 new in `test/http.test.ts`), fully
hermetic, zero network access. In addition, the actual, still-live
`.nexus/repository.json` content sitting on Iteration 17's real PR was
fetched via `gh api` and POSTed to a locally-running Nexus server this
session — the strongest available evidence, closing the exact loop the
Iteration 17 Artifact Review opened, with the literal artifact rather
than a regenerated stand-in.

## Scope completed

1. **`src/http/server.ts`'s `readJsonBody()`** now tries
   `extractManagedRegion()` (already built for `checkDrift()`, Iteration
   4) before falling back to plain `JSON.parse()`. This is the fix that
   makes the *already-generated, already-real* CI workflow's actual
   request shape parseable at all — confirmed directly: before this
   change, the real payload (`.nexus/repository.json`, markers
   included) throws a `SyntaxError` that `server.ts` already maps to
   `400 InvalidJson`, meaning the endpoint would have failed every real
   call regardless of how correct its alignment logic was.
2. **`src/graph/alignment.ts` gains `verifyRepositoryAlignment()`**,
   composing almost entirely from already-existing functions: `resolve()`
   and a direct `architecture.element` status lookup (since `resolve()`
   alone cannot distinguish "real and active" from "never existed"),
   `capabilitiesOf()`, and one genuinely new comparison — posted vs. live
   `repo.repository_component` mapping. Returns a structured `{ ok,
   failures, warnings }`; only a malformed request
   (`InvalidAlignmentRequestError`) throws.
3. **`POST /alignment/verify`** (`src/http/routes.ts`) — a thin wrapper,
   matching every other route's shape. Deliberately, and documented at
   the point of deviation: an unknown repository is a reported result
   (`200`, `ok: false`), not a `404` — the one route in this codebase
   where "not found" is itself a checklist item a CI caller parses, not
   a routing failure.
4. **`InvalidAlignmentRequestError` mapped to 400** in
   `src/http/errors.ts`, following the existing per-domain typed-error
   convention exactly.
5. **No change to `generate.ts` or the generated CI workflow** — the
   endpoint conforms to what the workflow already, actually sends.

## Two real bugs found and fixed during `/review`, not at implementation time

Both discovered by tracing what the code actually does against a case
its own author hadn't fully worked through in advance, not by intuition:

1. **A succession chain terminating in a retired element (no living
   successor) was misclassified as the mild `element-superseded`
   warning instead of the `element-retired-no-successor` failure it
   actually is.** The original logic only checked "is the *original*
   posted id retired with no successor of its own" — it never checked
   whether a chain that *did* resolve somewhere actually resolved to
   something alive. Fixed: terminal status is checked first, regardless
   of whether the id changed; a precise message distinguishes "retired
   directly" from "superseded by something itself retired." Covered by
   a new regression test.
2. **Duplicate posted `componentIds` were checked once per occurrence**,
   producing duplicate result entries for a harmless duplicate in the
   request. Fixed by iterating the already-built deduped `Set` instead
   of the raw array. Covered by a new regression test.

## What survived contact, precisely

- **The real, live end-to-end run succeeded on the first attempt** once
  the state was correctly re-seeded to match what `verify-github-bootstrap.ts`
  (Iteration 17) had originally created: `gh api
  repos/.../contents/.nexus/repository.json?ref=nexus/bootstrap` returned
  the exact managed-region-wrapped content; POSTed to a local server, it
  parsed correctly and returned `{ ok: true, failures: [], warnings: [] }`.
- **Every fail/warn condition composes from existing functions exactly
  as Iteration 4 predicted**, with one addition (the mapping comparison)
  Iteration 4's own text didn't name specifically, because
  `repo.repository_component` existed then but nothing had ever compared
  it against an externally-supplied set.

## What this does not settle

Whether the symmetric treatment of a mapping mismatch (Nexus-ahead vs.
repo-ahead reported identically) is what a real CI consumer will
actually want once one exists — a disclosed simplification, not
resolved here. Whether `resolve()` ever needs to handle more than one
resolved id in this project's real data — untested, no evidence either
way.

## Scope deferred

Exactly as `docs/history/iteration-18/SCOPE.md` listed: the "snapshot
hash is stale" warning (the CI workflow never posts the snapshot file,
so there is nothing to compare); the "managed region differs from a
fresh render" warning (would need the raw request text to survive past
`readJsonBody`'s parsed return value, not justified by evidence yet);
any authentication on this endpoint (matches Iteration 13's own
precedent, and the still-parked Security & Authorization Model);
multiple-successor resolution; anything inside
`.nexus/architecture.snapshot.json` itself, since the CI workflow never
posts it.

## Technical debt intentionally created

None beyond what `SCOPE.md` already named as deferred. Both bugs found
during `/review` were fixed in this same session, not carried forward.

## Demonstrations and verification

```
npm run typecheck   # clean
npm test            # 198/198, fully hermetic, zero network access
```

Plus one real, external demonstration (via a one-off script, not
committed): the actual `.nexus/repository.json` content still live on
`ketilaa/nexus-iter17-bootstrap-1789375649168`'s `nexus/bootstrap`
branch, fetched via `gh api`, POSTed to a locally-running
`createHttpServer()` instance with matching state re-seeded — returned
`{ ok: true, failures: [], warnings: [] }`.

`/review` applied this session against every file this iteration
touched: Constitution, Domain Integrity, Simplicity Reviewers PASS;
Evidence Reviewer findings recorded in `LESSONS.md`; Consistency
Auditor found and fixed the two bugs above, both before this Report was
written; Architecture Critic considered the deliberate `200`-not-`404`
deviation and found it documented at the point of deviation, matching
§10.5's own framing.

## Recommended next-step validation

Whether a real CI consumer actually wants the mapping-mismatch direction
distinguished (Nexus-ahead vs. repo-ahead) is the one concretely named,
untested thread this iteration leaves behind — not testable without a
real consumer or a concrete scenario demanding it. Beyond that, this
iteration's own deferrals (the two staleness warnings) are the natural
next candidates if `/alignment/verify` itself needs to grow further,
behind whatever the roadmap's own next priority turns out to be.
