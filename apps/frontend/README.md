# Nexus Frontend — placeholder

No implementation. This directory reserves the frontend's place in the
workspace (`package.json` is minimal, no framework chosen, no source
files) so that when frontend work actually starts, it starts inside an
already-wired monorepo instead of triggering a second restructuring.

## Why this doesn't exist yet

`docs/MVP_ARCHITECTURE_V2.md` §15 defers a web UI past Iteration 0/1; a
frontend has no consumer to talk to until the REST layer (§16 iteration
1a) and/or MCP servers (1e) exist. Scaffolding a framework now, with
nothing real for it to render, would be exactly the kind of speculative
structure `CLAUDE.md`'s Simplicity Reviewer exists to catch — deferring a
choice is not the same as being unprepared for it (this placeholder *is*
the preparation).

## What it will be

A client of the backend's future HTTP/API surface — **never** a second
place architecture, work, or repository data can originate or be cached
as truth. Per `docs/NEXUS_CONSTITUTION.md`, the platform database (behind
`apps/backend`) remains the system of truth; the frontend reads and
displays it.

## When this fills in

When Iteration 1a's REST endpoints exist and there's something to build a
screen against. At that point: pick a framework, add real dependencies to
`package.json`, add a `src/` directory, and add this app to whatever root
scripts (`npm run dev`, etc.) make sense then — not before.
