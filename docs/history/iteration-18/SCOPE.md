# Iteration 18 Scope — can Nexus verify a repository's alignment, against what it already generates for real?

This is a scope document, not a report. Nothing described here has been
built. It closes the second concrete gap the Iteration 17 Artifact
Review surfaced: `POST /alignment/verify` (§10.5) was disclosed as
accepted technical debt in Iteration 4 — "cheap to wire into an actual
HTTP endpoint... reuse traversal/alignment functions that already
exist" — and never revisited. `docs/PROJECT_KNOWLEDGE.md`'s Unproven
table now carries this distilled directly, citing both the original
disclosure and Iteration 17's real, live artifact that calls into it.

---

## Question Under Test

Can the fail/warn rule set §10.5 describes be implemented entirely from
already-existing traversal and Alignment functions, as Iteration 4
predicted — and, checked directly rather than assumed, does the
*existing* generic HTTP request-body handling (`src/http/server.ts`)
even support the request shape the *already-generated,
already-unmodified* CI workflow actually sends?

---

## What We Know

Checked directly against the actual code, not carried over from
Iteration 4's thirteen-iteration-old prose:

- **§10.5's fail conditions** (`docs/MVP_ARCHITECTURE_V2.md` lines
  1200-1205): repository ID unknown; implements mapping missing or
  contradicted; a referenced element ID does not exist and has no
  succession; a referenced element is retired with no successor; a
  mapped component provides no capabilities. **Warn conditions**: a
  referenced element is superseded (reported with its successor); the
  snapshot hash is stale; a managed region differs from a fresh render.
- **The workflow this endpoint must actually serve already exists,
  unmodified, and only ever posts one file.** `generate.ts`'s
  `alignmentWorkflowYaml` (rendered since Iteration 4, pushed for real
  in Iteration 17) runs exactly: `curl -X POST
  "$NEXUS_BASE_URL/alignment/verify" --data @.nexus/repository.json`.
  It never posts `.nexus/architecture.snapshot.json`. Any warn condition
  about the *snapshot's* own staleness is therefore unanswerable by this
  endpoint as currently generated — not a gap in this iteration's
  implementation, a gap in what the CI job sends.
- **`.nexus/repository.json`'s real posted content is not bare JSON.**
  `render()` wraps every generated file in `wrapManagedRegion()` —
  `<!-- nexus:begin generated · do not edit -->\n{...}\n<!-- nexus:end
  generated -->`. The real `curl --data @.nexus/repository.json` call
  posts that *whole file*, markers included.
- **`src/http/server.ts`'s `readJsonBody()` calls `JSON.parse()`
  unconditionally on the raw request body for every route, with no
  fallback.** Checked directly: parsing the actual managed-region-wrapped
  text above throws a `SyntaxError` immediately, which `server.ts`
  already maps to `400 InvalidJson` — meaning the real, already-generated,
  already-pushed-to-a-real-repository CI workflow would fail this
  endpoint on every single call today, before any alignment logic ever
  ran, regardless of how correct that logic is. This is the first
  concrete "contact with reality" finding this iteration produces,
  before a single line of alignment-checking code is written — the same
  shape of discovery Iteration 5 made about `gh repo create --json` and
  Iteration 17 made about a freshly-cloned repository's missing `HEAD`.
- **`extractManagedRegion()` (`src/repository/generate.ts`) already
  exists and already strips exactly these markers** — built for
  `hashManagedRegion()`/`checkDrift()` in Iteration 4, never reused
  anywhere near the HTTP layer.
- **Every fail condition maps directly onto an existing function, with
  one gap.** `resolve()` (§8.4) walks succession but does not itself
  check `architecture.element.status` or existence — it always returns
  at least the input id unchanged when no succession edge exists,
  whether or not that id is real. Confirmed by reading `graph.resolve()`
  directly (`db/migrations/0007_graph.sql`): the recursive CTE seeds
  with the input id regardless of whether a matching row exists.
  Existence/status must be checked separately, against
  `architecture.element`, after resolving.
- **`capabilitiesOf()` (§8.4) already answers "does this component
  provide anything"** directly — empty result, no new query needed.
- **No existing function compares a repository's *posted* component
  mapping against its *live* one.** `repo.repository_component` is the
  live mapping; nothing today diffs it against an externally-supplied
  set. This is the one genuinely new comparison this iteration adds —
  everything else is composition of existing functions.
