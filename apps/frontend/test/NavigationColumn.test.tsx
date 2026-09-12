import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavigationColumn } from "../src/components/NavigationColumn";

const items = [
  { id: "prod.a", kind: "product", name: "Product A", status: "active" },
  { id: "prod.b", kind: "product", name: "Product B", status: "active" },
];

describe("NavigationColumn", () => {
  it("renders each item and calls onSelect with the clicked item", () => {
    const onSelect = vi.fn();
    render(
      <NavigationColumn title="Product" items={items} selectedId={null} onSelect={onSelect} loading={false} />,
    );

    expect(screen.getByText("Product A")).toBeInTheDocument();
    expect(screen.getByText("Product B")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Product B"));
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it("marks the selected item, and only that one", () => {
    render(
      <NavigationColumn title="Product" items={items} selectedId="prod.b" onSelect={vi.fn()} loading={false} />,
    );
    expect(screen.getByText("Product A")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Product B")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a loading state instead of items", () => {
    render(<NavigationColumn title="Product" items={items} selectedId={null} onSelect={vi.fn()} loading={true} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("Product A")).not.toBeInTheDocument();
  });

  it("shows an explicit empty state, not a blank column, when there are zero items", () => {
    render(<NavigationColumn title="Domain" items={[]} selectedId={null} onSelect={vi.fn()} loading={false} />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });
});
