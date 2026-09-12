import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { apiCallLog } from "../src/api";

/**
 * Mocks `fetch` itself, not `src/api.ts`'s exported functions — so this
 * test exercises the real `listElements`/`getProviders`/`call()` code,
 * including the real `apiCallLog` logging every call feeds. Mirrors the
 * real seed data's shape exactly (apps/backend/seed/architecture.yaml)
 * — the same scenario `investigate-po-authoring-workflow.ts` (Iteration
 * 13) already drove for real over HTTP: Trade Platform -> Billing ->
 * Invoice -> Export Invoice, unprovided.
 */
function mockBackend() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL) => {
      const url = new URL(String(input), "http://localhost");
      const path = url.pathname;
      const kind = url.searchParams.get("kind");
      const parent = url.searchParams.get("parent");
      calls.push(`${path}${url.search}`);

      let body: unknown = [];
      if (path === "/architecture" && kind === "product") {
        body = [{ id: "prod.trade-platform", kind: "product", name: "Trade Platform", status: "active" }];
      } else if (path === "/architecture" && kind === "domain" && parent === "prod.trade-platform") {
        body = [{ id: "dom.billing", kind: "domain", name: "Billing", status: "active" }];
      } else if (path === "/architecture" && kind === "subsystem" && parent === "dom.billing") {
        body = [{ id: "subsys.invoice", kind: "subsystem", name: "Invoice", status: "active" }];
      } else if (path === "/architecture" && kind === "capability" && parent === "subsys.invoice") {
        body = [
          { id: "cap.invoice-discount", kind: "capability", name: "Apply Invoice Discount", status: "active" },
          { id: "cap.create-invoice", kind: "capability", name: "Create Invoice", status: "active" },
          { id: "cap.invoice-export", kind: "capability", name: "Export Invoice", status: "active" },
        ];
      } else if (path === "/architecture/cap.invoice-export/providers") {
        body = [];
      } else if (path === "/architecture/cap.invoice-discount/providers") {
        body = [{ component_id: "comp.invoice-service", is_primary: true }];
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      } as Response);
    }),
  );
  return calls;
}

beforeEach(() => {
  apiCallLog.length = 0; // module-level state; reset so counts don't leak across tests
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App — the real Iteration 13/PO-workflow scenario, driven through the UI", () => {
  it("reaches Export Invoice from nothing but the product's name and shows it has no provider", async () => {
    const calls = mockBackend();

    render(<App />);

    fireEvent.click(await screen.findByText("Trade Platform"));
    fireEvent.click(await screen.findByText("Billing"));
    fireEvent.click(await screen.findByText("Invoice"));
    fireEvent.click(await screen.findByText("Export Invoice"));

    await waitFor(() =>
      expect(screen.getByText("No provider — this capability is unprovided.")).toBeInTheDocument(),
    );

    // The real question this iteration exists to answer with evidence:
    // does this screen's own construction need GET /architecture/:id?
    expect(calls.some((c) => /^\/architecture\/[^/?]+$/.test(c))).toBe(false);

    // 4 listElements calls (one per level) + 1 getProviders call.
    expect(calls).toEqual([
      "/architecture?kind=product",
      "/architecture?kind=domain&parent=prod.trade-platform",
      "/architecture?kind=subsystem&parent=dom.billing",
      "/architecture?kind=capability&parent=subsys.invoice",
      "/architecture/cap.invoice-export/providers",
    ]);

    // The visible log, not just the mock's own record — a viewer of the
    // real screen sees the same count without opening dev tools.
    expect(screen.getByText(/Backend calls made this session \(5\)/)).toBeInTheDocument();
  });

  it("selecting an earlier level again clears every level below it", async () => {
    mockBackend();
    render(<App />);

    fireEvent.click(await screen.findByText("Trade Platform"));
    fireEvent.click(await screen.findByText("Billing"));
    fireEvent.click(await screen.findByText("Invoice"));
    fireEvent.click(await screen.findByText("Apply Invoice Discount"));
    await screen.findByText(/comp\.invoice-service/);

    // Re-selecting the domain level should clear the now-stale capability selection and its detail panel.
    fireEvent.click(screen.getByText("Billing"));

    await waitFor(() => expect(screen.queryByText(/comp\.invoice-service \(primary\)/)).not.toBeInTheDocument());
  });

  it("shows an error, not an infinite loading state, when a level's fetch fails (found during /review)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: "boom" }) } as Response)),
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText(/500/)).toBeInTheDocument());
    // Loading must not be stuck forever — the column should have given up, not still show "Loading…".
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});
