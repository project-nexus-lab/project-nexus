# Iteration 1 Lessons

Not a status report (`docs/history/iteration-1/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 1 had one primary target — `docs/PROJECT_KNOWLEDGE.md`'s
highest-ranked Open Question — and it resolved cleanly: the Architecture
Change Proposal lifecycle (§5) does close the loop it exists to close. A
Task blocked by a real `buildWorkPackage` gate failure reaches `ready`
again through `draft → proposed → approved → applied`, with mint, retire,
and succession genuinely transactional, with no manual database edit
anywhere in the path — proven in-process and, independently, over real
HTTP.

It also produced this iteration's one substantive finding, caught before
it shipped rather than after: the first implementation of §5.6's
retirement policy had Architecture-context code reading Work and
Repository tables directly, which §2.3's declared dependency table does
not permit in either direction. This was not a style question — re-reading
that table while preparing this document, retirement policy genuinely
cannot be checked from inside Architecture without either violating the
declared boundary or asking a context that is allowed to cross it. Fixed
by routing the check through Alignment, which is declared read-only across
everything specifically so this doesn't have to happen inside the owning
context.

Everything this iteration deliberately left alone — runtime independence,
MCP grants, repository bootstrap, multi-repository ambiguity — is exactly
as unproven as `docs/PROJECT_KNOWLEDGE.md` already said it was. Nothing
here should be read as movement on those; they were out of scope on
purpose, not touched and found unremarkable.

---

## Validated

### Assumption

The Architecture Change Proposal lifecycle (§5) closes the loop it is
designed to close: a Task blocked on missing architecture reaches `ready`
again without a manual database edit.

### Status

VALIDATED

### Evidence

`test/proposal.test.ts`'s end-to-end test drives the exact scenario §5.1
describes, starting from a real `WorkPackageGateError` (reason
`unprovided-capability`) raised by `buildWorkPackage` against the seed
data — not a synthetic setup built to make the proposal code look good.
The same scenario is independently reproduced over real HTTP requests in
`test/http.test.ts` against an actual `http.Server`, not a mocked router.
Both reach a second, successful `buildWorkPackage` call at the end.

### Consequence

This was `docs/PROJECT_KNOWLEDGE.md`'s #1-ranked Open Question, named
because the architecture document itself calls this mechanism its single
biggest addition over v1 and because it had zero implementation evidence
behind a fully-built schema. It now has direct evidence. This is the
result that unblocks recommending repository bootstrap (1c) and MCP (1e)
without first worrying that the platform's central promise might not
actually hold.

---

### Assumption

`applyProposal`'s mint + retire + succession sequence is genuinely
transactional: any failure rolls back every operation in the proposal, not
just the one that failed.

### Status

VALIDATED

### Evidence

Two levels. First, PGlite's `transaction()` rollback-on-throw behavior was
verified directly against this project's actual driver before being relied
on (a throwaway script inserting a row then throwing, confirming zero rows
survive) — not assumed from documentation. Second,
`test/proposal.test.ts`'s rollback test drafts a proposal with one legal
and one illegal `create` operation, applies it, and confirms *neither*
element exists afterward and the proposal's state stayed at `approved`,
not `applied`.

### Consequence

§3.2's invariant ("application is transactional: mint, retire, and
succession in one commit") is not just schema-shaped, it is behaviorally
true under this implementation. Worth carrying forward: Iteration 0 never
needed to test driver-level transaction semantics directly because nothing
it built could partially fail mid-write in a way that mattered; Iteration 1
did, and checking rather than assuming was cheap (a five-line script) and
would have been expensive to get wrong.

---

### Assumption

§5.6's retirement policy — refuse retiring an element with a live inbound
reference from a non-terminal Task or an active Repository, unless the
same proposal supplies succession — is fully specified by those two
clauses and one escape hatch.

### Status

VALIDATED

### Evidence

Three tests, each isolating one clause: retirement refused when a
non-terminal Task still affects the capability; retirement refused when an
active Repository still implements the component (repository state set to
`active` explicitly, since the seed data does not reach that state by
default); retirement succeeds when the same proposal's `create` operation
names the target as `supersedesId`, with the resulting `element_succession`
row asserted directly.

### Consequence

The rule as stated in §5.6 is complete and implementable exactly as
written, with no additional clause needed to make it behave sensibly (no
need, for instance, to also block retirement of a component that still
`provides` a capability — that state is real but outside what §5.6 claims
to police, and no test needed it to be).

---

### Assumption

The §3.5 no-orphan-task invariant, extracted into one shared function
(`assertReadyInvariants`), still agrees with itself across every caller
that checks it.

### Status

VALIDATED

### Evidence

`assertReadyInvariants` now has three callers: Iteration 0's YAML import
guard (checked against freshly-inserted rows), the new `markReady`
lifecycle function (checked against a Task that may have existed for a
while), and, indirectly, every test that calls either. All 71 tests pass
with one function doing the checking instead of two independent
implementations of the same rule.

### Consequence

This was a refactor performed *because* Iteration 1 needed the same check
a second time, not a speculative unification — the kind of "can two
concepts become one" the Simplicity Reviewer asks about, done at the
moment a second real caller appeared rather than in anticipation of one.

---

## Invalidated

### Assumption

Architecture-context code (`src/proposal/proposal.ts`) may read Work and
Repository tables directly to evaluate §5.6's retirement policy, since the
policy is stated as something the Architecture Change Proposal enforces.

### Status

INVALIDATED

### Evidence

§2.3's declared dependency direction table lists exactly six directions:
`Work → Architecture`, `Work → Repository` (override only), `Repository →
Architecture`, `Execution → {Architecture, Work, Repository}`, `Alignment →
all`, `Runtime Integration → Execution`. Architecture reading Work or
Repository is not among them, in either direction. The first
implementation of `assertRetirementAllowed` queried
`work.work_item_capability` / `work.work_item` and
`repo.repository_component` / `repo.repository` directly — a real
violation of a table this document itself treats as authoritative, not a
hypothetical one.

### Resolution

Moved the two queries into `alignment.live_references()`
(`db/migrations/0009_alignment_live_references.sql`), wrapped by
`src/graph/alignment.ts#liveReferences`. `applyProposal` now calls that
function instead of querying Work or Repository tables itself. Alignment's
declared read-everything authority (§2.1) exists precisely to hold checks
like this one so the owning context does not have to reach across a
boundary it is not allowed to cross.

### Consequence

§5.6 states a rule about Architecture's own aggregate (retirement) but the
rule's *evidence* lives entirely outside Architecture's declared read
graph. This is a real gap between two sections of the same document (§5.6
and §2.3) that only surfaces when someone tries to implement §5.6 exactly
as written and checks it against §2.3's table rather than against
intuition. The general shape — "a write-side invariant on aggregate A
needs to read state that only contexts B and C hold, and A has no declared
dependency on either" — is worth watching for elsewhere as more of §5 and
later iterations get built; Alignment is the answer whenever it recurs, not
a special case invented for retirement specifically.

---

## Unproven

Everything named as unproven in `docs/PROJECT_KNOWLEDGE.md` before this
iteration remains exactly as unproven — deliberately not touched, see
`docs/history/iteration-1/REPORT.md` → "Scope deferred." Two new items
this iteration's own implementation choices surfaced:

### Assumption

The in-process, direct-function-call form of `RunBlocked` and
`ProposalApplied` (§2.2) — `blockTask` and `releaseBlockedTasks` called
directly by whatever code needs the effect — will still be the right shape
once a real Orchestrator (1f) exists to raise these events instead of a
test or a human calling the functions by hand.

### Why It Remains Unproven

No event type, dispatcher, or subscription mechanism exists; "the event"
is just which function gets called. This was the right amount of
infrastructure for an iteration with no Orchestrator to serve, but nothing
has tested whether an Orchestrator wiring these same effects in as actual
event handlers finds the current function signatures (`blockTask(db,
taskId, proposalId)`, `releaseBlockedTasks(db, proposalId)`) sufficient, or
needs them reshaped around an actual `RunBlocked` payload.

### How To Validate

When 1f's Orchestrator is built, wire its `RunBlocked` handling to call
`blockTask` as the concrete effect and see whether the function signature
survives contact with a real caller, or needs to change.

---

### Assumption

R-1's write-authorization boundary ("the runtime never holds a write
credential" beyond drafting a proposal) holds in practice, not just in the
data model, once real callers exist.

### Why It Remains Unproven

The state machine enforces R-1's *substance* — an agent-authored proposal
can only ever be `draft`, only a human principal can approve, only
`applyProposal` mutates truth. But nothing distinguishes "the platform,
acting on a genuine `RunBlocked` event" from "any HTTP caller" at the
`POST /proposals` boundary, because Authentication has been out of scope
since Iteration 0. This is not new information — see the Constitution
Reviewer note in `docs/history/iteration-1/REPORT.md` — but it graduates
from "not yet relevant" to "not yet tested" the moment a real HTTP surface
exists to test it against, which happened this iteration.

### How To Validate

Not this platform's evidence to gather until Authentication is in scope.
Worth re-reading this entry when it is, rather than assuming the state
machine alone was always sufficient.

---

## Biggest Surprise

Not a surprise about the domain model — a surprise about *how* the real
findings this iteration produced were actually found, and that it
happened twice, by two different deliberate-review mechanisms, not once.

The first: the Domain Integrity violation (Architecture reading Work and
Repository directly, see Invalidated above). Not caught by a test — all
the retirement-policy tests passed against the boundary-violating version
too, because a SQL join across schemas works identically whether or not
the *code* issuing it lives in the "right" context. It was caught by
manually walking `applyProposal` against §2.3's dependency table while
writing this iteration's report — the same category of near-miss as
Iteration 0's `impactOf` gap (`docs/history/iteration-0/LESSONS.md`).

The second, found afterward by a dedicated pre-commit review pass applying
`docs/REVIEW_PRINCIPLES.md`'s framework directly (not by writing a report):
`blockTask` accepted a proposal in any state, including `applied` or
`rejected`, which could leave a Task permanently stuck with no code path
back to `ready`. Every test that called `blockTask` before that review
happened to block against a freshly-drafted proposal — the one state the
missing check would never have caught. 71 tests green at the time — every
existing test touching `blockTask` included — and the gap was still
there. The review found
it by reading the function's own doc comment against the actual schema (a
foreign key claimed to enforce something it structurally cannot express)
— the same kind of deliberate, slower, non-execution pass as the first
finding, applied by a different mechanism (a named review process instead
of report-writing) and catching a different *kind* of gap (a missing
runtime check, not a boundary violation).

