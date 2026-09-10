# Project Nexus

An AI-native software delivery platform. Start with
`docs/NEXUS_CONSTITUTION.md`, then `CLAUDE.md` for how work in this
repository is done and reviewed.

## Repository layout

A monorepo: one deployable backend, one database, one frontend (future),
shared packages, and infrastructure assets — not a service decomposition.
See "Why this structure" below.

```
apps/
  backend/     The one deployable backend — Nexus Core. Everything built in
               Iteration 0 lives here: schema, ID validation, YAML import,
               graph traversals, Work Package generation. See
               apps/backend/README.md.
  frontend/    Placeholder. No implementation yet — see apps/frontend/README.md.
packages/      Placeholder for code genuinely shared between apps/backend
               and apps/frontend. Empty until there are two real consumers
               of the same contract — see packages/README.md.
infra/         Placeholder for deployment and environment assets for the
               single deployable backend (and, later, frontend). Empty
               until there's a real deployment target — see infra/README.md.
docs/          Authoritative documents: the Constitution, the supporting
               model documents, the current MVP architecture, the review
               framework, and the cumulative project knowledge base. Applies
               to the whole monorepo, not just apps/backend.
CLAUDE.md      Operating instructions for work in this repository —
               design rules, the review framework, iteration discipline.
```

## Getting started

```
npm install
npm test              # runs apps/backend's test suite (142 node:test cases)
npm run verify         # narrated walkthrough of the same guarantees
```

These are root-level scripts that delegate to `apps/backend` via npm
workspaces (`workspaces: ["apps/*", "packages/*"]` in the root
`package.json`). For backend-specific development, see
`apps/backend/README.md`.

## Why this structure supports Nexus without introducing microservices

Project Nexus's own Constitution and `MVP_ARCHITECTURE_V2.md` govern a
*platform domain model* — bounded contexts, aggregates, one Postgres
instance with one schema per context. That model is unrelated to, and
does not require, any particular arrangement of source folders. This
repository layout is a source-organization decision, not an architecture
decision, and the two must not be confused with each other:

- **One backend, still.** `apps/backend` is still the single deployable
  process it was in Iteration 0 — same five Postgres schemas
  (`architecture`, `work`, `repo`, `execution`, `runtime`), same one
  database, same in-process domain events (§2.2 of
  `MVP_ARCHITECTURE_V2.md`). Splitting source into `apps/` and
  `packages/` folders changes nothing about how many processes run in
  production; npm workspaces is a *build-time* convenience (shared
  installs, shared scripts, shared lockfile), not a *runtime* boundary.
  Nothing here creates a second deployable, a second database, or a
  network call where an in-process function call used to be.
- **`packages/` is deliberately empty.** A shared package is only
  justified once two real apps need the identical contract — today
  there is exactly one consumer (`apps/backend`) of the domain model, so
  there is nothing to extract. Populating `packages/` speculatively,
  before `apps/frontend` exists to need it, would be the accidental
  complexity `CLAUDE.md`'s Simplicity Reviewer exists to catch.
- **`apps/frontend` and `infra/` are reservations, not implementations.**
  Each holds only a `README.md` (frontend also has a placeholder
  `package.json` so it's a recognized workspace member) explaining what
  it will hold and why it doesn't yet. This is what "prepare for" means
  without triggering "build prematurely."
- **`docs/` stays at the root, not inside `apps/backend`.** The
  Constitution and the MVP architecture govern the whole platform,
  including a frontend that doesn't exist yet — they are not backend
  implementation detail, and moving them under `apps/backend` would have
  implied otherwise.

This restructuring was performed ahead of Iteration 1, not as part of it —
it changes no domain-model code and passed Constitution, Domain Integrity,
and Simplicity review with no findings (see `CLAUDE.md` → Review
Framework). It has no `docs/history/iteration-N/` entry of its own for
that reason: the Iteration Discipline in `CLAUDE.md` captures iterations
that deliver and validate platform behavior, not source-tree moves. See
`docs/PROJECT_KNOWLEDGE.md` for what has and hasn't been validated about
the platform itself.
