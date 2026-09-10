# Nexus Repository Model

## Repository Role

Repositories are implementation containers.

Repositories are not architecture authorities.

Repositories are projections of Nexus architecture.

---

## Repository Ownership

Repositories own:

- source code
- tests
- infrastructure
- build configuration
- deployment configuration
- implementation mappings

Repositories do not own:

- products
- domains
- subsystems
- capabilities

---

## Repository Creation

Repositories are created from Nexus.

Workflow:

Create Component
→ Create Repository
→ Register Mapping
→ Generate Bootstrap
→ Begin Implementation

Repositories should not be manually created.

---

## Component Mapping

Every repository must declare:

Repository
→ implements
→ Component

Example:

repo.billing-service

implements:

- comp.invoice-service

---

## Drift Detection

CI should fail when:

- component mappings are missing
- architecture references are invalid
- capabilities are disconnected
- Nexus references are stale

---

## Repository Projection

Generated artifacts may include:

- CLAUDE.md
- AGENTS.md
- repo metadata
- architecture snapshots

These artifacts are projections.

Nexus remains authoritative.
