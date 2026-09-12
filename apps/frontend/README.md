# Nexus Frontend

Iteration 14 (`docs/history/iteration-14/SCOPE.md`) — one screen: browse
the architecture graph from a product's name down to a capability, and
see whether that capability has a provider. Read-only. Talks only to the
discovery/review API Iteration 13 already built and validated
(`apps/backend/src/http/routes.ts`).

React + Vite + TypeScript — a reasoned pick, not evidence-tested (no
prior codebase precedent existed to derive it from); see `SCOPE.md`'s
"Decision" section for the reasoning.

## Running it

1. From `apps/backend`: `npm run migrate && npm run import && npm run serve`
   (real backend, real seed data, port 3000).
2. From `apps/frontend` (or the repo root, once wired into root scripts):
   `npm run dev`.
3. Open the printed local URL. Requests to `/architecture` and
   `/proposals` are proxied to `localhost:3000` by `vite.config.ts` — no
   CORS change was made to the backend to allow this (see `SCOPE.md`'s
   "Decision" for why a dev-time proxy was chosen instead).

## What it is not

- Not a second place architecture, work, or repository data originates
  or is cached as truth (`docs/NEXUS_CONSTITUTION.md`) — every screen
  re-fetches from the backend; nothing here persists graph state.
- Not a proposal authoring/review UI — that's explicitly deferred to a
  later iteration (`docs/history/iteration-14/SCOPE.md`, Explicit
  Deferrals).
- Not authenticated — Security & Authorization Model is explicitly
  parked (`docs/ROADMAP.md`, Standing awareness); this app is exactly as
  ungated as the backend routes it calls.

## The API call log

The running screen shows, live, every backend call it has made this
session (`src/components/ApiCallLog.tsx`) — not a debug afterthought.
Iteration 13 left two open questions this iteration exists to answer
with real evidence: does `GET /architecture/:id` earn a permanent place
in the API, and does provider/unprovided status need its own endpoint.
The visible call log is how those questions get answered from what this
screen actually does, not from guessing — see
`docs/history/iteration-14/REPORT.md` for the result.
