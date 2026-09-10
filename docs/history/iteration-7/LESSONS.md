# Iteration 7 Lessons

Not a status report (`docs/history/iteration-7/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 7 asked `docs/PROJECT_KNOWLEDGE.md`'s oldest open question
(Open Question #1, since Iteration 3): does the MCP grant model bound
what an agent can *learn*, not only what it can *directly query*? The
structural gap was already known and disclosed — `getAncestry` checked
its grant against the call's target only, then returned an unfiltered
containment chain. What was genuinely unknown was whether that gap had
real behavioral consequence. It did, on the first real attempt: a real
agent, given a narrowly-scoped, entirely ordinary task that never
mentioned architecture or the broader product, called `getAncestry` for
a legitimate reason and disclosed an out-of-grant product codename
("Project Solstice") unprompted, twice, in its own final output. This
converts §9.5's claim that the grant model "bounds agent blast radius
provably" from a documented intention into something this project can
now say plainly was not fully true before this iteration, and — after a
small, contained fix — is true again.

The fix (`redactOutOfGrantAncestor` in `src/mcp/tools.ts`) was designed
and confirmed the same way the leak was found: against the identical
real scenario, not a synthetic unit test standing in for one. The same
real agent, given the same real task, reached the same correct
structural conclusion using only `kind` and `depth` — proving the
redaction did not just hide information, it hid exactly the information
that was never needed for any legitimate purpose this iteration could
identify.

---

## Validated

### Assumption

An in-grant `getAncestry` call can cause a real agent to disclose an
out-of-grant ancestor's identity in its own final output, as a side
effect of ordinary, legitimate tool use — not only under adversarial or
directed prompting.

### Status

VALIDATED

### Evidence

One real run, task-scoped to a single in-grant component, with acceptance
criteria that never mentioned ancestry, architecture, products, or
domains — only "confirm this component's containment placement looks
structurally correct." The agent called `getAncestry` unprompted (a
reasonable act for the task it was actually given) and its final output
named "Project Solstice," the out-of-grant product three containment
levels above the grant, twice: once narrating the chain, once in its own
readiness summary. Recorded at the protocol level (`toolCalls`/
`toolResults`, the same discipline Iteration 6 established) and checked
against the actual final text, not inferred.

### Consequence

Closes `docs/PROJECT_KNOWLEDGE.md` Open Question #1 for the specific
tool and mechanism tested — not by narrowing it further, as every prior
"resolved favorably" entry in this project's history has done, but by
confirming the gap was real and then removing it. The narrower
"information-exposure question" this project had been carrying since
Iteration 3 is retired, replaced by the correction below.

---

### Assumption

Redacting an out-of-grant ancestor's `id` and `name` while preserving
`kind` and `depth` is sufficient for a legitimate in-grant caller's
actual use of `getAncestry`'s result — the chain's shape, not each
ancestor's specific identity, is what a structural-placement check
actually needs.

### Status

VALIDATED

### Evidence

The identical real scenario, re-run after the fix: the same real agent,
given the same real task, reached the same correct conclusion ("a clean,
single-parent ancestry chain... not orphaned... exactly the expected
containment shape") using only the redacted chain's `kind` sequence and
`depth` values. It did not ask for, need, or seem to miss the hidden
identities. This is direct evidence, not an assumption carried over from
design — the redaction was tested against the exact legitimate use this
iteration's own scenario required, not a hypothetical one.

### Consequence

The mitigation is minimal and precisely targeted: one function, applied
inside the one MCP tool wrapper where the risk was demonstrated, leaving
the grant-agnostic traversal layer (`src/graph/traversals.ts`) untouched.
No broader redesign of the traversal or the grant model was needed.

---

## Invalidated

### Assumption

Iteration 3's own reading of §9.5 — "this project reads it as authorizing
the *call*, not re-deriving the traversal's own contract to also mean
'and filter everything it returns'" — was a defensible, low-risk
interpretation that could reasonably be left as documented risk rather
than fixed.

### Status

INVALIDATED

### Evidence

The very first real, non-adversarial attempt to find out whether this
mattered found that it did. This was not a contrived edge case requiring
unusual conditions — a completely ordinary task (confirm structural
placement before implementing) was enough to trigger it, because
`getAncestry` is exactly the kind of tool a real, legitimate task
reaches for. The risk was not theoretical or requiring an unlikely
sequence of events; it was the default outcome of the agent doing its
job as instructed.

### Resolution

`getAncestry`'s result is now filtered. §9.5's "authorizes the call, not
the result" reading is no longer this project's operating interpretation
for this tool.

### Consequence

Worth carrying forward precisely: "a gap is disclosed and low-risk in
the abstract" is not the same claim as "a gap has been tested against a
real agent and found low-risk." Iteration 3 could not have tested this
claim against a real agent, because no real agent existed yet
(`ClaudeSdkAdapter` is Iteration 6). This is not a criticism of
Iteration 3's own decision — it was the correct decision given what
could be tested at the time — but a reminder that a disclosed risk
carried in `docs/PROJECT_KNOWLEDGE.md` as Unproven is a flag to revisit
with real evidence as soon as the tooling to gather it exists, not a
permanent resting place for the concern.

---

## Unproven

### Assumption

Every current and future MCP tool that returns graph-derived structure
(not just `getAncestry`) needs the same category of grant-result
filtering.

### Why It Remains Unproven

`getCapabilitiesOf`, this project's only other MCP tool, does not carry
an equivalent risk — its result (capability ids, `is_primary`) has no
"walks past something outside the grant" shape the way an ancestry chain
does. This iteration deliberately did not build a general filtering
framework in the absence of a second demonstrated instance of the risk,
per its own scope's "evidence before redesign, not by default"
discipline. Whether a future tool (e.g. `architecture.get_dependencies`,
§9.2, still deferred) would have the same risk is unknown until that
tool exists and is tested the same way.

### How To Validate

When a future iteration adds another MCP tool whose result could
plausibly traverse past a grant boundary (dependency traversals, governance
resolution across ancestors), test it the same way this iteration tested
`getAncestry`: a real, narrowly-scoped, non-adversarial agent run, before
assuming either that filtering is needed or that it is not.

---

## Biggest Surprise

Not that the leak existed — that was already known and documented since
Iteration 3. The surprise is how little was needed to trigger it. No
adversarial prompting, no unusual task, no attempt to probe the
boundary — a single, ordinary "does this look structurally correct"
instruction, the kind any real pre-implementation check might reasonably
include, was sufficient on the very first real attempt. This sharpens
what "evidence before redesign, not by default" actually means in
practice: the bar for "does this matter" turned out to be much lower
than a cautious reading of the original Iteration 3 disclosure might
have suggested — worth remembering the next time a similar disclosed,
low-priority-sounding gap is carried forward instead of tested.

---

## Final Verdict

**What does Project Nexus now know?** That §9.5's "bounds agent blast
radius provably" claim did not fully hold for `getAncestry` before this
iteration — a real agent, doing ordinary work, disclosed out-of-grant
information unprompted — and does hold now, confirmed against the exact
same real scenario after a small, targeted fix. That the fix's cost was
low precisely because the legitimate use case (structural shape) and the
sensitive information (specific identity) were separable in this tool's
result, which will not necessarily be true of every future tool.

**What does Project Nexus still only believe?** That no other current or
future MCP tool carries the same risk — plausible for
`getCapabilitiesOf` today, untested for anything not yet built. That the
redaction placeholder's string-based convention will be adequate once a
programmatic (not just a real-agent-reading-JSON-text) consumer of
`getAncestry` exists.

**What architectural bets remain highest risk?** Unchanged by this
iteration's own outcome: the six-event `RunEvent` vocabulary's
sufficiency once a scope needs `ArtifactProduced` or a real `RunBlocked`
signal (open since Iteration 6) remains the next-ranked open question
this project has evidence-gathering tools to actually test.
