# Project Knowledge

The cumulative, evidence-based record of what is known about Project
Nexus's architecture — as distinct from what `docs/MVP_ARCHITECTURE_V2.md`
and its supporting documents *propose*. Updated at the end of every
iteration from that iteration's `docs/history/iteration-N/LESSONS.md`, per
the Iteration Discipline in `CLAUDE.md`.

This document only grows by evidence. An assumption moves from Unproven to
Validated or Invalidated only when an iteration actually demonstrates it —
not when it merely seems likely, and not when the architecture documents
assert it. Each entry names the iteration that last confirmed it, so a
stale entry (an area untouched for several iterations) is visible as such.

**Authority.** Per the Knowledge Distillation Rule (`CLAUDE.md`), this
document sits below the Constitution, the supporting model documents, and
the current architecture documents, and above historical iteration
reports:

1. `docs/NEXUS_CONSTITUTION.md`
2. Supporting model documents
3. Current architecture documents
4. **This document**
5. Historical iteration reports

Iteration reports inform this document. They do not replace it — this
document is current truth; they are historical record. For the reasoning,
code pointers, and full evidence behind any entry below, see the
corresponding iteration's `docs/history/iteration-N/LESSONS.md`. For a
narrative account of what was built, see
`docs/history/iteration-N/REPORT.md`.

---

## Validated

Demonstrated correct by direct implementation evidence.

| Assumption | Since | Evidence summary |
|---|---|---|
| One typed-tree aggregate per taxonomy (kind discriminator + `parent_id` + data-driven legal-containment), not per-kind aggregates, is sufficient for both Architecture and Work | Iteration 0 | Identical pattern (~50 lines) implemented independently for `architecture.element` and `work.work_item`; illegal containment rejected declaratively for both, with zero per-kind application code. |
| Legal containment and the no-orphan-task invariant can be enforced both declaratively (DB trigger/FK) and continuously (a query), without the two disagreeing | Iteration 0 | `orphanTasks()` and the import-time guard independently agree on every test case; a legitimate draft task with zero links is accepted by both, not just one. |
| The graph can be "a set of named recursive-CTE views over Postgres" (§8.1) with no graph database, for the traversal contract in §8.4 | Iteration 0 | All 8 traversals in scope implemented as plain SQL functions; correctness proven, including multi-hop `ancestry` and governance union across two elements. **Scale not yet tested — see Open Questions.** |
| `Component provides Capability` as a many-to-many join, not containment, correctly makes "zero providers" a first-class queryable state rather than a broken tree node (R2) | Iteration 0 | Multi-provider and zero-provider capabilities both demonstrated; primary-provider uniqueness enforced and tested. |
| `buildWorkPackage(taskId, profileId)` is a pure, idempotent function of graph state | Iteration 0 | Repeated calls against an unchanged graph return the same id and hash, across independent process runs, with exactly one persisted row — conditional on the content-hash correction recorded under Invalidated. |
| Stable ID validation holds at both the application boundary and the database boundary, and the two agree | Iteration 0 | Same pattern implemented as a TS regex and a Postgres `CHECK` constraint; both independently reject the same malformed inputs. |
| The Architecture Change Proposal lifecycle (§5) closes the loop it is designed to close — a Task blocked on missing architecture reaches `ready` again with no manual database edit | Iteration 1 | End-to-end test starting from a real `buildWorkPackage` gate failure, through draft → proposed → approved → applied, to a second successful `buildWorkPackage` call. Independently reproduced over real HTTP requests against a real `http.Server`. |
| `applyProposal`'s mint + retire + succession is genuinely transactional, not just schema-shaped | Iteration 1 | PGlite's rollback-on-throw behavior verified directly against this project's driver (not assumed); a proposal with one legal and one illegal operation leaves neither element behind and the proposal's state at `approved`, not `applied`. |
| §5.6's retirement policy (refused on a live Task or active Repository reference; permitted when the same proposal supplies succession) is fully specified by its two clauses and one escape hatch | Iteration 1 | Three isolated tests, one per clause, all passing against the real schema — no additional clause needed. |
| The §3.5 no-orphan-task invariant, extracted into one shared function, agrees with itself across every caller | Iteration 1 | `assertReadyInvariants` now serves both the Iteration 0 YAML-import guard and the new lifecycle `markReady` function; all 71 tests pass with one implementation instead of two. |

---

## Unproven

Real, specific hypotheses still open — not restated caution. Each has a
concrete experiment a future iteration can run directly.

