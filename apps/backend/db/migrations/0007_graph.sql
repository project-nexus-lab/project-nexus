-- graph schema — MVP_ARCHITECTURE_V2 §8
-- "In the MVP [the graph] is a set of named recursive-CTE views over Postgres."
-- These are the named traversals of §8.4. They are read-only, cross-context by
-- design (the graph sits above the bounded contexts), and are the only
-- sanctioned retrieval path — no ad-hoc queries, no document search (§8.1, §9.1).

create schema if not exists graph;

-- ancestry(element): element →CONTAINS*→ root. Returns the element itself at
-- depth 0, then each ancestor outward. Architecture-only: decisions and
-- constraints attach to architecture.element (§8.6), which is what ancestry
-- feeds into governanceOf.
create or replace function graph.ancestry(p_element_id text)
returns table (id text, kind text, name text, depth int) as $$
  with recursive anc as (
    select e.id, e.kind, e.name, e.parent_id, 0 as depth
    from architecture.element e
    where e.id = p_element_id
    union all
    select e.id, e.kind, e.name, e.parent_id, anc.depth + 1
    from architecture.element e
    join anc on e.id = anc.parent_id
  )
  select id, kind, name, depth from anc order by depth;
$$ language sql stable;

-- providersOf(capability): Capability ←PROVIDES← Component
create or replace function graph.providers_of(p_capability_id text)
returns table (component_id text, is_primary boolean) as $$
  select ep.component_id, ep.is_primary
  from architecture.element_provision ep
  where ep.capability_id = p_capability_id;
$$ language sql stable;

-- capabilitiesOf(component): Component →PROVIDES→ Capability
create or replace function graph.capabilities_of(p_component_id text)
returns table (capability_id text, is_primary boolean) as $$
  select ep.capability_id, ep.is_primary
  from architecture.element_provision ep
  where ep.component_id = p_component_id;
$$ language sql stable;

-- implementationPath(task):
--   Task→AFFECTS→Capability←PROVIDES←Component←IMPLEMENTS←Repository
-- Multi-valued at the Component and Repository steps (§8.4, §4.2). Repository
-- resolution order (explicit override → primary → ambiguous) is applied by
-- the caller (§4.3) — this traversal returns the raw graph, not a resolved
-- path. Both joins are LEFT JOINs deliberately: an affected capability with
-- zero providers (or a provided component with zero mapped repositories)
-- must still appear here as a row with nulls, not silently disappear — the
-- Work Package gate (§11.2 step 1) depends on seeing it to reject it.
create or replace function graph.implementation_path(p_task_id text)
returns table (
  capability_id       text,
  component_id        text,
  provider_is_primary boolean,
  repository_id       text,
  repo_is_primary     boolean
) as $$
  select
    wc.capability_id,
    ep.component_id,
    ep.is_primary as provider_is_primary,
    rc.repository_id,
    rc.is_primary as repo_is_primary
  from work.work_item_capability wc
  left join architecture.element_provision ep on ep.capability_id = wc.capability_id
  left join repo.repository_component rc on rc.component_id = ep.component_id
  where wc.work_item_id = p_task_id;
$$ language sql stable;

-- impactOf(component, depth): Component→DEPENDS_ON{1..depth}→Component
create or replace function graph.impact_of(p_component_id text, p_depth int)
returns table (component_id text, distance int) as $$
  with recursive impact as (
    select p_component_id::text as component_id, 0 as distance
    union all
    select d.to_id, impact.distance + 1
    from architecture.element_dependency d
    join impact on d.from_id = impact.component_id
    where impact.distance < p_depth
  )
  select component_id, distance from impact where distance > 0;
$$ language sql stable;

-- governanceOf(element): ancestry(element) ←GOVERNS/CONSTRAINS← Decision/Constraint.
-- Single-element form per §8.4. The Work Package's union-over-multiple-elements
-- form (§11.2 step 6, nearest-ancestor-wins) is composed by the caller from
-- repeated calls to this function (kept here as one element, one rule).
create or replace function graph.governance_of(p_element_id text)
returns table (
  decision_id   text,
  constraint_id text,
  via_element_id text,
  depth         int
) as $$
  select ds.decision_id, null::text as constraint_id, a.id as via_element_id, a.depth
  from graph.ancestry(p_element_id) a
  join architecture.decision_scope ds on ds.element_id = a.id
  union all
  select null::text as decision_id, ec.constraint_id, a.id as via_element_id, a.depth
  from graph.ancestry(p_element_id) a
  join architecture.element_constraint ec on ec.element_id = a.id;
$$ language sql stable;

-- resolve(id): element →SUPERSEDED_BY*→ active successor set (§5.5, §8.4).
-- Iteration 0 ships the succession table with no data path that populates it
-- (proposal application is postponed, §5). This still walks it correctly so
-- callers never special-case "no succession yet" vs. "resolved".
create or replace function graph.resolve(p_id text)
returns table (id text) as $$
  with recursive chain as (
    select p_id::text as id
    union all
    select s.successor_id
    from architecture.element_succession s
    join chain on s.predecessor_id = chain.id
  )
  select c.id
  from chain c
  where not exists (
    select 1 from architecture.element_succession s2 where s2.predecessor_id = c.id
  );
$$ language sql stable;
