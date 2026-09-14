# Iteration 16 Report — Decisions gain a real, governed creation path

Status: complete for the scope agreed in `docs/history/iteration-16/SCOPE.md`,
with a clean result. 184 `node:test` cases pass (up from Iteration 15's
177: 5 new in `test/schema-constraints.test.ts`, 2 new plus 2 extended
assertions in `test/proposal.test.ts`, 1 existing test extended in
`test/http.test.ts`), fully hermetic, zero network access. No live agent
run — this iteration touches only the Architecture Change Proposal
mechanism and `architecture.decision`, neither of which `buildPrompt()`
or classification depends on.

## Scope completed

1. **`architecture.change_operation` gains a `decide` operation**
   (migration `0015_decide_operation.sql`): three new nullable columns
   (`decide_id`, `decide_title`, `decide_statement`), mirroring `create`'s
   own `mint_id`/`mint_kind`/`mint_name` shape; `op` widened to include
   `'decide'`.
2. **The disclosed mutual-exclusivity debt paid, not deferred a third
   time.** Iteration 12's own `/review` named the exact trigger —
   *"before a fourth operation type is added: decide... a
   mutual-exclusivity check across all column groups"*
   (`docs/history/iteration-12/LESSONS.md`) — and this iteration adds
   exactly that fourth type. `change_operation_check` was rewritten so
   each `op` branch requires its own fields **and** forbids every other
   operation's fields, covering `create`/`retire`/`provide` retroactively
   as well as `decide` — not a check scoped only to the newest operation.
3. **`src/proposal/proposal.ts`**: `ProposalOperationInput`/
   `ProposalOperationDetail` gain `op: "decide"` plus `decideId`/
   `decideTitle`/`decideStatement`; `validateOperation` requires all
   three and calls the already-existing `assertId(id, "decision")`
   (`ids.ts` already had a `decision` `AuthoredKind` — `adr.*` — ready to
   reuse; `assertPrefixMatchesKind` does not cover it, so `decide`
   validation calls `assertId` directly, not a new helper);
   `applyProposal`'s transaction gains a `decide` branch inserting into
   `architecture.decision` with `status = 'accepted'`, at apply time —
   the same pattern `create` already established for Elements (minted
   only at apply time, already `'active'`); `ApplyProposalResult` gains
   `decidedIds`; `toOperationDetail` surfaces the new fields.
4. **No new table, no new module, no new HTTP route.** `GET
   /proposals/:id` (Iteration 13) surfaces a `decide` operation for free
   once `toOperationDetail` knows its shape — confirmed over real HTTP
   in `http.test.ts`, the same way `provide` started surfacing there in
   Iteration 12 with zero route changes.
5. **The concrete end-to-end loop this iteration exists to close,
   demonstrated directly**
   (`test/proposal.test.ts`, "Iteration 16 closes Open Question #7
   end-to-end"): draft a proposal with one `decide` operation → submit
   → approve → apply → a real `architecture.decision` row now exists,
   created through governance, not a direct insert → `createTechnologyProfile`
   (Iteration 15, `src/architecture/technology-profile.ts`) cites that
   row's id → succeeds. Before this iteration, only a direct insert
   could have produced a citable Decision.
6. **Attribution stays indirect, deliberately.** No `authored_by`/
   `approved_by` columns were added to `architecture.decision` itself —
   attribution is discoverable the same way a minted Element's already
   is, by joining `change_operation`/`change_proposal`
   (`test/proposal.test.ts`, "'decide' operation creates a real,
   governed... row" asserts this directly via the join, not merely that
   the insert succeeded).

## The decision this iteration was required to make, and the evidence behind it

`docs/history/iteration-16/SCOPE.md` required choosing between extending
`ArchitectureChangeProposal` (chosen), a second, dedicated
`DecisionProposal` lifecycle, or driving `architecture.decision.status`'s
own existing `proposed`/`accepted`/`superseded` vocabulary directly
without going through `change_proposal` at all. The chosen option was
also the smallest by actual diff: no new file, no new error class, no
new attribution column — three nullable columns on a table already
carrying this exact kind of operation, plus one branch each in three
already-existing functions.

## What survived contact, precisely

- **The mutual-exclusivity retrofit did not break any existing
  `create`/`retire`/`provide` test.** All three operation types' existing
  tests pass unmodified against the rewritten check constraint — the
  retrofit only narrows what a single row may simultaneously claim to
  be, not what any operation is legally allowed to do on its own.
- **`ids.ts`'s already-existing `decision` `AuthoredKind` needed zero
  changes** to be reused by `decide`'s validation — checked directly,
  not assumed from its presence in the file.
- **The apply-time-only insertion pattern (mirroring `create`) avoids a
  real problem the alternative would have had**: inserting a Decision
  row at *draft* time with `status = 'proposed'`, then flipping it to
  `'accepted'` at apply, would leave an orphaned, permanently-`'proposed'`
  row behind for any proposal later rejected — `architecture.decision`
  has no `'rejected'`/`'withdrawn'` status to transition to. Considered
  directly during this iteration's own `/review` (Architecture Critic
  pass), not merely assumed correct by analogy to `create`.

## What this does not settle

Whether `decision_scope` (which elements a Decision governs) is ever
actually needed as a governed, `decide`-adjacent concern, or whether a
real Decision-supersession mechanism (a `decision` analogue to
`element_succession`) will ever be required — both untouched, both
named directly in `SCOPE.md`'s Explicit Deferrals, neither picked up
opportunistically during implementation.

## Scope deferred

Exactly as `docs/history/iteration-16/SCOPE.md` listed: `decision_scope`
population; superseding or amending an already-accepted Decision;
driving `decision.status` through `'proposed'`; the `jsonb`-discriminated-
payload alternative for `change_operation` (rejected for this iteration
specifically, not ruled out permanently); any HTTP write route for
proposing a Decision directly (Iteration 13 only ever added read routes;
unchanged here).

## Technical debt intentionally created

None found during this iteration's own `/review` pass beyond what
`SCOPE.md` already named as deferred.

## Demonstrations and verification

```
npm run typecheck   # clean
npm test            # 184/184, fully hermetic, zero network access
```

`/review` applied this session against every file this iteration
touched (migration, `proposal.ts`, all three test files): Constitution,
Domain Integrity, and Simplicity Reviewers PASS; Evidence Reviewer
findings recorded in `LESSONS.md`; Consistency Auditor PASS (test
counts and every new code comment checked directly against actual
behavior, not trusted); Architecture Critic considered the
apply-time-only insertion pattern against the draft-time alternative
and found the chosen design avoids a real orphaned-row problem the
alternative would have had.

## Recommended next-step validation

Open Question #7 is now closed for the mechanism it named — Decisions
have a real, governed creation path. What remains open, named in
`LESSONS.md` rather than silently dropped, is whether a real PO/
architect ever needs `decision_scope` populated through this same
governed path, or whether the current, entirely separate ungoverned
state of that table continues to be sufficient — not testable without
a concrete scenario demanding it, the same discipline Iteration 12 first
applied to this exact question three iterations ago.
