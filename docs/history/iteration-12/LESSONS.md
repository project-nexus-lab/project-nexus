# Iteration 12 Lessons

Not a status report (`docs/history/iteration-12/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 12 was scoped to answer Open Question #6 — how a Product Owner
or Architect would grow an existing architecture graph incrementally.
Scoping it first (before writing any code) found the question's own
framing was wrong: `applyProposal`'s `create` operation already provided
transactional, incremental element growth since Iteration 1. The real,
previously unnoticed gap was narrower — no operation could make a newly
minted element *usable*, specifically by establishing `Component
provides Capability`, so a proposal that minted a component to satisfy a
missing capability left the capability unprovided after apply,
regardless. That gap is now closed by a new `provide` operation, proven
against the project's own motivating example
(`MVP_ARCHITECTURE_V2.md` §5.1) end-to-end.

---

## Invalidated

### Assumption

That today's only architecture-authoring path is a one-shot bulk YAML
import via `importArchitecture`, which fails if re-run against an
already-populated graph — Open Question #6's original framing, recorded
in `docs/PROJECT_KNOWLEDGE.md` since Iteration 10.

### Status

INVALIDATED — before any code was written, by reading `src/proposal/proposal.ts`
directly.

### Evidence

`applyProposal`'s `create` operation (`src/proposal/proposal.ts`,
validated since Iteration 1 — see `docs/PROJECT_KNOWLEDGE.md` Validated
table) already does `insert into architecture.element (...)` against
whatever graph already exists, inside a transaction, gated by the
proposal lifecycle's draft → proposed → approved → applied states. This
is a real incremental write path, exercised by `test/proposal.test.ts`
since Iteration 1's own tests. `importArchitecture`'s lack of
conflict-handling is real, but it is the seed path, not the only path —
the Open Question conflated the two.

### Resolution

Not a partial fix — the premise was set aside entirely. The real gap
was found by asking a narrower, more specific question: what,
*specifically*, does `applyProposal` not yet let a proposal do? Answer:
establish `provides` or `dependsOn` edges, attach a Decision or
Constraint, or rename an element. Of those, `provides` was the one with
a demonstrated, non-hypothetical consequence — see Validated, below.

### Consequence

This narrows what "incremental architecture authoring" means for this
project going forward: it is not a green-field mechanism to build, but a
specific, enumerable set of gaps in an already-validated mechanism to
close one at a time, each justified by a concrete scenario rather than
by category completeness.

---

## Validated

### Assumption

Adding a `provide` operation to the existing `ArchitectureChangeProposal`
mechanism — writing into the existing, unchanged `element_provision`
table, validated inside the same transaction as `create` — closes the
gap where minting a component to satisfy a missing capability left that
capability unprovided after apply.

### Status

VALIDATED

### Evidence

`test/proposal.test.ts`'s end-to-end test: a Task affecting
`cap.invoice-export` fails `buildWorkPackage`'s gate with
`unprovided-capability`; a proposal with `create` (mint
`comp.export-service`) and `provide` (wire it to
`cap.invoice-export`) operations is drafted, approved, and applied in
one atomic step; `unprovidedCapabilities()` (Alignment, §8.5) no longer
lists the capability afterward — checked directly via the same query
Alignment already uses, not inferred from the proposal's own success. A
second, independent test mints *both* ends of the provision edge
(component and capability) in one proposal and confirms the resulting
`element_provision` row and `ApplyProposalResult.providedLinks` both
reflect it correctly.

### Consequence

Closes Open Question #6 for the specific, demonstrated gap. The
project's own textbook unblocking-flow example (§5.1: "implement invoice
discounts, which needs a new `comp.discount-engine`") is now actually
reachable end-to-end through the proposal mechanism alone, without a raw
SQL escape hatch.

---

## Unproven

### Assumption

A `depend` operation (`element_dependency`, the other R2 behavioural
edge) needs the same treatment `provide` just received.

### Why It Remains Unproven

No concrete scenario in this project's history has yet needed a proposal
to mint two interdependent components and wire the dependency in the
same governed step — unlike `provide`, which the architecture document's
own running example required. Structurally near-identical to add if
evidence demands it.

### How To Validate

Wait for a real scenario — a task, a `RunBlocked` reason, or an authoring
API design (Iteration 13) — that actually needs it, rather than adding it
speculatively now.

---

### Assumption

A PO/architect-facing authoring API (Iteration 13), built on top of
`create`/`provide`, is usable by a real, non-technical-enough-to-write-
raw-JSON user.

### Why It Remains Unproven

This iteration proved the backend mechanism only. `POST /proposals`
still takes an arbitrary `operations[]` array of raw field names —
nothing about ergonomics, validation feedback, or a real UX has been
touched.

### How To Validate

Iteration 13's own scoped territory.

---

### Assumption

`architecture.change_operation`'s check constraint, extended to a third
operation family (`provide`) in this iteration, is a sufficient guard on
row shape.

### Why It Remains Unproven

Discovered during `/review`, not during implementation. The constraint
only asserts that the fields a given `op` requires are present; it never
asserts that the *other* operations' fields are absent. A row with
`op = 'provide'` could carry a non-null `mint_id` and the schema would
not reject it — the same looseness already existed between `create` and
`retire` before this iteration, now extended to a third column family.
Today this is harmless only because `draftProposal` is the sole writer
and is disciplined about nulling irrelevant fields; nothing at the
schema level enforces that.

### How To Validate

Not an experiment to run — a design decision to make before a fourth
operation type (`depend`, or `move`/`split`/`merge` when their iteration
arrives) is added: either extend the check constraint to assert mutual
exclusivity across all four column groups, or move to the discriminated
`jsonb` payload the migration's own comment already anticipated. Iteration
13 or whichever iteration adds the next operation type should decide
this deliberately rather than by continuing to extend the same table.

---

## Biggest Surprise

Not that `provide` was needed — `docs/history/iteration-12/SCOPE.md`
predicted that precisely, from reading `buildWorkPackage`'s gate logic
directly before writing any code. The surprise was in the *first*
implementation attempt: giving `provide_component_id` and
`provide_capability_id` a foreign key to `architecture.element(id)`
seemed like the obviously-correct, safe choice — the same protective
instinct that put FKs on `target_id` and `supersedes_id`. It was wrong,
and the test suite caught it immediately: this iteration's own
motivating scenario (mint a component, then have it provide a capability
in the same proposal) requires the `provide` operation to name an
element that does not exist yet at draft time. `mint_id` itself already
had no FK, for exactly this reason — a pattern that was sitting in the
code the whole time, not noticed until a real failing test forced the
comparison. `SCOPE.md`'s own "Failure modes" section had named this
ordering risk as a thing to test for, but framed it as a question about
*intra-transaction visibility* (does Postgres see an earlier statement's
insert within the same transaction) rather than the simpler, actual bug
(a schema-level FK that should never have been there at all). Both
readings pointed at the same test; only running it distinguished them.

---

## Final Verdict

**What does Project Nexus now know?** That `ArchitectureChangeProposal`
can grow a graph into something immediately usable — not just present —
in one atomic, governed step, using a `provide` operation that required
no new invariants beyond the ones `element_provision` already enforced.
That Open Question #6, as originally framed, was asking about the wrong
mechanism.

**What does Project Nexus still only believe?** That a real
PO/architect-facing API and UI, built on this mechanism, will be usable
by someone who is not comfortable hand-writing `operations[]` JSON —
entirely untested until Iteration 13/14.

**What architectural bets remain highest risk?** Whether `depend`,
Decision/Constraint attachment, and element renaming are ever actually
needed, or whether `create`/`retire`/`provide` turn out to be sufficient
for every real scenario this project encounters before Iteration 13
starts — deliberately left open rather than pre-built.
