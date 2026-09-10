# Iteration 0 Lessons

This document is not a status report (`docs/history/iteration-0/REPORT.md` is) and
not a roadmap. It separates what Iteration 0 actually demonstrated from what
it merely assumed, so Iteration 1 can be scoped against evidence rather than
against the confidence of the prose in `MVP_ARCHITECTURE_V2.md`.

---

## Executive Summary

Iteration 0 proved that the hardest structural bets in v2 are buildable
exactly as specified: one typed-tree aggregate per taxonomy (not per kind),
Postgres alone as the graph substrate (no graph database), capability
modelled as provision rather than containment, and Work Package generation
as a genuinely pure, idempotent function of graph state. All four now have
direct, executable proof, not just prose argument.

It disproved two implicit readings of the specification, both caught only by
trying to implement them literally: hashing the Work Package payload
*including* its own generated `id` makes the stated idempotency guarantee
impossible by construction, and implementing `implementationPath` as a
literal chain of INNER JOINs makes the generation gate's own precondition
checks structurally unobservable. Both were one-line fixes once found — the
lesson is in how easily each would have shipped silently broken, since
nothing about their *type signature* looked wrong.

It left almost everything about *governed change* unresolved: the
Architecture Change Proposal workflow — the mechanism v2 itself calls the
single biggest addition over v1 — has a complete schema and zero exercised
behavior. Runtime independence is designed for (no vendor string exists
anywhere in the core schemas) but has never been tested against an actual
second adapter, so "zero vendor strings" is necessary evidence, not
sufficient evidence. File anchors, the MCP grant model, multi-repository
ambiguity, and profile depth beyond zero are similarly real but thin —
built, individually testable, but never exercised under conditions that
resemble actual use.

---

## Validated Assumptions

### Assumption

A single typed-tree aggregate — one table, a `kind` discriminator, a
`parent_id`, and legal containment enforced against a small data table —
is sufficient to model both the Architecture taxonomy (Product → Domain →
Subsystem → {Component, Capability}) and the Work taxonomy (Initiative →
Epic → Feature → Task), without per-kind aggregates or per-kind code.

### Status

VALIDATED

### Evidence

Implemented identically for `architecture.element` and `work.work_item`:
same trigger shape (`check_legal_containment`), same `legal_containment`
data table shape, same enforcement pattern, in each case under 50 lines of
SQL. `test/schema-constraints.test.ts` proves illegal containment is
rejected declaratively for both taxonomies (a subsystem cannot contain a
domain; a feature cannot contain an epic) with zero kind-specific
application code — the trigger and the data table do all the work.

### Consequence

The typed-tree choice isn't just simpler on paper — it stayed simple on the
second application of the pattern, which is the actual test of whether a
"genuinely shared lifecycle" claim (§3.1, §3.5) holds. §16's closing note —
"per-kind aggregates... needed only if kind-specific invariants appear" —
can now be trusted with direct evidence behind it, not just restated.

---

### Assumption

The graph can be "a set of named recursive-CTE views over Postgres" (§8.1)
— no graph database — and this is sufficient to implement the full §8.4
traversal contract.

### Status

VALIDATED

### Evidence

All eight traversals used in Iteration 0 (`ancestry`, `providersOf`,
`capabilitiesOf`, `implementationPath`, `impactOf`, `governanceOf`,
`resolve`, plus the two Alignment queries) are plain SQL functions;
recursion is used only where the traversal is genuinely recursive
(`ancestry`, `impactOf`, `resolve`). Every one is directly callable and
directly tested (`test/traversals.test.ts`). A four-level `ancestry` walk
(component → subsystem → domain → product) and a governance union across
two different elements both resolve correctly in one call each.

### Consequence

Defers graph-database adoption (§15) with an actual implementation behind
the deferral, not only the document's assertion that CTEs are "a
substitutable implementation." The caveat is scale, not correctness — see
Unproven Assumptions.

---

### Assumption

Modelling `Component provides Capability` as a many-to-many join table,
separate from containment, correctly supports multi-provider capabilities
and makes "zero providers" a legitimate, queryable state rather than a
broken tree node (§4.2, R2).

### Status

