-- Execution run telemetry — evidence preservation for real agent runs.
-- Raw facts only: no cost calculation, no aggregation, no analytics.
-- One row per run, written once from inside the driving adapter's
-- events() (see src/execution/telemetry.ts, src/runtime/adapters/claude-sdk.ts).
--
-- Deliberately separate from execution.execution_run / execution.run_event
-- (schema since Iteration 0, still unwritten — they model a full
-- Orchestrator-driven state machine this focused enhancement does not
-- build). Telemetry is evidence about what happened, not the run's
-- lifecycle state; conflating the two would pull unrelated columns
-- (blocked_reason, proposal_id, artifact_ref) into a table that has
-- nothing to do with them.
--
-- work_package_id and runtime_adapter_id are opaque text, no FK —
-- deliberately, the same reasoning execution_run.adapter_id already uses
-- ("opaque; no FK, crosses ACL, §7.1"). Every run driven in this codebase
-- so far uses a synthetic work package id, not a real wp.<seq> row; a hard
-- FK would make telemetry writes fail for exactly the runs that need
-- evidence captured.
create table execution.run_telemetry (
  run_id                     text primary key
                               check (run_id ~ '^run\.[0-9A-HJKMNP-TV-Z]{26}$'),
  work_package_id            text not null,
  runtime_adapter_id         text not null,

  started_at                 timestamptz not null,
  completed_at               timestamptz,
  duration_ms                bigint,

  -- Tokens: null when unavailable, never estimated (see telemetry.ts).
  input_tokens                bigint,
  output_tokens                bigint,
  total_tokens                bigint,

  -- Context: facts about the Work Package and grant this run was issued
  -- against. work_package_size_tokens is always null today — no
  -- tokenizer call is made; see src/execution/telemetry.ts for why.
  work_package_size_bytes    bigint,
  work_package_size_tokens   bigint,
  capability_count           int,
  component_count            int,
  repository_count           int,
  grant_element_count        int,
  grant_repository_count     int,

  -- Retrieval: accessed_repository_count is always null today — no
  -- repository-scoped MCP tool exists yet (only getAncestry and
  -- getCapabilitiesOf, both element-scoped); see telemetry.ts.
  accessed_element_count     int,
  accessed_repository_count  int,

  created_at                 timestamptz not null default now()
);
revoke update, delete on execution.run_telemetry from public;
