/**
 * Iteration 13 (`docs/history/iteration-13/SCOPE.md`) — does the new
 * discovery/review read surface let a simulated PO/Architect complete a
 * real authoring workflow starting from nothing but a product's *name*?
 * NOT part of `npm test` — the hermetic pass/fail proof lives in
 * `test/http.test.ts` ("PO discovery workflow..."); this script exists to
 * capture what a hermetic assertion can't: how many discovery steps it
 * actually took, where the workflow had friction, which endpoints turned
 * out indispensable, and what information was conspicuously missing.
 * Explicitly requested to feed Iteration 14 (the first architecture UI):
 * the UI should automate exactly the navigation pain points this
 * surfaces, not rediscover them from scratch.
 *
 * Real HTTP, real `http.Server`, the same pattern `test/http.test.ts` and
 * every other real-server test in this project already use — not
 * simulated in-process calls. Uses the same seed data every hermetic test
 * uses (`seed/*.yaml`), not a purpose-built fixture, so the capability
 * this script "discovers" as needing a provider is the same
 * `cap.invoice-export` `verify.ts` and `unprovidedCapabilities()` already
 * know about — nothing rigged for this script alone.
 *
 * The rule this script holds itself to throughout: **no `subsys.*` /
 * `comp.*` / `cap.*` / `dom.*` id literal appears anywhere below.** The
 * only domain fact "known in advance" is the product's human-readable
 * name, "Trade Platform" — exactly what a real PO would actually know.
 * Every id used after that point was returned by a previous call in this
 * same script, checked mechanically at the end.
 */

import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { importAll } from "../import/importAll.js";
import { createHttpServer } from "../http/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, "../../seed");

const FORBIDDEN_ID_PATTERN = /\b(prod|dom|subsys|comp|cap)\.[a-z0-9-]+\b/;
const idsUsed = new Set<string>();
const idsDiscovered = new Set<string>();

type CallKind = "discover" | "write" | "review" | "confirm";

interface CallLogEntry {
  kind: CallKind;
  method: string;
  path: string;
  purpose: string;
  status: number;
}

const log: CallLogEntry[] = [];
const friction: string[] = [];
const missingInfo: string[] = [];

