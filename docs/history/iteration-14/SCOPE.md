# Iteration 14 Scope — can a minimal, real screen let a human do what Iteration 13 already proved an API can do?

This is a scope document, not a report. Nothing described here has been
built. It follows `docs/ROADMAP.md`'s current sequence and directly
answers the two questions Iteration 13's own investigation left for
this iteration to decide from real evidence: does `GET /architecture/:id`
earn a permanent place, and does provider/unprovided status need a new
HTTP endpoint or can a UI synthesize it client-side
(`docs/PROJECT_KNOWLEDGE.md`, Unproven).

---

## Question Under Test

Can one minimal, real screen — built against Iteration 13's
already-validated discovery/review API, nothing more — let an actual
human complete the same discover-down-to-a-capability workflow already
proven at the API layer (`investigate-po-authoring-workflow.ts`,
Iteration 13)? And does building it settle Iteration 13's own two open
questions from real UI evidence, rather than from further speculation?

---

## What We Know

Checked directly before deciding anything, not assumed from the
placeholder's own prior reasoning:

- **`apps/frontend` is a deliberate, empty placeholder** — `package.json`
  has no dependencies, no `src/`, and its own `README.md` states the
  plan explicitly: *"When Iteration 1a's REST endpoints exist and
  there's something to build a screen against... pick a framework, add
  real dependencies... add this app to whatever root scripts make
  sense."* That moment is now — Iteration 13 built exactly the read
  surface this placeholder was waiting for.
- **The backend has zero CORS handling** — confirmed directly:
  `grep`ping `src/http/server.ts` for `cors`/`Access-Control`/`Origin`
  returns nothing. Every HTTP test so far (`test/http.test.ts`) calls
  `fetch()` from Node against a server on `127.0.0.1`, same-process —
  never from an actual browser origin. A real browser-rendered frontend
  talking to `apps/backend`'s server is untested territory at the
  transport level, not just the screen level.
- **Iteration 13 already validated the exact workflow this screen needs
  to render**: discover a product by name → list domains → list
  subsystems → list capabilities → check a capability's providers —
  proven twice (a hermetic test and a live investigate script), using
  only `GET /architecture?kind=&parent=` and
  `GET /architecture/:id/providers`. This iteration does not need to
  invent a new workflow — it needs to render an already-proven one.
- **Iteration 13's own Report names this iteration's starting brief
  directly**: *"automate the product → domain → subsystem → capability
  walk as one navigation control instead of separate manual list calls,
  and decide whether provider/unprovided status needs a new HTTP
  endpoint or can be synthesized client-side."* Nothing here is a fresh
  invention; it is Iteration 13's own recommended next step, taken
  as-is.
- **The Security & Authorization Model stays parked.** No route the
  backend exposes today requires a credential; a UI calling those same
  routes is exactly as ungated as `curl` calling them directly. Building
  a UI does not change that fact, and does not require solving it first.
- **The Constitution's own framing of what a frontend is allowed to be**
  (`apps/frontend/README.md`, consistent with `docs/NEXUS_CONSTITUTION.md`):
  *"a client of the backend's future HTTP/API surface — never a second
  place architecture, work, or repository data can originate or be
  cached as truth."* This bounds the whole iteration: no client-side
  persistence of graph state beyond what's needed to render the current
  screen, no local mutation, read-only.

---

## What We Only Believe

1. **That React + Vite + TypeScript is the right framework choice for
   this screen.** A reasoned pick, not an evidence-tested one — no
   prior iteration or codebase precedent exists to derive it from. See
   "Decision," below, for the reasoning; revisit only if a concrete
   problem with it surfaces, not preemptively.
2. **That one screen (breadcrumb-style containment navigation +
   provider-status display) is the right smallest slice** to settle
   Iteration 13's two open questions. Untested against a real human's
   actual reaction to it — this iteration's own acceptance bar is a
   real, driven browser session, not just "it renders."
3. **That a client-side, per-capability `/providers` call is fast and
   simple enough not to need a batched or aggregated endpoint.**
   Genuinely unknown until built — this is exactly the question this
   iteration exists to answer with evidence, not decide in advance.

---

## Decision: framework, transport, and scope

Settled here, before implementation, on the reasoning below — not left
for an implementer to guess:

- **Framework: React + Vite + TypeScript.** Weighed against plain
  TypeScript with direct DOM manipulation (smaller, but this project's
  own stated craftsmanship bias and the likelihood of more screens
  following — proposal review, eventually authoring — favor a
  structured, component-per-node model over hand-rolled DOM code that
  would likely need rewriting once a second screen arrives) and against
  heavier alternatives (no meta-framework, no routing library, no state
  manager — none are justified by one screen). Vite's dev server and
  build step are close to zero-configuration for this scale.
- **Transport: a Vite dev-server proxy to the backend, not a CORS
  change.** Adding CORS headers to `createHttpServer` would further
  widen a surface Iteration 13's own Architecture Critic finding already
  flagged as larger than its "as ungated as `/ancestry`" framing
  admitted (`docs/ROADMAP.md`, Standing awareness). A dev-time-only
  proxy (`vite.config.ts` → `server.proxy`) reaches the same backend
  with zero backend changes and zero new cross-origin surface. How a
  *production* deployment would serve both is explicitly out of scope —
  this project has no production deployment story for either app yet.
- **Scope: exactly one screen.** Product → Domain → Subsystem →
  Capability navigation, rendered as a breadcrumb or simple nested list
  (implementer's choice at build time — not a decision this document
  needs to make), plus a capability detail panel showing its providers
  (empty state rendered plainly, not hidden, when there are none).
  **No proposal review/approve/apply UI** — a second, later screen,
  Iteration 13's own write-path work is already proven sufficient at the
  API level and doesn't need a UI to validate it the way discovery did.
  **No write actions of any kind** from the UI in this iteration.

