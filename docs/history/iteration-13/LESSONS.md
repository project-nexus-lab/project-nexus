# Iteration 13 Lessons

Not a status report (`docs/history/iteration-13/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 13 asked whether the `create`/`retire`/`provide` proposal
mechanism — validated for its backend correctness in Iterations 1 and
12 — is actually usable by a real Product Owner or Architect, given it
was reachable only as raw JSON with no way to discover what exists or
review a draft before approving it. The answer is yes, and cleanly: a
small, plain HTTP read surface (list/get elements, get a capability's
providers, list/get proposals), added without touching the existing
write shape at all, was sufficient for a real, HTTP-driven workflow to
go from knowing only a product's name to a confirmed, applied change.
One endpoint not in the original plan (`/architecture/:id/providers`)
turned out indispensable; one endpoint that was planned
(`GET /architecture/:id`) turned out unused in the one real scenario
tested.

---

## Validated

### Assumption

A plain, ungated HTTP read surface (discovery + review) — added without
changing the existing `create`/`retire`/`provide` write shape at all —
is sufficient to make that mechanism usable by a real Product
Owner/Architect starting from only a product's name.

### Status

VALIDATED

### Evidence

Two independent runs of the same real workflow: a hermetic
`test/http.test.ts` case ("PO discovery workflow...") and a live
`investigate-po-authoring-workflow.ts` run against a real `http.Server`.
Both discover a product by name, walk containment down to a real
unprovided capability, draft a `create` + `provide` proposal referencing
only ids returned by earlier calls, review it via `GET /proposals/:id`,
approve, apply, and confirm the capability now has a provider via
`GET /architecture/:id/providers` — with zero hardcoded
`prod.*`/`dom.*`/`subsys.*`/`comp.*`/`cap.*` id literal anywhere in
either. The investigate script enforces this mechanically: every id
literal appearing in a request *path* is checked against the set of ids
already returned by an earlier response before the call is allowed to
proceed, not just enforced by convention or code review.

### Consequence

Resolves `docs/PROJECT_KNOWLEDGE.md`'s Open Question #6 for its core
claim. The narrower question that survives is not about the write path
at all, but about what Iteration 14's UI needs beyond this read surface
— see Unproven, below.

---

## Unproven

### Assumption

Whether capability discovery needs provider/unprovided status surfaced
over HTTP before Iteration 14's UI is built, or whether the UI can
synthesize it client-side from already-existing endpoints.

### Why It Remains Unproven

The investigate script found a real, named gap: `GET /architecture`'s
listing carries no provider-status signal, so "which capabilities need
a component" cannot be answered from a listing alone. The scripted
workflow completed anyway because the simulated PO already knew which
capability to target from its own backlog — the same way a real PO
would know from their own requirements, not from Nexus telling them.
Nothing tested whether a user without that prior knowledge, browsing
purely to find "what needs attention," would be equally unblocked.

### How To Validate

Once Iteration 14's UI actually needs to show "which capabilities need
a provider" as a real feature (e.g. a dashboard or backlog view), decide
there whether that requires a new HTTP endpoint wrapping
`unprovidedCapabilities()` (Alignment, §8.5) or can be synthesized
client-side by calling `GET /architecture/:id/providers` per capability
— not decided speculatively here.

---

### Assumption

`GET /architecture/:id` (single-element detail, mirroring §9.2's
`architecture.get_element`) earns a permanent place in the API surface.

### Why It Remains Unproven

Built as scoped, but the one real workflow this iteration tested never
called it — the listing endpoint's summary shape (`id`, `kind`, `name`,
`status`) was sufficient at every step, and `childIds` was never
consulted below the top of the walk. This is one data point, not a
verdict: a UI's dedicated "element detail" page (showing full ancestry,
governance, etc. for one element) is a highly plausible future need for
exactly this endpoint — but that need hasn't been demonstrated yet
either.

### How To Validate

Revisit when Iteration 14 has a concrete detail-view screen design; keep
if it's needed, remove if a future review finds it genuinely dead code.

---

## Biggest Surprise

Not that a read surface was needed — `docs/ROADMAP.md`'s own framing of
this iteration already expected that. The surprise was *which* two
endpoints turned out to matter and which didn't, and neither could have
been predicted from the scope document alone. `SCOPE.md` planned
`GET /architecture/:id` (element detail) as one of the four core
endpoints and never mentioned `/providers` at all — reality inverted
that: the planned endpoint went unused, and the unplanned one became
load-bearing the moment the workflow needed to close its own loop
("did the `provide` operation actually work?"). This is a very concrete
instance of why `docs/history/iteration-N/SCOPE.md` documents are
scoped as *questions to test*, not implementation blueprints to execute
— the smallest viable investigation, run for real, told this iteration
something its own planning could not have.

---

## Final Verdict

**What does Project Nexus now know?** That the proposal mechanism
Iterations 1 and 12 built is genuinely usable by something standing in
for a real Product Owner or Architect, given a small, plain read
surface — and that the write shape itself, the part of Open Question #6
most likely to have needed redesign, needed no changes at all.

**What does Project Nexus still only believe?** That `GET
/architecture/:id`'s continued existence is worth its keep, and that
provider-status discovery is better solved by a new endpoint than by
client-side synthesis — both genuinely open until Iteration 14 has a
real UI design to test them against.

**What architectural bets remain highest risk?** Whether Iteration 14
can build a UI on exactly this surface without needing anything more
than what this iteration's own investigation already flagged
(tree/breadcrumb navigation, provider-status display) — or whether a
real UI design surfaces a third category of gap neither this iteration
nor its own investigation anticipated.
