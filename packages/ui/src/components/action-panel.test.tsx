import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionPanel } from "./action-panel";

describe("ActionPanel", () => {
  it("explains the state and exposes the next action", () => {
    render(
      <ActionPanel
        title="No donors yet"
        description="Add your first donor or import a CSV to start tracking giving history."
        action={<button type="button">Add donor</button>}
      />,
    );

    expect(screen.getByRole("region", { name: "No donors yet" })).toBeInTheDocument();
    expect(
      screen.getByText("Add your first donor or import a CSV to start tracking giving history."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add donor" })).toBeInTheDocument();
  });

  it("marks error panels as alerts", () => {
    render(<ActionPanel title="Unable to load reports" variant="error" />);

    expect(screen.getByRole("alert", { name: "Unable to load reports" })).toHaveAttribute(
      "data-variant",
      "error",
    );
  });

  it("uses rounded-2xl container radius", () => {
    const { container } = render(<ActionPanel title="Radius check" />);
    expect(container.querySelector("[data-slot='action-panel']")).toHaveClass("rounded-2xl");
  });

  it("keeps secondary action visually grouped with the primary action", () => {
    render(
      <ActionPanel
        title="No reports generated"
        action={<button type="button">Generate report</button>}
        secondaryAction={<a href="/help">Read guide</a>}
      />,
    );

    const actions = screen
      .getByRole("button", { name: "Generate report" })
      .closest("[data-slot='action-panel-actions']");
    expect(actions).toContainElement(screen.getByRole("link", { name: "Read guide" }));
  });
});
