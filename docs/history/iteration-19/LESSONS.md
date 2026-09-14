# Iteration 19 Lessons

Not a status report (`docs/history/iteration-19/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 19 wired four already-existing, already-validated mechanisms
together for the first time — Technology Profile resolution (15),
Decision governance (16), real push/branch/PR (17), and the alignment
endpoint's own indifference to unrecognized files (18) — to answer the
narrow, prerequisite question Iteration 15's own "Phase 4" deferred:
can a resolved Technology Profile reach a generated repository at all?
It can, confirmed against a real, live GitHub repository, not only a
hermetic fixture. The one real correctness gap this iteration's own
`/review` found was not in the new resolution logic itself, but in an
ambiguity the existing schema has always structurally allowed and
nothing before this iteration ever had reason to check for.

---

## Validated

### Assumption

A resolved Technology Profile can be projected into a real, generated
repository as a new, additive file, with zero effect on every repository
that has none assigned.

### Status

VALIDATED

### Evidence

`render()` produces a fourth file only when a non-null
`technologyProfile` is passed in; every pre-existing
`repository.test.ts` test (none of which ever passes one) continues to
pass unmodified, confirming the additive claim directly rather than by
inspection of the diff alone. A real, live run created a real Decision
and Technology Profile, assigned it to a real Product, and confirmed
`generateProjection()` produced exactly four real files for that
repository — the fourth independently verified via `gh pr view`/`gh api`
to match `generateProjection()`'s own real output byte-for-byte.

### Consequence

The narrow, prerequisite question behind Iteration 15's deferred "Phase
4" is answered: the resolution mechanism reaches a real repository.
Synthesizing real scaffolding content from it remains a separate,
larger, still-unattempted claim.

---

### Assumption

`repo.generated_region`'s existing hash-and-drift-check mechanism
(Iteration 4), built for three files, requires no changes to cover a
fourth.

### Status

VALIDATED

### Evidence

`generateProjection()`'s existing loop iterates every `ManagedFile`
`render()` returns; a real row appeared for
`.nexus/technology-profile.json` after a real `generateProjection()`
call in the live run, using the identical, unmodified insert statement
every other file already uses.

### Consequence

No schema migration was needed for this iteration — confirmed, not
merely predicted from reading the loop before running anything real
against it.

---

### Assumption

The new file avoids the exact footprint smell the Iteration 17 Artifact
Review found in `nexusBaseUrl` — mixing genuine architecture knowledge
with environment/deployment configuration.

### Status

VALIDATED, checked against real, pushed content, not only the code that
produces it.

### Evidence

The actual `.nexus/technology-profile.json` content fetched via `gh api`
during the live run contains exactly `{profileId, category, language,
languageVersion, buildSystem, decisionId}` — every field traceable to
`resolveTechnologyProfile()`'s own already-governed return shape, none
of it a URL, environment reference, or deployment setting.

### Consequence

The lesson named during the Iteration 17 Artifact Review shaped a real
design decision this time, confirmed against real output rather than
merely asserted as an intention going in.

---

## Invalidated

### Assumption

The repository's primary-mapped component is unambiguous whenever at
least one exists — implicit in the first implementation, never stated
as a hypothesis because it seemed too obvious to name.

### Status

INVALIDATED, found during `/review`, before this Report was written.

### Evidence

`repository_component_primary_uq` (`db/migrations/0004_repo.sql`) is a
unique index on `component_id` alone, guarded by `where is_primary` — it
prevents the *same* component from being primary for two different
repositories. It does not prevent one repository from independently
marking two of its own *distinct* mapped components primary; nothing
in the schema or in `registerMapping()` guards against that. The
original `mappings.find((m) => m.is_primary)` would have silently
picked whichever such component sorted first, with no diagnostic.

### Resolution

Technology Profile resolution now requires *exactly one* primary-mapped
component; zero or more than one both fall back to no resolution — the
same ambiguity-averse pattern this project already applies elsewhere
(`allow_ambiguous_repo`). A new regression test seeds two distinct
primary-mapped components for one repository and confirms exactly three
files result.

### Consequence

A real, if narrow, correctness gap that no prior iteration had reason
to encounter — `is_primary` had only ever been used to disambiguate
*which repository* implements a component (`repository_component_primary_uq`'s
own stated purpose), never to identify *which component* a single
repository should be resolved against. This iteration is the first
consumer of that second meaning, and the first to find the schema
doesn't enforce it.

---

## Unproven

### Assumption

A repository whose mapped components genuinely span more than one
Product resolves sensibly (silently, no profile) rather than needing
its own explicit handling.

### Why It Remains Unproven

Inherits, rather than resolves, the already-Unproven Repository/Task
single-Product-ownership question (Iteration 14a/15 architecture
clarification). This iteration's own primary-component heuristic
assumes the common case; no real or constructed scenario in this
iteration tests a repository that violates it.

### How To Validate

Construct a real repository mapping components from two different
Products, mark one primary, and observe whether the resolved Technology
Profile (that primary component's own Product) is the correct or even
sensible answer for a repository that is not really single-Product in
practice.

---

### Assumption

Hardcoding the `backend` category is the right long-term choice, not
merely the cheapest one for a first slice.

### Why It Remains Unproven

No second category has ever had real data (Iteration 15's own
limitation, unchanged). Determining which category a Component or
Repository itself belongs to still has no schema field anywhere — this
iteration sidesteps the question by hardcoding, it does not answer it.

### How To Validate

Populate a second real category (`frontend`/`data`/`infrastructure`)
for a real Product, and decide — with a concrete scenario in hand,
not speculatively — whether repository generation needs a real
category-classification field or whether hardcoding remains sufficient
because repositories in practice only ever need one category's profile.

---

## Biggest Surprise

Not that Technology Profile resolution worked end-to-end against a real
repository — `docs/history/iteration-19/SCOPE.md` had already traced
every mechanism this iteration composes and found each one already
validated. The surprise was smaller and structural: `is_primary`, a
column this project has used since Iteration 0 to disambiguate *which
repository* implements a component, turned out to have a second,
unenforced meaning — *which component, among several a single
repository maps, is the one that matters* — the moment a second
consumer (this iteration) needed to ask that second question of the
same column. The schema was never wrong; it simply had never been asked
this before.

---

## Final Verdict

**What does Project Nexus now know?** That a resolved Technology
Profile can reach a real, generated repository as a genuinely additive
projection, confirmed against a real GitHub PR's own real content, not
only a hermetic fixture; that `repo.generated_region`'s existing
mechanism needed nothing new to cover a fourth file; and that
`is_primary`'s existing meaning (disambiguating which repository serves
a component) does not, on its own, also disambiguate which component a
repository's own generation should resolve against — a real, structural
gap this iteration found and closed for its own purposes, not for every
future consumer of that column.

**What does Project Nexus still only believe?** That hardcoding
`backend` is sufficient until a second category is real; that a
repository spanning more than one Product resolves sensibly under this
iteration's own heuristic.

**What architectural bets remain highest risk?** Whether repository
generation ever needs a real category-classification field, rather than
continuing to hardcode `backend` — unresolved since the Iteration 14a/15
architecture-clarification session, and still unresolved now, by
design: this iteration answers the narrower question of whether
resolution reaches generation at all, not the broader one of how
categories get assigned to components in the first place.
