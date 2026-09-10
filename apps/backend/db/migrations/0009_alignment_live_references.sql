-- alignment.live_references — MVP_ARCHITECTURE_V2 §5.6, §8.5, §2.3
--
-- §5.6's retirement policy needs to know whether an element has a live
-- inbound reference from a non-terminal Task or an active Repository. But
-- §2.3's declared dependency directions give Architecture no read
-- dependency on Work or Repository at all (only the reverse: Work ->
-- Architecture, Repository -> Architecture). Alignment is declared
-- read-only across every context (§2.1, §2.3: "Alignment -> all
-- (read-only)") specifically so cross-context checks like this one do not
-- have to be embedded in the context that would otherwise have to reach
-- outside its own boundary to make them. This query is Alignment's answer
-- to a question Architecture is not allowed to ask directly — discovered
-- as a real boundary violation while building the proposal lifecycle
-- (§5.6's retirement check), not designed in from the start; see
-- docs/history/iteration-1/LESSONS.md.

create or replace function alignment.live_references(p_element_id text)
returns table (
  reference_kind text, -- 'task' | 'repository'
  reference_id   text
) as $$
  select 'task'::text, wi.id
  from work.work_item_capability wc
  join work.work_item wi on wi.id = wc.work_item_id
  where wc.capability_id = p_element_id
    and wi.status not in ('done', 'cancelled')
  union all
  select 'repository'::text, r.id
  from repo.repository_component rc
  join repo.repository r on r.id = rc.repository_id
  where rc.component_id = p_element_id
    and r.bootstrap_state = 'active';
$$ language sql stable;
