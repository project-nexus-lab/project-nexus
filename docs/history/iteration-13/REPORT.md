# Iteration 13 Report — a plain read surface makes the existing write path usable, unchanged

Status: complete for the scope agreed in `docs/history/iteration-13/SCOPE.md`,
with a clean result. 161 `node:test` cases pass (up from Iteration 12's
153, plus 8 new cases this iteration; all still hermetic, offline, zero
network access). One live investigate script
(`investigate-po-authoring-workflow.ts`) was run this iteration, at the
user's explicit request, specifically to capture qualitative findings a
hermetic test cannot — discovery step count, friction, indispensable
endpoints, missing information — to feed Iteration 14's UI design.

## Scope completed

1. **`GET /architecture/:id`** — element detail (`kind`, `name`,
   `status`, `parentId`, `childIds`), backed by a new
   `src/graph/elements.ts` (deliberately separate from `traversals.ts`'s
   closed §8.4 named-traversal set). Mirrors §9.2's spec'd, never-built
   `architecture.get_element` shape, but as a plain, ungated route for
   humans — the same relationship `/architecture/:id/ancestry` already
   has to the grant-checked `getAncestry`.
2. **`GET /architecture?kind=&parent=`** — bounded discovery listing
   (`id`, `kind`, `name`, `status`), both filters optional, fixed cap
   (200), no cursor pagination (same postponement §9.6 already states
   for MCP).
3. **`GET /architecture/:id/providers`** — wraps the already-existing,
   already-tested `providersOf` traversal (`src/graph/traversals.ts`),
   which had no HTTP route at all before this iteration. **Not in the
   original scope document** — added mid-implementation once the
   end-to-end workflow made clear that neither `GET /architecture/:id`
   nor the listing endpoint could show provision edges at all
   (`childIds` is containment-only; provision is a separate edge, R2),
   so confirming a `provide` operation actually took effect had no path
   through the API without it.
4. **`GET /proposals/:id`** and **`GET /proposals?state=`**
   (`src/proposal/proposal.ts`: `getProposalDetail`, `listProposals`) —
   before this iteration, nothing let a reviewer see a proposal's own
   operations before approving it, or see which proposals await review.
5. **A hermetic HTTP-driven test** (`test/http.test.ts`) individually
   covering each new endpoint (including 404s for unknown element/proposal
   ids), plus one full "PO discovery workflow" test that discovers a
   product by name, walks containment down to a real unprovided
   capability, drafts and reviews a `create` + `provide` proposal
   referencing only discovered ids, approves, applies, and confirms
   resolution — zero `prod.*`/`dom.*`/`subsys.*`/`comp.*`/`cap.*` id
   literals anywhere in that test.
6. **A new investigate script**, run live against the real HTTP server
   (`npm run investigate:po-authoring-workflow`), answering the four
   questions asked of this iteration directly — see below.
7. **`operations[]`'s write shape was not touched** — per the Question
   Under Test, this iteration deliberately tested whether read access
   alone closes the usability gap before considering a write-shape
   redesign.

## What was asked of this iteration, answered directly

**How many discovery steps were required?** Six discovery calls (list
products by name → list domains under the discovered product → list
subsystems → list capabilities → check the target capability's
providers), one review call, four write calls (draft, submit, approve,
apply), one confirm call — 12 HTTP calls total, for one capability,
none naming a hardcoded architecture id.

