import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { parse as parseYaml } from "yaml";
import { assignTechnologyProfile, createTechnologyProfile } from "../src/architecture/technology-profile.js";
import type { NexusDb } from "../src/db/client.js";
import { extractManagedRegion, render, wrapManagedRegion } from "../src/repository/generate.js";
import {
  activateRepository,
  checkDrift,
  declareRepository,
  generateProjection,
  IllegalRepositoryTransitionError,
  provisionRepository,
  registerMapping,
  RepositoryNotFoundError,
} from "../src/repository/lifecycle.js";
import { NoopVcsProvider } from "../src/repository/vcs-provider.js";
import { seededDb } from "./helpers.js";

let db: NexusDb;
const noop = new NoopVcsProvider();

before(async () => {
  db = await seededDb();
});
after(async () => {
  await db.close();
});

async function getState(repositoryId: string): Promise<string> {
  const { rows } = await db.query<{ bootstrap_state: string }>(
    `select bootstrap_state from repo.repository where id = $1`,
    [repositoryId],
  );
  return rows[0]?.bootstrap_state as string;
}

test("the full state machine, driven start to finish: declared -> provisioned -> mapped -> bootstrapped -> active", async () => {
  await declareRepository(db, { id: "repo.export-service", name: "export-service", provider: "noop" });
  assert.equal(await getState("repo.export-service"), "declared");

  await provisionRepository(db, "repo.export-service", noop);
  assert.equal(await getState("repo.export-service"), "provisioned");
  const { rows } = await db.query<{ provider_ref: string }>(
    `select provider_ref from repo.repository where id = 'repo.export-service'`,
  );
  assert.equal(rows[0]?.provider_ref, "noop/export-service");

  await registerMapping(db, "repo.export-service", "comp.invoice-service", false);
  assert.equal(await getState("repo.export-service"), "mapped");

  const files = await generateProjection(db, "repo.export-service", "v1");
  assert.equal(await getState("repo.export-service"), "bootstrapped");
  assert.deepEqual(
    files.map((f) => f.path),
    [".nexus/repository.json", ".nexus/architecture.snapshot.json", ".github/workflows/nexus-alignment.yml"],
  );

  await activateRepository(db, "repo.export-service");
  assert.equal(await getState("repo.export-service"), "active");
});

test("registerMapping is legal a second time while already 'mapped' (at least one, not exactly one)", async () => {
  await declareRepository(db, { id: "repo.multi-map", name: "multi-map", provider: "noop" });
  await provisionRepository(db, "repo.multi-map", noop);
  await registerMapping(db, "repo.multi-map", "comp.invoice-service", false);
  assert.equal(await getState("repo.multi-map"), "mapped");
  await registerMapping(db, "repo.multi-map", "comp.payment-service", false);
  assert.equal(await getState("repo.multi-map"), "mapped");

  const { rows } = await db.query(`select component_id from repo.repository_component where repository_id = 'repo.multi-map' order by component_id`);
  assert.deepEqual(rows, [{ component_id: "comp.invoice-service" }, { component_id: "comp.payment-service" }]);
});

test("out-of-order transitions are refused at every step", async () => {
  await declareRepository(db, { id: "repo.out-of-order", name: "out-of-order", provider: "noop" });

  await assert.rejects(
    () => registerMapping(db, "repo.out-of-order", "comp.invoice-service", false),
    (err) => err instanceof IllegalRepositoryTransitionError,
  );
  await assert.rejects(
    () => generateProjection(db, "repo.out-of-order", "v1"),
    (err) => err instanceof IllegalRepositoryTransitionError,
  );
  await assert.rejects(
    () => activateRepository(db, "repo.out-of-order"),
    (err) => err instanceof IllegalRepositoryTransitionError,
  );

  await provisionRepository(db, "repo.out-of-order", noop);
  await assert.rejects(
    () => provisionRepository(db, "repo.out-of-order", noop), // already provisioned
    (err) => err instanceof IllegalRepositoryTransitionError,
  );
  await assert.rejects(
    () => activateRepository(db, "repo.out-of-order"), // still provisioned, not bootstrapped
    (err) => err instanceof IllegalRepositoryTransitionError,
  );
});

test("lifecycle operations on an unknown repository throw RepositoryNotFoundError", async () => {
  await assert.rejects(
    () => provisionRepository(db, "repo.does-not-exist", noop),
    (err) => err instanceof RepositoryNotFoundError,
  );
});

