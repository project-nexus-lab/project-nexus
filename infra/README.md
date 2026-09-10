# Infrastructure — placeholder

No infrastructure assets exist yet, by design. Iteration 0 runs on PGlite
(an embedded, wire-compatible Postgres) precisely so that zero external
infrastructure — no container runtime, no CI, no deployment target — is
required to build, test, or verify the backend (see
`apps/backend/README.md` §3).

## What belongs here (eventually)

Deployment and environment assets for the one deployable backend and the
future frontend — for example:

- a `Dockerfile` for `apps/backend`, when there's a real deployment target
  to build one for;
- a CI workflow that runs `npm test` from the repository root, when
  there's a team or a remote to make CI meaningful for;
- environment variable templates and a connection-string convention, for
  the point where `apps/backend` swaps PGlite for a networked Postgres
  (a driver change, not a schema change — see `apps/backend/README.md` §3).

## What does not belong here

Per-service infrastructure. Project Nexus is one deployable backend, one
database, one frontend — infrastructure here describes *how that single
deployable is built and run*, not a fleet of independently deployed
services.

## Why it's empty right now

Nothing here is needed until there's a real deployment target or a CI
runner to configure it for. Adding a Dockerfile or a CI workflow with
nothing depending on either yet would be exactly the kind of infrastructure
`CLAUDE.md`'s Simplicity Reviewer flags: solving a hypothetical future
problem instead of a current one.
