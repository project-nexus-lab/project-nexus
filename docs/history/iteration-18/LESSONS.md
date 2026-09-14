# Iteration 18 Lessons

Not a status report (`docs/history/iteration-18/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 18 closed a gap disclosed as cheap thirteen iterations ago
(Iteration 4) and never revisited, until the Iteration 17 Artifact
Review re-surfaced it. The core prediction held: §10.5's fail/warn rule
set composes almost entirely from already-existing functions. But the
first concrete thing this iteration found, before any alignment logic
was written, was that the *shared HTTP body parser* — untouched since
Iteration 1 — could not parse what the *already-generated, already-real*
CI workflow actually sends. And the second concrete thing this iteration
found, during its own `/review` rather than at implementation time, was
a real correctness bug in the succession-chain logic itself: a chain
that resolves *somewhere* is not the same as a chain that resolves
somewhere *alive*.

---

## Validated

### Assumption

§10.5's fail/warn rule set can be implemented from already-existing
traversal and Alignment functions (`resolve`, `capabilitiesOf`), plus
one new comparison — no new mechanism needed, as Iteration 4 predicted.

### Status

VALIDATED

### Evidence

`verifyRepositoryAlignment()` (`src/graph/alignment.ts`) composes
`resolve()`, a direct `architecture.element` status lookup, and
`capabilitiesOf()` for every fail/warn condition this iteration
implements; the one new piece of logic is the posted-vs-live
`repo.repository_component` comparison, which nothing before this
iteration needed. Ten hermetic tests exercise every condition against
real inserted fixtures.

### Consequence

Closes the `docs/PROJECT_KNOWLEDGE.md` row distilled from Iteration 4's
own disclosure — the endpoint exists, is real, and its rule set did not
require inventing anything beyond what Iteration 4 already predicted.

---

### Assumption

The endpoint works against the *actual* payload the *already-generated,
unmodified* CI workflow sends — not a bare-JSON approximation of it.

### Status

VALIDATED, by a real, external, live demonstration — not only a
hermetic test.

### Evidence

Two levels of evidence, deliberately not stopping at the first: (1) a
hermetic HTTP test posts `generateProjection()`'s own real output
(markers included) and confirms `200`, not `400 InvalidJson`; (2) the
actual, still-live `.nexus/repository.json` content sitting on
Iteration 17's real PR (`ketilaa/nexus-iter17-bootstrap-1789375649168`,
branch `nexus/bootstrap`) was fetched via `gh api` and POSTed to a
locally-running Nexus server this session, with matching architecture
state re-seeded to what `verify-github-bootstrap.ts` originally created
— returned `{ ok: true, failures: [], warnings: [] }` on the first
attempt.

### Consequence

This is the strongest evidence this project's own discipline asks for:
not a fresh artifact built to pass, but the literal, previously-existing
artifact from a different iteration, checked against a fix made for a
reason discovered independently of it. The loop the Iteration 17
Artifact Review opened is now closed with the same real object, not a
regenerated stand-in.

---

### Assumption

`readJsonBody()`'s unconditional `JSON.parse()` (unchanged since
Iteration 1) can parse whatever `.nexus/repository.json`'s real,
generated content actually is.

### Status

INVALIDATED, before any alignment logic was written — see Invalidated,
below.

---

## Invalidated

### Assumption

`src/http/server.ts`'s generic request-body parsing already supports
whatever a real POST caller sends, because every route built through
Iteration 17 has always sent bare JSON.

### Status

INVALIDATED

### Evidence

`.nexus/repository.json`, as `render()` has generated it since
Iteration 4, is wrapped in managed-region markers
(`wrapManagedRegion()`) — not bare JSON. `readJsonBody()`'s
`JSON.parse(text)` throws a `SyntaxError` on that exact real content,
which `server.ts` already maps to `400 InvalidJson`. Checked directly
against the real generated string, not inferred from reading `render()`
alone.

### Resolution

`readJsonBody()` now tries `extractManagedRegion()` first, falling back
to plain `JSON.parse()` when no markers are found — every existing
route's plain-JSON body is unaffected (confirmed: the full existing
suite passes unmodified), since none of their bodies have ever contained
the marker strings.

### Consequence

The real, already-pushed CI workflow (Iteration 17) would have failed
every single call to this endpoint, forever, for a reason with nothing
to do with alignment logic — discovered only because this iteration
traced the actual real payload shape before writing any check, the same
discipline that found `gh repo create --json` didn't exist (Iteration
5) and that a fresh repository has no commit history (Iteration 17).

---

## Unproven

### Assumption

Treating a mapping mismatch symmetrically — Nexus has since mapped a
component the repo doesn't know about, or the repo claims one Nexus no
longer has — as the same single `mapping-mismatch` failure is the right
granularity.

### Why It Remains Unproven

§10.5's own text ("missing or contradicted") doesn't distinguish the
two directions, and no real CI consumer exists yet to observe reacting
to them differently or the same way. A stated simplification, not a
proven-correct design.

### How To Validate

Once a real CI consumer exists, observe whether it needs to react
differently to "Nexus moved ahead of the repo" versus "the repo claims
something Nexus no longer recognizes" — split the failure code into two
only if a concrete case demands it.

---

### Assumption

`resolve()` never returns more than one id in this project's real data.

### Why It Remains Unproven

`architecture.element_succession` has no constraint preventing a
predecessor from having two successor edges; nothing in this project's
history has ever produced that shape. `verifyRepositoryAlignment()`
only ever inspects `resolved[0]`, silently ignoring any further entries
— a disclosed limitation, not a proven-safe one.

### How To Validate

Construct a real scenario where one element is superseded by two
others in the same or different proposals, and observe what a real
alignment check should report — a single successor, a list, or an
ambiguity failure of its own.

---

## Final Verdict

**What does Project Nexus now know?** That `POST /alignment/verify`
exists, works against the real, unmodified CI workflow's actual
payload — confirmed against the literal live artifact from a different
iteration, not merely a fresh one built to pass — and that its rule set
required no new mechanism beyond one comparison, exactly as Iteration 4
predicted. That the shared HTTP body parser, unquestioned since
Iteration 1, could not handle a real caller's real payload until this
iteration traced it directly. That a succession chain resolving
*somewhere* is not the same claim as resolving somewhere *alive* — a
distinction the original implementation missed and this iteration's own
`/review` caught before it shipped.

**What does Project Nexus still only believe?** That symmetric
mapping-mismatch treatment is the right granularity; that no real
scenario will ever need `resolve()` to return more than one id.

**What architectural bets remain highest risk?** None newly introduced.
The two staleness-related warn conditions this iteration deferred
(snapshot-hash-stale, managed-region-drift) remain exactly as
unaddressed as `SCOPE.md` disclosed — real gaps, named, not silently
dropped, waiting on either a change to what the CI workflow sends or a
concrete need for the raw request text to survive past body parsing.