---

## Smallest Viable Investigation

1. **Scaffold `apps/frontend`**: Vite + React + TypeScript, wired into
   the existing npm workspace (a root `dev` script delegating to
   `--workspace=apps/frontend`, matching every other root script's
   existing pattern in `package.json`). Replace the placeholder
   `package.json`/`README.md` — the placeholder's own stated job is
   done once this happens.
2. **One screen**, calling only endpoints Iteration 13 already built and
   tested: `GET /architecture?kind=product` → find by name → `GET
   /architecture?kind=domain&parent=` → ... down to
   `GET /architecture?kind=capability&parent=` → `GET
   /architecture/:id/providers` for the selected capability. `GET
   /architecture/:id` (element detail) is deliberately **not** used
   unless the screen's own real navigation needs `childIds` or a
   single-element fetch — Iteration 13 already found it unused in the
   API-only workflow; this iteration is exactly where evidence can
   confirm or overturn that, one way or the other.
3. **Component-level hermetic tests** (Vitest + Testing Library,
   `fetch` mocked): the navigation renders the right children at each
   level from a given API response shape; the provider-status panel
   renders both the has-providers and zero-providers cases correctly.
   Kept in the existing `npm test` discipline's spirit — hermetic, no
   network — even though this is the project's first frontend test.
4. **One real, driven browser session** against the actual running
   backend (`npm run serve`, real PGlite, real seed data) and the actual
   running frontend dev server — not a mock, not a component test in
   isolation — reproducing Iteration 13's own real acceptance bar:
   starting from nothing but the on-screen ability to find "Trade
   Platform," reach `cap.invoice-export`, and see, on screen, that it
   has no provider. Screenshot or recorded, the same evidentiary
   standard this project has applied to every real-agent claim, applied
   here to a real UI claim for the first time.

**Stays unchanged unless evidence demands otherwise**: every existing
backend route and its behavior, `operations[]`'s write shape, the
`change_operation` schema debt, `relatedElements`'s succession handling
(Iteration 14a's own disclosed deferral), the MCP grant surface.

---

## Evidence Plan

**New evidence required:**
1. Does the rendered screen, driven by a real human/browser session
   against the real backend, actually let someone reach the same result
   Iteration 13 already proved reachable via raw HTTP calls?
2. Does the screen's own real construction need `GET /architecture/:id`
   at all, settling `docs/PROJECT_KNOWLEDGE.md`'s open question about it
   one way or the other — from what the screen actually required, not
   from assumption?
3. Does fetching provider status per-capability, client-side, feel and
   perform acceptably at this project's own seeded scale, or does
   building it surface a concrete reason to add a batched/aggregated
   endpoint?

**Failure modes, named directly:**
- The Vite dev-proxy approach turns out insufficient for some reason
  not yet anticipated (e.g., a header or cookie behavior the proxy
  doesn't forward) — would force the CORS question back open, and
  should be reported as that, not silently worked around.
- The one screen's real construction reveals a *third* gap neither
  Iteration 13 nor this scope anticipated (matching Iteration 13's own
  experience discovering `/architecture/:id/providers` mid-build) — a
  real, informative finding to report precisely, not a deviation to
  hide.
- A real driven browser session may be harder to reproduce
  deterministically than a hermetic test — report exactly what was
  driven and observed, the same discipline every live agent-run report
  in this project's history already applies to a real, non-repeatable
  session.

---

## Acceptance Criteria

1. `apps/frontend` is a real, running Vite + React + TypeScript app,
   reachable via a root `npm run dev` (or equivalent), talking to the
   real backend through a dev-time proxy — no CORS change to
   `apps/backend`.
2. The one screen renders real containment navigation and real
   provider-status data from Iteration 13's own endpoints — no
   client-side caching or mutation of graph state beyond what the
   current screen displays.
3. Component-level hermetic tests exist for the navigation and
   provider-status rendering logic, run via whatever the frontend's own
   `npm test` becomes — reported honestly if it can't share the
   backend's exact hermetic-test discipline (e.g., a real browser DOM
   vs. `node:test`'s assertions), not forced to look identical to
   `apps/backend`'s suite for its own sake.
4. One real, driven browser session reproduces Iteration 13's own
   acceptance bar visually — recorded (screenshot/transcript), not
   merely asserted.
5. The Report states plainly, from what was actually built, whether
   `GET /architecture/:id` was needed and whether provider-status needs
   a new backend endpoint — closing both of Iteration 13's open
   questions with evidence, not with this scope document's own guesses.

---

## Explicit Deferrals

- **Proposal review/approve/apply UI** — a second, later screen; not
  needed to answer this iteration's questions and would roughly double
  its scope.
- **Any write action from the UI** — read-only this iteration,
  unconditionally.
- **Production deployment / serving story for either app** — local dev
  only; genuinely nothing exists yet for either `apps/backend` or
  `apps/frontend` in production, and inventing one isn't this
  iteration's job.
- **Authentication/authorization** — Security & Authorization Model
  stays explicitly parked (`docs/ROADMAP.md`).
- **Visual design system, styling polish, accessibility beyond basic
  usability** — real concerns, not this iteration's evidence question.
- **`relatedElements` succession-staleness** (Iteration 14a) and
  **`change_operation` schema debt** (Iteration 12) — unrelated,
  untouched.
- **Technology Profiles** (Iteration 15) — unrelated, untouched.
