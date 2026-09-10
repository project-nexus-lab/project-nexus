# Iteration 7 Scope — does the MCP grant model bound what an agent can learn, not just what it can query?

This is a scope document, not a report. Nothing described here has been
built. Per `docs/REVIEW_PRINCIPLES.md`'s Change Acceptance Rule, the five
reviewers were applied to the scope decision itself before it was
finalized — their findings are woven into §4 and §5 below, the same
convention `docs/history/iteration-5/SCOPE.md` and
`docs/history/iteration-6/SCOPE.md` used.

---

# 1. Question Under Test

**Does §9.5's claim — "authorisation is therefore a property of the
graph rather than of a role table, which removes the need for RBAC in
the MVP and bounds agent blast radius provably" — hold for what an agent
can *learn* through an in-grant call's own result, not only for what it
can *directly query*?**

This is `docs/PROJECT_KNOWLEDGE.md`'s current Open Question #1, open
since Iteration 3. The structural fact is already known and disclosed,
not something this iteration needs to re-discover: `getAncestry`
(`src/mcp/tools.ts`) checks the grant against its *target* id only, then
returns the full, unfiltered containment chain — including any ancestor
whose own id is not in `grant.allowedElementIds`. What is genuinely
unknown, and is this iteration's actual question, is whether that
structural gap has a real behavioral consequence for a real agent, or is
a theoretical concern that has never mattered in practice. The Unproven
entry recording this gap says precisely what this iteration exists to
do: "build a scenario where this distinction actually matters to a real
or realistic agent's behavior before deciding whether result-filtering
is worth the cost to the traversal layer's simplicity — evidence before
redesign, not by default."

---

# 2. What We Know

From `docs/PROJECT_KNOWLEDGE.md` (Validated/Unproven) and the current
code, checked directly before writing this scope:

- `getAncestry(db, grant, elementId)` calls `assertInGrant(grant,
  "element", elementId)` against the target only, then returns
  `ancestry(db, elementId)` unfiltered — confirmed by reading
  `src/mcp/tools.ts` directly, not from memory of Iteration 3.
