import type { ElementSummary } from "../api";

export interface NavigationColumnProps {
  title: string;
  items: ElementSummary[];
  selectedId: string | null;
  onSelect: (item: ElementSummary) => void;
  loading: boolean;
}

/**
 * One containment level (Product/Domain/Subsystem/Capability) — a plain
 * clickable list, backed by `GET /architecture?kind=&parent=` alone
 * (`App.tsx`). Deterministic retrieval, not search: this project's own
 * bias (`docs/NEXUS_CONSTITUTION.md`, MCP Layer) against free-text
 * lookup applies here too, even though this is a human-facing screen,
 * not an agent tool.
 */
export function NavigationColumn({ title, items, selectedId, onSelect, loading }: NavigationColumnProps) {
  return (
    <section className="nav-column">
      <h2>{title}</h2>
      {loading && <p className="status">Loading…</p>}
      {!loading && items.length === 0 && <p className="status">None</p>}
      {!loading && items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={item.id === selectedId}
                className={item.id === selectedId ? "selected" : ""}
                onClick={() => onSelect(item)}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
