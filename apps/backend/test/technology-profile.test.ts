import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  assignTechnologyProfile,
  createTechnologyProfile,
  DecisionNotAcceptedError,
  ProductNotFoundError,
  resolveTechnologyProfile,
} from "../src/architecture/technology-profile.js";
import type { NexusDb } from "../src/db/client.js";
import { seededDb } from "./helpers.js";

let db: NexusDb;
before(async () => {
  db = await seededDb();
});
after(async () => {
  await db.close();
});

test("technology_category is seeded with exactly the four known categories", async () => {
  const { rows } = await db.query<{ category: string }>(
    `select category from architecture.technology_category order by category`,
  );
  assert.deepEqual(
    rows.map((r) => r.category),
    ["backend", "data", "frontend", "infrastructure"],
  );
});

test("a fifth category requires only a data row, no schema or CHECK-constraint change", async () => {
  await db.query(`insert into architecture.technology_category (category) values ('mobile')`);
  const { rows } = await db.query<{ category: string }>(
    `select category from architecture.technology_category where category = 'mobile'`,
  );
  assert.equal(rows.length, 1);
});

test("createTechnologyProfile rejects a decisionId that does not exist", async () => {
  await assert.rejects(
    () =>
      createTechnologyProfile(db, {
        id: "tech.iter15-no-decision",
        category: "backend",
        language: "Java",
        languageVersion: "24",
        buildSystem: "Gradle",
        decisionId: "adr.does-not-exist",
        authoredBy: "human:po",
      }),
    (err) => err instanceof DecisionNotAcceptedError,
  );
});

test("createTechnologyProfile rejects a decision that exists but is not 'accepted'", async () => {
  await db.query(
    `insert into architecture.decision (id, title, status, statement)
     values ('adr.iter15-proposed-only', 'Proposed only', 'proposed', 'not yet accepted')`,
  );
  await assert.rejects(
    () =>
      createTechnologyProfile(db, {
        id: "tech.iter15-proposed-decision",
        category: "backend",
        language: "Java",
        languageVersion: "24",
        buildSystem: "Gradle",
        decisionId: "adr.iter15-proposed-only",
        authoredBy: "human:po",
      }),
    (err) => err instanceof DecisionNotAcceptedError,
  );
});

test("createTechnologyProfile succeeds when the cited decision is accepted (reusing the seed's own adr.discount-strategy-v1)", async () => {
  const { id } = await createTechnologyProfile(db, {
    id: "tech.iter15-reused-decision",
    category: "backend",
    language: "Java",
    languageVersion: "24",
    buildSystem: "Gradle",
    decisionId: "adr.discount-strategy-v1",
    authoredBy: "human:po",
  });
  assert.equal(id, "tech.iter15-reused-decision");
});

test("assignTechnologyProfile rejects a productId that is not a 'product' element", async () => {
  await db.query(
    `insert into architecture.decision (id, title, status, statement)
     values ('adr.iter15-nonproduct-target', 'x', 'accepted', 'stmt')`,
  );
  await createTechnologyProfile(db, {
    id: "tech.iter15-nonproduct-target",
    category: "backend",
    language: "Java",
    languageVersion: "24",
    buildSystem: "Gradle",
    decisionId: "adr.iter15-nonproduct-target",
    authoredBy: "human:po",
  });

  await assert.rejects(
    () =>
      assignTechnologyProfile(db, {
        productId: "dom.billing", // a domain, not a product
        category: "backend",
        profileId: "tech.iter15-nonproduct-target",
      }),
    (err) => err instanceof ProductNotFoundError,
  );
});

test("assignTechnologyProfile rejects assigning a profile whose own category does not match the assignment category", async () => {
  await db.query(
    `insert into architecture.decision (id, title, status, statement)
     values ('adr.iter15-category-mismatch', 'x', 'accepted', 'stmt')`,
  );
  await createTechnologyProfile(db, {
    id: "tech.iter15-category-mismatch",
    category: "backend",
    language: "Java",
    languageVersion: "24",
    buildSystem: "Gradle",
    decisionId: "adr.iter15-category-mismatch",
    authoredBy: "human:po",
  });

  await assert.rejects(() =>
    assignTechnologyProfile(db, {
      productId: "prod.trade-platform",
      category: "frontend", // profile's own category is 'backend'
      profileId: "tech.iter15-category-mismatch",
    }),
  );
});

test("Iteration 15 v1 example end-to-end: decision -> profile -> assignment -> resolution via ancestry()", async () => {
  await db.query(
    `insert into architecture.decision (id, title, status, statement)
     values ('adr.backend-stack-java24-gradle', 'Backend stack: Java 24 + Gradle', 'accepted',
             'The backend category standardizes on Java 24 with Gradle as its build system.')`,
  );

  const { id: profileId } = await createTechnologyProfile(db, {
    id: "tech.java24-gradle",
    category: "backend",
    language: "Java",
    languageVersion: "24",
    buildSystem: "Gradle",
    decisionId: "adr.backend-stack-java24-gradle",
    authoredBy: "human:po",
  });

  await assignTechnologyProfile(db, {
    productId: "prod.trade-platform",
    category: "backend",
    profileId,
  });

  // comp.invoice-service -> subsys.invoice -> dom.billing -> prod.trade-platform:
  // three containment levels between the Component and its Product, exercising
  // ancestry() rather than a direct product_id lookup.
  const resolved = await resolveTechnologyProfile(db, "comp.invoice-service", "backend");
  assert.deepEqual(resolved, {
    id: "tech.java24-gradle",
    category: "backend",
    language: "Java",
    languageVersion: "24",
    buildSystem: "Gradle",
    decisionId: "adr.backend-stack-java24-gradle",
  });
});

test("resolveTechnologyProfile returns null for a category with no assignment on that Product", async () => {
  const resolved = await resolveTechnologyProfile(db, "comp.payment-service", "frontend");
  assert.equal(resolved, null);
});

test("assignTechnologyProfile called again for the same (product, category) replaces the assignment (explicit replace, not silently duplicated)", async () => {
  await db.query(
    `insert into architecture.decision (id, title, status, statement)
     values ('adr.iter15-second-backend-decision', 'A second accepted backend decision', 'accepted', 'stmt')`,
  );
  const { id: firstProfileId } = await createTechnologyProfile(db, {
    id: "tech.iter15-replace-first",
    category: "backend",
    language: "Java",
    languageVersion: "21",
    buildSystem: "Maven",
    decisionId: "adr.iter15-second-backend-decision",
    authoredBy: "human:po",
  });
  const { id: secondProfileId } = await createTechnologyProfile(db, {
    id: "tech.iter15-replace-second",
    category: "backend",
    language: "Kotlin",
    languageVersion: "2.0",
    buildSystem: "Gradle",
    decisionId: "adr.iter15-second-backend-decision",
    authoredBy: "human:po",
  });

  await db.query(
    `insert into architecture.element (id, kind, parent_id, name)
     values ('prod.iter15-replace', 'product', null, 'Replace Test Product')`,
  );

  await assignTechnologyProfile(db, {
    productId: "prod.iter15-replace",
    category: "backend",
    profileId: firstProfileId,
  });
  await assignTechnologyProfile(db, {
    productId: "prod.iter15-replace",
    category: "backend",
    profileId: secondProfileId,
  });

  const { rows } = await db.query<{ profile_id: string }>(
    `select profile_id from architecture.product_technology_profile
     where product_id = 'prod.iter15-replace' and category = 'backend'`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.profile_id, "tech.iter15-replace-second");
});
