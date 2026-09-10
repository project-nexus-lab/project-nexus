-- runtime context (Runtime Integration, non-core ACL) — MVP_ARCHITECTURE_V2 §7.7
-- Schema-only in iteration 0: no adapter, orchestration, or SDK integration work
-- is in scope. Present so the role vocabulary and vendor-specific strings have
-- a home from day one (§4.4) and never leak into the core schemas.

create table runtime.agent_role (
  id      text primary key check (id ~ '^role\.[a-z0-9]+(-[a-z0-9]+)*$'),
  name    text not null,
  purpose text not null
);

create table runtime.adapter_registration (
  id           text primary key,                 -- 'claude-sdk'
  display_name text not null,
  config       jsonb not null,                   -- model, prompt template, tool policy
  enabled      boolean not null default true
);

create table runtime.adapter_role_support (
  adapter_id text references runtime.adapter_registration(id),
  role_id    text references runtime.agent_role(id),
  primary key (adapter_id, role_id)
);

create table runtime.hint_file_template (
  adapter_id text references runtime.adapter_registration(id),
  file_path  text not null,                      -- 'CLAUDE.md', 'AGENTS.md'
  template   text not null,
  primary key (adapter_id, file_path)
);
