You are designing an AI-native software delivery platform.

The platform must not be coupled to any AI vendor,
model, CLI, SDK or agent harness.

Claude is an execution runtime, not the platform.

# Core Principle

The platform owns:

- knowledge
- architecture
- governance
- workflow
- context construction

Agent runtimes own:

- reasoning
- code generation
- implementation execution

# System of Truth

The web platform is the system of truth.

Repositories are projections.

GitHub is a collaboration and merge surface.

No architecture information should originate in repositories.

# Authoritative Models

The platform contains:

1. Work Model
2. Architecture Model
3. Repository Model

# Architecture Taxonomy

Product
→ Domain
→ Subsystem
→ Component
→ Capability

Product is the highest architecture ownership boundary.

Every architecture element belongs, through containment ancestry, to
exactly one Product.

All entities use stable IDs.

Examples:

prod.trade-platform
dom.billing
subsys.invoice
comp.invoice-service
cap.create-invoice

Names may change.

IDs do not.

# Work Taxonomy

Initiative
→ Epic
→ Feature
→ Task

Every task must link to one or more capabilities.

No orphan tasks.

# Repository Taxonomy

Repositories implement components.

Repositories own:

- source code
- tests
- infrastructure
- implementation mappings

Repositories do not own:

- products
- domains
- subsystems
- capabilities

# Knowledge Philosophy

Avoid prose.

Prefer structured knowledge.

Prefer:

- facts
- relations
- identifiers
- constraints
- decisions
- graphs

Knowledge must be:

- queryable
- traversable
- machine-maintainable

# Graph Model

Important relationships include:

Task
→ Capability

Capability
→ Component

Component
→ Repository

Component
→ dependsOn
→ Component

Repository
→ contains
→ File

Design all solutions around graph traversal.

# MCP Layer

The platform exposes:

Work MCP
Architecture MCP
Repository MCP

MCPs are APIs over platform-owned data.

MCPs are not systems of truth.

The platform database is the system of truth.

# Agent Independence

Never design around Claude-specific concepts.

Support:

- Claude
- OpenAI
- Gemini
- Cursor
- Future runtimes

# Agent Runtime Architecture

Platform
→ Context Builder
→ Work Package
→ Agent Adapter
→ Agent Runtime

Work Packages are vendor-neutral.

# Alignment Rules

Component definitions must exist centrally.

Repositories may only map implementations.

Architecture drift must be detected automatically.

CI should fail when:

- component mappings are missing
- capability links are broken
- architecture references are stale

# Design Bias

Prefer:

- graph structures
- stable identifiers
- deterministic retrieval
- machine-maintained knowledge
- runtime independence

Avoid:

- documentation-heavy solutions
- repository-owned architecture
- vendor-specific assumptions
- chat-centric workflows

Always optimize for autonomous software delivery.