**Where was the friction?** Two points, both real and both disclosed
directly by the script:
1. A capability listing carries no provider-status signal — "which
   capabilities need a component" cannot be answered from `GET
   /architecture` alone. Not blocking for this workflow (the simulated
   PO already knew which capability to build against, the same way a
   real PO would from their own backlog), but a real, named gap.
2. `GET /architecture/:id` (element detail) never shows provision edges
   at all, because provision is not containment (R2) and `childIds` is
   containment-only. Confirming a `provide` operation actually took
   effect had no path through the two originally-scoped read endpoints —
   this is exactly what motivated adding `/providers` mid-implementation
   (see Scope completed, item 3).

**Which endpoints were indispensable?** `GET /architecture?kind=&parent=`
(used at every containment level — without it, discovery has no
starting point beyond a hardcoded id) and `GET /proposals/:id` (the one
call that actually lets a human review before approving — the entire
reason this iteration exists). `GET /architecture/:id/providers`, though
not in the original scope, became indispensable the moment the workflow
needed to confirm its own result. `GET /proposals?state=` is a real
reviewer-inbox pattern, not required for this scripted workflow's own
correctness. `GET /architecture/:id` (element detail) was, honestly,
never called at all in the investigate script's run — the listing
endpoint's summary shape was sufficient at every step. Recorded as a
genuine finding, not suppressed: Iteration 14 should ask whether a
separate "get one element" endpoint earns its place outside a UI's
dedicated element-detail page, rather than assuming both a list and a
get form are needed just because §9.2 specified both.

**Which information was missing?** Provider/unprovided status. Whether a
capability has zero providers is answerable today only via
`unprovidedCapabilities()` (`src/graph/alignment.ts`), CLI-only, never
exposed over HTTP. Recorded in `docs/PROJECT_KNOWLEDGE.md` as a new
Unproven entry rather than fixed here — deciding whether this needs a
new endpoint or can be synthesized client-side is Iteration 14's own
call, to be made from evidence of what the UI actually needs.

## What survived contact, precisely

- **The `operations[]` write shape needed no changes at all.** The
  Question Under Test asked whether read access alone would be
  sufficient, or whether the write shape would also need attention —
  the evidence answered cleanly: read access alone was enough. This
  iteration deliberately did not assume either answer in advance.
- **§6.2 rule 8's "authoring API call" is the seed/bootstrap path, not a
  second write mechanism** — the interpretive reading `SCOPE.md` settled
  on before writing any code held up; nothing built this iteration
  bypasses the governed proposal lifecycle.
- **One endpoint not in the original scope turned out load-bearing**
  (`/architecture/:id/providers`), and **one endpoint that was in scope
  turned out unused** (`GET /architecture/:id`) — both discovered only
  by actually running the workflow, not by reasoning about the shape in
  advance.

## What this does not settle

Whether Iteration 14's UI needs more than what this API surface
provides — a tree/breadcrumb navigation replacing four manual list
calls, and inline provider-status display — is exactly what the
investigate script's closing recommendation names for Iteration 14 to
decide, not attempted here.

## Scope deferred

Exactly as `docs/history/iteration-13/SCOPE.md` listed: redesigning
`operations[]`'s wire shape (not warranted by this iteration's own
evidence); `change_operation`'s disclosed schema looseness (Iteration
12's own deferral, untouched); Work MCP and Repository MCP; any UI
(Iteration 14); authentication/authorization on the new endpoints (the
Security & Authorization Model stays parked, `docs/ROADMAP.md`);
pagination beyond a fixed cap; `depend`, Decision/Constraint attachment,
element renaming; Technology Profiles.

## Technical debt intentionally created

None new. `GET /architecture/:id` was built as scoped but turned out
unused in the one real workflow tested — left in place (it is still the
§9.2-anticipated shape, cheap, and likely useful for a UI's dedicated
detail view) rather than removed on the strength of a single scenario,
but named directly above so Iteration 14 makes an informed choice
rather than assuming it's needed.

## Demonstrations and verification

```
npm run typecheck                         # clean
npm test                                   # 161/161, fully hermetic, zero network access
npm run investigate:po-authoring-workflow  # real HTTP server; findings quoted above
```

## Recommended next-step validation

Iteration 14 (first architecture UI) should treat this iteration's four
answers as its own starting brief: automate the product → domain →
subsystem → capability walk as one navigation control rather than
separate manual calls, decide whether provider/unprovided status needs
a new endpoint or client-side synthesis, and reassess whether `GET
/architecture/:id` earns a place in the UI or can be dropped.
