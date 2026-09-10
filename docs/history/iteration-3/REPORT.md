# Iteration 3 Report — MCP grant enforcement

Status: complete for the scope agreed before starting. 93 `node:test`
cases pass (up from Iteration 2's 84). The primary target — the top-ranked
Open Question in `docs/PROJECT_KNOWLEDGE.md` as of Iteration 2's close,
whether the MCP grant model (§9.5) is a real enforcement boundary or only
a documented formula — is answered with direct, executed evidence,
in-process, over HTTP, and by hand against a running server.

*(This report avoids restating the current Open Question ranking as a
number — see `docs/history/iteration-2/REPORT.md`'s own stale
cross-references, corrected twice already, for why: a ranking asserted in
prose drifts the moment `docs/PROJECT_KNOWLEDGE.md` is next updated. Check
that document directly for the current order.)*

## Scope completed

1. **`buildGrant(db, workPackage, runId)`** — `src/mcp/grant.ts`.
   Implements §9.5's formula exactly: `allowedElementIds` = the Work
   Package's own capabilities and components, unioned with
   `impactOf(components, profile.context_depth + 1)` — one level wider
   than the Work Package itself resolved, reusing the `impactOf`
   traversal that has existed since Iteration 0. `allowedRepositoryIds` =
   the Work Package's own repositories. No `execution.execution_run` row
   is created — `runId` is accepted as a parameter, the same stand-in
   pattern Iteration 1 used for a not-yet-built Orchestrator.

2. **`assertInGrant(grant, kind, id)`** — the enforcement primitive, in
   the same file. Checks expiry first, then membership. A single typed
   error, `GrantRefusedError`, with a structured `reason: "expired" |
   "out-of-grant"` (mirroring the shape `ProposalNotBlockableError`
   already established in Iteration 1 — reused, not reinvented).

3. **`McpGrant` moved to its real home.** Iteration 2 defined the type
   directly in `src/runtime/port.ts` because nothing else existed yet to
   construct or enforce one. It now lives in `src/mcp/grant.ts`;
   `runtime/port.ts` imports it. Checked, not assumed, to still respect
   §2.3's declared dependency direction — see "Architectural deviations."

4. **Two grant-checked tool wrappers** — `src/mcp/tools.ts`:
   `getAncestry`, `getCapabilitiesOf`. Both call straight into
   `src/graph/traversals.ts`'s existing, already-tested functions after
   the grant check passes. Not the other five Architecture MCP tools, not
   Work MCP, not Repository MCP.

5. **An enabling HTTP surface** — `POST /grants` (builds a Work Package,
   then a grant, from `{taskId, profileId, runId}`), `POST
   /mcp/architecture/ancestry`, `POST /mcp/architecture/capabilities`.
   Same status as Iteration 1's §10.5: makes the refusal demonstrable by
   hand, not the full §16 1e MCP surface (real MCP protocol, three
   servers).

6. **Tests** — `test/mcp.test.ts` (8 cases) plus one new case in
   `test/http.test.ts`. Covers grant construction (including the specific,
   easy-to-get-subtly-wrong depth+1 widening — see "Demonstrations and
   verification"), the disclosed target-only enforcement semantics,
   out-of-grant refusal, and grant expiry.

## Scope deferred

- **The actual MCP wire protocol** (stdio/JSON-RPC,
  `@modelcontextprotocol/sdk`). This iteration tests the authorization
  logic; a real protocol server with no Orchestrator to drive it is
  infrastructure for a caller that doesn't exist yet.
- **The other five Architecture MCP tools** (`get_element`,
  `get_providers`, `get_dependencies`, `get_governance`, `resolve`), all
  of Work MCP, all of Repository MCP.
- **Wiring a refusal into a real `RunBlocked` / `context-insufficient`
  event.** §9.5 says exactly this should happen ("anything beyond that is
  a RunBlocked with reason context-insufficient rather than a silent
  widening") — but emitting an event needs a run loop to emit it into,
  which is the Orchestrator (§16 1f), still not built. `RunBlockedReason`
  already includes `"context-insufficient"` (Iteration 2's port), so the
  vocabulary is ready; nothing produces it from a grant refusal yet.
- **Repository bootstrap (§10)** — unrelated to this question, still the
  other large deferred piece.

## The actual answer to the Open Question

**Yes, the grant model is a real enforcement boundary — confirmed three
ways, not inferred from green tests:**

1. **In-process.** `test/mcp.test.ts`: a grant built from a real Work
   Package correctly includes `comp.payment-service` — a one-hop
   dependency the Work Package's own `impactedComponents` field
   (computed at `context_depth`, not `context_depth + 1`) does *not*
   include. An in-grant `getAncestry` call succeeds; an out-of-grant one
   throws `GrantRefusedError` with `reason: "out-of-grant"`; an expired
   grant refuses an otherwise in-grant call with `reason: "expired"`.
2. **Over HTTP.** `test/http.test.ts`: the same sequence — issue a grant,
   succeed in-grant, get refused out-of-grant — through real HTTP
   requests against a real `http.Server`, with the refusal surfacing as
   `403` and a structured body naming the reason.
3. **By hand.** A live `npm run serve` session, `curl -X POST /grants`
   then two `curl -X POST /mcp/architecture/ancestry` calls — one
   succeeding, one refused with `403` — reproducing the exact same
   sequence a third, independent way. Command transcript in
   `docs/history/iteration-3/LESSONS.md`.

## A disclosed interpretive choice

§9.5 says "a tool call outside the grant is refused." It does not say
whether a grant should also *filter* what an in-grant call's result
contains. `getAncestry(grant, "comp.invoice-service")` is checked at the
call boundary only — the result still walks the full containment chain up
to `prod.trade-platform`, even though the product root is not itself
individually listed in `allowedElementIds`. This project reads §9.5 as
authorizing the call, not as re-deriving each traversal's own contract to
also mean "and filter everything it returns." `test/mcp.test.ts` asserts
this explicitly (`prod.trade-platform` present in the ancestry result,
absent from `allowedElementIds`) so the choice is a passing, checked test,
not a silent behavior nobody decided on purpose. If a future iteration
needs result-filtering instead, this is the specific place and test to
change.

## Architectural deviations

None new. One deliberate correction of an Iteration 2 placeholder: moving
`McpGrant`'s canonical definition into `src/mcp/grant.ts` and having
`src/runtime/port.ts` import it. Checked directly, not assumed, that this
keeps §2.3's declared direction intact: `grep` across `src/mcp/` confirms
zero imports from `src/runtime/` (only two mentions, both in a doc
comment, not import statements), and `runtime/port.ts` importing from
`src/mcp/grant.ts` is exactly the declared-legal `Runtime Integration →
Execution (inbound port only)` direction, not a new coupling — Runtime
Integration receiving a type from the context whose port it implements.

## Technical debt intentionally created

- **`buildGrant` re-queries `execution.work_package_profile` for
  `context_depth`** rather than accepting it as a parameter, even though
  a caller that already called `buildWorkPackage` technically has this
  information buried inside it (not currently exposed on
  `WorkPackageResult`). A small, deliberate redundancy in favor of
  `buildGrant` being self-contained — the alternative is a wider
  `WorkPackageResult` surface just to save one query, which is not
  obviously a better trade.
- **No real `ExecutionRun` row backs `runId`.** Same stand-in pattern as
  Iteration 1's `blockTask`/`draftProposal` split — a caller (test, human,
  eventually an Orchestrator) supplies the id; nothing validates it
  against a dispatched run because there is no dispatch mechanism yet.

## Demonstrations and verification

```
npm run typecheck    # clean
npm test              # 93/93
```

Live smoke test (transcript, values change run to run but the shape is
exact):

```
curl -X POST http://localhost:3000/grants -d '{"taskId":"task.invoice-discount-validation","profileId":"wpp.implementation","runId":"run.manual-1"}'
# → {"runId":"run.manual-1", ..., "allowedElementIds":["cap.invoice-discount","comp.invoice-service","comp.payment-service"], ...}

curl -X POST http://localhost:3000/mcp/architecture/ancestry -d '{"grant":{...},"elementId":"comp.invoice-service"}'
# → 200, full ancestry chain

curl -X POST http://localhost:3000/mcp/architecture/ancestry -d '{"grant":{...},"elementId":"cap.invoice-export"}'
# → 403 {"error":"GrantRefusedError","reason":"out-of-grant", ...}
```

## Recommended next-step validation

Repository bootstrap (§10) is now the largest remaining piece of §16, and
the one most other Unproven items in `docs/PROJECT_KNOWLEDGE.md` are
waiting on (FileAnchor maintenance over real time, multi-repository
ambiguity in a real scenario both need it). Check
`docs/PROJECT_KNOWLEDGE.md`'s Open Questions directly for the current
ranking before scoping Iteration 4 — this report deliberately does not
restate it as a number.
