import { createHash } from "node:crypto";
import type { ResolvedTechnologyProfile } from "../architecture/technology-profile.js";
import type { LocalSubgraph } from "../graph/traversals.js";

/**
 * Repository projection generation — MVP_ARCHITECTURE_V2 §10.3, §10.4.
 *
 * "Generation is a pure function: render(repository, localSubgraph,
 * templateVersion) → managed regions." Whole-file diffing does not survive
 * the first human edit, so generated content is bounded by explicit
 * markers; only the text between them is hashed and compared.
 *
 * `CLAUDE.md` / `AGENTS.md` (rendered from `runtime.hint_file_template`)
 * are deliberately not generated here — that table has zero real rows,
 * because no real adapter with a real template exists yet (Iterations 2
 * and 3 built only no-op adapters). Seeding a placeholder template just to
 * exercise the table would be building for a need that does not exist yet.
 *
 * `.nexus/technology-profile.json` was added in Iteration 19
 * (`docs/history/iteration-19/SCOPE.md`) — the first slice of Iteration
 * 15's own deferred "Phase 4": projecting an already-resolved Technology
 * Profile into the repository, not yet synthesizing real language/build/
 * CI scaffolding from it. A separate file, not a new field on
 * `.nexus/repository.json` — each generated file already has exactly one
 * concern, and mixing a resolved architecture fact into the
 * identity/config file would repeat the exact footprint smell the
 * Iteration 17 Artifact Review found in `nexusBaseUrl`. Contains only
 * genuine Architecture-computed facts (`resolveTechnologyProfile()`'s own
 * return shape) — no environment or deployment configuration of any
 * kind. Additive and optional: omitted entirely when no profile is
 * resolved, which is every repository in this project's real seed data
 * today.
 *
 * The managed-region markers became format-aware in Iteration 20
 * (`docs/history/iteration-20/SCOPE.md`): the original single,
 * HTML-comment-style marker is not valid YAML, verified directly
 * against this project's own `yaml` package. That fix targeted
 * `.github/workflows/nexus-alignment.yml`, the one generated file whose
 * real consumer (GitHub Actions) never unwraps anything — see Iteration
 * 21, below, for why that file no longer exists. The `"yaml"` marker
 * style itself stays available in `wrapManagedRegion()` for whatever
 * future generated file needs it next (real scaffolding synthesis,
 * still deferred) — proven necessary once already, not removed merely
 * because nothing currently calls it.
 *
 * `nexusBaseUrl` and `.github/workflows/nexus-alignment.yml` were
 * removed in Iteration 21 (`docs/history/iteration-21/SCOPE.md`),
 * resolving `docs/PROJECT_KNOWLEDGE.md`'s Open Question #7: repositories
 * stop being Nexus clients. `nexusBaseUrl` was dead data — written,
 * read by nothing, verified directly by grep before this iteration.
 * The workflow's only purpose was making the repository call Nexus;
 * `src/graph/alignment.ts#verifyAndPublishAlignment` now does the
 * reverse — Nexus fetches the repository's own committed state itself
 * and posts a real GitHub Commit Status, using credentials this project
 * already has (the Checks API would need a GitHub App; tested directly
 * against a real repository, ruled out before writing any code).
 * `repositoryJson`'s `schemaVersion` bumped from 2 to 3 to reflect this
 * real shape change — nothing currently reads the field, but it exists
 * exactly to signal this.
 */

/**
 * Two marker styles — Iteration 20 (`docs/history/iteration-20/SCOPE.md`):
 * the original HTML-comment style is not valid YAML (verified directly
 * against this project's own `yaml` package: a bare `<!-- ... -->` line
 * is an invalid implicit scalar key, not a comment). Harmless for the
 * `.nexus/*.json` files — nothing but Nexus's own unwrap-aware code ever
 * reads them — but not for `.github/workflows/nexus-alignment.yml`,
 * whose only real consumer is GitHub Actions, which never unwraps
 * anything. `"html"` stays the default so every existing call site is
 * unaffected; only the one YAML file passes `"yaml"` explicitly.
 */