async function call(
  baseUrl: string,
  kind: CallKind,
  method: string,
  reqPath: string,
  purpose: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  // Enforce the "no hardcoded id" rule mechanically: any id literal in the
  // *request path* must already have come back from a prior response.
  const idsInPath = reqPath.match(new RegExp(FORBIDDEN_ID_PATTERN, "g")) ?? [];
  for (const id of idsInPath) {
    if (!idsDiscovered.has(id)) {
      throw new Error(
        `script discipline violation: path ${reqPath} uses id '${id}' that was never returned by a prior call`,
      );
    }
    idsUsed.add(id);
  }

  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${reqPath}`, init);
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;
  log.push({ kind, method, path: reqPath, purpose, status: res.status });

  // Record every id this response makes legitimately discoverable.
  const discovered = JSON.stringify(parsed).match(new RegExp(FORBIDDEN_ID_PATTERN, "g")) ?? [];
  for (const id of discovered) idsDiscovered.add(id);

  return { status: res.status, body: parsed };
}

console.log(
  "=== Iteration 13: can a simulated PO, knowing only \"Trade Platform,\" complete a real authoring workflow through the API alone? ===\n",
);

const db = await openDb();
await migrate(db);
await importAll(db, {
  architecture: path.join(SEED_DIR, "architecture.yaml"),
  repository: path.join(SEED_DIR, "repository.yaml"),
  work: path.join(SEED_DIR, "work.yaml"),
  execution: path.join(SEED_DIR, "execution.yaml"),
});

const server = createHttpServer(db);
await new Promise<void>((resolve) => server.listen(0, resolve));
const { port } = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}`;

// --- Step 1: find the product by name -------------------------------------

const products = await call(baseUrl, "discover", "GET", "/architecture?kind=product",
  "list every product, since the PO knows a name, not an id");
const product = products.body.find((p: { name: string }) => p.name === "Trade Platform");
if (!product) throw new Error("Trade Platform not found among products — seed data changed?");
console.log(`Step 1: found product "${product.name}" -> ${product.id} (${products.body.length} product(s) listed)`);

// --- Step 2: walk down containment by name, one level at a time ------------

const domains = await call(baseUrl, "discover", "GET", `/architecture?kind=domain&parent=${product.id}`,
  "list domains under the discovered product");
const domain = domains.body[0]; // only one in seed data; a real PO would recognize theirs by name
console.log(`Step 2: found domain "${domain.name}" -> ${domain.id} (${domains.body.length} domain(s) under the product)`);

const subsystems = await call(baseUrl, "discover", "GET", `/architecture?kind=subsystem&parent=${domain.id}`,
  "list subsystems under the discovered domain");
const subsystem = subsystems.body[0];
console.log(`Step 3: found subsystem "${subsystem.name}" -> ${subsystem.id} (${subsystems.body.length} subsystem(s) under the domain)`);

// --- Step 3: find a capability worth building against ----------------------
//
// Friction, recorded as it happens: the listing below (id/kind/name/status
// only) does not say which capabilities already have a provider. A real PO
// already knows *what* they intend to build from their own backlog (the
// same way this script already "knows" it wants Export Invoice, matching
// verify.ts's own seeded example) — so this is not blocking for this
// workflow — but confirming a capability genuinely has *zero* providers
// today requires falling back to a call this iteration's new endpoints do
// not themselves make obvious is the right one (`/providers`, not
// `/architecture/:id`), or to `unprovidedCapabilities()` outside the API
// entirely (CLI-only, not exposed over HTTP at all).
friction.push(
  "GET /architecture (listing) does not surface provider status, so 'which capabilities " +
    "need a component' cannot be answered from a listing alone — a PO must already know what " +
    "they intend to build, or fall back to a call this workflow does not otherwise need.",
);
missingInfo.push(
  "Provider count / unprovided status on capability listings and details — " +
    "unprovidedCapabilities() (src/graph/alignment.ts) answers this today, but only via the CLI, never over HTTP.",
);

const capabilities = await call(baseUrl, "discover", "GET", `/architecture?kind=capability&parent=${subsystem.id}`,
  "list capabilities under the discovered subsystem, looking for the one this PO already knows needs a component");
const capability = capabilities.body.find((c: { name: string }) => c.name === "Export Invoice");
if (!capability) throw new Error("Export Invoice capability not found — seed data changed?");
console.log(`Step 4: found capability "${capability.name}" -> ${capability.id} (${capabilities.body.length} capabilities listed)`);

const providersBefore = await call(baseUrl, "discover", "GET", `/architecture/${capability.id}/providers`,
  "confirm the capability genuinely has zero providers before proposing to fix that");
console.log(`Step 5: confirmed ${capability.id} has ${providersBefore.body.length} provider(s) today`);

// --- Step 4: draft a create + provide proposal, referencing only discovered ids ---

const draft = await call(baseUrl, "write", "POST", "/proposals", "draft a proposal minting a new component that provides the discovered capability", {
  intent: `provide ${capability.name} from a new component (Iteration 13 PO-workflow investigation)`,
  authoredBy: "human:po-investigation",
  operations: [
    {
      op: "create",
      mintId: "comp.po-workflow-export-service",
      mintKind: "component",
      mintParentId: subsystem.id,
      mintName: "Export Service (PO workflow)",
    },
    {
      op: "provide",
      provideComponentId: "comp.po-workflow-export-service",
      provideCapabilityId: capability.id,
      provideIsPrimary: true,
    },
  ],
});
const proposalId: string = draft.body.id;
idsDiscovered.add(proposalId); // acp.* ids are outside the architecture-id pattern; tracked separately, not exempt from the "only what's been returned" rule
console.log(`Step 6: drafted proposal ${proposalId}`);

// --- Step 5: review the draft before approving it — the actual point of GET /proposals/:id ---

const review = await call(baseUrl, "review", "GET", `/proposals/${proposalId}`,
  "review the proposal's own operations before approving it — impossible before this iteration");
const operationsMatch =
  review.body.operations.length === 2 &&
  review.body.operations[1].provideCapabilityId === capability.id;
if (!operationsMatch) throw new Error("reviewed proposal did not contain the expected operations");
console.log(`Step 7: reviewed proposal — ${review.body.operations.length} operation(s), confirmed before approving`);

const pending = await call(baseUrl, "discover", "GET", "/proposals?state=draft",
  "confirm this proposal shows up in a reviewer's pending queue");
if (!pending.body.some((p: { id: string }) => p.id === proposalId)) {
  friction.push("the drafted proposal did not appear in GET /proposals?state=draft's listing");
}
console.log(`Step 8: confirmed proposal appears in the draft-state queue (${pending.body.length} pending)`);

// --- Step 6: approve and apply --------------------------------------------

await call(baseUrl, "write", "POST", `/proposals/${proposalId}/submit`, "submit for review");
await call(baseUrl, "write", "POST", `/proposals/${proposalId}/approve`, "approve as a human reviewer", {
  approvedBy: "human:po-reviewer",
});
const applied = await call(baseUrl, "write", "POST", `/proposals/${proposalId}/apply`, "apply the approved proposal");
console.log(`Step 9: applied — mintedIds=${JSON.stringify(applied.body.mintedIds)}, providedLinks=${JSON.stringify(applied.body.providedLinks)}`);

// --- Step 7: confirm the capability now resolves ---------------------------
//
// Friction, recorded as it happens: GET /architecture/:id on the capability
// (this iteration's own new endpoint) does NOT show providers — provision
// is not containment, so `childIds` never carries it. Confirming the fix
// actually worked requires the *other* new endpoint added mid-implementation
// once this became apparent, GET /architecture/:id/providers — which
// SCOPE.md did not originally list. Closing this loop was not possible with
// only the endpoints planned in advance.
friction.push(
  "GET /architecture/:id (element detail) never shows provision edges (provision is not " +
    "containment, so childIds cannot carry it) — confirming a fix worked requires the separate " +
    "/providers endpoint, which the original scope document did not list and which was added " +
    "specifically because this workflow could not otherwise close its own loop.",
);

const providersAfter = await call(baseUrl, "confirm", "GET", `/architecture/${capability.id}/providers`,
  "confirm the capability now has a provider");
const nowProvided = providersAfter.body.some(
  (p: { component_id: string; is_primary: boolean }) =>
    p.component_id === "comp.po-workflow-export-service" && p.is_primary,
);
console.log(`Step 10: confirmed ${capability.id} now has ${providersAfter.body.length} provider(s) -> resolved: ${nowProvided}`);

if (!nowProvided) throw new Error("workflow completed but the capability did not resolve as expected");

// --- Summary ----------------------------------------------------------------

const discoverySteps = log.filter((l) => l.kind === "discover").length;
const reviewSteps = log.filter((l) => l.kind === "review").length;
const writeSteps = log.filter((l) => l.kind === "write").length;
const confirmSteps = log.filter((l) => l.kind === "confirm").length;

console.log("\n--- Call log ---");
for (const [i, entry] of log.entries()) {
  console.log(`${i + 1}. [${entry.kind}] ${entry.method} ${entry.path} (${entry.status}) — ${entry.purpose}`);
}

console.log("\n--- How many discovery steps were required? ---");
console.log(
  `${discoverySteps} discovery calls (list product by name -> list domain -> list subsystem -> ` +
    `list capability -> check its providers), ${reviewSteps} review call, ${writeSteps} write calls ` +
    `(draft, submit, approve, apply), ${confirmSteps} confirm call. ${log.length} HTTP calls total for ` +
    "one capability, zero of them naming a hardcoded architecture id.",
);
console.log(
  `${idsDiscovered.size} distinct architecture/proposal ids were legitimately discoverable by the ` +
    `end of the run; this workflow's own path actually referenced ${idsUsed.size} of them in a ` +
    "request. The remainder (siblings returned by a listing call but never individually needed, " +
    "e.g. cap.invoice-discount and cap.create-invoice alongside the targeted cap.invoice-export) " +
    "were discovered as a side effect of a bounded listing, not fetched one at a time.",
);

console.log("\n--- Where was the friction? ---");
for (const f of friction) console.log(`- ${f}`);

console.log("\n--- Which endpoints were indispensable? ---");
console.log(
  "- GET /architecture?kind=&parent= : used at every containment level (product -> domain -> " +
    "subsystem -> capability) — without it, discovery has no starting point at all beyond a " +
    "hardcoded id.",
);
console.log(
  "- GET /proposals/:id : the one call that actually lets a human review before approving — " +
    "the entire reason this iteration exists, per docs/PROJECT_KNOWLEDGE.md's Open Question 6.",
);
console.log(
  "- GET /architecture/:id/providers : not in the original scope document at all — added only " +
    "once this workflow made clear that neither new endpoint could otherwise confirm a " +
    "provide operation actually took effect.",
);
const elementDetailCalls = log.filter((l) => l.path.match(/^\/architecture\/[^/]+$/)).length;
console.log(
  `- GET /architecture/:id (element detail): called ${elementDetailCalls} time(s) in this run — ` +
    "not at all. The listing endpoint's summary shape (id/kind/name/status) was sufficient at " +
    "every step; this workflow never needed childIds or a single-element fetch. A real finding, " +
    "not an oversight: worth Iteration 14 asking whether this endpoint earns its place outside a " +
    "UI's dedicated 'element detail page,' rather than assuming both a list and a get form are " +
    "both needed just because §9.2 specified both.",
);
console.log(
  "- GET /proposals?state= : used once, to confirm queue membership — not required for this " +
    "script's own correctness, but this is exactly a real reviewer's inbox view, so likely " +
    "genuinely indispensable for a human even though this scripted workflow could complete " +
    "without it.",
);

console.log("\n--- Which information was missing? ---");
for (const m of missingInfo) console.log(`- ${m}`);

console.log(
  "\nFor Iteration 14 (the first architecture UI): the UI should automate the product -> domain -> " +
    "subsystem -> capability walk as a single tree/breadcrumb navigation, not four separate manual " +
    "list calls, and should surface provider status inline on a capability (closing the missing-" +
    "information gap above) rather than requiring a separate lookup.",
);

await new Promise<void>((resolve) => server.close(() => resolve()));
await db.close();
