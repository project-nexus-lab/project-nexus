# Claude Context

This repository is part of Project Nexus.

## Authoritative Documents

Read and follow:

1. docs/NEXUS_CONSTITUTION.md
2. docs/GRAPH_MODEL.md
3. docs/WORK_PACKAGE_SPEC.md
4. docs/REPOSITORY_MODEL.md
5. docs/AGENT_RUNTIME_MODEL.md
6. docs/MVP_ARCHITECTURE_V2.md
7. docs/REVIEW_PRINCIPLES.md

These documents define the platform's architectural principles and are authoritative. `docs/REVIEW_PRINCIPLES.md` is process, not architecture — it governs how change is evaluated, not what the platform is — but is read and followed with the same weight.

## Architecture Status

`docs/MVP_ARCHITECTURE_V2.md` is the current MVP architecture.

`docs/MVP_ARCHITECTURE.md` is retained for historical reference and design evolution analysis only.

Do not use `docs/MVP_ARCHITECTURE.md` as a source of requirements, domain rules, schemas, workflows, or implementation guidance when conflicts exist.

When evaluating architecture decisions, prefer:

NEXUS_CONSTITUTION.md
→ supporting model documents
→ MVP_ARCHITECTURE_V2.md

in that order.

## Design Rules

When proposing designs, schemas, APIs, workflows, code or documentation:

- Follow the Nexus Constitution.
- Preserve agent-runtime independence.
- Preserve architecture authority hierarchy.
- Preserve graph-centric modeling.
- Prefer structured knowledge over prose.
- Prefer stable identifiers over names.
- Prefer deterministic retrieval over broad context loading.
- Avoid introducing Claude-specific concepts into the core domain model.

## Architecture Principles

Assume:

Nexus Platform
→ System of Truth

Graph Model
→ Canonical relationship model

Work Package
→ Universal execution contract

Agent Runtime Adapter
→ Runtime-specific integration layer

Repositories
→ Implementation projections

GitHub
→ Review and merge governance

Claude
→ Execution runtime

Claude is not part of the platform domain model.

## Project Knowledge

Consult:

- docs/PROJECT_KNOWLEDGE.md

for validated, invalidated and unresolved assumptions.

Historical iteration reports are supporting material and should only be consulted when investigating design history.

## Review Framework

Project Nexus is in iterative development. In addition to implementation
work, every significant change, iteration, and architectural decision must
be evaluated through the five reviewers, the Architecture Critic
perspective, and the Iteration Discipline defined in full in
`docs/REVIEW_PRINCIPLES.md`. Read and follow that document — it is not
restated here, so this file doesn't become a second, driftable copy of it.

In short: Constitution Reviewer, Domain Integrity Reviewer, Simplicity
Reviewer, Evidence Reviewer, and Consistency Auditor, each `PASS` or
specific findings; every iteration ends in a Report and Lessons under
`docs/history/iteration-N/`; every Lessons update feeds
`docs/PROJECT_KNOWLEDGE.md`, never bypasses it. For the exact questions,
output formats, and the authority order between these documents, see
`docs/REVIEW_PRINCIPLES.md`.

Two commands invoke this process directly rather than requiring it to be
restated each time: `/review [scope]` applies the five reviewers (default
scope: uncommitted changes) — distinct from the general-purpose
`code-review` skill, which checks different things; `/iteration-close
<N>` runs the Iteration Discipline for iteration N. Both are thin pointers
into `docs/REVIEW_PRINCIPLES.md`, defined in `.claude/commands/`.

## Working Style

Before introducing a new concept:

1. Identify the bounded context it belongs to.
2. Define ownership and authority.
3. Define stable identifiers.
4. Define graph relationships.
5. Define alignment and drift-detection requirements.
6. Verify consistency with the Nexus Constitution.

When uncertain:

- favor simplicity
- favor explicit relationships
- favor centralized authority
- avoid duplicate sources of truth