- **`POST /alignment/verify` would be the first endpoint in this
  project's history where "the referenced thing doesn't exist" is
  itself a reported, structured check result (`ok: false`, 200), not an
  HTTP 404** — every other route in `src/http/errors.ts` maps
  not-found to 404. This isn't an oversight to reconcile; §10.5 itself
  frames "repository ID unknown" as one line item in a checklist a CI
  job needs to parse and act on, not a routing failure.

---

## What We Only Believe

1. **That treating a mapping mismatch symmetrically — Nexus has since
   added a component the repo doesn't know about, or the repo claims one
   Nexus no longer has — as the same single `mapping-mismatch` failure
   is the right granularity for v1.** §10.5's own text ("missing or
   contradicted") doesn't distinguish the two directions; a real CI
   consumer might one day want to react to them differently. Not
   resolved here — the symmetric treatment is a stated simplification,
   not a settled design.
2. **That `resolve()` never returns more than one id in this project's
   real data**, even though `architecture.element_succession` has no
   constraint preventing a predecessor from having two successor edges.
   Nothing in this project's history has ever produced that shape;
   untested, not proven impossible.
3. **That accepting extra, currently-unused posted fields
   (`nexusBaseUrl`, `schemaVersion`, `templateVersion`) without
   validating them is fine for v1** — plausible (they're not needed by
   any check below), but not stress-tested against a real schema
   version mismatch.

---

## Recommended Iteration 18 Scope

1. **`src/http/server.ts`: `readJsonBody()` tries `extractManagedRegion()`
   first** (already exists, `repository/generate.ts`), parsing whatever
   it returns; falls back to `JSON.parse()` on the raw text when no
   markers are found — every existing route's plain-JSON body is
   unaffected (none of their bodies ever contain the marker strings),
   confirmed by the full existing HTTP test suite passing unmodified.
   This one change is what makes the *already-generated, already-real*
   CI workflow's actual request shape parseable at all.
2. **`src/graph/alignment.ts` gains `verifyRepositoryAlignment(db,
   input: { repositoryId, componentIds }): Promise<AlignmentVerifyResult>`**
   — the one genuinely new function, composing entirely from existing
   traversals plus one new live-mapping comparison:
   - Unknown `repositoryId` → short-circuits with `{ ok: false,
     failures: [{ code: "unknown-repository" }], warnings: [] }` —
     nothing else is checkable without a real row.
   - Posted `componentIds` vs. live `repo.repository_component` set
     difference (either direction) → `mapping-mismatch` failure.
   - For each posted `componentId`: `resolve()` to find the terminal
     successor, then look up that id's `status` in
     `architecture.element` directly (`resolve()` alone cannot
     distinguish "real and active" from "never existed" — see What We
     Know). Not found at all → `element-not-found` failure. Found,
     `status = 'retired'`, resolved to itself (no successor) →
     `element-retired-no-successor` failure. Resolved to a *different*,
     active id → `element-superseded` **warning**, carrying the
     successor id. Found and active → no issue.
   - For each *live*-mapped component (post-mapping-check): zero
     capabilities via `capabilitiesOf()` → `component-provides-nothing`
     failure.
   - Malformed input (`repositoryId` not a string, `componentIds` not
     an array of strings) → a new `InvalidAlignmentRequestError`,
     mapped to 400 in `src/http/errors.ts` — the request itself is
     malformed, a different concern from a well-formed check that
     fails.
