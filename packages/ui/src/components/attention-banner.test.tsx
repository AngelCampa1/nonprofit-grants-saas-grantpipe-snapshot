import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttentionBanner } from "./attention-banner";

describe("AttentionBanner", () => {
  it("renders title, description, icon, and action content", () => {
    render(
      <AttentionBanner
        title="Trial ends in 5 days"
        description="Add billing to keep access uninterrupted."
        icon={<span data-testid="attention-icon">!</span>}
        action={<a href="/settings/billing">Add billing</a>}
      />,
    );

    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("data-slot", "attention-banner");
    expect(banner).toHaveAttribute("data-variant", "warning");
    expect(screen.getByText("Trial ends in 5 days")).toBeInTheDocument();
    expect(screen.getByText("Add billing to keep access uninterrupted.")).toBeInTheDocument();
    expect(screen.getByTestId("attention-icon")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add billing" })).toBeInTheDocument();
  });

  it("uses alert semantics for blocking variants", () => {
    render(
      <AttentionBanner
        variant="destructive"
        title="Access paused"
        description="Restore billing to continue."
      />,
    );

    const banner = screen.getByRole("alert");
    expect(banner).toHaveAttribute("aria-live", "assertive");
    expect(banner).toHaveAttribute("data-variant", "destructive");
  });

  it("keeps warning styling on semantic tokens without side-border accents", () => {
    render(<AttentionBanner title="Deadline approaching" description="Review the queue." />);

    const banner = screen.getByRole("status");
    expect(banner.className).toMatch(/border-warning/);
    expect(banner.className).toMatch(/bg-warning/);
    expect(banner.className).not.toMatch(/border-l-\d/);
    expect(banner.className).not.toMatch(/border-r-\d/);
  });

  it("has large container rounding (rounded-2xl)", () => {
    render(<AttentionBanner title="Notice" />);
    expect(screen.getByRole("status")).toHaveClass("rounded-2xl");
  });

  it("supports info styling, custom live semantics, and nested content without optional regions", () => {
    render(
      <AttentionBanner
        variant="info"
        role="note"
        aria-live="off"
        title="Calendar synced"
        className="custom-banner"
      >
        <button type="button">Review sync</button>
      </AttentionBanner>,
    );

    const banner = screen.getByRole("note");
    expect(banner).toHaveAttribute("aria-live", "off");
    expect(banner).toHaveAttribute("data-variant", "info");
    expect(banner).toHaveClass("custom-banner");
    expect(banner.className).toMatch(/border-info/);
    expect(screen.getByRole("button", { name: "Review sync" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot='attention-banner-description']")).toBeNull();
    expect(document.querySelector("[data-slot='attention-banner-action']")).toBeNull();
    expect(document.querySelector("[data-slot='attention-banner-icon']")).toBeNull();
  });
});