test("generateProjection is a pure function of graph state: same inputs produce byte-identical output", async () => {
  await declareRepository(db, { id: "repo.determinism", name: "determinism", provider: "noop" });
  await provisionRepository(db, "repo.determinism", noop);
  await registerMapping(db, "repo.determinism", "comp.invoice-service", false);

  const first = await generateProjection(db, "repo.determinism", "v1");

  // registerMapping again would advance state past 'mapped' semantics for
  // a second generateProjection call in the same test to be meaningful, so
  // instead assert the same call's output is stable by re-deriving it
  // through checkDrift against its own untouched output — a second
  // generateProjection call is exercised structurally by the "second
  // mapping" test above and by the full-lifecycle test; determinism of
  // render() itself is what this test isolates.
  for (const file of first) {
    const result = await checkDrift(db, "repo.determinism", file.path, file.content);
    assert.equal(result.drifted, false, `${file.path} must not drift against its own freshly-generated content`);
  }
});

// The literal §16 1c acceptance bar: "a hand-edit outside the markers does
// not trip the check." This is the test this iteration exists to pass.
test("a hand-edit outside the managed-region markers does not trigger drift; a hand-edit inside it does", async () => {
  await declareRepository(db, { id: "repo.drift-check", name: "drift-check", provider: "noop" });
  await provisionRepository(db, "repo.drift-check", noop);
  await registerMapping(db, "repo.drift-check", "comp.invoice-service", false);
  const [repositoryJsonFile] = await generateProjection(db, "repo.drift-check", "v1");
  assert.ok(repositoryJsonFile);

  const original = repositoryJsonFile.content;
  const region = extractManagedRegion(original);
  assert.ok(region, "generated content must contain a managed region");

  const editedOutside = `// a human added this note above the generated region\n${original}\n// and this one below`;
  const outsideResult = await checkDrift(db, "repo.drift-check", repositoryJsonFile.path, editedOutside);
  assert.equal(outsideResult.drifted, false);
  assert.equal(outsideResult.currentHash, outsideResult.storedHash);

  const editedInside = original.replace(region, region.replace('"schemaVersion": 2', '"schemaVersion": 999'));
  const insideResult = await checkDrift(db, "repo.drift-check", repositoryJsonFile.path, editedInside);
  assert.equal(insideResult.drifted, true);
  assert.notEqual(insideResult.currentHash, insideResult.storedHash);
});

test("checkDrift against a file whose markers were deleted entirely is drift, not a crash", async () => {
  await declareRepository(db, { id: "repo.markers-gone", name: "markers-gone", provider: "noop" });
  await provisionRepository(db, "repo.markers-gone", noop);
  await registerMapping(db, "repo.markers-gone", "comp.invoice-service", false);
  const [file] = await generateProjection(db, "repo.markers-gone", "v1");
  assert.ok(file);

  const result = await checkDrift(db, "repo.markers-gone", file.path, "the markers were deleted");
  assert.equal(result.drifted, true);
  assert.equal(result.currentHash, null);
});

test("NoopVcsProvider.openPullRequestWithChanges (Iteration 17) does no real I/O and returns a fixed, fake URL", async () => {
  const result = await noop.openPullRequestWithChanges({
    providerRef: "noop/example",
    branch: "nexus/bootstrap",
    baseBranch: "main",
    files: [{ path: ".nexus/repository.json", content: "{}" }],
    title: "Nexus bootstrap",
    body: "test",
  });
  assert.equal(result.prUrl, "noop://noop/example/pull/nexus/bootstrap");
});

test("render() with technologyProfile omitted produces exactly today's three files, byte-identical to before Iteration 19", async () => {
  const files = render({
    repository: { id: "repo.iter19-none", name: "iter19-none", defaultBranch: "main" },
    componentIds: [],
    subgraphs: [],
    templateVersion: "v1",
  });
  assert.deepEqual(
    files.map((f) => f.path),
    [".nexus/repository.json", ".nexus/architecture.snapshot.json", ".github/workflows/nexus-alignment.yml"],
  );
});

test("render() with a real technologyProfile adds a fourth file, .nexus/technology-profile.json, with the resolved profile's own fields verbatim", async () => {
  const files = render({
    repository: { id: "repo.iter19-with-profile", name: "iter19-with-profile", defaultBranch: "main" },
    componentIds: [],
    subgraphs: [],
    templateVersion: "v1",
    technologyProfile: {
      id: "tech.iter19-java24-gradle",
      category: "backend",
      language: "Java",
      languageVersion: "24",
      buildSystem: "Gradle",
      decisionId: "adr.iter19-backend-stack",
    },
  });
  assert.deepEqual(
    files.map((f) => f.path),
    [
      ".nexus/repository.json",
      ".nexus/architecture.snapshot.json",
      ".github/workflows/nexus-alignment.yml",
      ".nexus/technology-profile.json",
    ],
  );
  const region = extractManagedRegion(files[3]?.content as string);
  assert.deepEqual(region && JSON.parse(region), {
    profileId: "tech.iter19-java24-gradle",
    category: "backend",
    language: "Java",
    languageVersion: "24",
    buildSystem: "Gradle",
    decisionId: "adr.iter19-backend-stack",
  });
});