| Assumption | Open since | Why it's still open | What would resolve it |
|---|---|---|---|
| Curated FileAnchors (§13 Alt. A) are worth their maintenance cost and don't silently rot | Iteration 0 | One hand-authored anchor, written in the same commit as everything it describes — zero elapsed time, zero maintenance evidence. §13 is explicitly undecided in the source document. | Observe a real anchor against a real repository that changes over time (post repository-bootstrap); answer §13.4's own four questions. |
| The MCP grant model (§9.5) actually bounds agent blast radius, not just describes an intention | Iteration 0 | No MCP server exists yet; the formula's missing half (`impactOf`) is wired into `buildWorkPackage`, but nothing has ever attempted — and been refused — an out-of-grant call. | Build one MCP tool, issue one grant, assert an out-of-grant call is refused. `alignment.liveReferences` (Iteration 1) is a second working example of the same read-only, cross-context query shape a grant check would need — reuse the pattern rather than inventing a new one. |
| `WorkPackageProfile.context_depth` correctly bounds `impactOf` for depth > 0 | Iteration 0 | The seed dataset ships exactly one profile at `context_depth: 0`. The nonzero-depth code path went unexecuted for most of Iteration 0 without any test failing. | Seed a real profile at depth ≥ 1 against a component with a real multi-hop dependency chain; have a human judge whether the resulting impact set is useful. |
| A component served by more than one repository resolves to a *usable* Work Package, not just a mechanically correct one | Iteration 0 | Only tested against a synthetic fixture built to trigger the ambiguity branch — no real content behind either repository. | Seed a second real repository against a real component; generate a Work Package with ambiguity allowed; have a human judge the result. |
| Runtime independence holds when a second adapter is actually built (§12.7's "one row, one class" claim) | Iteration 0 | Zero vendor strings exist in the core schemas today (real, static evidence) — but so do zero adapters, not one. That's necessary evidence, not sufficient evidence for a claim about adding a *second* one. | Build two trivial no-op adapters against the §12.2 port; confirm the second requires zero changes to any core schema. |
| The recursive-CTE traversal layer performs acceptably at realistic scale | Iteration 0 | Correctness proven at ~10 architecture elements, 5 work items, 1 dependency edge. Never measured against anything resembling a real organization's graph. | Generate a synthetic graph at representative scale (e.g. 500 components, 2,000 tasks, depth 5); measure traversal latency against the MCP call budget. |
| The in-process, direct-function-call form of `RunBlocked` / `ProposalApplied` (§2.2) will still be the right shape once a real Orchestrator (1f) exists | Iteration 1 | No event type, dispatcher, or subscription mechanism exists yet — "the event" is just which function gets called (`blockTask`, `releaseBlockedTasks`), by a test or a human today. | When 1f's Orchestrator is built, wire its `RunBlocked` handling to call these functions as real event effects; see whether the signatures survive or need reshaping around an actual event payload. |
| R-1's write-authorization boundary ("the runtime never holds a write credential") holds against a real caller, not just in the data model | Iteration 1 | The state machine enforces R-1's substance (agent-authored proposals are always `draft`; only a human principal can approve), but nothing yet distinguishes "the platform, acting on a genuine `RunBlocked` event" from "any HTTP caller" — Authentication remains out of scope. Not new, but newly testable now that a real HTTP surface exists. | Not this platform's evidence to gather until Authentication is in scope — revisit then rather than assuming the state machine alone was always sufficient. |

---

## Invalidated

Assumptions that implementation proved false, and how they were corrected.
An entry here means the *original* reading was wrong — not merely
underspecified — and the correction is now load-bearing: any future
reimplementation needs to be told this directly, because re-deriving it
from the architecture documents alone is not reliable.

| Assumption (as originally read) | Since | Why it was wrong | Correction |
|---|---|---|---|
| The Work Package payload is canonicalized and hashed as one linear pipeline — build the full payload including its own generated `id`, then hash it | Iteration 0 | Self-contradictory: `id` is only known after deciding a new row is needed, which is exactly what the hash lookup decides. Hashing `id` in means every call mints a new id — idempotency becomes unreachable by construction, not just unlikely. | Hash the payload **without** `id`; attach `id` to the persisted payload only after the hash has determined whether a matching row already exists. |
| `implementationPath` (§8.4) is a literal chain of INNER JOINs following the stated arrow-path | Iteration 0 | An affected capability with zero providers, or a component with zero mapped repositories, disappears from the result set entirely instead of surfacing — so the generation gate's own precondition checks (§11.2 step 1) become structurally unobservable. | Both joins are LEFT JOINs; a missing link surfaces as a row with a null column, which the gate explicitly checks for. |
| Architecture-context code may read Work and Repository tables directly to evaluate §5.6's retirement policy, since the policy is stated as something the Architecture Change Proposal enforces | Iteration 1 | §2.3's declared dependency table lists no read dependency from Architecture to Work or Repository in either direction — only the reverse. The first implementation of `applyProposal`'s retirement check queried both directly, a real violation of a table this project treats as authoritative, not a hypothetical one. | Moved the check into `alignment.live_references()` — Alignment is declared read-only across every context (§2.1) specifically so a check like this does not have to be embedded in the context that would otherwise have to reach outside its own boundary to make it. |

---

## Open Questions

Important unresolved issues, in priority order. These are broader than any
single row above — several draw together multiple Unproven entries into
one architectural bet.

1. **Does runtime independence hold under an actual second adapter?** The
   Constitution's own top-line principle. Currently supported only by the
   absence of evidence against it (no vendor strings in core schemas), not
   by evidence for it (no adapters — first or second — have ever been
   built against the port).
2. **Is the MCP grant model a real enforcement boundary, or only a
   documented convention?** The stated reason RBAC was judged safe to defer
   in the MVP (§15). Currently a formula, not a demonstrated refusal —
   though Iteration 1's `alignment.liveReferences` is now a second working
   example of the cross-context, read-only query shape a real grant check
   would need.
3. **Should Nexus hold file-level knowledge at all?** §13 of
   `MVP_ARCHITECTURE_V2.md` is explicitly unresolved in the source
   document itself; Iteration 0 shipped Alternative A (curated
   FileAnchors) by default, not by evidence.
4. **Do the graph traversals hold up past toy scale?** Every traversal is
   correctness-proven; none has been measured against a graph resembling a
   real organization's architecture.

Resolved as of Iteration 1, removed from this list: *does the Architecture
Change Proposal / unblocking flow actually close the loop it's designed to
close?* — see Validated, above.

See the corresponding `docs/history/iteration-N/LESSONS.md` →
"Recommended next-step validation" for the smallest experiment that would
move each of these.
