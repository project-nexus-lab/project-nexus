# Iteration 4 Lessons

Not a status report (`docs/history/iteration-4/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 4 built and tested the repository bootstrap state machine and
generation pipeline (§10) against the literal §16 acceptance bar for this
work — a hand-edit outside the managed-region markers must not trip drift
detection, and one inside must. Both directions are now directly tested,
not asserted.

It also made concrete something that was previously only true by
omission: `src/import/repository.ts`, unchanged since Iteration 0, has
always bulk-inserted repository rows and bypassed the state machine this
iteration builds — even though §10.2 states "repositories are never
created outside this flow" and the schema for enforcing that has existed
since Iteration 0. This was true before this iteration started; it simply
had nothing to be inconsistent *with* until now. Recorded as a disclosed
architectural tension, not fixed — fixing it was not in scope, and the
report explains why doing it quickly here would likely have done it worse
than a dedicated pass.

---

## Validated

### Assumption

The managed-region mechanism (§10.4) actually survives a human edit
outside the markers without falsely reporting drift, and actually catches
an edit inside them.

### Status

VALIDATED

### Evidence

`test/repository.test.ts`'s acceptance-bar test, directly reproducing
§16's own words: generate a file, prepend and append human text outside
the markers, confirm `checkDrift` reports no drift and the hash is
unchanged; then mutate a value *inside* the markers on the original
content, confirm `checkDrift` reports drift and the hash changed. A third
case — the markers deleted entirely — confirmed the mechanism fails safe
(reported as drift) rather than crashing or silently passing.

### Consequence

This was §16's own literal "Done when" criterion for this slice of work,
stated once, years before this iteration, and never tested until now. The
mechanism works exactly as designed: hashing only the extracted managed
region, never the whole file, is sufficient and correct for the stated
goal.

---

### Assumption

`render(repository, localSubgraph, templateVersion)` is genuinely a pure
function — identical inputs produce byte-identical output.

### Status

VALIDATED

### Evidence

`test/repository.test.ts`'s determinism test regenerates the same
repository's projection and checks every file's hash against itself via
`checkDrift`, finding zero drift. Achieved by sorting `componentIds` and
`subgraphs` inside `render()` itself rather than trusting callers to pass
already-sorted data — the same discipline Iteration 0 already learned the
hard way for `buildWorkPackage`'s canonical payload.

### Consequence

§10.4's claim ("generation is a pure function") is not just schema-deep
or aspirational; a caller can regenerate a projection at any time and
compare it against what is stored with the expectation of an exact match
when nothing in the graph changed.

---

### Assumption

The bootstrap state machine (§10.1) can be enforced as a real invariant —
illegal transitions refused, not merely a `bootstrap_state` column nobody
checks.

### Status

VALIDATED

### Evidence

Every one of the five transitions is tested both for the legal case and
for at least one illegal case reachable from a state that isn't its
immediate predecessor (e.g. `registerMapping` and `activateRepository`
both refused while a repository is still `declared`). `registerMapping`
called a second time while already `mapped` is confirmed legal — the
invariant is "at least one mapping," not "exactly one," and the state
machine does not over-restrict past what §3.6 actually requires.

### Consequence

The same "typed state machine with an explicit illegal-transition error"
pattern now has three independent implementations —
`ArchitectureChangeProposal`, `WorkItem`, `Repository` — all built the
same way, all tested the same way. That consistency is itself a small
piece of evidence that the pattern generalizes, not just that any one
instance of it happens to work.

---

## Invalidated

None. Nothing this iteration assumed about §10's state machine, the
managed-region mechanism, or the `VcsProvider` port turned out wrong.

---

## Unproven

### Assumption

The bootstrap mechanism validated here against `NoopVcsProvider` holds
once a real `VcsProvider` (GitHub) exists — that provisioning, branch
creation, and PR-opening compose with the state machine the same way the
no-op case does.

### Why It Remains Unproven

`NoopVcsProvider.create()` does no real work and can never fail in a way
a real GitHub API call could (rate limits, permission errors, a
repository name collision, network failure mid-provision). The state
machine has never been driven against a provider that can genuinely fail
partway through a step.

### How To Validate

The same shape of experiment Iteration 2 named for `AgentRuntimeAdapter`
and Iteration 3 implicitly left open for a real MCP protocol server:
build one real adapter — here, a GitHub `VcsProvider` — and re-run the
state machine against it, specifically checking what happens when
`provisionRepository` fails partway (does the repository stay cleanly in
`declared`, or does it end up in an inconsistent state no test here ever
produced because `NoopVcsProvider` cannot fail).

---

## Biggest Surprise

Not a subtle one this time — a plain, repeated test-fixture bug, caught
immediately by the database itself rather than by careful review. Five of
`test/repository.test.ts`'s seven tests initially failed on first run:
every test registered `comp.invoice-service` as the *primary* mapped
component for a new repository, colliding with the seed data's existing
primary mapping (`repo.billing-service`) and with each other across
tests, against the real partial-unique-index constraint
(`repository_component_primary_uq`) that has enforced "at most one
primary repository per component" since Iteration 0's schema. Fixed by
using `isPrimary: false` throughout, since none of these tests are
actually about primary-repository semantics.

Worth recording precisely because of how little friction it took to find
and fix: a real database constraint, exercised by a real test run, failed
loudly and specifically (`duplicate key value violates unique constraint
"repository_component_primary_uq"`, naming the exact column and
constraint) rather than silently succeeding with wrong data. This is the
positive case of the same lesson Iteration 0 first drew from PGlite —
constraints that are actually enforced by the database catch mistakes a
test author makes, cheaply, the first time the test runs, rather than
requiring a separate review pass to notice. It is also a small, concrete
data point *for* the "typed-tree, declarative-constraint" architectural
style this project has used throughout: the constraint existed for a real
reason (§3.6), and it did its job the moment something violated it.

---

## Final Verdict

**What does Project Nexus now know?** That the repository bootstrap state
machine enforces its own transition order for real, the same way the
proposal and task lifecycles already do. That the managed-region
mechanism genuinely distinguishes a human edit outside the markers from
one inside — the specific, literal thing §16 asked this slice of work to
prove. That `render()` is a pure function of graph state, checked by
regenerating and comparing, not assumed from its own docstring. That the
`localSubgraph` traversal, present in the source document since v2 and
unused for four iterations, composes correctly from traversals that
already existed.

**What does Project Nexus still only believe?** That this holds against a
real `VcsProvider`, not only a no-op one that cannot fail partway through
a step. Everything else in `docs/PROJECT_KNOWLEDGE.md` untouched by this
iteration remains exactly as it was.

**What architectural bets remain highest risk?** Unchanged in kind from
the last three iterations' closing verdicts: real-adapter, real-protocol,
and now real-VCS-provider risk are the same shape of open question,
appearing a third time. Nothing in this project's core domain model has
been the source of risk in four iterations running — every open question
left standing is about what happens at the boundary where a no-op
stand-in is eventually replaced with something real.
