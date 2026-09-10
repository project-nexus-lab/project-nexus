-- alignment context — MVP_ARCHITECTURE_V2 §8.5
-- "Alignment owns no state: named queries plus one verify endpoint." (§2.1)
-- Iteration 0 implements the two queries explicitly in scope: orphanTasks()
-- (the constitutional no-orphan-task invariant) and unprovidedCapabilities()
-- (the state that replaced v1's orphaned tree node, §4.2).

create schema if not exists alignment;

-- orphanTasks(): Task with no AFFECTS edge.
create or replace function alignment.orphan_tasks()
returns table (task_id text, title text, status text) as $$
  select wi.id, wi.title, wi.status
  from work.work_item wi
  where wi.kind = 'task'
    and not exists (
      select 1 from work.work_item_capability wc where wc.work_item_id = wi.id
    );
$$ language sql stable;

-- unprovidedCapabilities(): Capability with no provider.
create or replace function alignment.unprovided_capabilities()
returns table (capability_id text, name text) as $$
  select e.id, e.name
  from architecture.element e
  where e.kind = 'capability'
    and e.status = 'active'
    and not exists (
      select 1 from architecture.element_provision ep where ep.capability_id = e.id
    );
$$ language sql stable;
