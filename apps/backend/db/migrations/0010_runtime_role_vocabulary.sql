-- runtime.agent_role vocabulary — MVP_ARCHITECTURE_V2 §4.4, §12.6
--
-- The neutral role vocabulary, preserved in full per §4.4 even though only
-- role.implementer is actually orchestrated in the MVP (§12.6) — the other
-- five are registered as reference data now so their eventual homes are
-- already named, not because anything dispatches them yet.
--
-- Note: role.consistency-auditor is this project's own role vocabulary,
-- straight from MVP_ARCHITECTURE_V2 §4.4 — it predates and is unrelated to
-- the "Consistency Auditor" reviewer in docs/REVIEW_PRINCIPLES.md. The name
-- collision is coincidental, not a reference between the two.

insert into runtime.agent_role (id, name, purpose) values
  ('role.implementer',
   'Implementer',
   'Executes a Work Package via a runtime adapter. The only role actually orchestrated in the MVP (§12.6), paired with wpp.implementation.'),
  ('role.task-analyst',
   'Task Analyst',
   'Assesses whether a Task is ready for Work Package generation. Collapses into the generation gate (§11.2) in the MVP — not separately orchestrated.'),
  ('role.context-navigator',
   'Context Navigator',
   'Expands context during a run. Collapses into MCP tool calls in the MVP (§12.6) — the agent navigates itself.'),
  ('role.code-locator',
   'Code Locator',
   'Locates relevant files in a repository. Collapses into FileAnchors plus the Repository MCP in the MVP (§13, still an open design question).'),
  ('role.knowledge-maintainer',
   'Knowledge Maintainer',
   'Maintains platform knowledge from run observations. Registered but not orchestrated in the MVP — awaits the Observation stream (§15).'),
  ('role.consistency-auditor',
   'Consistency Auditor',
   'Audits architecture and repository alignment. Replaced by the Alignment context''s queries in the MVP (§8.5, §10.5), not a runtime role.');
