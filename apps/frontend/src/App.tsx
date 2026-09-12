import { useEffect, useState } from "react";
import { listElements, type ElementSummary } from "./api";
import { ApiCallLog } from "./components/ApiCallLog";
import { CapabilityProviders } from "./components/CapabilityProviders";
import { NavigationColumn } from "./components/NavigationColumn";

/**
 * Product → Domain → Subsystem → Capability, deliberately fixed and
 * matching the containment taxonomy (`docs/NEXUS_CONSTITUTION.md`) —
 * not a generic tree, since this screen's only job is reaching a
 * capability (`docs/history/iteration-14/SCOPE.md`).
 */
const LEVELS = [
  { kind: "product", label: "Product" },
  { kind: "domain", label: "Domain" },
  { kind: "subsystem", label: "Subsystem" },
  { kind: "capability", label: "Capability" },
] as const;

/**
 * Iteration 14's one screen. Built using only `listElements`
 * (`GET /architecture?kind=&parent=`) for every level, including the
 * top one (no parent filter) — `getElement` (`GET /architecture/:id`)
 * is never called. This is a deliberate test, not an oversight: does
 * this screen's own real construction need it? See `ApiCallLog` (the
 * real, recorded answer) and `docs/history/iteration-14/REPORT.md`.
 */
export function App() {
  const [selection, setSelection] = useState<Array<ElementSummary | null>>([null, null, null, null]);
  const [columns, setColumns] = useState<ElementSummary[][]>([[], [], [], []]);
  const [loadingLevel, setLoadingLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadLevel(levelIndex: number, filter: Parameters<typeof listElements>[0]): void {
    setLoadingLevel(levelIndex);
    setError(null);
    listElements(filter)
      .then((items) => {
        setColumns((cols) => {
          const next = [...cols];
          next[levelIndex] = items;
          return next;
        });
        setLoadingLevel(null);
      })
      .catch((err: unknown) => {
        // Found during /review, not while scoping: without this, a failed
        // fetch left loadingLevel set forever — an unhandled rejection and
        // a column stuck on "Loading…" with no visible error, inconsistent
        // with CapabilityProviders' own error handling for the same class
        // of failure.
        setError(err instanceof Error ? err.message : String(err));
        setLoadingLevel(null);
      });
  }

  useEffect(() => {
    loadLevel(0, { kind: LEVELS[0].kind });
  }, []);

  function handleSelect(levelIndex: number, item: ElementSummary): void {
    setSelection((sel) => {
      const next = [...sel];
      next[levelIndex] = item;
      for (let i = levelIndex + 1; i < next.length; i++) next[i] = null;
      return next;
    });
    setColumns((cols) => {
      const next = [...cols];
      for (let i = levelIndex + 1; i < next.length; i++) next[i] = [];
      return next;
    });

    const nextLevelIndex = levelIndex + 1;
    const nextLevel = LEVELS[nextLevelIndex];
    if (!nextLevel) return; // capability is the last level; nothing to load next

    loadLevel(nextLevelIndex, { kind: nextLevel.kind, parent: item.id });
  }

  const selectedCapability = selection[3];

  return (
    <main>
      <h1>Nexus — Architecture Browser</h1>
      <p className="subtitle">
        Discover a product by name, browse down to a capability, and see whether it has a
        provider. Read-only — Iteration 14 (<code>docs/history/iteration-14/SCOPE.md</code>).
      </p>
      {error && <p className="status error">{error}</p>}
      <div className="columns">
        {LEVELS.map((level, i) => (
          <NavigationColumn
            key={level.kind}
            title={level.label}
            items={columns[i] ?? []}
            selectedId={selection[i]?.id ?? null}
            onSelect={(item) => handleSelect(i, item)}
            loading={loadingLevel === i}
          />
        ))}
      </div>
      {selectedCapability && (
        <CapabilityProviders
          capabilityId={selectedCapability.id}
          capabilityName={selectedCapability.name}
        />
      )}
      <ApiCallLog />
    </main>
  );
}
