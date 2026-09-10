# Iteration 8 Lessons

Not a status report (`docs/history/iteration-8/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 8 asked the narrower half of `docs/PROJECT_KNOWLEDGE.md`'s
current Open Question #1: does the six-event `RunEvent` vocabulary hold
for `RunBlocked`, the one event kind Iteration 6's real adapter never
produced from anything real? It did, on the first real attempt. A real
agent, given a genuine, ordinary pre-implementation task, called a tool
that was refused for a real reason, correctly reasoned about what that
refusal meant for its ability to do its job reliably, and signaled
exactly the convention it was given — not instead of reasoning, but
after it, which is precisely the shape a real "I am blocked" signal
should take. `mapMessage()`'s new parsing path translated that into a
real `RunBlocked` event, not `RunCompleted`, without any correction
needed after the fact.

This is the first iteration since Iteration 5 where the mechanism worked
cleanly on the first live attempt with no harness bug or design
correction discovered along the way (Iteration 6 found a real prompt-
wiring bug; Iteration 7 found a real information leak). Worth naming
precisely rather than treating as unremarkable: the "check before
trusting" discipline this project has practiced since Iteration 0 — most
visibly, running two probe scripts and reading `--help` output before
writing adapter code in Iterations 5 and 6 — applies here too. This
iteration's design (§5 in `SCOPE.md`) explicitly weighed a fragile,
exact-match convention against a more robust dedicated tool, and chose
the fragile one *because* it tested the harder, more informative
question. That the fragile choice held is itself a data point, not a
foregone conclusion the design assumed going in.

---

## Validated

### Assumption

A real agent, given a real refusal it has a genuine reason to encounter,
and a standing (not per-task) instruction for how to signal that it
cannot proceed reliably, will follow that instruction — not silently
work around the gap, not guess, not report the refusal only as
unstructured prose.

### Status

VALIDATED

### Evidence

Two independent real runs against the identical scenario (the second
during `/review`, after fixing an unrelated Consistency Auditor finding
in the investigation script — see `docs/history/iteration-8/REPORT.md`
"Pre-commit review findings"): both times the agent called
`getCapabilitiesOf` on an out-of-grant component for a reason the task
itself created (confirming a historical dependency before certifying
readiness), was genuinely refused (`isError: true`, the real
`GrantRefusedError` message), explained precisely why that refusal meant
it could not responsibly complete the task, and ended its response with
the exact `BLOCKED: context-insufficient — <note>` line specified in
`buildPrompt()`'s standing instruction — with different phrasing each
time, not a memorized or cached response. Checked at the protocol level
(`toolCalls`/`toolResults`) and against the real final text, not
inferred.

### Consequence

Closes the `RunBlocked` half of `docs/PROJECT_KNOWLEDGE.md` Open
Question #1 for the one reason (`context-insufficient`) this project's
current MCP tool catalog can actually produce. `ArtifactProduced` remains
the question's only untested half.

---

### Assumption

`mapMessage()` can correctly translate a real agent's free-form final
output into a structured `RunBlocked` event using a plain, exact-match
textual convention, without needing a dedicated MCP tool for the agent
to call instead.

### Status

VALIDATED

### Evidence

Both live runs: `events()` yielded `RunStarted → ContextRequested →
ContextRequested → RunBlocked` — the fourth event a real, not hardcoded,
`RunBlocked`, confirmed by inspecting the actual sequence each live run
produced, not assumed from the code compiling or from hermetic fixture
tests alone (those were added first and predicted this outcome; the live
run then confirmed the prediction).

### Consequence

`docs/history/iteration-8/SCOPE.md` §5's Option B (a dedicated
`requestBlocked` tool) is not needed as a follow-up correction — the
simpler mechanism this iteration chose specifically because it tested
the harder question held. This does not mean Option B is wrong for a
future need (e.g. once `proposalDraft` needs real structure a plain text
line cannot carry cleanly), only that it was not *required* to make the
basic signal reliable.

---

## Invalidated

*(none this iteration — see Biggest Surprise, below, for why the absence
of an invalidated assumption is itself worth naming rather than passed
over.)*

---

## Unproven

### Assumption

A plain, exact-match textual convention remains a reliable mechanism for
`RunBlocked` across a wider range of real scenarios than the one this
iteration tested.

### Why It Remains Unproven

Two real runs, same scenario, same refusal, same signal both times —
stronger than one data point, but still one scenario repeated, not a
varied sample. `docs/history/iteration-8/SCOPE.md` §8 named the two ways
this could have failed (the agent never signals at all; the agent
signals something close but not an exact match) as real, checkable
possibilities — neither happened either time, but neither was ruled out
as a possibility for a differently-shaped future scenario,
a longer or more complex task, or a different model behavior on a
different day.

### How To Validate

Run the same class of scenario again, varied — a task where the refusal
happens earlier or later in the agent's reasoning, a task with more
competing instructions pulling attention away from the convention, or
simply a repeated run of the identical scenario to check for consistency
rather than a single data point standing in for reliability.

---

### Assumption

`architecture-change-required` and `mapping-missing` — the two
`RunBlockedReason` values this iteration could not test — behave the
same way `context-insufficient` did once they become reachable.

### Why It Remains Unproven

Neither is discoverable with `getAncestry`/`getCapabilitiesOf`, the only
two MCP tools this project has. Nothing about this iteration's evidence
bears on either.

### How To Validate

Once Repository MCP (for `mapping-missing`) or a genuine
zero-providers-discoverable-mid-run scenario (for
`architecture-change-required`) exists, test each the same real-agent
way this iteration tested `context-insufficient` — not assumed to work
by analogy.

---

## Biggest Surprise

That there wasn't one, in the specific sense every prior iteration
touching a real agent has had one. Iterations 6 and 7 each found a real,
concrete problem on the first live attempt — a harness bug, a genuine
information leak. This iteration's first live attempt produced exactly
the outcome the design predicted, with no correction needed. Worth
resisting two opposite misreadings: that this means the "check before
trusting" discipline is no longer necessary (it is what let this design
be built carefully enough to hold, the same discipline that caught real
problems twice before), and that a single clean run is stronger evidence
than it actually is (see Unproven, above — one run is one run, not a
demonstrated pattern of reliability). The honest middle reading: careful
design, informed directly by what two prior real-agent iterations
learned the hard way, produced a mechanism that worked the first time it
was actually tried — evidence that the lessons from Iterations 6 and 7
transferred, not evidence that this class of risk has stopped existing.

---

## Final Verdict

**What does Project Nexus now know?** That a real agent can be given a
standing, always-present protocol instruction and follow it correctly
when a genuine, unprompted condition calls for it — not only per-task
instructions, which is all `buildPrompt()` had ever carried before. That
`mapMessage()` can translate unstructured real agent output into a
structured `RunEvent` beyond the three kinds Iteration 6 ever exercised,
using a mechanism deliberately chosen for being the harder test, not the
safer one. That four of the six `RunEvent` kinds have now been produced
from real, not hardcoded, agent behavior — `RunStarted`,
`ContextRequested`, `RunCompleted`/`RunFailed`, and now `RunBlocked`.

**What does Project Nexus still only believe?** That the textual
convention chosen here generalizes past the one scenario tested. That
`architecture-change-required` and `mapping-missing` would work the same
way once reachable. That `ArtifactProduced` — the last untested kind —
will translate as cleanly once the real output path exists to produce
one.

**What architectural bets remain highest risk?** `ArtifactProduced` and
the real output path it depends on now stand alone as the only
untested piece of Open Question #1 — the natural next target, not
because anything here suggests it will be harder, but because it is the
only piece of the six-event vocabulary this project has not yet put in
front of a real agent at all.
