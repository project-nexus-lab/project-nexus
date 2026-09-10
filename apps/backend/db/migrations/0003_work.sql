-- work context — MVP_ARCHITECTURE_V2 §7.4
-- Aggregate root: WorkItem (Initiative → Epic → Feature → Task).

create table work.work_item (
  id                     text primary key
                           check (id ~ '^(init|epic|feat|task)\.[a-z0-9]+(-[a-z0-9]+)*$'),
  kind                   text not null check (kind in
                           ('initiative','epic','feature','task')),
  parent_id              text references work.work_item(id),
  title                  text not null,
  status                 text not null default 'draft'
                           check (status in ('draft','ready','blocked',
                                             'in_progress','done','cancelled')),
  blocked_by_proposal_id text references architecture.change_proposal(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint work_item_root_parent
    check ((parent_id is null) = (kind = 'initiative')),
  check (blocked_by_proposal_id is null or status = 'blocked')
);

create table work.legal_containment (
  parent_kind text,
  child_kind  text,
  primary key (parent_kind, child_kind)
);
insert into work.legal_containment (parent_kind, child_kind) values
  ('initiative','epic'),
  ('epic','feature'),
  ('feature','task');

-- Trigger: legal containment by kind, same pattern as architecture.element (§7.4).
create or replace function work.check_legal_containment() returns trigger as $$
declare
  v_parent_kind text;
begin
  if new.parent_id is null then
    return new; -- root: only 'initiative' reaches here, enforced by work_item_root_parent
  end if;

  select kind into v_parent_kind from work.work_item where id = new.parent_id;
  if v_parent_kind is null then
    raise exception 'work.work_item %: parent % does not exist', new.id, new.parent_id;
  end if;

  if not exists (
    select 1 from work.legal_containment lc
    where lc.parent_kind = v_parent_kind and lc.child_kind = new.kind
  ) then
    raise exception 'illegal containment: % cannot contain % (work item %)',
      v_parent_kind, new.kind, new.id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger work_item_legal_containment
  before insert or update of parent_id, kind on work.work_item
  for each row execute function work.check_legal_containment();

-- Task --affects--> Capability (§4.3). Live FK: bears the no-orphan-task invariant (§7.1).
create table work.work_item_capability (
  work_item_id    text not null references work.work_item(id),
  capability_id   text not null,
  capability_kind text not null default 'capability'
                    check (capability_kind = 'capability'),
  primary key (work_item_id, capability_id),
  foreign key (capability_id, capability_kind)
    references architecture.element (id, kind)
);

-- Task --implementedIn--> Repository (override only, §4.3). Table created here;
-- the FK to repo.repository is added in 0004_repo.sql once that table exists.
create table work.work_item_repository (
  work_item_id  text not null references work.work_item(id),
  repository_id text not null,
  primary key (work_item_id, repository_id)
);

create table work.acceptance_criterion (
  id           text primary key check (id ~ '^ac\.[a-z0-9]+(-[a-z0-9]+)*$'),
  work_item_id text not null references work.work_item(id),
  statement    text not null,
  ordinal      int not null,
  unique (work_item_id, ordinal)
);
