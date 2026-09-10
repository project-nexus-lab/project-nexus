-- execution context — MVP_ARCHITECTURE_V2 §7.6
-- Aggregate roots: WorkPackageProfile, WorkPackage (immutable), ExecutionRun.
-- Iteration 0 uses only WorkPackageProfile and WorkPackage (§16: "Work Package generation").
-- ExecutionRun / run_event are schema-only in iteration 0 (orchestration is out of scope).

create table execution.work_package_profile (
  id                    text primary key check (id ~ '^wpp\.[a-z0-9]+(-[a-z0-9]+)*$'),
  name                  text not null,
  context_depth         int not null default 0 check (context_depth between 0 and 3),
  include_all_providers boolean not null default false,
  allow_ambiguous_repo  boolean not null default false,
  created_at            timestamptz not null default now()
);

-- Backs the monotonic wp.<seq> generated-ID form (§6.1). The application reads
-- nextval() and constructs `id` before insert, so both `id` and `seq` are
-- explicit columns exactly as specified in §7.6.
create sequence execution.work_package_seq;

create table execution.work_package (
  id             text primary key check (id ~ '^wp\.[0-9]+$'),
  seq            bigint not null unique,
  task_id        text not null,                 -- historical: no FK (R-3, §7.1)
  profile_id     text not null references execution.work_package_profile(id),
  content_hash   text not null,
  payload        jsonb not null,
  schema_version text not null,
  created_at     timestamptz not null default now(),
  unique (task_id, profile_id, content_hash)
);
revoke update, delete on execution.work_package from public;

create table execution.execution_run (
  id                text primary key check (id ~ '^run\.[0-9A-HJKMNP-TV-Z]{26}$'),
  work_package_id   text not null references execution.work_package(id),
  adapter_id        text not null,              -- opaque; no FK (crosses ACL, §7.1)
  adapter_role_ref  text,                       -- opaque; interpreted only by the adapter
  state             text not null default 'pending'
                      check (state in ('pending','dispatched','running','produced',
                                       'completed','blocked','failed','cancelled')),
  blocked_reason    text check (blocked_reason in
                      ('architecture-change-required','mapping-missing',
                       'context-insufficient')),
  proposal_id       text references architecture.change_proposal(id),
  artifact_ref      text,                       -- PR URL
  started_at        timestamptz,
  ended_at          timestamptz,
  check ((state = 'blocked') = (blocked_reason is not null))
);

create table execution.run_event (
  id      bigserial primary key,
  run_id  text not null references execution.execution_run(id),
  kind    text not null,                        -- one of the six (§12.2)
  payload jsonb,
  at      timestamptz not null default now()
);
