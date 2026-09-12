-- architecture.change_operation: add 'provide' operation — Iteration 12
--
-- docs/history/iteration-12/SCOPE.md found that `create` mints an element
-- but a proposal minting a component to satisfy an unprovided capability
-- left that capability unprovided after apply — `buildWorkPackage`'s gate
-- and `unprovidedCapabilities()` both check for a real element_provision
-- row, not merely the component's existence. This adds the missing
-- operation, writing into the existing architecture.element_provision
-- table unchanged: no new invariant, its own FK-by-(id,kind) and
-- at-most-one-primary-provider unique index remain the final word (§7.2),
-- the same discipline importArchitecture's own comment already states
-- for containment.

-- No FK here, deliberately — same reason mint_id has none: a 'provide'
-- operation may name a component minted by an earlier 'create' operation
-- in the very same proposal, which does not exist yet when the operation
-- is drafted. Existence and kind are checked once, at apply time, by the
-- real insert into element_provision below (its own FK is the final word).
alter table architecture.change_operation
  add column provide_component_id  text,
  add column provide_capability_id text,
  add column provide_is_primary    boolean not null default false;

alter table architecture.change_operation
  drop constraint change_operation_op_check,
  add constraint change_operation_op_check
    check (op in ('create', 'retire', 'provide'));

alter table architecture.change_operation
  drop constraint change_operation_check,
  add constraint change_operation_check
    check (case op
             when 'retire'  then target_id is not null
             when 'create'  then mint_id is not null
                             and mint_kind is not null
                             and mint_name is not null
             when 'provide' then provide_component_id is not null
                             and provide_capability_id is not null
           end);