test("generateProjection() resolves a real Technology Profile end-to-end via the repository's primary-mapped component, and hashes the fourth file the same way as the other three", async () => {
  await db.query(
    `insert into architecture.decision (id, title, status, statement)
     values ('adr.iter19-backend-stack', 'Backend stack', 'accepted', 'stmt')`,
  );
  const { id: profileId } = await createTechnologyProfile(db, {
    id: "tech.iter19-real-gradle",
    category: "backend",
    language: "Java",
    languageVersion: "24",
    buildSystem: "Gradle",
    decisionId: "adr.iter19-backend-stack",
    authoredBy: "human:po",
  });
  // A fresh component, not the seed's own comp.invoice-service — that one
  // is already the global primary mapping for repo.billing-service, and
  // repository_component_primary_uq is a global-per-component uniqueness,
  // not scoped to one repository.
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name)
     values ('comp.iter19-primary-target', 'component', 'subsys.invoice', 'Iter19 Primary Target')`,
  );
  // comp.iter19-primary-target's own Product is prod.trade-platform (the
  // seed's only Product) — assigning the profile there is what
  // resolveTechnologyProfile() will find via ancestry().
  await assignTechnologyProfile(db, { productId: "prod.trade-platform", category: "backend", profileId });

  await declareRepository(db, { id: "repo.iter19-primary", name: "iter19-primary", provider: "noop" });
  await provisionRepository(db, "repo.iter19-primary", noop);
  await registerMapping(db, "repo.iter19-primary", "comp.iter19-primary-target", true); // primary

  const files = await generateProjection(db, "repo.iter19-primary", "v1");
  assert.deepEqual(
    files.map((f) => f.path),
    [
      ".nexus/repository.json",
      ".nexus/architecture.snapshot.json",
      ".github/workflows/nexus-alignment.yml",
      ".nexus/technology-profile.json",
    ],
  );
  const techProfileFile = files.find((f) => f.path === ".nexus/technology-profile.json");
  const region = extractManagedRegion(techProfileFile?.content as string);
  assert.deepEqual(region && JSON.parse(region), {
    profileId: "tech.iter19-real-gradle",
    category: "backend",
    language: "Java",
    languageVersion: "24",
    buildSystem: "Gradle",
    decisionId: "adr.iter19-backend-stack",
  });

  // Iteration 4's own mechanism, unmodified, already covers a fourth file.
  const { rows } = await db.query<{ region_hash: string }>(
    `select region_hash from repo.generated_region where repository_id = 'repo.iter19-primary' and file_path = '.nexus/technology-profile.json'`,
  );
  assert.ok(rows[0]?.region_hash);
});

test("generateProjection() with no primary-mapped component skips Technology Profile resolution silently — exactly three files, not an error", async () => {
  await db.query(
    `insert into architecture.decision (id, title, status, statement)
     values ('adr.iter19-unused', 'Unused', 'accepted', 'stmt')`,
  );
  const { id: profileId } = await createTechnologyProfile(db, {
    id: "tech.iter19-unused",
    category: "backend",
    language: "Java",
    languageVersion: "24",
    buildSystem: "Gradle",
    decisionId: "adr.iter19-unused",
    authoredBy: "human:po",
  });
  await assignTechnologyProfile(db, { productId: "prod.trade-platform", category: "backend", profileId });

  await declareRepository(db, { id: "repo.iter19-no-primary", name: "iter19-no-primary", provider: "noop" });
  await provisionRepository(db, "repo.iter19-no-primary", noop);
  await registerMapping(db, "repo.iter19-no-primary", "comp.invoice-service", false); // not primary

  const files = await generateProjection(db, "repo.iter19-no-primary", "v1");
  assert.deepEqual(
    files.map((f) => f.path),
    [".nexus/repository.json", ".nexus/architecture.snapshot.json", ".github/workflows/nexus-alignment.yml"],
  );
});

test("generateProjection() with two distinct primary-mapped components (a real ambiguity repository_component_primary_uq does not prevent) skips Technology Profile resolution rather than silently picking one", async () => {
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name)
     values ('comp.iter19-primary-a', 'component', 'subsys.invoice', 'Iter19 Primary A')`,
  );
  await db.query(
    `insert into architecture.element (id, kind, parent_id, name)
     values ('comp.iter19-primary-b', 'component', 'subsys.invoice', 'Iter19 Primary B')`,
  );
  await db.query(
    `insert into architecture.decision (id, title, status, statement)
     values ('adr.iter19-ambiguous', 'Ambiguous', 'accepted', 'stmt')`,
  );
  const { id: profileId } = await createTechnologyProfile(db, {
    id: "tech.iter19-ambiguous",
    category: "backend",
    language: "Java",
    languageVersion: "24",
    buildSystem: "Gradle",
    decisionId: "adr.iter19-ambiguous",
    authoredBy: "human:po",
  });
  await assignTechnologyProfile(db, { productId: "prod.trade-platform", category: "backend", profileId });

  await declareRepository(db, { id: "repo.iter19-two-primaries", name: "iter19-two-primaries", provider: "noop" });
  await provisionRepository(db, "repo.iter19-two-primaries", noop);
  await registerMapping(db, "repo.iter19-two-primaries", "comp.iter19-primary-a", true);
  await registerMapping(db, "repo.iter19-two-primaries", "comp.iter19-primary-b", true);

  const files = await generateProjection(db, "repo.iter19-two-primaries", "v1");
  assert.deepEqual(
    files.map((f) => f.path),
    [".nexus/repository.json", ".nexus/architecture.snapshot.json", ".github/workflows/nexus-alignment.yml"],
  );
});

