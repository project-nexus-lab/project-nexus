# Iteration 3 Lessons

Not a status report (`docs/history/iteration-3/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 3 had one primary target — the top-ranked Open Question in
`docs/PROJECT_KNOWLEDGE.md` as of Iteration 2's close — and closed it with
three independent forms of evidence: an in-process test, an HTTP-driven
test against a real server, and a hand-run `curl` transcript, all
reproducing the same sequence (issue a grant, succeed in-grant, get
refused out-of-grant). The grant model is a real enforcement boundary, not
only a documented formula.

It also produced one honest qualifier, found while writing the tests
rather than after: the boundary enforced is narrower than "an agent cannot
learn anything about elements outside its grant." It is "an agent cannot
*directly query* an element outside its grant" — `getAncestry` on an
in-grant element still returns the full containment chain, including
ancestor ids that are not themselves individually in the grant. That gap
between "cannot query X" and "cannot learn X exists" is real and is now a
named Unproven item, not swept into the Validated claim.

---

## Validated

### Assumption

The MCP grant model (§9.5) is a real enforcement boundary: a tool call
whose target is outside the grant is refused, not merely documented as
something that should be refused.

### Status

VALIDATED

### Evidence

Three independent forms, not one: an in-process test
(`test/mcp.test.ts`) constructing a real grant from a real Work Package
and asserting both a successful in-grant call and a refused out-of-grant
one; an HTTP-driven test (`test/http.test.ts`) reproducing the same
sequence through real requests against a real `http.Server`, with the
refusal surfacing as `403`; a hand-run `curl` transcript against
`npm run serve` reproducing it a third, fully independent way.

### Consequence

`docs/PROJECT_KNOWLEDGE.md`'s top Open Question at the start of this
iteration now has direct evidence behind it. §15's justification for
deferring RBAC in the MVP ("run-scoped graph grants bound agent blast
radius provably") is no longer just an argument in prose — provided the
narrower reading holds; see Unproven, below, for where it might not.

---

### Assumption

§9.5's grant formula — `allowedElementIds = WP elements ∪
impactOf(components, context_depth + 1)` — is genuinely *wider* than the
Work Package's own bound, not the same value read twice.

### Status

VALIDATED

### Evidence

The seed's `comp.invoice-service dependsOn comp.payment-service` edge is
one hop away. `wpp.implementation` ships `context_depth: 0`, so the Work
Package's own `impactedComponents` field — computed at `context_depth`
exactly (§11.2 step 4, unchanged since Iteration 0) — is empty, proven in
Iteration 0's own test suite. The *grant*, computed at `context_depth + 1
= 1`, correctly includes `comp.payment-service`. Both facts asserted
together in one test (`test/mcp.test.ts`, "buildGrant widens one level
past the Work Package's own context_depth"), not left as two facts nobody
compared.

### Consequence

A subtle, easy-to-get-wrong detail — reusing the wrong depth value, or the
Work Package's own already-computed `impactedComponents` field instead of
a fresh call one level wider, would have silently produced a grant
identical to the Work Package's own bound, defeating the stated purpose of
"the minimum to discover what else is needed" (§9.5). Checked directly
rather than assumed correct because the formula looked right.

---

## Invalidated

None. Nothing this iteration assumed about the grant model, the port
relocation, or §2.3's dependency direction turned out wrong. The
`McpGrant` type move from `src/runtime/port.ts` to `src/mcp/grant.ts` was
checked against §2.3 directly (`grep` confirming zero imports from
`src/mcp/` into `src/runtime/`) rather than assumed safe, and it held.

---

## Unproven

### Assumption

The grant model bounds what an agent can *learn*, not only what it can
*directly query* — i.e., that "authorisation is a property of the graph...
[that] bounds agent blast radius provably" (§9.5) holds for information
exposure generally, not only for call targets.

### Why It Remains Unproven

`getAncestry(grant, elementId)` checks only `elementId` against the
grant; the returned ancestry chain is not filtered against
`allowedElementIds`. An in-grant call to `comp.invoice-service` returns
`prod.trade-platform` in its result even though the product root is not
itself in the grant — the agent now knows that id, its kind, and its name
exist, without ever being authorized to query it directly. This is a
disclosed, deliberate reading of an ambiguous line in §9.5 (see the
REPORT's "A disclosed interpretive choice"), not a bug — but it does mean
the *provable* blast-radius bound is narrower than "the agent cannot learn
about X," and the current implementation does not make that narrower
scope obvious to a caller relying on the grant for a security property
rather than a routing convenience.

### How To Validate

Decide, with evidence rather than by default, whether result-filtering is
actually required: build a scenario where a real (or realistic) agent's
behavior depends on this distinction — for instance, whether a
runtime-side abuse of "I learned an id from an in-grant ancestry call, now
I'll ask a *different*, in-grant-adjacent tool about it" is a real
exploitable gap or a theoretical one, before changing the enforcement
model to filter results and paying the cost of a less simple traversal
layer for it.

---

### Assumption

The `context_depth + 1` grant-widening formula generalizes correctly to
profiles with nonzero `context_depth`.

### Why It Remains Unproven

The only profile in the seed data, `wpp.implementation`, ships
`context_depth: 0`, making the tested case `impactOf(..., 1)`. Nothing
this iteration exercised `impactOf(..., 2)` or deeper, and nothing checked
whether a wider Work Package (itself already including one-hop impact)
composes correctly with a grant that then needs to widen one *further*
level past that.

### How To Validate

The same experiment Iteration 1 already named for a different reason
(`docs/PROJECT_KNOWLEDGE.md`, "`WorkPackageProfile.context_depth`
correctly bounds `impactOf` for depth > 0") — seed a real profile at depth
≥ 1, and check the grant built from a Work Package generated under it
widens correctly one level past that. One experiment now answers both
questions at once.

---

## Biggest Surprise

Not about this iteration's own code — about a stale cross-reference this
iteration deliberately did *not* create, having created and then found the
same category of mistake twice already (Iterations 1 and 2's own
Lessons). `src/runtime/port.ts` carried a doc comment asserting it existed
to answer "`docs/PROJECT_KNOWLEDGE.md`'s #1 Open Question" — true when
Iteration 2 wrote it, already false by the time Iteration 2's own close
re-ranked Open Questions, and never caught until this iteration's review
pass reread it. The fix this time was not just correcting the number
(that patches one instance) but rewording the comment to stop asserting a
rank at all — pointing at `docs/PROJECT_KNOWLEDGE.md` as the thing to
check instead of restating its contents. The same discipline is applied
in this iteration's own `REPORT.md`, which explicitly declines to name a
current ranking anywhere in it.

Worth stating as the actual lesson, not just the fix: a comment that
restates a fact from a document that changes is not documentation, it is
a second copy of the document with worse update guarantees. The reliable
fix is not "remember to update every copy" — three iterations of evidence
now say that doesn't hold up — it's not making the copy in the first
place, and pointing at the source instead.

---

## Final Verdict

**What does Project Nexus now know?** That the MCP grant model refuses an
out-of-grant tool call for real, checked three independent ways, not
inferred from a passing suite. That §9.5's depth-widening formula is
genuinely wider than a Work Package's own bound, and that this
specifically — not something adjacent to it — was what got tested. That
moving a type to its architecturally correct owner (`McpGrant`, from
`runtime/port.ts` to `mcp/grant.ts`) can be checked against §2.3's
declared dependency table directly, the same way Iteration 1's boundary
violation was checked, and this time the check came back clean rather
than finding a second violation.

**What does Project Nexus still only believe?** That the grant model
bounds what an agent can *learn*, not only what it can directly query —
the gap between those two claims is now named and open, not blurred
together. That the depth-widening formula works for any profile deeper
than the one seed profile actually exercises. Everything else in
`docs/PROJECT_KNOWLEDGE.md` untouched by this iteration remains exactly as
it was.

**What architectural bets remain highest risk?** Repository bootstrap
(§10) is now unambiguously the largest remaining piece of unbuilt scope,
and the one the most other Unproven items are waiting on. Whether a real
adapter (not this project's two no-ops) can actually use a grant to drive
genuine MCP protocol calls remains exactly as untested as it was at the
end of Iteration 2.