3. **`POST /alignment/verify`** (`src/http/routes.ts`) — a thin wrapper,
   matching every other route's shape exactly: `{ status: 200, body:
   await verifyRepositoryAlignment(db, ctx.body) }`. Always 200 when the
   check itself ran (even `ok: false`); 400 only for a malformed
   request.
4. **No change to `generate.ts` or the generated workflow.** The
   endpoint is built to accept what the CI job already, actually sends
   — not the other way around.

---

## Acceptance Criteria

1. A repository whose posted `componentIds` exactly match its live
   mapping, every component active and providing at least one
   capability, returns `{ ok: true, failures: [], warnings: [] }`.
2. A posted `componentIds` set that differs from `repo.repository_component`
   in either direction produces a `mapping-mismatch` failure — checked
   both directions, not just one.
3. An unknown `repositoryId` returns only `unknown-repository`, nothing
   else attempted.
4. A posted `componentId` with no matching `architecture.element` row
   and no succession record produces `element-not-found`.
5. A posted `componentId` resolved (via `resolve()`) to itself, with
   `status = 'retired'`, produces `element-retired-no-successor`.
6. A posted `componentId` resolved to a *different*, active id via
   succession produces an `element-superseded` **warning** (not a
   failure) naming the successor.
7. A live-mapped component with zero capabilities produces
   `component-provides-nothing`.
8. **`POST /alignment/verify`, given the exact managed-region-wrapped
   text `render()` produces — not a hand-typed approximation —
   is parsed correctly and returns a structured result, not `400
   InvalidJson`.** This is the acceptance bar that actually matters:
   reproducing the real CI payload byte-for-byte via `wrapManagedRegion()`
   in the test itself, the same discipline Iteration 17 held live runs
   to.
9. Every existing HTTP test continues to pass unmodified — confirming
   `readJsonBody()`'s fallback path changes nothing for a route whose
   body was never marker-wrapped.
10. A malformed alignment-verify request (missing `repositoryId`; a
    non-array `componentIds`) returns 400 via `InvalidAlignmentRequestError`,
    not a 500 or an unhandled exception.
11. The Report states plainly that the two staleness-related warn
    conditions (snapshot hash stale; managed region differs from a
    fresh render) were deferred, and exactly why each was — not silently
    dropped from §10.5's own list.

**Recommended, not required**: if the real repository/PR from
Iteration 17's own live run is still live, POST its actual, real
`.nexus/repository.json` content to a locally-run Nexus server and
confirm the check runs correctly end-to-end — the strongest available
evidence, closing the exact loop the Artifact Review opened, but
outside this iteration's control if that repository has since been
deleted.

---

## Explicit Deferrals

- **The "snapshot hash is stale" warning** — the CI workflow never
  posts `.nexus/architecture.snapshot.json` or any hash of it; there is
  nothing to compare. Fixing this means changing what the generated
  workflow sends (`generate.ts`), which is a separate, larger decision
  this iteration does not make.
- **The "managed region differs from a fresh render" warning** —
  `checkDrift()` already exists and could answer this for
  `.nexus/repository.json` specifically, but doing so cleanly requires
  the raw, marker-wrapped request text to survive past
  `readJsonBody()`'s parsed return value, which today's every-route
  contract doesn't carry. Not plumbed through for one warning check
  without a concrete need forcing it.
- **Any authentication or authorization on this endpoint** — matches
  Iteration 13's own precedent (plain, ungated reads) and the still-parked
  Security & Authorization Model; not this iteration's job to reopen.
- **Multiple-successor resolution** (`resolve()` returning more than one
  id) — untested, not designed around; nothing in this project's real
  data has ever produced this shape.
- **Verifying anything inside `.nexus/architecture.snapshot.json`
  itself** — only `.nexus/repository.json`'s claims are checked, because
  that is the only file the CI workflow currently posts.
- **Any change to `generate.ts` or the generated workflow file** — the
  endpoint conforms to what already exists and is already live on a
  real repository, not the reverse.

---

## Risks

- **The symmetric mapping-mismatch treatment may not be what a real CI
  consumer wants**, once one exists — a disclosed simplification, not a
  proven-correct design; revisit if a concrete scenario needs the two
  directions distinguished.
- **The `readJsonBody()` change is small but touches every route's
  request path**, not only this new one — mitigated by Acceptance
  Criterion 9 (the full existing suite must pass unmodified), but worth
  extra scrutiny during `/review` precisely because its blast radius is
  wider than the feature it was added for.
- **This is the first endpoint whose "not found" case is a reported
  result rather than an HTTP error**, a deliberate deviation from this
  project's own established `statusForError` convention — worth a clear
  comment at the point of deviation so a future reader doesn't "fix" it
  by making it 404 and breaking what a CI job actually expects to parse.

---

## Why Iteration 18 Is The Right Next Step

This is the second of the two concrete candidates the Iteration 17
Artifact Review surfaced, and the smaller, more contained one: no new
port, no new external service, no schema change — composition of
already-existing, already-validated functions (`resolve`,
`capabilitiesOf`, `architecture.element` lookups) plus one new
comparison and one small, well-motivated fix to shared HTTP body
parsing. It closes a gap disclosed as cheap thirteen iterations ago and
never revisited, made concretely urgent by Iteration 17 having pushed a
real CI workflow, calling this exact endpoint, to a real repository —
where it would fail today, before any alignment logic ever ran, for a
reason (`readJsonBody`'s unconditional `JSON.parse`) nobody had reason
to notice until a real artifact existed to reveal it.