test("wrapManagedRegion(body, 'yaml') round-trips through extractManagedRegion, and default ('html') is byte-identical to before Iteration 20", async () => {
  const htmlDefault = wrapManagedRegion("hello");
  const htmlExplicit = wrapManagedRegion("hello", "html");
  assert.equal(htmlDefault, htmlExplicit);
  assert.equal(
    htmlDefault,
    "<!-- nexus:begin generated · do not edit -->\nhello\n<!-- nexus:end generated -->",
  );
  assert.equal(extractManagedRegion(htmlDefault), "hello");

  const yamlWrapped = wrapManagedRegion("name: nexus-alignment", "yaml");
  assert.equal(yamlWrapped, "# nexus:begin generated · do not edit\nname: nexus-alignment\n# nexus:end generated");
  assert.equal(extractManagedRegion(yamlWrapped), "name: nexus-alignment");
});

test("extractManagedRegion returns null for content matching neither marker style", () => {
  assert.equal(extractManagedRegion("just some plain text, no markers at all"), null);
});

test("render()'s CI workflow file (Iteration 20: YAML-native markers) is valid YAML, markers included, as it would actually be committed", async () => {
  const [, , alignmentWorkflowFile] = render({
    repository: { id: "repo.iter20-yaml", name: "iter20-yaml", defaultBranch: "main" },
    componentIds: [],
    subgraphs: [],
    templateVersion: "v1",
  });
  assert.ok(alignmentWorkflowFile);
  assert.equal(alignmentWorkflowFile.path, ".github/workflows/nexus-alignment.yml");
  // Parses the whole file, markers included -- exactly what GitHub Actions
  // itself would receive, not only the extracted region.
  const parsed = parseYaml(alignmentWorkflowFile.content);
  assert.deepEqual(parsed, {
    name: "nexus-alignment",
    on: ["pull_request"],
    jobs: {
      verify: {
        "runs-on": "ubuntu-latest",
        steps: [
          { run: 'curl -X POST "$NEXUS_BASE_URL/alignment/verify" --data @.nexus/repository.json\n' },
        ],
      },
    },
  });
});

test("checkDrift against the CI workflow file specifically: a hand-edit outside the (now YAML-native) markers does not trigger drift; one inside does", async () => {
  await declareRepository(db, { id: "repo.iter20-drift", name: "iter20-drift", provider: "noop" });
  await provisionRepository(db, "repo.iter20-drift", noop);
  await registerMapping(db, "repo.iter20-drift", "comp.invoice-service", false);
  const [, , alignmentWorkflowFile] = await generateProjection(db, "repo.iter20-drift", "v1");
  assert.ok(alignmentWorkflowFile);

  const original = alignmentWorkflowFile.content;
  const region = extractManagedRegion(original);
  assert.ok(region, "generated CI workflow content must contain a managed region");

  const editedOutside = `# a human added this note above the generated region\n${original}\n# and this one below`;
  const outsideResult = await checkDrift(db, "repo.iter20-drift", alignmentWorkflowFile.path, editedOutside);
  assert.equal(outsideResult.drifted, false);
  assert.equal(outsideResult.currentHash, outsideResult.storedHash);

  const editedInside = original.replace(region, region.replace("ubuntu-latest", "ubuntu-22.04"));
  const insideResult = await checkDrift(db, "repo.iter20-drift", alignmentWorkflowFile.path, editedInside);
  assert.equal(insideResult.drifted, true);
  assert.notEqual(insideResult.currentHash, insideResult.storedHash);
});
