import { useEffect, useState } from "react";
import { apiCallLog, subscribeToApiCallLog } from "../api";

/**
 * Visible, not just logged to the console — recording which backend
 * endpoints this screen actually calls is a first-class requirement of
 * this iteration (`docs/history/iteration-14/SCOPE.md`,
 * `docs/history/iteration-14/REPORT.md`), not an incidental debug
 * feature. Re-renders on every call via a plain subscriber (`api.ts`),
 * not a state library — one screen doesn't need one.
 */
export function ApiCallLog() {
  const [, setTick] = useState(0);
  useEffect(() => subscribeToApiCallLog(() => setTick((n) => n + 1)), []);

  return (
    <details className="api-call-log" open>
      <summary>Backend calls made this session ({apiCallLog.length})</summary>
      <ol>
        {apiCallLog.map((entry, i) => (
          <li key={i}>
            {entry.method} {entry.path} → {entry.status}
          </li>
        ))}
      </ol>
    </details>
  );
}
