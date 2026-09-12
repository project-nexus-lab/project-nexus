-- Technology Profiles — Iteration 15 (docs/history/iteration-15/SCOPE.md)
--
-- Category-scoped configuration, not a new architecture-taxonomy concept:
-- Product x Category -> Technology Profile. Rejected shape: a single flat
-- profile per Product (composite catalog ids like
-- 'tech.java24-spring-react-postgres-azure' don't decompose into queryable
-- facts, and grow combinatorially). Categories are Architecture-context
-- facts about a Component's role, kept as a small data-driven reference
-- table -- mirroring architecture.legal_containment's own pattern -- so
-- that adding 'frontend'/'infrastructure'/'data' rows later is additive,
-- never a schema or CHECK-constraint change.
--
-- Resolution reuses the existing, already-validated graph.ancestry()
-- traversal (§8.4) to walk a Component up to its Product; there is exactly
-- one attachment point (the Product), so no override or nearest-ancestor-
-- wins resolution logic is needed here, unlike architecture.decision_scope.

create table architecture.technology_category (
  category text primary key
);

insert into architecture.technology_category (category) values
  ('backend'), ('frontend'), ('infrastructure'), ('data');

-- Governance: creating/modifying a profile requires citing an existing
-- Decision (decision_id not null) -- checked at write time, in TypeScript,
-- that the cited decision is 'accepted', not merely that it exists (a bare
-- FK can't express a status requirement). Deliberately not routed through
-- architecture.change_operation: that table already carries disclosed,
-- not-mutually-exclusive schema debt (docs/history/iteration-12/LESSONS.md)
-- that a fourth operation type would inherit, and a profile assignment has
-- none of the cascading side effects (mint/retire/succession) that table's
-- proposal lifecycle exists to govern. See "Decision 2" in this iteration's
-- own SCOPE.md.
create table architecture.technology_profile (
  id               text primary key
                     check (id ~ '^tech\.[a-z0-9]+(-[a-z0-9]+)*$'),
  category         text not null references architecture.technology_category(category),
  language         text not null,
  language_version text not null,
  build_system     text not null,
  decision_id      text not null references architecture.decision(id),
  authored_by      text not null                     -- opaque: 'human:<id>' | 'run:<id>'
);

-- Product ownership: architecture.element has no per-kind table, so (like
-- element_provision's component_kind/capability_kind) product_kind exists
-- only so the composite FK below can require kind = 'product' -- a bare FK
-- on product_id alone cannot express that restriction.
create table architecture.product_technology_profile (
  product_id   text not null,
  product_kind text not null default 'product' check (product_kind = 'product'),
  category     text not null references architecture.technology_category(category),
  profile_id   text not null references architecture.technology_profile(id),
  primary key (product_id, category),
  foreign key (product_id, product_kind) references architecture.element (id, kind)
);

-- A profile assigned to (product, category) must actually be a profile of
-- that category -- the FK on profile_id alone can't express that; enforced
-- the same way check_legal_containment enforces cross-row consistency a
-- bare FK cannot.
create or replace function architecture.check_profile_category_match() returns trigger as $$
declare
  v_profile_category text;
begin
  select category into v_profile_category
    from architecture.technology_profile where id = new.profile_id;

  if v_profile_category is null then
    raise exception 'product_technology_profile: profile % does not exist', new.profile_id;
  end if;

  if v_profile_category <> new.category then
    raise exception 'product_technology_profile: profile % is category %, not %',
      new.profile_id, v_profile_category, new.category;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger product_technology_profile_category_match
  before insert or update of profile_id, category on architecture.product_technology_profile
  for each row execute function architecture.check_profile_category_match();
