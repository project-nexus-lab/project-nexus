# Iteration 14 Lessons

Not a status report (`docs/history/iteration-14/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 14 built this project's first real frontend screen and used
it, deliberately, as a live experiment rather than a foregone
conclusion: would a real, rendered UI need `GET /architecture/:id`, and
would provider-status need a new backend endpoint? Both questions were
answered from what the screen actually did, recorded in a call log the
screen itself displays — not assumed in either direction. Neither
endpoint turned out necessary; the existing discovery API, unchanged
since Iteration 13, was sufficient for a real human to reach the same
result Iteration 13 already proved reachable via raw HTTP calls.

---

## Validated

### Assumption

A minimal screen, built entirely from Iteration 13's already-validated
discovery API and a dev-time proxy (no backend change), lets a real
human complete the same discover-down-to-a-capability workflow already
proven at the API layer.

### Status

VALIDATED

### Evidence

One real, driven browser session (`claude-in-chrome`, not simulated)
against a real running backend (real PGlite, real seed data, real
`serve`) and a real running Vite dev server: clicking Trade Platform →
Billing → Invoice → Export Invoice rendered "No provider — this
capability is unprovided," the same real fact this project's own
`unprovidedCapabilities()` has recorded since Iteration 0's seed data.
The screen's own visible call log showed exactly five real `GET`
requests, all `200`, reproduced verbatim in `docs/history/iteration-14/REPORT.md`.

### Consequence

This project's discovery API, built for Iteration 13's own investigate
script, generalizes to a second, independent real consumer (an actual
rendered UI) without any change — a real test of the API's own design,
not merely of the UI's ability to call it.

---

### Assumption

`GET /architecture/:id` is unnecessary for a real discovery screen built
using only the bounded listing endpoint.

### Status

VALIDATED for this screen specifically — not a general claim about every
possible future screen.

### Evidence

Two independent confirmations: `App.test.tsx` mocks `fetch` directly (not
the API module's exported functions), so the real `apiCallLog` path
actually executes, and asserts the exact 5-call sequence contains no
call matching `/architecture/[id]` alone. The real browser session
reproduced the identical sequence. Both the top level (`kind=product`,
no parent — the "start from a name, not an id" requirement Iteration
13's own investigation cared most about) and every subsequent level were
reachable from the listing endpoint alone.

### Consequence

This is the *second* independent real workflow (after Iteration 13's own
`investigate-po-authoring-workflow.ts`) to find this endpoint unused.
`docs/PROJECT_KNOWLEDGE.md`'s existing Unproven entry about it is updated
to reflect convergent, not merely repeated, evidence — see Open
Questions, `docs/PROJECT_KNOWLEDGE.md`.

---

## Unproven

### Assumption

Client-side, per-capability provider fetching remains acceptable at a
real organization's actual scale (many capabilities, deep hierarchies),
not only at this project's own small seed data.

### Why It Remains Unproven

This iteration's real session exercised exactly one capability lookup,
against a seed graph with single-digit elements per level. Nothing here
tests what happens with, say, a subsystem containing dozens of
capabilities each requiring a separate round trip, or a capability with
many providers. Iteration 10's own graph-scale investigation raises the
same category of caveat for a different question — the pattern is
familiar, the specific claim here is not yet tested.

### How To Validate

Once a real or realistic-scale dataset exists (the same kind of
synthetic graph `investigate-graph-scale.ts` already generates), repeat
this iteration's own real-session discipline at that scale and observe
whether per-capability fetching still feels acceptable, or whether it
demonstrates a concrete need for a batched/aggregated endpoint —
deciding from a measured cause, not from this iteration's small-scale
comfort.

---

### Assumption (already fixed, recorded for the record)

`App.tsx`'s navigation-loading code needed no error handling beyond what
`CapabilityProviders` already had.

### Why It Was Wrong

Discovered during `/review`, not during implementation, and fixed before
this iteration closed rather than merely disclosed: the two
`listElements()` calls driving the navigation columns had no `.catch()`
at all — a failed fetch left `loadingLevel` set forever, an unhandled
promise rejection with no visible error, while the capability-detail
panel handled the identical class of failure correctly one component
over. Fixed by extracting a shared `loadLevel` helper with proper error
handling; a new hermetic test confirms the fix.

### Consequence

Worth naming precisely because it's the same shape of gap this
project's own history keeps finding in fresh code during `/review`
rather than during implementation (Iteration 12's FK-on-`provide_component_id`
bug, Iteration 13's stale roadmap cross-reference) — a real, if narrow,
argument for treating `/review` as load-bearing on every iteration, not
a formality, including one this small.

---

## Biggest Surprise

Not either of the two headline findings — both were genuinely open
going in, but the mechanism for testing them (build the real screen,
record what it actually calls) was exactly what `docs/history/iteration-14/SCOPE.md`
predicted it would be. The surprise was smaller and more mechanical,
caught while writing the App-level test: mocking `src/api.ts`'s exported
functions (`listElements`, `getProviders`) directly, the natural first
instinct for a component test, silently bypasses `apiCallLog` entirely —
the logging lives inside a shared `call()` helper those functions both
call internally, and a function-level mock never reaches it. The first
version of this test passed every assertion except the one checking the
visible call count, which stayed at zero no matter what the UI actually
rendered. Fixed by mocking `fetch` itself instead, which happens to be a
better test regardless: it now also exercises `api.ts`'s own URL-building
logic (`?kind=&parent=` construction), never separately tested before.

---

## Final Verdict

**What does Project Nexus now know?** That this project's first
frontend screen, built without any change to the discovery API, is
sufficient for a real human to do what Iteration 13 already proved an
API-only workflow could do — and that neither of Iteration 13's two open
questions needed a new backend capability to answer. Both were resolved
by recording what a real screen actually calls, not by further
speculation.

**What does Project Nexus still only believe?** That client-side
provider-status fetching remains acceptable at real scale — untested
beyond this project's own small seed data.

**What architectural bets remain highest risk?** Whether `GET
/architecture/:id` should be removed now that two independent real
workflows have found it unused — not decided in this iteration, left as
a named, evidence-backed choice for whoever next touches the discovery
API.
