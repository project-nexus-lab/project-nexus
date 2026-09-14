-- architecture.change_operation: add 'decide' operation — Iteration 16
--
-- docs/history/iteration-16/SCOPE.md: architecture.decision has no
-- governed creation path -- every row to date is a direct insert (the
-- YAML seed importer, or a hand-written statement). This closes that
-- gap the same way 'provide' (Iteration 12) closed the equivalent gap
-- for Elements: a fourth operation on the existing
-- ArchitectureChangeProposal mechanism, not a second, parallel
-- proposal-and-approval lifecycle built for Decisions alone.
--
-- A Decision is inserted only at apply time, already in its terminal
-- 'accepted' status -- the same pattern 'create' already established
-- for Elements (minted only at apply time, already 'active'). No new
-- table, no attribution columns on architecture.decision itself:
-- attribution is discoverable the same indirect way a minted Element's
-- is already discoverable today, by joining back through
-- change_operation/change_proposal.
alter table architecture.change_operation
  add column decide_id        text,
  add column decide_title     text,
  add column decide_statement text;

alter table architecture.change_operation
  drop constraint change_operation_op_check,
  add constraint change_operation_op_check
    check (op in ('create', 'retire', 'provide', 'decide'));

-- Iteration 12's own /review disclosed this constraint as presence-only,
-- not presence-and-absence, and named exactly this moment as when it
-- would have to be paid: "before a fourth operation type is added...
-- decide... a mutual-exclusivity check across all column groups... or
-- the discriminated jsonb payload" (docs/history/iteration-12/LESSONS.md).
-- Resolved here as a mutual-exclusivity check, covering create/retire/
-- provide retroactively as well as the new decide branch -- not a new
-- debt scoped only to the newest operation. requires_repository and
-- provide_is_primary are deliberately excluded from this check: both are
-- `not null default false` on every row regardless of op, never treated
-- as an identifying field the original constraint asserted presence or
-- absence of.
alter table architecture.change_operation
  drop constraint change_operation_check,
  add constraint change_operation_check
    check (
      case op
        when 'retire' then
          target_id is not null
          and mint_id is null and mint_kind is null and mint_parent_id is null
          and mint_name is null and supersedes_id is null
          and provide_component_id is null and provide_capability_id is null
          and decide_id is null and decide_title is null and decide_statement is null
        when 'create' then
          mint_id is not null and mint_kind is not null and mint_name is not null
          and target_id is null
          and provide_component_id is null and provide_capability_id is null
          and decide_id is null and decide_title is null and decide_statement is null
        when 'provide' then
          provide_component_id is not null and provide_capability_id is not null
          and target_id is null
          and mint_id is null and mint_kind is null and mint_parent_id is null
          and mint_name is null and supersedes_id is null
          and decide_id is null and decide_title is null and decide_statement is null
        when 'decide' then
          decide_id is not null and decide_title is not null and decide_statement is not null
          and target_id is null
          and mint_id is null and mint_kind is null and mint_parent_id is null
          and mint_name is null and supersedes_id is null
          and provide_component_id is null and provide_capability_id is null
      end
    );
