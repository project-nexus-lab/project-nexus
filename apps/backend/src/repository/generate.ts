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
 */

const BEGIN_MARKER = "<!-- nexus:begin generated · do not edit -->";
const END_MARKER = "<!-- nexus:end generated -->";

export function wrapManagedRegion(body: string): string {
  return `${BEGIN_MARKER}\n${body}\n${END_MARKER}`;
}

/** Returns the text strictly between the markers, or null if the markers are missing or malformed. */
export function extractManagedRegion(fileContent: string): string | null {
  const start = fileContent.indexOf(BEGIN_MARKER);
  const end = fileContent.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) return null;
  return fileContent.slice(start + BEGIN_MARKER.length, end).trim();
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
  nexusBaseUrl?: string;
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
        nexusBaseUrl: input.nexusBaseUrl ?? "https://nexus.invalid",
        schemaVersion: 2,
        templateVersion: input.templateVersion,
      },
      null,
      2,
    ),
  );

  const architectureSnapshotJson = wrapManagedRegion(JSON.stringify(subgraphs, null, 2));

  const alignmentWorkflowYaml = wrapManagedRegion(
    [
      "name: nexus-alignment",
      "on: [pull_request]",
      "jobs:",
      "  verify:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: >",
      "          curl -X POST \"$NEXUS_BASE_URL/alignment/verify\"",
      "          --data @.nexus/repository.json",
    ].join("\n"),
  );

  const files: ManagedFile[] = [
    { path: ".nexus/repository.json", content: repositoryJson },
    { path: ".nexus/architecture.snapshot.json", content: architectureSnapshotJson },
    { path: ".github/workflows/nexus-alignment.yml", content: alignmentWorkflowYaml },
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
