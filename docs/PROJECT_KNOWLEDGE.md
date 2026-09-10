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
| Runtime independence holds when a second adapter is built against the §12.2 port — adding it costs "one row, one class" (§12.7), for adapters with no real behavioral complexity | Iteration 2 | Three independent checks: a structural test asserting the second adapter's only import is the port; an import-surface diff against the first adapter showing zero new dependencies; `port.ts` and `registry.ts` each written once and never touched again to accommodate the second adapter. **Validated for trivial adapters only — see Unproven for the real-adapter case.** |
| The MCP grant model (§9.5) is a real enforcement boundary: an out-of-grant tool call is refused, an expired grant refuses everything | Iteration 3 | Three independent forms of evidence: an in-process test, an HTTP-driven test against a real `http.Server`, and a hand-run `curl` transcript, all reproducing the same issue-grant → succeed-in-grant → refuse-out-of-grant sequence. **Validated for direct call-target enforcement only — see Unproven for the narrower "can still learn X exists" gap.** |
| §9.5's grant-widening formula (`allowedElementIds = WP elements ∪ impactOf(components, context_depth + 1)`) is genuinely wider than the Work Package's own bound, not the same value computed twice | Iteration 3 | The seed's one-hop `comp.invoice-service dependsOn comp.payment-service` edge is present in the grant (`context_depth + 1 = 1`) but absent from the Work Package's own `impactedComponents` (`context_depth = 0`), asserted together in one test. |
| The managed-region mechanism (§10.4) genuinely distinguishes a human edit outside the markers (no false drift) from one inside (drift correctly detected) | Iteration 4 | §16's own literal acceptance bar for this work, reproduced directly: prepend/append text outside the markers → no drift, unchanged hash; mutate a value inside the markers → drift, changed hash; markers deleted entirely → drift, not a crash. |
| `render()` (§10.4) is genuinely a pure function of graph state — identical inputs produce byte-identical output | Iteration 4 | Regenerating a repository's projection and comparing every file against itself via `checkDrift` finds zero drift, achieved by sorting inputs inside `render()` rather than trusting caller order — the same discipline `buildWorkPackage`'s canonical payload already required in Iteration 0. |
| The repository bootstrap state machine (§10.1) enforces its own transition order as a real invariant, not just a `bootstrap_state` column nobody checks | Iteration 4 | Every one of the five transitions tested both legally and illegally from a non-immediate-predecessor state; `registerMapping` confirmed legal a second time once already `mapped` ("at least one," not "exactly one," per §3.6). Third independent implementation of the same typed-state-machine pattern already used for `ArchitectureChangeProposal` and `WorkItem`. |
| The `VcsProvider` port's type signature, and the bootstrap state machine built against it, require no changes to accommodate a real GitHub-backed implementation | Iteration 5 | A real, private GitHub repository was provisioned via `GhCliVcsProvider`, independently confirmed with a separate `gh repo view` call, then driven unmodified through `registerMapping → generateProjection → activateRepository` to `active`. Zero lines of `src/repository/lifecycle.ts` changed. **One real design choice was needed to keep the port's type unchanged (visibility moved to adapter configuration, not the port's input) — see Unproven.** |
| `provisionRepository`'s call-then-write sequence is safe under a real provider failure — the repository is left cleanly at `declared`, not in an inconsistent state | Iteration 5 | A genuine GitHub API failure (a real name collision, not simulated) left `bootstrap_state` at `declared`, checked directly against the database; a retry against the same repository was then confirmed legal. Closes the exact gap Iteration 4 named as its own top Unproven item. |
| Keeping Nexus's minted `id` separate from a provider's own reference (`provider_ref`) — two columns since Iteration 0 — was necessary, not merely cautious | Iteration 5 | The real repository's Nexus id and its GitHub name differed in every character but a shared timestamp suffix; GitHub raised no objection to either independently, and nothing in this iteration would have worked had the two been forced to be the same string. |

---

## Unproven

Real, specific hypotheses still open — not restated caution. Each has a
concrete experiment a future iteration can run directly.

| Assumption | Open since | Why it's still open | What would resolve it |
|---|---|---|---|
| Curated FileAnchors (§13 Alt. A) are worth their maintenance cost and don't silently rot | Iteration 0 | One hand-authored anchor, written in the same commit as everything it describes — zero elapsed time, zero maintenance evidence. §13 is explicitly undecided in the source document. | Observe a real anchor against a real repository that changes over time (post repository-bootstrap); answer §13.4's own four questions. |
| `WorkPackageProfile.context_depth` correctly bounds `impactOf`, and the grant's `context_depth + 1` widening composes correctly on top, for depth > 0 | Iteration 0, extended Iteration 3 | The seed dataset ships exactly one profile at `context_depth: 0`; only `impactOf(..., 1)` (the grant's case) has ever been exercised. A profile at depth ≥ 1 — where the Work Package itself already includes one-hop impact and the grant would need to widen one level *further* — has never been built. | Seed a real profile at depth ≥ 1 against a component with a real multi-hop dependency chain; check both the Work Package's own impact set and the grant built from it. |
| A component served by more than one repository resolves to a *usable* Work Package, not just a mechanically correct one | Iteration 0 | Only tested against a synthetic fixture built to trigger the ambiguity branch — no real content behind either repository. | Seed a second real repository against a real component; generate a Work Package with ambiguity allowed; have a human judge the result. |
| The recursive-CTE traversal layer performs acceptably at realistic scale | Iteration 0 | Correctness proven at ~10 architecture elements, 5 work items, 1 dependency edge. Never measured against anything resembling a real organization's graph. | Generate a synthetic graph at representative scale (e.g. 500 components, 2,000 tasks, depth 5); measure traversal latency against the MCP call budget. |
| The in-process, direct-function-call form of `RunBlocked` / `ProposalApplied` (§2.2) will still be the right shape once a real Orchestrator (1f) exists | Iteration 1 | No event type, dispatcher, or subscription mechanism exists yet — "the event" is just which function gets called (`blockTask`, `releaseBlockedTasks`), by a test or a human today. | When 1f's Orchestrator is built, wire its `RunBlocked` handling to call these functions as real event effects; see whether the signatures survive or need reshaping around an actual event payload. |
| R-1's write-authorization boundary ("the runtime never holds a write credential") holds against a real caller, not just in the data model | Iteration 1 | The state machine enforces R-1's substance (agent-authored proposals are always `draft`; only a human principal can approve), but nothing yet distinguishes "the platform, acting on a genuine `RunBlocked` event" from "any HTTP caller" — Authentication remains out of scope. Not new, but newly testable now that a real HTTP surface exists. | Not this platform's evidence to gather until Authentication is in scope — revisit then rather than assuming the state machine alone was always sufficient. |
| The near-zero marginal cost of a second adapter (validated, above) holds for a *real* adapter — one expressing actual behavioral differences (streaming, tool-call translation, vendor config) through the port, not a canned event sequence | Iteration 2 | Both adapters built so far are deliberately trivial; neither exercised anything the port might need to grow to support (structured tool calls, streaming delivery, per-vendor configuration surfaced through `capabilities()`). | Build the Claude SDK Adapter (§12.7), the first real adapter, and re-run the same three checks (structural, comparative, no-second-pass on the port/registry) against it. |
| The grant model bounds what an agent can *learn*, not only what it can *directly query* | Iteration 3 | `getAncestry`'s grant check applies to its target id only; the returned ancestry chain is not filtered against `allowedElementIds`, so an in-grant call can surface the id, kind, and name of an out-of-grant ancestor (e.g. the containment root). A disclosed, deliberate reading of an ambiguous line in §9.5, not a bug — but it makes the *provable* blast-radius bound narrower than "the agent cannot learn X exists." | Build a scenario where this distinction actually matters to a real or realistic agent's behavior before deciding whether result-filtering is worth the cost to the traversal layer's simplicity — evidence before redesign, not by default. |
| A real adapter can actually use a grant to drive genuine (non-simulated) MCP protocol calls | Iteration 3 | Grant construction and enforcement are validated against direct function calls and HTTP requests written for this iteration's own tests — never against a real MCP client/server exchange, because no real MCP protocol server exists (deliberately deferred, see `docs/history/iteration-3/REPORT.md`). | Build the real MCP protocol layer (§16 1e) and the Claude SDK Adapter (§12.7) together, and check whether the grant as currently shaped is sufficient for an actual tool-call round trip. |
| Repository visibility (and by extension other per-repository provisioning choices — organization, license, gitignore template) belongs on the `VcsProvider` port's per-call input, not adapter-level configuration | Iteration 5 | `GhCliVcsProvider` took visibility as a constructor parameter, fixed once per provider instance, specifically to keep the port's type unchanged — untested against a run that needs two different visibilities through one process. | Attempt to provision two repositories with different visibility in the same run; see whether adapter-level configuration holds up or the decision needs to move onto the port's input. |
| The bootstrap mechanism's success provisioning a real repository predicts success for the rest of §10.2's flow — pushing `generateProjection`'s output, creating a branch, opening a PR | Iteration 5 | Explicitly out of scope this iteration (`docs/history/iteration-5/SCOPE.md` §4); provisioning (`gh repo create`, GitHub's REST API) and pushing content (`git` operations) are different operations against different parts of GitHub's surface, with their own untested failure modes. | Write `generateProjection`'s managed-region files to disk, commit, push a branch, and (if going as far as §10.2 step 5) open a PR against a real repository; check whether that succeeds the way provisioning did. |

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
| `gh repo create` supports a `--json` flag for structured output, the same way `gh repo view` does | Iteration 5 | Checked directly against `gh repo create --help` before writing any adapter code: no such flag exists for this subcommand. It prints a bare repository URL to stdout on success and nothing structured. | `extractOwnerRepo()` parses `owner/name` out of the URL with a regular expression; error classification (`mapGhError`) is necessarily stderr-text-pattern-based for the same reason. |
| Existing `gh` credentials are sufficient for the whole exercise — creation and cleanup both | Iteration 5 | Creation succeeded with the token's `repo` scope. Deletion failed: GitHub requires the separate `delete_repo` scope, which the authenticated token does not have. "Is the runtime authenticated" and "is the runtime authorized for this specific operation" are different questions. | `verify-github.ts` treats deletion failure as an expected, handled outcome, printing the manual cleanup command rather than crashing; deletion was never added to the `VcsProvider` port itself. |

