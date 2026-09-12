import { useEffect, useState } from "react";
import { getProviders, type ProviderRow } from "../api";

export interface CapabilityProvidersProps {
  capabilityId: string;
  capabilityName: string;
}

/**
 * `GET /architecture/:id/providers` per selected capability — the
 * question this iteration exists to gather real evidence on: does a
 * client-side, per-capability call like this feel and perform
 * acceptably, or does it demonstrate a real need for a batched/aggregated
 * endpoint? (`docs/history/iteration-14/SCOPE.md`.)
 */
export function CapabilityProviders({ capabilityId, capabilityName }: CapabilityProvidersProps) {
  const [providers, setProviders] = useState<ProviderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProviders(null);
    setError(null);
    getProviders(capabilityId)
      .then((rows) => {
        if (!cancelled) setProviders(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [capabilityId]);

  return (
    <section className="capability-detail" aria-label={`Providers for ${capabilityName}`}>
      <h2>{capabilityName}</h2>
      {error && <p className="status error">{error}</p>}
      {!error && providers === null && <p className="status">Checking providers…</p>}
      {!error && providers !== null && providers.length === 0 && (
        <p className="status unprovided">No provider — this capability is unprovided.</p>
      )}
      {!error && providers !== null && providers.length > 0 && (
        <ul>
          {providers.map((p) => (
            <li key={p.component_id}>
              {p.component_id}
              {p.is_primary ? " (primary)" : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
