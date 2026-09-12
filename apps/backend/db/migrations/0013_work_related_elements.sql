-- work.work_item_related_element — Iteration 14a
--
-- docs/history/iteration-14a/SCOPE.md: relatedElements (Iteration 11,
-- the Work Package's declared "check this out-of-grant element, treat a
-- refusal on it as blocking or not" field) has never had a real
-- authoring path — buildWorkPackage() carries no such field at all;
-- every real use of it to date hand-authors a JS literal and bypasses
-- Work Package generation entirely. Automatic derivation from graph
-- structure was ruled out (not deferred) by direct evidence: neither of
-- Iteration 9/11's own reusable scenarios encodes its required/optional
-- distinction as any graph edge. This table is the declared (human
-- authored, not agent-runtime-derived) source buildWorkPackage() reads
-- instead — matching work.work_item_capability's existing shape exactly.
--
-- No kind restriction on element_id: a related element could be any
-- architecture element kind (the field's own examples in
-- docs/WORK_PACKAGE_SPEC.md name a component, but nothing in the spec
-- restricts it), unlike work_item_capability's kind-checked FK.

create table work.work_item_related_element (
  work_item_id text not null references work.work_item(id),
  element_id   text not null references architecture.element(id),
  required     boolean not null default false,
  primary key (work_item_id, element_id)
);
