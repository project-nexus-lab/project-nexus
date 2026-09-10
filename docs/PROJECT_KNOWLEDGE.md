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

---

## Unproven

Real, specific hypotheses still open — not restated caution. Each has a
concrete experiment a future iteration can run directly.

| Assumption | Open since | Why it's still open | What would resolve it |
|---|---|---|---|
| Curated FileAnchors (§13 Alt. A) are worth their maintenance cost and don't silently rot | Iteration 0 | One hand-authored anchor, written in the same commit as everything it describes — zero elapsed time, zero maintenance evidence. §13 is explicitly undecided in the source document. | Observe a real anchor against a real repository that changes over time (post repository-bootstrap); answer §13.4's own four questions. |
| The MCP grant model (§9.5) actually bounds agent blast radius, not just describes an intention | Iteration 0 | No MCP server exists yet; the formula's missing half (`impactOf`) is now wired into `buildWorkPackage`, but nothing has ever attempted — and been refused — an out-of-grant call. | Build one MCP tool, issue one grant, assert an out-of-grant call is refused. |
| `WorkPackageProfile.context_depth` correctly bounds `impactOf` for depth > 0 | Iteration 0 | The seed dataset ships exactly one profile at `context_depth: 0`. The nonzero-depth code path went unexecuted for most of Iteration 0 without any test failing. | Seed a real profile at depth ≥ 1 against a component with a real multi-hop dependency chain; have a human judge whether the resulting impact set is useful. |
| The Architecture Change Proposal workflow (§5) closes the loop it's designed to close | Iteration 0 | Schema validated structurally only; nothing has ever drafted, approved, or applied a proposal. This is the mechanism v2 calls its single biggest addition over v1, and it has zero behavioral evidence. | Hand-drive one proposal through the full lifecycle against the existing schema, script-only, with a genuinely blocked Task released to `ready` at the end. |
| A component served by more than one repository resolves to a *usable* Work Package, not just a mechanically correct one | Iteration 0 | Only tested against a synthetic fixture built to trigger the ambiguity branch — no real content behind either repository. | Seed a second real repository against a real component; generate a Work Package with ambiguity allowed; have a human judge the result. |
| Runtime independence holds when a second adapter is actually built (§12.7's "one row, one class" claim) | Iteration 0 | Zero vendor strings exist in the core schemas today (real, static evidence) — but so do zero adapters, not one. That's necessary evidence, not sufficient evidence for a claim about adding a *second* one. | Build two trivial no-op adapters against the §12.2 port; confirm the second requires zero changes to any core schema. |
| Retirement is refused while live inbound references exist unless succession is supplied (§5.6) | Iteration 0 | No code path retires an element through any governed mechanism; the only place `status = 'retired'` is set bypasses policy entirely (it's a raw UPDATE, used to test the *build-side* gate only). | Implement retirement inside the proposal-application transaction; test that retiring a live-referenced element is refused there, not just noticed downstream. |
| The recursive-CTE traversal layer performs acceptably at realistic scale | Iteration 0 | Correctness proven at ~10 architecture elements, 5 work items, 1 dependency edge. Never measured against anything resembling a real organization's graph. | Generate a synthetic graph at representative scale (e.g. 500 components, 2,000 tasks, depth 5); measure traversal latency against the MCP call budget. |

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

---

## Open Questions

Important unresolved issues, in priority order. These are broader than any
single row above — several draw together multiple Unproven entries into
one architectural bet.

1. **Does the Architecture Change Proposal / unblocking flow actually
   close the loop it's designed to close?** The platform's central promise
   over v1 — no orphan tasks, ever, even under delivery pressure (§5.1) —
   depends entirely on it, and it currently has zero implementation
   evidence behind a fully-built schema.
2. **Does runtime independence hold under an actual second adapter?** The
   Constitution's own top-line principle. Currently supported only by the
   absence of evidence against it (no vendor strings in core schemas), not
   by evidence for it (no adapters — first or second — have ever been
   built against the port).
3. **Is the MCP grant model a real enforcement boundary, or only a
   documented convention?** The stated reason RBAC was judged safe to defer
   in the MVP (§15). Currently a formula, not a demonstrated refusal.
4. **Should Nexus hold file-level knowledge at all?** §13 of
   `MVP_ARCHITECTURE_V2.md` is explicitly unresolved in the source
   document itself; Iteration 0 shipped Alternative A (curated
   FileAnchors) by default, not by evidence.
5. **Do the graph traversals hold up past toy scale?** Every traversal is
   correctness-proven; none has been measured against a graph resembling a
   real organization's architecture.

See the corresponding `docs/history/iteration-N/LESSONS.md` →
"Recommended Iteration N+1 Validation Targets" for the smallest experiment
that would move each of these.
