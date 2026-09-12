import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapabilityProviders } from "../src/components/CapabilityProviders";
import * as api from "../src/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CapabilityProviders", () => {
  it("shows the unprovided message when getProviders returns an empty list — the real cap.invoice-export case", async () => {
    vi.spyOn(api, "getProviders").mockResolvedValue([]);

    render(<CapabilityProviders capabilityId="cap.invoice-export" capabilityName="Export Invoice" />);

    await waitFor(() =>
      expect(screen.getByText("No provider — this capability is unprovided.")).toBeInTheDocument(),
    );
    expect(api.getProviders).toHaveBeenCalledWith("cap.invoice-export");
  });

  it("lists each provider, flagging the primary one, when providers exist", async () => {
    vi.spyOn(api, "getProviders").mockResolvedValue([
      { component_id: "comp.invoice-service", is_primary: true },
      { component_id: "comp.payment-service", is_primary: false },
    ]);

    render(<CapabilityProviders capabilityId="cap.invoice-discount" capabilityName="Apply Invoice Discount" />);

    await waitFor(() => expect(screen.getByText(/comp\.invoice-service/)).toBeInTheDocument());
    expect(screen.getByText(/comp\.invoice-service \(primary\)/)).toBeInTheDocument();
    expect(screen.getByText("comp.payment-service")).toBeInTheDocument();
    expect(screen.queryByText("No provider — this capability is unprovided.")).not.toBeInTheDocument();
  });

  it("surfaces a real fetch failure as an error, not a silent empty state", async () => {
    vi.spyOn(api, "getProviders").mockRejectedValue(new Error("GET /architecture/cap.x/providers -> 404"));

    render(<CapabilityProviders capabilityId="cap.x" capabilityName="X" />);

    await waitFor(() => expect(screen.getByText(/404/)).toBeInTheDocument());
    expect(screen.queryByText("No provider — this capability is unprovided.")).not.toBeInTheDocument();
  });
});
