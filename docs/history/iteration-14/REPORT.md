# Iteration 14 Report — one real screen, and both of Iteration 13's open questions answered

Status: complete for the scope agreed in `docs/history/iteration-14/SCOPE.md`,
with a clean result. This is this project's first frontend iteration:
`apps/frontend` is now a real, running Vite + React + TypeScript app (10
new hermetic tests, all passing) talking to the real backend through a
dev-time proxy, with zero changes to `apps/backend`. One real, driven
browser session against the real running backend (real seed data, real
`serve`) and the real running frontend dev server reproduced Iteration
13's own acceptance bar visually, and is recorded below with the exact
backend call log the screen itself displayed.

## Scope completed

1. **`apps/frontend` scaffolded**: Vite + React + TypeScript, replacing
   the placeholder `package.json`/`README.md` (the placeholder's own
   stated job — "when Iteration 1a's REST endpoints exist and there's
   something to build a screen against" — is done). Root `package.json`
   gains a `dev` script and both `test`/`typecheck` now run across both
   workspaces.
2. **A dev-time Vite proxy** (`vite.config.ts`, `/architecture` and
   `/proposals` → `http://localhost:3000`) — no CORS handling added to
   `apps/backend/src/http/server.ts`, confirmed unchanged.
3. **One screen** (`src/App.tsx`): Product → Domain → Subsystem →
   Capability navigation (`NavigationColumn.tsx`, one per level) plus a
   capability detail panel (`CapabilityProviders.tsx`) showing that
   capability's providers, or a plain "No provider — this capability is
   unprovided" message. Built using **only** `GET /architecture?kind=&parent=`
   for every level (including the top, with no parent filter) and
   `GET /architecture/:id/providers` for the detail panel.
4. **A visible API call log** (`ApiCallLog.tsx`, `src/api.ts`) — every
   backend call this screen makes is recorded (`method`, `path`,
   `status`) and rendered live on screen, not just kept for a report to
   quote after the fact. This is what actually answers "record which
   backend endpoints were called" directly, both hermetically and in
   the real session below.
5. **10 new hermetic tests** (Vitest + Testing Library): `NavigationColumn`
   (rendering, selection, loading/empty states), `CapabilityProviders`
   (has-providers, zero-providers, and a real-error case), and three
   `App`-level tests that mock `fetch` itself (not the API module's
   functions) so the real `apiCallLog` logging path actually executes —
   reproducing the exact real scenario below and asserting the exact
   5-call sequence with zero calls to `GET /architecture/:id`; confirming
   re-selecting an earlier level clears every level below it; and (found
   during `/review`, see below) confirming a failed fetch surfaces an
   error rather than an infinite loading state.
6. **One real, driven browser session** — see below.

## The real session, in full

Real backend: `npm run migrate` + `npm run import` against a fresh data
directory, then `npm run serve` (port 3000, real PGlite, real seed data).
Real frontend: `npm run dev` (Vite, port 5173). Driven with
`claude-in-chrome`, not simulated.

Starting from nothing but the on-screen name "Trade Platform": clicked
Trade Platform → Billing → Invoice → Export Invoice. The screen showed,
in red: **"No provider — this capability is unprovided."** — the same
real, seeded fact `verify.ts` and every prior iteration's own
`unprovidedCapabilities()` check already knew about `cap.invoice-export`,
now reached by an actual human clicking through an actual rendered page
for the first time in this project's history.

The screen's own visible call log, exactly as rendered, reproduced
verbatim here:

```
1. GET /architecture?kind=product → 200
2. GET /architecture?kind=domain&parent=prod.trade-platform → 200
3. GET /architecture?kind=subsystem&parent=dom.billing → 200
4. GET /architecture?kind=capability&parent=subsys.invoice → 200
5. GET /architecture/cap.invoice-export/providers → 200
```

Five calls. All `GET`. All 200. Zero calls to `/proposals` (this screen
never needed them — no proposal review UI in scope). **Zero calls to
`GET /architecture/:id`** — the exact question this iteration exists to
answer, answered by what the screen actually did, not by guessing.

## Both of Iteration 13's open questions, answered

**Does `GET /architecture/:id` earn a permanent place?** Not by this
iteration's evidence. Confirmed twice, independently: the hermetic
`App.test.tsx` (mocking `fetch`, not the API functions, so the real
logging path runs) and the real browser session above both show the
same thing — five calls, none of them to that endpoint. This is now the
*second* independent real workflow (after Iteration 13's own
`investigate-po-authoring-workflow.ts`) that never needed it. Not deleted
in this iteration — see Scope deferred — but the evidence against
keeping it as anything other than a plausible future detail-view
endpoint is now stronger, not merely unchanged.

**Does provider/unprovided status need a new HTTP endpoint, or can a UI
synthesize it client-side?** Client-side synthesis worked, felt fast, and
needed no batching at this project's own seeded scale — one call per
selected capability, fired only when a capability is actually selected,
not for every capability in a listing. No concrete problem surfaced that
would justify a new endpoint. This is evidence at *this* scale only, not
a claim about a real organization's full graph — the same caveat
`docs/PROJECT_KNOWLEDGE.md`'s own Unproven entries already apply to
comparable scale claims elsewhere in this project.

## What survived contact, precisely

- **The Vite dev-proxy approach worked with zero surprises** — no CORS
  question ever needed reopening, confirmed by the real session actually
  completing against the real backend.
- **Building the navigation from only the bounded listing endpoint was
  sufficient at every level, including the top** (`kind=product`, no
  parent) — nothing about the "start from a name, not an id" requirement
  needed `GET /architecture/:id` either.
- **The visible, on-screen call log is not a decoration** — it is what
  let this Report state its two headline findings from what a viewer of
  the actual screen can see directly, the same discipline this project's
  `investigate-*.ts` scripts already apply to backend-only workflows,
  now applied to a rendered UI for the first time.

## What this does not settle

Whether this holds at a real organization's actual scale (many products,
deep subsystems, capabilities with many providers) — this iteration's
evidence is scoped to this project's own seed data, the same disclosed
limitation Iteration 10's own graph-scale investigation named for a
different question.

