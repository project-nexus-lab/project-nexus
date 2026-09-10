-- repo context — MVP_ARCHITECTURE_V2 §7.5
-- Aggregate root: Repository.

create table repo.repository (
  id               text primary key check (id ~ '^repo\.[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text not null,
  provider         text not null,             -- 'github'
  provider_ref     text,                      -- owner/name, null until provisioned
  default_branch   text not null default 'main',
  bootstrap_state  text not null default 'declared'
                     check (bootstrap_state in
                       ('declared','provisioned','mapped','bootstrapped','active')),
  template_version text,
  created_at       timestamptz not null default now()
);

-- Now that repo.repository exists, close the FK deferred from 0003_work.sql.
alter table work.work_item_repository
  add constraint work_item_repository_repository_fk
  foreign key (repository_id) references repo.repository(id);

create table repo.repository_component (       -- Repository implements Component
  repository_id  text not null references repo.repository(id),
  component_id   text not null,
  component_kind text not null default 'component'
                   check (component_kind = 'component'),
  is_primary     boolean not null default false,
  primary key (repository_id, component_id),
  foreign key (component_id, component_kind)
    references architecture.element (id, kind)
);

create unique index repository_component_primary_uq
  on repo.repository_component (component_id) where is_primary;

create table repo.file_anchor (                -- see §13: under review
  id            uuid primary key default gen_random_uuid(),
  repository_id text not null references repo.repository(id),
  path_glob     text not null,
  element_id    text not null references architecture.element(id),
  note          text
);

create table repo.generated_region (           -- §10.4 managed regions
  repository_id text not null references repo.repository(id),
  file_path     text not null,
  region_hash   text not null,
  primary key (repository_id, file_path)
);
