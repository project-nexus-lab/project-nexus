-- Iteration 0 — one Postgres schema per bounded context (MVP_ARCHITECTURE_V2 §2.4, §7).
create schema if not exists architecture;
create schema if not exists work;
create schema if not exists repo;
create schema if not exists execution;
create schema if not exists runtime;