Two independent instances of the same shape is a pattern, not a
coincidence: bounded-context placement and state-machine completeness are
both **not** things `npm test` passing is evidence for, one way or the
other, and both times the miss was invisible to every test specifically
because every existing test's *inputs* happened to avoid the exact
condition that mattered. Worth carrying forward as standing practice, not
a one-off lesson: a green suite is necessary but was demonstrated,
concretely, twice, to be insufficient — the review framework's explicit,
separate pass (reading code against documented rules, not running code) is
doing real work here, not ceremony.

---

## Final Verdict

**What does Project Nexus now know?** That the Architecture Change
Proposal lifecycle, including its transactional apply and its retirement
policy, works exactly as §5 specifies — genuinely, not just schema-deep —
and closes the real loop §5.1 was written to close. That PGlite's
transaction rollback can be relied on because it was checked, not assumed.
That `assertReadyInvariants`, now shared by three call sites, still agrees
with itself. That §2.3's dependency table is precise enough to catch a
real, non-obvious violation when actually checked against it — and that
checking it is not automatic; it took a deliberate pass, not test-suite
green, to find one.

**What does Project Nexus still only believe?** Everything
`docs/PROJECT_KNOWLEDGE.md` already listed as unproven before this
iteration, unchanged. Plus, newly named rather than newly true: that the
in-process direct-call form of domain events will survive contact with a
real Orchestrator without reshaping, and that R-1's write boundary holds
against a real caller rather than only against the data model — both now
worth tracking precisely because a real HTTP surface exists to eventually
test them against.

**What architectural bets remain highest risk?** Runtime independence
under an actual second adapter and MCP grant enforcement as a real
boundary rather than a formula — unchanged from before this iteration,
and, on the evidence gathered here, correctly still ranked above
repository bootstrap and multi-repository ambiguity: nothing this
iteration touched gives either of those two top-ranked bets any more or
less evidence than they had at the end of Iteration 0.
