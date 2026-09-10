# Packages — placeholder

No packages exist yet. This directory reserves the location for code
genuinely shared between `apps/backend` and `apps/frontend` — nothing more.

## What belongs here (eventually)

Things both apps need *identically*, not things that happen to be useful
in both — for example, the shape of the WorkPackage payload
(`WORK_PACKAGE_SPEC.md`), stable-ID validation regexes, or generated API
types. The test is the same one `CLAUDE.md`'s Simplicity Reviewer would
apply: does this earn its existence as a package, or is one caller (the
backend, today) enough?

## What does not belong here

Business logic split out "in case a service needs it later." Project
Nexus is explicitly one deployable backend (`CLAUDE.md`, this iteration's
migration summary) — a `packages/` directory that grows into a place where
domain logic hides from the backend that owns it is service decomposition
by accident, which this restructuring was scoped to avoid.

## Why it's empty right now

Nothing is shared yet, because there is exactly one consumer of the domain
model: `apps/backend`. The first real package should appear when
`apps/frontend` needs something the backend already defines — most likely
a package of TypeScript types generated from, or mirroring, the WorkPackage
and ID-validation contracts — not before.
