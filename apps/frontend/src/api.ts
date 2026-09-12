/**
 * Iteration 14 (`docs/history/iteration-14/SCOPE.md`): every call this
 * frontend makes goes through here, and only ever to endpoints Iteration
 * 13 already built and validated
 * (`apps/backend/src/http/routes.ts`): `GET /architecture/:id`,
 * `GET /architecture?kind=&parent=`, `GET /architecture/:id/providers`,
 * `GET /proposals/:id`, `GET /proposals?state=`. Read-only — nothing
 * here ever issues a write.
 *
 * `apiCallLog` records every call (method, path, status), not just
 * makes it. This is deliberate, not incidental logging: Iteration 13's
 * own two open questions — does `GET /architecture/:id` earn a place,
 * does provider status need a new endpoint — can only be answered
 * honestly by recording what this screen actually calls, the same
 * discipline `investigate-po-authoring-workflow.ts` (Iteration 13)
 * already applied to the API-only workflow. Surfaced in the UI itself
 * (`ApiCallLog.tsx`), not just kept in memory for a report to quote
 * after the fact.
 */

export interface ApiCallLogEntry {
  method: string;
  path: string;
  status: number;
  at: number;
}

export const apiCallLog: ApiCallLogEntry[] = [];
type LogListener = () => void;
const listeners = new Set<LogListener>();

/** So a component can re-render as calls happen, without a state library. */
export function subscribeToApiCallLog(listener: LogListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function call<T>(method: string, path: string): Promise<T> {
  const res = await fetch(path, { method });
  apiCallLog.push({ method, path, status: res.status, at: Date.now() });
  for (const listener of listeners) listener();

  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new Error(`${method} ${path} -> ${res.status}${body ? `: ${JSON.stringify(body)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export interface ElementSummary {
  id: string;
  kind: string;
  name: string;
  status: string;
}

export interface ElementDetail extends ElementSummary {
  parentId: string | null;
  childIds: string[];
}

export interface ProviderRow {
  component_id: string;
  is_primary: boolean;
}

export interface ListElementsFilter {
  kind?: string;
  parent?: string;
}

/** GET /architecture?kind=&parent= — the one endpoint this screen's navigation actually needs. */
export function listElements(filter: ListElementsFilter): Promise<ElementSummary[]> {
  const params = new URLSearchParams();
  if (filter.kind) params.set("kind", filter.kind);
  if (filter.parent) params.set("parent", filter.parent);
  const qs = params.toString();
  return call<ElementSummary[]>("GET", `/architecture${qs ? `?${qs}` : ""}`);
}

/**
 * GET /architecture/:id — deliberately not called anywhere in this
 * screen's own navigation (see App.tsx). Exported so it exists for a
 * future screen that might need `childIds` or a single-element fetch,
 * not because this one calls it. Whether that turns out to matter is
 * exactly what `docs/PROJECT_KNOWLEDGE.md`'s open question about this
 * endpoint asks — see `docs/history/iteration-14/REPORT.md` for what
 * this iteration's real call log shows.
 */
export function getElement(id: string): Promise<ElementDetail> {
  return call<ElementDetail>("GET", `/architecture/${encodeURIComponent(id)}`);
}

/** GET /architecture/:id/providers — Capability <- PROVIDES <- Component. */
export function getProviders(capabilityId: string): Promise<ProviderRow[]> {
  return call<ProviderRow[]>("GET", `/architecture/${encodeURIComponent(capabilityId)}/providers`);
}
