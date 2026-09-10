# Nexus Agent Runtime Model

## Principle

Nexus owns workflow.

Agent runtimes own execution.

---

## Architecture

Nexus
→ Context Builder
→ Work Package
→ Runtime Adapter
→ Agent Runtime

---

## Runtime Adapter

Examples:

- Claude SDK Adapter
- OpenAI Adapter
- Gemini Adapter

Adapters convert Work Packages into runtime-specific formats.

---

## Agent Roles

Logical roles:

- Task Analyst
- Context Navigator
- Code Locator
- Implementer
- Knowledge Maintainer
- Consistency Auditor

Roles belong to Nexus.

Models implementing roles may change.
