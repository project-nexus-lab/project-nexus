-- architecture context — MVP_ARCHITECTURE_V2 §7.3
-- Aggregate roots: ArchitectureElement, ArchitectureChangeProposal, Decision, Constraint.

create table architecture.element (
  id         text primary key
               check (id ~ '^(prod|dom|subsys|comp|cap)\.[a-z0-9]+(-[a-z0-9]+)*$'),
  kind       text not null check (kind in
               ('product','domain','subsystem','component','capability')),
  parent_id  text references architecture.element(id),
  name       text not null,
  status     text not null default 'active'
               check (status in ('active','deprecated','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint element_root_parent
    check ((parent_id is null) = (kind = 'product')),
  constraint element_id_kind_uq unique (id, kind)
);

create table architecture.legal_containment (
  parent_kind text,
  child_kind  text,
  primary key (parent_kind, child_kind)
);
insert into architecture.legal_containment (parent_kind, child_kind) values
  ('product','domain'),
  ('domain','subsystem'),
  ('subsystem','component'),
  ('subsystem','capability');

-- Trigger: (parent.kind, kind) must appear in legal_containment (R-2, §7.2/§7.3).
create or replace function architecture.check_legal_containment() returns trigger as $$
declare
  v_parent_kind text;
begin
  if new.parent_id is null then
    return new; -- root: only 'product' reaches here, enforced by element_root_parent
  end if;

  select kind into v_parent_kind from architecture.element where id = new.parent_id;
  if v_parent_kind is null then
    raise exception 'architecture.element %: parent % does not exist', new.id, new.parent_id;
  end if;

  if not exists (
    select 1 from architecture.legal_containment lc
    where lc.parent_kind = v_parent_kind and lc.child_kind = new.kind
  ) then
    raise exception 'illegal containment: % cannot contain % (element %)',
      v_parent_kind, new.kind, new.id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger element_legal_containment
  before insert or update of parent_id, kind on architecture.element
  for each row execute function architecture.check_legal_containment();

-- Component --provides--> Capability (R-2 §4.2): behavioural, many-to-many, mutable.
create table architecture.element_provision (
  component_id    text not null,
  component_kind  text not null default 'component'
                    check (component_kind = 'component'),
  capability_id   text not null,
  capability_kind text not null default 'capability'
                    check (capability_kind = 'capability'),
  is_primary      boolean not null default false,
  primary key (component_id, capability_id),
  foreign key (component_id, component_kind)
    references architecture.element (id, kind),
  foreign key (capability_id, capability_kind)
    references architecture.element (id, kind)
);

create unique index element_provision_primary_uq
  on architecture.element_provision (capability_id) where is_primary;

create table architecture.element_dependency (
  from_id   text not null,
  from_kind text not null default 'component' check (from_kind = 'component'),
  to_id     text not null,
  to_kind   text not null default 'component' check (to_kind = 'component'),
  primary key (from_id, to_id),
  check (from_id <> to_id),
  foreign key (from_id, from_kind) references architecture.element (id, kind),
  foreign key (to_id,   to_kind)   references architecture.element (id, kind)
);

-- ArchitectureChangeProposal (§3.2, §5) — schema present in iteration 0; the
-- proposal lifecycle (draft/apply flow) is out of scope for iteration 0.
create table architecture.change_proposal (
  id          text primary key
                check (id ~ '^acp\.[0-9A-HJKMNP-TV-Z]{26}$'), -- acp.<ulid>
  intent      text not null,
  state       text not null default 'draft'
                check (state in ('draft','proposed','approved','applied','rejected')),
  authored_by text not null,                     -- opaque: 'human:<id>' | 'run:<id>'
  approved_by text,
  created_at  timestamptz not null default now(),
  applied_at  timestamptz,
  check ((state = 'applied') = (applied_at is not null)),
  check (state not in ('approved','applied') or approved_by is not null)
);

create table architecture.change_operation (
  id                  uuid primary key default gen_random_uuid(),
  proposal_id         text not null references architecture.change_proposal(id),
  ordinal             int  not null,
  op                  text not null check (op in ('create','retire')),
  target_id           text references architecture.element(id),      -- retire
  mint_id             text,                                          -- create
  mint_kind           text,
  mint_parent_id      text references architecture.element(id),
  mint_name           text,
  supersedes_id       text references architecture.element(id),
  requires_repository boolean not null default false,
  unique (proposal_id, ordinal),
  check (case op when 'retire' then target_id is not null
                 when 'create' then mint_id is not null
                                 and mint_kind is not null
                                 and mint_name is not null end)
);

create table architecture.element_succession (
  predecessor_id text not null references architecture.element(id),
  successor_id   text not null references architecture.element(id),
  proposal_id    text not null references architecture.change_proposal(id),
  primary key (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

create table architecture.decision (
  id        text primary key check (id ~ '^adr\.[a-z0-9]+(-[a-z0-9]+)*$'),
  title     text not null,
  status    text not null default 'accepted'
              check (status in ('proposed','accepted','superseded')),
  statement text not null
);

create table architecture.decision_scope (
  decision_id text references architecture.decision(id),
  element_id  text references architecture.element(id),
  primary key (decision_id, element_id)
);

create table architecture.constraint_def (
  id        text primary key check (id ~ '^con\.[a-z0-9]+(-[a-z0-9]+)*$'),
  title     text not null,
  statement text not null
);

create table architecture.element_constraint (
  element_id    text references architecture.element(id),
  constraint_id text references architecture.constraint_def(id),
  primary key (element_id, constraint_id)
);
