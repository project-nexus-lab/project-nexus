# Claude Context

This repository is part of Project Nexus.

## Authoritative Documents

Read and follow:

1. docs/NEXUS_CONSTITUTION.md
2. docs/GRAPH_MODEL.md
3. docs/WORK_PACKAGE_SPEC.md
4. docs/REPOSITORY_MODEL.md
5. docs/AGENT_RUNTIME_MODEL.md

These documents define the platform's architectural principles and are authoritative.

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
