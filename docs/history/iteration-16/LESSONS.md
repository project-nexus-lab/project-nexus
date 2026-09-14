# Iteration 16 Lessons

Not a status report (`docs/history/iteration-16/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 16 closed `docs/PROJECT_KNOWLEDGE.md`'s Open Question #7 by
applying Iteration 12's own precedent (`provide`, closing the
mint-but-not-usable gap for Elements) to the one remaining ungoverned
architecture primitive: Decisions. The mechanism decided in
`docs/history/iteration-16/SCOPE.md` — extend `ArchitectureChangeProposal`
with a fourth operation rather than build a second lifecycle — survived
implementation unchanged, and in doing so paid the mutual-exclusivity
debt Iteration 12's own `/review` had explicitly named as due "before a
fourth operation type is added." The end-to-end loop this iteration
exists to close — a Decision created through real review, then
successfully cited by Iteration 15's `createTechnologyProfile` — is now
directly demonstrated, not merely argued for.

---

## Validated

### Assumption

Extending `ArchitectureChangeProposal` with a fourth operation type
(`decide`) is sufficient to give `architecture.decision` a real,
attributable, human-approved creation path, without a second, parallel
proposal-and-approval lifecycle built for Decisions alone.

### Status

VALIDATED

### Evidence

A `decide` operation reached `applied` through the existing
draft → proposed → approved → applied state machine unchanged; the
resulting `architecture.decision` row was checked directly (`status =
'accepted'`, correct `title`/`statement`), and its attribution was
confirmed recoverable by joining `change_operation`/`change_proposal` —
not merely that the insert succeeded silently. A second test then took
that same governance-created Decision and successfully cited it from
`createTechnologyProfile` (Iteration 15), the concrete acceptance
criterion this iteration was scoped around.

### Consequence

Closes Open Question #7 for the mechanism it named: Technology Profile
governance's citation check no longer has to rest on a pre-seeded YAML
fixture as its only real-world example — a Decision created entirely
through review now satisfies it too.

---

### Assumption

`architecture.change_operation`'s mutual-exclusivity check can be
retrofitted to cover `create`/`retire`/`provide` as well as the new
`decide` branch, without narrowing what any existing operation type is
legally allowed to do.

### Status

VALIDATED

### Evidence

Every pre-existing `create`/`retire`/`provide` test
(`test/proposal.test.ts`) passed unmodified against the rewritten
`change_operation_check`. Five new tests in `test/schema-constraints.test.ts`
confirm the check directly at the DB level: one well-formed `decide` row
is accepted, and each of the four operation types is independently
rejected when a row also carries another operation's fields — not
inferred from the SQL, checked against real insert attempts.

### Consequence

The debt Iteration 12's own `/review` disclosed — *"before a fourth
operation type is added: decide... a mutual-exclusivity check... or the
discriminated jsonb payload"* — is paid, not merely acknowledged again.
Any operation type added after this one inherits a genuinely
presence-and-absence-checked constraint, not a fifth unchecked column
group added to a still-loose check.

---

### Assumption

Inserting a governed Decision only at *apply* time, already in its
terminal `'accepted'` status — mirroring how `create` mints an Element
only at apply time, already `'active'` — is the correct choice, not
merely the convenient one.

### Status

VALIDATED, by explicit comparison against the alternative during this
iteration's own `/review` (Architecture Critic pass), not merely assumed
by analogy.

### Evidence

The alternative considered directly: insert the Decision row at *draft*
time with `status = 'proposed'`, then flip it to `'accepted'` once
applied. `architecture.decision.status` has no `'rejected'` or
`'withdrawn'` value — a proposal drafted this way and later rejected
would leave a Decision row permanently stuck at `'proposed'`, with no
legal transition back out. The apply-time-only design avoids this
failure mode entirely, the same way `create` already avoids the
equivalent problem for Elements.

### Consequence

`architecture.decision.status`'s `'proposed'` value remains exactly as
unreached by governed creation as `element.status`'s `'deprecated'`
value already was before this iteration — a deliberate consequence of
the correct design, not an oversight this iteration failed to close.

---

## Unproven

### Assumption

`architecture.decision_scope` (which elements a Decision governs) is
safe to leave entirely outside this governed mechanism.

### Why It Remains Unproven

Untouched by design, exactly as `docs/history/iteration-16/SCOPE.md`
scoped it — governing Decision *creation* and governing which elements a
Decision *applies to* were treated as two separate gaps, and only the
first was this iteration's target. No concrete scenario has yet
demanded the second; Iteration 12 named this same open thread three
iterations ago (`docs/history/iteration-12/LESSONS.md`) and it remains
exactly as open now.

### How To Validate

Build a real scenario needing a newly governance-created Decision
immediately scoped to specific elements in the same reviewed step
(rather than attached later, ungoverned, the way `decision_scope` rows
are written today), and decide then whether `decide` needs a `governs:
string[]`-shaped extension or whether a separate, later mechanism is a
better fit.

---

### Assumption

The mutual-exclusivity `case` expression, now covering four operation
types' worth of columns, remains a maintainable shape rather than one
that should have been a discriminated `jsonb` payload instead.

### Why It Remains Unproven

Readable and passing at four operation types; genuinely untested
whether a fifth would still be comfortable to add to the same `case`
expression or whether that would be the point the `jsonb` alternative
(named and deliberately deferred in `SCOPE.md`) finally earns its cost.

### How To Validate

The next iteration proposing a fifth `change_operation` type (`move`,
`split`, or `merge`, per `docs/MVP_ARCHITECTURE_V2.md` §5.3) should
read this constraint fresh before extending it again, and treat "is this
still readable" as a real question, not a formality.

---

## Invalidated

None. Nothing this iteration attempted was disproven — the mechanism
chosen in `docs/history/iteration-16/SCOPE.md` survived contact with
real code, a real mutual-exclusivity retrofit, and a real end-to-end
demonstration, unchanged.

---

## Biggest Surprise

Not a surprise about `decide` itself — about how little of
`docs/PROJECT_KNOWLEDGE.md`'s prior evidence needed re-deriving.
`ids.ts`'s `decision` `AuthoredKind` (prefix `adr`) had existed,
unused by any proposal-facing validation, since long before this
iteration; `assertId(op.decideId, "decision")` worked on the first call,
no changes needed to `ids.ts` at all. The smallest-viable-architecture
argument in `SCOPE.md` was made from reading the code, not from
optimism — and it held exactly as read.

---

## Final Verdict

**What does Project Nexus now know?** That `architecture.decision` has a
real, governed, attributable creation path, built by extending the
existing `ArchitectureChangeProposal` mechanism rather than duplicating
it; that the mutual-exclusivity debt Iteration 12 disclosed can be paid
without narrowing any existing operation's legal shape; and that a
Decision created through this real path is usable, end to end, by
Iteration 15's Technology Profile governance.

**What does Project Nexus still only believe?** That `decision_scope`
never needs to be part of this same governed path, and that the
mutual-exclusivity `case` expression will still be comfortable to extend
when a fifth operation type is eventually proposed.

**What architectural bets remain highest risk?** None newly introduced
by this iteration — the residual risk is the same one Iteration 15 left
behind and this iteration was scoped to reduce, not eliminate: whether a
real PO/architect, given a real governed path for both Decisions and
Technology Profiles, actually uses either correctly in practice. That
remains a question about people and process, not mechanism, and no
iteration to date has been positioned to answer it.