---

## Open Questions

Important unresolved issues, in priority order. These are broader than any
single row above — several draw together multiple Unproven entries into
one architectural bet.

1. **Does the MCP grant model bound what an agent can *learn*, not only
   what it can *directly query*?** Iteration 3 validated call-target
   enforcement (see Validated, above); a call result can still surface the
   existence and basic metadata of an element outside the grant when that
   element sits on a legitimately-reachable traversal path (e.g. a
   containment root). Narrower than "resolved," not the same as "open" —
   see Unproven, above, for exactly what remains.
2. **Does runtime independence hold for a *real* second adapter, not just
   two deliberately trivial ones?** Iteration 2 validated the marginal
   cost for adapters with no behavioral complexity (see Validated, above);
   whether that holds once an adapter has real work to translate through
   the port is unresolved until the Claude SDK Adapter (§12.7) exists.
3. **Should Nexus hold file-level knowledge at all?** §13 of
   `MVP_ARCHITECTURE_V2.md` is explicitly unresolved in the source
   document itself; Iteration 0 shipped Alternative A (curated
   FileAnchors) by default, not by evidence.
4. **Do the graph traversals hold up past toy scale?** Every traversal is
   correctness-proven; none has been measured against a graph resembling a
   real organization's architecture.
5. **Does every mechanism validated against a no-op/fake stand-in
   (`AgentRuntimeAdapter`, the MCP protocol boundary, `VcsProvider`) hold
   once the real thing behind it exists?** Not one question but a
   recurring shape of one. Answered a second time, cleanly, as of
   Iteration 5 for `VcsProvider` specifically — the port and bootstrap
   state machine survived contact with real GitHub unmodified (see
   Validated, above). The *pattern itself* stays open as its own entry:
   two of three tracked instances (`VcsProvider`, and the MCP-grant
   direct-call-target case in Iteration 3) have now resolved favorably;
   the Claude SDK Adapter instance (Question 2, below) has not yet been
   attempted at all.