const MARKERS = {
  html: {
    begin: "<!-- nexus:begin generated · do not edit -->",
    end: "<!-- nexus:end generated -->",
  },
  yaml: {
    begin: "# nexus:begin generated · do not edit",
    end: "# nexus:end generated",
  },
} as const;

export function wrapManagedRegion(body: string, style: keyof typeof MARKERS = "html"): string {
  const { begin, end } = MARKERS[style];
  return `${begin}\n${body}\n${end}`;
}

/**
 * Returns the text strictly between the markers, or null if neither
 * marker style is found. Tries `"html"` first, then `"yaml"` — callers
 * (`checkDrift()`, `generateProjection()`'s hashing loop,
 * `readJsonBody()`) never need to know or pass which style a given file
 * actually uses, the same "try the specific thing, fall back" shape
 * `readJsonBody()` already established in Iteration 18.
 */
export function extractManagedRegion(fileContent: string): string | null {
  for (const { begin, end } of Object.values(MARKERS)) {
    const start = fileContent.indexOf(begin);
    const stop = fileContent.indexOf(end);
    if (start !== -1 && stop !== -1 && stop >= start) {
      return fileContent.slice(start + begin.length, stop).trim();
    }
  }
  return null;
}

/** sha256 of the managed region only — never of the whole file, so content outside the markers cannot affect it. */
export function hashManagedRegion(fileContent: string): string | null {
  const region = extractManagedRegion(fileContent);
  if (region === null) return null;
  return createHash("sha256").update(region).digest("hex");
}

export interface ManagedFile {
  path: string;
  content: string;
}

export interface RenderInput {
  repository: { id: string; name: string; defaultBranch: string };
  /** Mapped component ids, already resolved by the caller — sorted here regardless, so render() stays pure of DB row order. */
  componentIds: string[];
  subgraphs: LocalSubgraph[];
  templateVersion: string;
  /**
   * Already resolved by the caller (Iteration 19) — `render()` stays pure
   * and does no Technology Profile lookup of its own, the same reason it
   * takes `subgraphs` pre-resolved rather than querying for them itself.
   * `null`/omitted ⇒ no fourth file, byte-identical to every render()
   * call before this iteration.
   */
  technologyProfile?: ResolvedTechnologyProfile | null;
}

/**
 * render(repository, localSubgraph, templateVersion) → managed regions
 * (§10.4). A pure function: identical input produces byte-identical
 * output, checked directly in `test/repository.test.ts` rather than
 * assumed from "it's a pure function on paper."
 */
export function render(input: RenderInput): ManagedFile[] {
  const componentIds = [...input.componentIds].sort();
  const subgraphs = [...input.subgraphs].sort((a, b) => a.component.id.localeCompare(b.component.id));

  const repositoryJson = wrapManagedRegion(
    JSON.stringify(
      {
        repositoryId: input.repository.id,
        componentIds,
        schemaVersion: 3,
        templateVersion: input.templateVersion,
      },
      null,
      2,
    ),
  );

  const architectureSnapshotJson = wrapManagedRegion(JSON.stringify(subgraphs, null, 2));

  const files: ManagedFile[] = [
    { path: ".nexus/repository.json", content: repositoryJson },
    { path: ".nexus/architecture.snapshot.json", content: architectureSnapshotJson },
  ];

  if (input.technologyProfile) {
    const p = input.technologyProfile;
    const technologyProfileJson = wrapManagedRegion(
      JSON.stringify(
        {
          profileId: p.id,
          category: p.category,
          language: p.language,
          languageVersion: p.languageVersion,
          buildSystem: p.buildSystem,
          decisionId: p.decisionId,
        },
        null,
        2,
      ),
    );
    files.push({ path: ".nexus/technology-profile.json", content: technologyProfileJson });
  }

  return files;
}
