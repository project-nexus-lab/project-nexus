import { z } from "zod";

/**
 * YAML import model for Architecture, Work and Repository (Iteration 0
 * deliverable #4). Shapes mirror the relational schema (§7) directly —
 * import is a thin, validated transcription, not a second model.
 */

const id = z.string();

export const ArchitectureYaml = z.object({
  products: z
    .array(z.object({ id, name: z.string() }))
    .default([]),
  domains: z
    .array(z.object({ id, parent: id, name: z.string() }))
    .default([]),
  subsystems: z
    .array(z.object({ id, parent: id, name: z.string() }))
    .default([]),
  components: z
    .array(z.object({ id, parent: id, name: z.string() }))
    .default([]),
  capabilities: z
    .array(z.object({ id, parent: id, name: z.string() }))
    .default([]),
  provides: z
    .array(
      z.object({
        component: id,
        capability: id,
        primary: z.boolean().default(false),
      }),
    )
    .default([]),
  dependsOn: z
    .array(z.object({ from: id, to: id }))
    .default([]),
  decisions: z
    .array(
      z.object({
        id,
        title: z.string(),
        statement: z.string(),
        status: z.enum(["proposed", "accepted", "superseded"]).default("accepted"),
        governs: z.array(id).default([]),
      }),
    )
    .default([]),
  constraints: z
    .array(
      z.object({
        id,
        title: z.string(),
        statement: z.string(),
        appliesTo: z.array(id).default([]),
      }),
    )
    .default([]),
});
export type ArchitectureYaml = z.infer<typeof ArchitectureYaml>;

export const WorkYaml = z.object({
  initiatives: z.array(z.object({ id, title: z.string() })).default([]),
  epics: z.array(z.object({ id, parent: id, title: z.string() })).default([]),
  features: z.array(z.object({ id, parent: id, title: z.string() })).default([]),
  tasks: z
    .array(
      z.object({
        id,
        parent: id,
        title: z.string(),
        status: z
          .enum(["draft", "ready", "blocked", "in_progress", "done", "cancelled"])
          .default("draft"),
        affects: z.array(id).default([]),
        acceptanceCriteria: z
          .array(z.object({ id, statement: z.string() }))
          .default([]),
        implementedIn: z.array(id).default([]),
      }),
    )
    .default([]),
});
export type WorkYaml = z.infer<typeof WorkYaml>;

export const RepositoryYaml = z.object({
  repositories: z
    .array(
      z.object({
        id,
        name: z.string(),
        provider: z.string().default("github"),
        providerRef: z.string().optional(),
        defaultBranch: z.string().default("main"),
        implements: z
          .array(z.object({ component: id, primary: z.boolean().default(false) }))
          .default([]),
        // §13 Alternative A (current MVP position): curated FileAnchors, one
        // path glob bound to one element. Open design question — kept small.
        fileAnchors: z
          .array(z.object({ element: id, pathGlob: z.string(), note: z.string().optional() }))
          .default([]),
      }),
    )
    .default([]),
});
export type RepositoryYaml = z.infer<typeof RepositoryYaml>;

export const ExecutionYaml = z.object({
  profiles: z
    .array(
      z.object({
        id,
        name: z.string(),
        contextDepth: z.number().int().min(0).max(3).default(0),
        includeAllProviders: z.boolean().default(false),
        allowAmbiguousRepo: z.boolean().default(false),
      }),
    )
    .default([]),
});
export type ExecutionYaml = z.infer<typeof ExecutionYaml>;