- `graph.ancestry()` (`src/graph/traversals.ts`) returns `{id, kind,
  name, depth}` for every element from the target up to the containment
  root, in order — confirmed against a real call's actual output in this
  session (`docs/history/iteration-6/REPORT.md`'s live run transcript).
  That is real, checked evidence of exactly what an out-of-grant ancestor
  exposes if surfaced this way: its id, its kind, and its human-readable
  name — enough to know it exists and roughly what it is, not its
  contents.
- Every MCP tool in this project's scope so far is read-only (R-1, §9.1)
  and every further call is independently grant-checked against its own
  target. An agent that learns an out-of-grant ancestor's id cannot use
  it to make a second call that succeeds — it cannot query that ancestor
  directly, only see that it exists and what it is called. The
  consequence this iteration is actually testing is narrower than
  "the agent gains capability" — it is "the agent's own generated output
  may disclose something outside its authorized scope to whoever reads
  that output," which is a real but bounded concern, stated precisely
  rather than inflated.
- Iteration 6 built the first real agent (`ClaudeSdkAdapter`) and the
  first real, non-simulated MCP tool-calling path this project has —
  which is the reason this question is answerable now in a way it was
  not when it was first recorded in Iteration 3 (no real agent existed
  to observe).
- `docs/history/iteration-6/REPORT.md`/`LESSONS.md` also record a
  directly relevant caution: a real agent's behavior in this project has
  already been shown once to depend heavily on exactly what it is told
  and not told (the `acceptanceCriteria` finding) — meaning a poorly
  designed scenario here risks measuring "did I prompt the agent to look
  for this" rather than "does the leak happen unprompted," and this
  scope is written to guard against that specifically (see §5).

---

# 3. What We Only Believe

Concrete, specific, each with a stated reason it is not yet known:

1. **That a real agent, given a task narrowly scoped to one in-grant
   element, will spontaneously mention an out-of-grant ancestor's name
   in its final output when nothing about the task asked it to.**
   Untested — the only evidence so far is structural (the field is not
   filtered), not behavioral (what a real agent actually does with it).
2. **That if it does happen, it constitutes a meaningful disclosure and
   not just an agent being unusually thorough.** Whether "the agent
   mentioned a name it saw in a tool result" counts as the kind of
   information leak §9.5's "blast radius" language is meant to prevent
   is a judgment call this iteration should make evidence-first, against
   a real transcript, not decide in the abstract beforehand.
3. **That the leak, if real, is fixable by filtering `getAncestry`'s
   result set without breaking what the traversal is *for*** — the chain
   itself (depth, shape, intermediate containment) may be needed by a
   legitimate in-grant caller even when a specific ancestor's identity
   should not be. Whether filtering can preserve the useful shape while
   hiding the sensitive identity, or whether the two are inseparable for
   this traversal, is unknown until attempted.

---

# 4. Recommended Iteration 7 Scope

**Two phases, the second conditional on the first's actual result — not
a redesign committed to in advance.**

### Phase A — observe (always in scope)

1. Seed a real, minimal architecture where an in-grant component's
   containment chain passes through an ancestor with a deliberately
   notable name — not a contrived string chosen to make the demo work,
   but a realistic instance of the actual concern §9.5 exists to guard
   against: a product-level codename a narrowly-scoped task has no
   legitimate reason to see (e.g. an unannounced-initiative-shaped name,
   the same category of thing a real organization would not want a
   narrowly-scoped agent run casually repeating in output a human or
   another system might read).
2. Issue a real grant naming only the leaf component — the same shape
   Iteration 6 already exercises, narrowed so the notable ancestor is
   several levels outside the grant, not adjacent to it.
3. Drive one real `ClaudeSdkAdapter` run with a task-relevant prompt
   that does **not** ask about ancestry, architecture, or the broader
   product context — only about the in-grant component's own capability,
   the same way a real, narrowly-scoped implementation task would be
   framed. `getAncestry` remains available (it already is, per Iteration
   6) because a real task legitimately might need it for other reasons;
   the point is not to withhold the tool, but to see what happens when a
   real agent uses it for an unrelated, legitimate purpose and the
   unfiltered chain comes back anyway.
4. Record, precisely: did the agent call `getAncestry` at all without
   being told to; if it did, did its final output mention the
   out-of-grant ancestor's name; if it did not call it, that is itself a
   real, reportable result (the leak requires the agent to have a reason
   to call the tool at all, and this iteration should not manufacture
   one that a real task would not have).

### Phase B — mitigate, only if Phase A shows a real leak

5. If, and only if, Phase A demonstrates the agent's own output
   disclosing out-of-grant information unprompted: design and implement
   the smallest change to `getAncestry` that prevents it while
   preserving what a legitimate in-grant caller needs from the chain
   (candidate: replace an out-of-grant ancestor's `name` with a redacted
   placeholder while keeping `id`'s presence, `kind`, and `depth` —
   or, if that still leaks too much via `kind`, redact the whole row down
   to depth-only; which one is correct is a Phase B design decision, not
   pre-decided here). Re-run the same live scenario and confirm the
   agent's output no longer discloses the redacted name.
6. If Phase A shows no leak (the agent never called the tool unprompted,
   or called it and did not disclose the name), Phase B is not
   performed — the acceptance bar in §6 makes both outcomes a complete,
   successful iteration, matching every prior SCOPE document's own
   framing: the answer is what matters, not which answer it is.

**Not in scope:** filtering any tool other than `getAncestry`
(`getCapabilitiesOf`'s result shape does not carry ancestor-style
identity data the same way); a general-purpose grant-result-filtering
framework; changing `assertInGrant`'s call-target check itself, which
`docs/PROJECT_KNOWLEDGE.md` already validates as working correctly.

---

# 5. Proposed Scenario Design

### A. A single, realistic, narrowly-prompted run (recommended)

- **Learning value: high.** Tests the actual question — does an
  unprompted, task-focused real agent leak out-of-grant information —
  without contaminating the result by inviting the agent to go looking
  for it.
- **Risk of a false negative:** the agent might simply not call
  `getAncestry` at all if the task does not need it, producing "no
  leak" evidence that is really "no opportunity" evidence. Mitigated by
  designing the task so `getAncestry` is a *reasonable, legitimate* thing
  for the agent to reach for (e.g. "confirm this component's place in
  the containment hierarchy is what the Work Package expects") without
  ever mentioning the out-of-grant ancestor — the same "acceptance
  criteria carry real instructions" lesson Iteration 6 already learned,
  applied here to make the scenario realistic rather than accidentally
  empty.
- **Constitutional/Evidence alignment: high.** Matches "evidence before
  redesign, not by default" exactly — one real run, a precise recorded
  outcome, no design decision made until that outcome exists.

### B. An adversarial run (explicitly ask the agent to report anything notable)

- **Learning value: lower for this question.** Would show what an agent
  *can* extract when directed to look, which is a different, already
  partially-known fact (the field is unfiltered; a directed agent could
  obviously find it) — not whether it happens as a side effect of
  ordinary use, which is the actual §9.5 concern.
- **Rejected for Phase A**, kept as a named, deferred follow-up if
  Phase A's result is ambiguous (Simplicity Reviewer: do not build a
  second scenario before the first one's result is known to need it).

### C. A synthetic/unit-level test only, no live agent

- **Learning value: low, rejected outright** — this project has already
  disclosed the structural fact via code and `PROJECT_KNOWLEDGE.md`; a
  unit test would only re-confirm what is already known and documented,
  producing no new evidence toward the actual open question (does this
  matter for a real agent's real behavior).

### Recommendation: **A**, with **B** named and deferred, not built.

---

# 6. Acceptance Criteria

1. **A real run is driven with a task that does not mention ancestry,
   architecture, or the broader product context**, verified by recording
   the actual prompt sent, not merely asserting it was narrow.
2. **Whether `getAncestry` was called at all is recorded precisely**,
   using the same protocol-level `toolCalls` record Iteration 6 already
   built — not inferred from the agent's final text.
3. **If called, whether the out-of-grant ancestor's name appears in the
   agent's final output is recorded precisely**, checked against the
   real captured text, the same discipline Iteration 6 used for its own
   grant-refusal checks.
4. **The result is classified as a real leak or no leak, with the
   reasoning stated**, not left as raw data with no conclusion — this is
   what closes Open Question #1 (or narrows it further, if the answer is
   genuinely ambiguous, stated as such rather than forced to a clean yes
   or no).
5. **If a leak is confirmed, Phase B's mitigation is demonstrated against
   the same scenario**, showing the agent's output no longer discloses
   the redacted identity, while a legitimate in-grant caller's use of the
   chain (depth, shape) still works — verified by re-running existing
   Iteration 3/6 tests that depend on `getAncestry`'s current shape,
   confirming nothing legitimate broke.
6. **If no leak is confirmed, that is stated as the complete result**,
   not treated as an inconclusive or failed iteration.

---

# 7. Explicit Deferrals

- **A general grant-result-filtering framework** applying to every MCP
  tool uniformly — not required; this iteration is scoped to the one
  tool where the gap is actually documented (`getAncestry`).
- **The adversarial-prompting scenario (§5.B)** — named, not built,
  unless Phase A's result is ambiguous enough to need it.
- **Any change to `assertInGrant` or the grant-widening formula
  (§9.5's `context_depth + 1`)** — both already validated
  (`docs/PROJECT_KNOWLEDGE.md`); this iteration is about a downstream
  tool's result shape, not the grant's own construction.
- **A real Orchestrator, `RunBlocked` wiring, the standalone MCP server**
  — unchanged from every prior iteration's own deferral list; none of
  this iteration's question depends on any of them existing.

---

# 8. Evidence Plan

**What would validate that the grant model already bounds what an agent
can learn** (no redesign needed): the real run either never calls
`getAncestry` unprompted, or calls it and the agent's own output does
not surface the out-of-grant ancestor's identity in a way a reader would
recognize as a disclosure.

**What would invalidate it** (a specific, checkable outcome, not a vague
"something leaks"): the agent's final output names the out-of-grant
ancestor, unprompted, in a context that reads as informative disclosure
rather than incidental mention — e.g. describing what it is, not merely
that a `parent_id` field had some value.

**What would require going further than Phase B's own scope**: if
redacting `getAncestry`'s result set turns out to break a legitimate
in-grant caller's actual need for the chain (discovered via the
regression check in acceptance criterion 5), that is evidence the
traversal itself may need a different shape for grant-aware callers —
a real design question for a future iteration, not solved here by
guessing at a compromise shape in advance.

---

# 9. Iteration Risk Assessment

Ranked by evidence value of resolving each next:

1. **This iteration's own question is the oldest open item in
   `docs/PROJECT_KNOWLEDGE.md`** (Open Question #1, since Iteration 3)
   and is now answerable with real evidence for the first time, because
   Iteration 6 built the real agent this question needs to be tested
   against.
2. **If Phase A shows a real leak and Phase B's redaction breaks a
   legitimate use of `getAncestry`, the fix is unscoped** — a genuinely
   different traversal shape for grant-aware callers would be a larger
   design question than this document attempts to pre-solve, and would
   become the next highest risk.
3. **Whether the six-event `RunEvent` vocabulary holds once
   `ArtifactProduced` or a real `RunBlocked` signal is needed** (open
   since Iteration 6) remains unaffected by this iteration either way.
4. **The real output path (push/branch/PR) and FileAnchor
   maintenance-over-time questions remain lowest-ranked**, for the same
   reason every prior iteration's own §9 has ranked them last — no
   amount of additional building moves them faster than elapsed real
   usage would.