## Scope deferred

Exactly as `docs/history/iteration-14/SCOPE.md` listed: proposal
review/approve/apply UI; any write action from the UI; a production
deployment/serving story for either app; authentication (parked);
visual design polish and accessibility beyond basic usability;
`relatedElements` succession-staleness (Iteration 14a) and
`change_operation` schema debt (Iteration 12); Technology Profiles
(Iteration 15). `GET /architecture/:id` itself is **not removed** —
named above as weaker-evidenced, not deleted on the strength of two
data points.

## Technical debt intentionally created

`npm audit` reports 5 vulnerabilities (3 moderate, 1 high, 1 critical)
in `apps/frontend`'s dev-tooling dependency tree — `esbuild` (dev-server
request forwarding) and `@vitest/mocker`/`vite-node` (a path-traversal
advisory in Vitest's own mocker), both fixable only via a breaking major
upgrade (`vite@8`, `vitest@5`) not evaluated in this iteration. Both are
dev-server-only concerns — neither affects a production build artifact,
and this project has no production deployment for either app yet (see
Scope deferred). Left as a disclosed, accepted risk, not silently
ignored or force-upgraded without testing the breaking change.

One real bug, found during this iteration's own `/review` pass and fixed
before this commit, not merely disclosed: `App.tsx`'s two `listElements()`
calls (the initial product load and every subsequent level load) had no
`.catch()`, unlike `CapabilityProviders`, which already handled fetch
failures correctly. A failed fetch left `loadingLevel` set forever — an
unhandled promise rejection and a column stuck on "Loading…" with no
visible error, inconsistent with how the rest of the screen handles the
same class of failure. Fixed by extracting a shared `loadLevel` helper
with proper `.catch()` handling and a visible error message; a new
hermetic test (`App.test.tsx`) confirms a failed fetch now surfaces an
error rather than an infinite loading state.

## Demonstrations and verification

```
npm run typecheck   # both workspaces, clean
npm test             # apps/backend 163/163; apps/frontend 10/10, all hermetic
```

Plus the one real, driven browser session reproduced in full above —
screenshots taken during the session, referenced in this conversation.

## Recommended next-step validation

Whether `GET /architecture/:id` should actually be removed, now that two
independent real workflows have both found it unused — a decision for
whichever iteration next touches the discovery API, made from this
iteration's own accumulating evidence rather than assumed here.
Separately: a second screen (proposal review/approve/apply) would be the
natural next UI iteration, building on this one's now-proven scaffold
rather than re-deciding the framework/proxy questions again.