Resolved as of Iteration 1, removed from this list: *does the Architecture
Change Proposal / unblocking flow actually close the loop it's designed to
close?* — see Validated, above.

Resolved as of Iteration 2 for the trivial case, narrowed rather than
removed: *does runtime independence hold under an actual second adapter?*
— replaced above by the real-adapter question that remains.

Resolved as of Iteration 3 for direct call-target enforcement, narrowed
rather than removed: *is the MCP grant model a real enforcement boundary,
or only a documented convention?* — replaced above by the narrower
information-exposure question that remains.

Resolved as of Iteration 5 for the `VcsProvider` port and bootstrap state
machine specifically: *does the repository bootstrap mechanism hold once a
real `VcsProvider` exists?* — see Validated, above. Two narrower questions
survive in its place (visibility's place in the model; whether
provisioning success predicts push/branch/PR success) — see Unproven,
above.

A note on numbering, added after this document's own numbered rankings
were twice quoted stale in other files' prose (`docs/history/iteration-2/`
and `iteration-3/REPORT.md`, both corrected): treat the order above as
current only as of whichever iteration most recently edited it — check
this file directly rather than trusting a number repeated elsewhere.

See the corresponding `docs/history/iteration-N/LESSONS.md` →
"Recommended next-step validation" for the smallest experiment that would
move each of these.
