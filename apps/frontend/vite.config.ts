/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Iteration 14 (docs/history/iteration-14/SCOPE.md, "Decision"): a
 * dev-time proxy to the real backend, not a CORS change to
 * apps/backend/src/http/server.ts. Adding CORS would widen a surface
 * Iteration 13's own Architecture Critic finding already flagged as
 * larger than "as ungated as /ancestry" admits (docs/ROADMAP.md,
 * Standing awareness). A proxy reaches the same backend with zero new
 * cross-origin surface and zero backend changes. `npm run serve` (from
 * apps/backend) must be running on port 3000 for `npm run dev` here to
 * have anything real to talk to.
 *
 * Only /architecture and /proposals are proxied — the only two route
 * prefixes this frontend calls (src/api.ts). Adding a third here without
 * a corresponding, deliberate addition to api.ts would be a real,
 * visible inconsistency, not a silent one.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/architecture": "http://localhost:3000",
      "/proposals": "http://localhost:3000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
});