VALIDATED

### Evidence

The seed data has one component providing two capabilities, both flagged
primary; a partial unique index (`element_provision_primary_uq`) correctly
rejects a second primary provider for the same capability (tested); a
capability with zero providers (`cap.invoice-export`) is correctly reported
by `unprovidedCapabilities()` as an informational state, not an error, and
correctly excluded from `implementationPath` results without crashing the
traversal.

### Consequence

R2's stated argument — that v1's `component contains capability` broke
multi-provider expressiveness and made an unimplemented capability look
like a structural defect — is now a demonstrated property of the schema,
not just a paragraph of justification for a design decision.

---

### Assumption

`buildWorkPackage(taskId, profileId)` can be a pure function of graph state:
identical graph, task, and profile always produce the identical content
hash, and repeated calls are idempotent (§11.1).

### Status

VALIDATED — after correcting exactly what "content" means (see Invalidated
Assumptions, #1)

### Evidence

Two successive calls to `buildWorkPackage` against an unchanged graph
return the same `wp.<seq>` id, the same content hash, and leave exactly one
row in `execution.work_package`. The hash was independently re-derived
across two separate process invocations (fresh in-memory database, fresh
import, fresh build) and matched byte-for-byte both times — not merely
consistent within one process's memory.

### Consequence

The insert-only, no-UPDATE-grant design for `execution.work_package`
(§7.6) is now backed by a demonstrated guarantee that duplicate builds
genuinely don't happen, rather than a design that merely *permits* it.
This is the exact mechanism iteration 1d needs to wrap in a service — the
hard part is done, not merely sketched.

---

### Assumption

Stable ID validation (§6) can be enforced both declaratively, at the
database boundary, and at the application boundary, without the two
enforcement points disagreeing.

### Status

VALIDATED

### Evidence

The same prefix/slug pattern exists as a TypeScript regex
(`src/ids/ids.ts`) and as a Postgres `CHECK` constraint in every migration
that defines an authored-ID column. `test/ids.test.ts` and
`test/schema-constraints.test.ts` independently confirm both layers reject
the same malformed inputs (uppercase, wrong prefix, missing dot, trailing
hyphen).

### Consequence

A cheap, low-risk defense-in-depth pattern that Iteration 1's REST layer
can rely on without re-deriving: validate early for a fast, precise error,
but never *only* at the application boundary, since the database is the
system of truth and must not depend on every future caller remembering to
validate first.

---

### Assumption

The no-orphan-task invariant (§3.5) can be enforced both at the write
boundary (a Task may not leave `draft` with zero `affects` links) and
continuously via `orphanTasks()`, without the two mechanisms disagreeing
about what counts as a violation.

### Status

VALIDATED

### Evidence

The import-time guard (`OrphanTaskError`) rejects a non-draft task with
zero capability links. A *draft* task with zero links is correctly
accepted — and correctly still surfaces via `orphanTasks()`, as an
informational state rather than a violation, since the query reports
structure ("no AFFECTS edge") and the write-time guard enforces a
lifecycle rule ("not while leaving draft"). These are the same invariant
observed from two different moments, and Iteration 0 confirms they don't
contradict each other.

### Consequence

Confirms the architecture's own framing (§7.4: "the no-orphan-task
invariant is now guarded twice") is accurate, not aspirational.

---

## Invalidated Assumptions

### Assumption

The Work Package payload can be canonicalized and hashed as one linear
pipeline, exactly as §11.2 step 8 reads in isolation: build the full
payload — including its own `id` — then "sort keys, sort arrays, serialise,
hash."

### Status

INVALIDATED

### Evidence

This is self-contradictory once actually implemented. `id` (`wp.<seq>`) can
only be known after a sequence value is minted; minting a sequence value is
only justified once you've decided a *new* row is needed; and deciding
whether a new row is needed is exactly what the content-hash lookup is for.
Hashing a payload that includes `id` means every single call mints a new
id, therefore produces a new hash, therefore never matches an existing row
— §11.1's idempotency claim becomes unreachable by construction, not merely
unlikely in practice.

### Resolution

`contentHash()` (`src/workpackage/canonicalize.ts`) operates on the payload
*without* `id`. `id` is attached to the persisted `payload` only after the
hash has already determined whether a matching row exists
(`src/workpackage/build.ts`, step 9). The check constraint
`unique(task_id, profile_id, content_hash)` never includes `id`, which is
the schema quietly agreeing with this resolution — it was already correct;
only the narrative reading of step 8 in isolation was wrong.

### Consequence

"Content" in "content hash" needed a precise definition that the document
does not state explicitly: the payload minus its own generated identifier.
Any future reimplementation — a second language, a different team, a
future rewrite — needs to be told this directly. It is not something a
careful reader would reliably re-derive from §11 alone, because §11.3 lists
`id` as the payload's first field with no annotation that it's excluded
from what's hashed.

---

### Assumption

`implementationPath`, read as the literal arrow-path in §8.4 —
`Task→AFFECTS→Capability←PROVIDES←Component←IMPLEMENTS←Repository` — is
correctly implemented as a chain of INNER JOINs following each arrow in
turn.

### Status

INVALIDATED

### Evidence

Under an INNER-JOIN implementation, a capability with zero providers, or a
component with zero mapped repositories, doesn't appear in the result set
with an empty or null value — it disappears entirely. But §11.2 step 1's
gate is required to *detect and reject* exactly those two states
("unprovided capability", "mapping missing"). Under the literal INNER-JOIN
reading, the traversal has already discarded the one piece of evidence the
gate exists to check, before the gate ever runs. The bug is invisible by
inspection of either piece of code alone — the traversal looks correct
(it follows the arrows), and the gate looks correct (it checks the right
things) — it only appears at the seam between them, and only for inputs
that hit the missing-link case, which the happy-path seed data doesn't.

### Resolution

Both joins in `graph.implementation_path`
(`db/migrations/0007_graph.sql`) are LEFT JOINs. A capability with no
provider now returns a row with `component_id: null`; a component with no
mapped repository returns a row with `repository_id: null`. The gate in
`buildWorkPackage` filters explicitly on these and raises the correctly
typed error (`unprovided-capability`, `mapping-missing`) instead of the
traversal silently deciding the answer by omission.

### Consequence

A "named traversal" (§8.4) consumed by an invariant-checking gate cannot be
specified by its happy-path shape alone — its behavior on a *missing* link
is part of its contract, and §8.4 doesn't state one. As Iteration 1's
REST/MCP layer exposes these same traversal functions to callers who are
not the gate (a human browsing the graph, an agent doing discovery), the
absent-row behavior needs to be a documented, deliberate part of each
traversal's contract — not an accident of whichever caller happened to need
it first.

---

No other invalidated assumptions were found. Every other place Iteration 0
had to make a judgment call in the presence of underspecification (repository
resolution scope, `unprovidedCapabilities()`'s status filter, the
`work.legal_containment` table's existence) was a genuine gap being filled
one reasonable way, not a stated assumption proven false — see
`docs/history/iteration-0/REPORT.md` §6 for those, and "Biggest Surprises" below for
the one that came closest to counting as a correction.

---

## Unproven Assumptions

### Assumption

Curated FileAnchors (§13 Alternative A — the position Iteration 0 shipped
by default, not by evidence) are worth their ongoing human maintenance
cost, and don't silently rot the way §13.2 itself warns they might.

### Status

UNPROVEN

### Why It Remains Unproven

Exactly one anchor exists (`comp.invoice-service` → `InvoiceService.java`),
hand-written in the same commit as everything else it describes. There has
been no repository evolution, no second file added to the component, no
window of time in which the anchor could have gone stale and nobody
noticed. §13.4's own validation questions — did any human update an anchor
without being asked; did runs that ignored `files:` produce worse pull
requests — require real usage over real time, which a from-scratch seed
dataset cannot simulate no matter how carefully it's constructed.

### How To Validate

Once repository bootstrap (§10, iteration 1c) produces a real repository
that changes over time, track whether a seeded anchor still matches reality
after N unrelated commits, and whether anyone updates it unprompted. This
is observation, not new code.

---

### Assumption

The MCP grant model (§9.5) — `allowedElementIds = WP elements ∪
impactOf(components, context_depth + 1)` — actually bounds an agent's blast
radius, rather than merely describing an intention that nothing enforces.

### Status

UNPROVEN

### Why It Remains Unproven

No MCP server exists in Iteration 0 (explicitly out of scope). `impactOf`
is now genuinely called by `buildWorkPackage` and its result
(`WorkPackageResult.impactedComponents`) is exactly the missing half of the
grant formula — but nothing has ever attempted to construct a grant, hand
it to a caller, and refuse a call that falls outside it. "Authorisation is
a property of the graph" (§9.5) is currently a true statement about a
formula, not yet a demonstrated behavior.

### How To Validate

Iteration 1e's smallest real test: build one MCP tool, issue one grant,
attempt one out-of-grant call in a test, and assert it's refused. This
doesn't require the other two MCP servers or the Orchestrator to exist
first.

---

### Assumption

`WorkPackageProfile.context_depth` correctly bounds `impactOf` for profiles
wider than the MVP default of zero (§11.1, §11.2 step 4, §9.5).

### Status

UNPROVEN

### Why It Remains Unproven

The seed dataset ships exactly one profile at `context_depth: 0`, per
§11.1's own instruction ("MVP ships one profile"). The `context_depth > 0`
code path was, in fact, entirely unexercised for most of Iteration 0 — see
"Biggest Surprises" below — and is now covered by two hand-built unit
tests against a single one-hop `dependsOn` edge in a synthetic fixture.
No profile with nonzero depth has ever been used to generate a Work Package
for a task with real acceptance criteria, and no one has evaluated whether
the resulting `impactedComponents` set is actually the right size to be
useful to an agent (too narrow to matter, or already too wide to read).

### How To Validate

Add a second profile at `context_depth: 1` or `2` to the *seed* dataset
(not just a test fixture), on a component with a real, multi-hop dependency
chain, and have a human judge whether the resulting impact set is a
reasonable thing to hand an agent.

---

### Assumption

The Architecture Change Proposal workflow (§5) — draft → approved → applied,
with mint/retire/succession in one transaction — is representable and
correctly closes the loop v1 was missing (§5.1, §5.4).

### Status

UNPROVEN

### Why It Remains Unproven

The schema (`architecture.change_proposal`, `change_operation`,
`element_succession`) exists and was validated only structurally (its own
check constraints — state transitions, `approved_by` requiring a human
principal — are exercised in `test/schema-constraints.test.ts`). Nothing
drafts a proposal, approves one, or applies one. The transactional
guarantee at the center of §5.4 ("mint elements · retire elements · write
succession" as one commit) has never been attempted against the schema
that's supposed to support it.

### How To Validate

The smallest real experiment, ahead of any API: hand-drive one proposal
through the full lifecycle against the existing schema — a script, in the
same spirit as this iteration's `verify.ts` — with a Task genuinely blocked
beforehand and genuinely released to `ready` afterward. If that's awkward
against the current tables, that's exactly the finding worth having before
an API is built on top of the assumption that it isn't.

---

### Assumption

A component genuinely served by more than one repository (§4.3 step 3,
`allow_ambiguous_repo`) resolves to a usable Work Package, not merely to a
mechanically-correct one.

### Status

UNPROVEN

### Why It Remains Unproven

The only test of this path is a synthetic fixture (`test/workpackage.test.ts`)
built specifically to trigger the ambiguity branch — two bare repositories,
no primary flag, no real content. It proves the gate logic is reachable and
correctly typed; it says nothing about whether a real multi-repository
scenario (e.g., a component mid-migration between two services) produces a
payload that's actually useful — `repositories: [repo.a, repo.b]` with no
further guidance may be the mechanically correct answer and still the wrong
thing to hand an agent.

### How To Validate

Seed a second real repository against `comp.invoice-service`, generate a
Work Package with `allow_ambiguous_repo: true`, and have a human evaluate
whether the resulting payload is something they'd actually want to execute
against.

---

### Assumption

Runtime independence (§4.4, §12.7) — specifically, "adding a second runtime
means one `adapter_registration` row, one `adapter_role_support` set and
one class" — holds when a second adapter is actually attempted.

### Status

UNPROVEN

### Why It Remains Unproven

Static evidence is real but partial: `grep`-ing `architecture`, `work`,
`repo`, and `execution` for any vendor-specific string returns nothing,
which is a genuinely checkable, currently-true fact. But that fact is
consistent with two very different worlds — "the boundary is sound" and
"the boundary has never been under any load, because there are zero
adapters, not one." §12.7's marginal-cost claim ("one row, one class") is
about what happens when a *second* adapter is added; Iteration 0 has never
built even a first one, fake or real.

### How To Validate

The cheapest real test isn't building the Claude SDK Adapter — it's
building two trivial no-op `AgentRuntimeAdapter` implementations against
the §12.2 port and confirming that adding the second one requires zero
changes to `execution`, `work`, `architecture`, or `repo`. Half a day of
work, and it tests the actual claim rather than a proxy for it.

---

### Assumption

Retirement is refused while live inbound references exist, unless the same
proposal supplies a succession edge (§5.6).

### Status

UNPROVEN

### Why It Remains Unproven

No code path in Iteration 0 retires an element through any governed
mechanism. The one place `status = 'retired'` is set
(`test/workpackage.test.ts`, "gate: a retired capability with no succession
is rejected") does so via a raw `UPDATE` that bypasses any policy check
entirely — deliberately, to test the *build-side* half of this rule (a
Work Package build refuses a retired-without-succession reference). The
*retirement-time* half — refusing the retirement itself while live
references exist — has no implementation and no test anywhere in this
codebase.

### How To Validate

This is exactly what Iteration 1b's proposal-application transaction needs
to implement and test: attempt to retire an element with a live `AFFECTS`
reference from a non-terminal Task through the proposal mechanism, and
confirm the application is refused — not just that a downstream build
later notices the resulting bad state.

---

### Assumption

The recursive-CTE traversal layer (`ancestry`, `impactOf`, `resolve`) and
the Alignment anti-join queries perform acceptably at a scale resembling a
real organization's architecture graph.

### Status

UNPROVEN

### Why It Remains Unproven

Correctness was proven at roughly ten architecture elements, five work
items, and one dependency edge. Postgres recursive CTEs are generally
well-behaved at moderate scale, which is exactly the kind of assumption
that feels safe enough to not measure — and is worth measuring once,
deliberately, before it's load-bearing under an MCP server serving live
agent traffic with a latency budget.

### How To Validate

Generate a synthetic graph at a representative scale (e.g., 500
components, 2,000 tasks, containment depth 5) and measure `ancestry`,
`impactOf` at depth 3, and `implementationPath` latency against whatever
per-call budget an MCP tool call is expected to tolerate.

---

## Architectural Confidence Matrix

| Area | Status | Confidence | Notes |
|---|---|---|---|
| Stable ID strategy | VALIDATED | HIGH | Two independent enforcement layers (app regex, DB check constraint), both tested to agree. |
| Typed-tree aggregates | VALIDATED | HIGH | Identical pattern reused across Architecture and Work with zero per-kind code. |
| Legal containment / no-orphan-task enforcement | VALIDATED | HIGH | Enforced declaratively (trigger + FK) and continuously (`orphanTasks()`), shown not to disagree. |
| Graph traversals on PostgreSQL | PARTIALLY VALIDATED | MEDIUM | Correctness proven for every traversal in scope; performance at realistic scale is untested (see Unproven). |
| Deterministic WorkPackage generation | VALIDATED | HIGH | Idempotency and hash stability demonstrated across independent process runs, after correcting the hash boundary (see Invalidated #1). |
| Capability modelling (provision, not containment) | VALIDATED | HIGH | Multi-provider and zero-provider states both demonstrated as first-class, not broken. |
| Repository projection model | PARTIALLY VALIDATED | MEDIUM | `implements` mapping and file anchors work; bootstrap state machine, managed regions, and drift detection (§10) are entirely unbuilt. |
| Alignment model | PARTIALLY VALIDATED | MEDIUM | 2 of 8 named queries built and proven correct at toy scale; the "query-only, no state" architectural claim holds for those 2, untested for the rest. |
| Architecture proposal model | UNPROVEN | LOW | Schema validated structurally; zero lifecycle behavior (draft/approve/apply) ever exercised. |
| Runtime independence model | UNPROVEN | LOW | No vendor string exists in core schemas (real, static evidence) but zero adapters — not one, not two — have ever been built against the port. |
| File anchors | UNPROVEN | LOW | One hand-authored anchor, zero elapsed time, zero maintenance evidence — §13's own open question is exactly as open as before. |

---

## Biggest Surprises

**Simpler than expected**: the typed-tree pattern's second application
(Work, after Architecture) was close to copy-paste — same trigger shape,
same containment-table shape, no new abstraction needed. That's a stronger
signal than the first application alone, since a pattern that only looks
clean once is usually a coincidence.

**Simpler than expected**: canonicalization and content hashing, once the
id-exclusion rule was correctly identified, is about fifteen lines of
recursive key/array sorting. The complexity here was never really in the
serialization — it was entirely in the one boundary question the document
doesn't answer (see Invalidated #1).

**Harder than expected**: getting the traversal/gate boundary right. A
traversal that must let a caller *observe absence* (no provider, no
mapping) is a different contract than one that only needs to return the
right non-empty answer — and ordinary happy-path testing doesn't surface
the difference. The bug in `implementationPath` (Invalidated #2) was only
found by tracing what the gate actually needed to see, not by testing the
traversal function in isolation first. Worth carrying forward as a testing
discipline: for every traversal that feeds an invariant check, test its
*empty* and *partial* results deliberately, not only its full ones.

**Required architectural correction, smallest but sharpest**: the
id-excluded-from-hash rule. It isn't stated anywhere in
`MVP_ARCHITECTURE_V2.md`, and a careful reading of §11 alone doesn't
uniquely determine it — you only discover it's forced by trying to make
§11.1 and §11.3 simultaneously true. Any future reimplementation needs this
told to it directly.

**A near-miss worth recording precisely because it stayed a near-miss**:
`impactOf` (§11.2 step 4, "Bound") was implemented as a comment, not a
function call, for most of Iteration 0 — the seed data's one profile ships
at `context_depth: 0`, for which `impactOf` is always empty by definition,
so every test still passed with the step entirely unexecuted. It was only
caught by re-reading the pipeline against the document line by line while
preparing `docs/history/iteration-0/REPORT.md`, not by any test failing. The lesson
isn't the bug — it's that **a test suite built entirely against one
degenerate parameter value (`context_depth = 0`) structurally cannot catch
regressions in the code path that only exists for other values of that same
parameter.** This is the same shape of gap as the seed data having only one
`WorkPackageProfile` — it's not a coincidence that the one unexercised
pipeline step and the one degenerate seed value are the same axis.

**Surprise about what *didn't* need correction**: the cross-context foreign
key table (§7.1) required zero deviation. Every row — including the
trickier ones, the opaque `authored_by` provenance string and the
historical `task_id` with deliberately no FK — was buildable exactly as
specified. Worth recording as a point in the document's favor, not only
logging the two places it needed correcting.

---

## Recommended Iteration 1 Validation Targets

Not a roadmap. The assumptions carrying the most combined risk (impact ×
current uncertainty) that Iteration 1 should spend its first effort proving
or disproving, before building further on top of them unverified.

### 1. Architecture Change Proposal lifecycle

**Risk**: the platform's central differentiating claim over v1 — "no orphan
tasks, ever, even under delivery pressure" (§5.1) — depends entirely on
this working, and it currently has a complete schema and zero exercised
behavior.

**Why it matters**: if the transactional apply (mint + retire + succession
in one commit, §5.4) turns out awkward against the current schema, that is
an architecture-level finding, not an implementation cleanup — far better
to learn it before MCP and Orchestration are also built assuming it works.

**Smallest experiment**: hand-drive one proposal through
draft → proposed → approved → applied against the existing schema with a
genuinely blocked Task, script-only, no API — the same spirit as this
iteration's `verify.ts`.

### 2. Runtime independence under an actual second adapter

**Risk**: "adding a second runtime means one row, one class" (§12.7) is
currently untested at any adapter count above zero.

**Why it matters**: this is the Constitution's own top-line principle
(§NEXUS_CONSTITUTION.md "Agent Independence"). If it's false, it's far
cheaper to discover with two throwaway no-op adapters than after the
Claude SDK Adapter is built and a real second vendor is on the roadmap.

**Smallest experiment**: two trivial no-op `AgentRuntimeAdapter`
implementations against the §12.2 port; assert adding the second requires
zero changes to any core schema.

### 3. MCP grant boundary as an actual enforcement mechanism

**Risk**: §9.5's claim that authorisation is "a property of the graph...
which bounds agent blast radius provably" is currently a formula, not a
demonstrated refusal.

**Why it matters**: this is the platform's stated alternative to RBAC in
the MVP (§15). If enforcing it turns out to be awkward — a convention
agents can route around, rather than a hard boundary — that changes the
RBAC deferral decision itself, not just an implementation detail.

**Smallest experiment**: one MCP tool, one grant, one test that calls it
for an element outside the grant and asserts refusal.

### 4. Multi-repository resolution against a real scenario

**Risk**: `allow_ambiguous_repo: true` has only ever been tested against a
synthetic fixture with no real content behind either repository.

**Why it matters**: the mechanically correct answer
(`repositories: [repo.a, repo.b]`, unranked) may still be the wrong thing
to hand an agent — worth finding out with a real scenario before it's a
live footgun in a real Work Package.

**Smallest experiment**: seed a second real repository against
`comp.invoice-service`, generate a Work Package with ambiguity allowed, and
have a human judge whether the result is actually usable.

### 5. FileAnchor maintenance over real elapsed time

**Risk**: lowest technical risk, highest "we might be building the wrong
thing" risk — §13 is an explicitly open design question in the source
document, and Iteration 0 shipped Alternative A by default, not by
evidence.

**Why it matters**: every iteration that adds anchors without evidence
compounds the eventual cost of being wrong, and §13.2 already names the
predicted failure mode (silent rot, not coarseness).

**Smallest experiment**: nothing to build. Once repository bootstrap (1c)
produces a real repository that changes over time, run §13.4's own four
questions against it.

---

## Final Verdict

**1. What does Project Nexus now know?**

That the typed-tree modeling pattern works identically across two different
bounded contexts, with no per-kind special-casing. That Postgres alone,
with recursive CTEs, correctly answers every traversal the platform
currently needs — at the scale tested. That capability-as-provision (not
containment) correctly represents both multi-provider and zero-provider
states as first-class data, not structural damage — exactly what R2 argued
and had not, until now, been demonstrated. That Work Package generation is
genuinely deterministic and idempotent, once "content" is precisely defined
as the payload minus its own generated `id` — a rule the source document
implies but never states, and that Iteration 0 had to discover by trying to
make two of its own claims simultaneously true. That two independent
enforcement layers — application and database — for both ID validity and
the no-orphan-task invariant hold and agree with each other. That the §7.1
cross-context foreign key table is buildable exactly as written, including
its least obvious rows.

**2. What does Project Nexus still only believe?**

That the Architecture Change Proposal workflow closes the loop it's
designed to close — the schema exists, the mechanism has never run. That
runtime independence holds under an actual second adapter — zero vendor
strings exist today, but so do zero adapters, and those are different
facts. That the MCP grant model bounds blast radius rather than merely
describing an intention nothing enforces yet. That file anchors are worth
their maintenance cost — §13 is exactly as open as the source document
left it. That multi-repository ambiguity resolves to something an agent
could actually use, not just something the gate accepts. That the graph
traversal layer holds up past toy scale.

**3. What architectural bets remain highest risk?**

In order: the Architecture Change Proposal / unblocking flow, because the
platform's central promise depends entirely on it and it has zero
implementation evidence behind it; runtime independence under a real
second adapter, because it is the Constitution's own top-line principle
and "no vendor strings so far" is necessary but not sufficient evidence
when there has also been no adapter to strain the boundary; and the MCP
grant model as an actual security boundary rather than a documented
convention, because it is the stated reason RBAC was safe to defer in the
MVP.
