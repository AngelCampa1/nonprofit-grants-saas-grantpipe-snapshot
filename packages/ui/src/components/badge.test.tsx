import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders a span badge with the default variant", () => {
    render(<Badge>Active</Badge>);

    const badge = screen.getByText("Active");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveAttribute("data-variant", "default");
  });

  it("renders child elements when used asChild", () => {
    render(
      <Badge asChild variant="outline">
        <a href="/settings">Settings</a>
      </Badge>,
    );

    const link = screen.getByRole("link", { name: "Settings" });
    expect(link).toHaveAttribute("href", "/settings");
    expect(link).toHaveAttribute("data-variant", "outline");
  });

  it("renders warning variant with semantic warning classes", () => {
    render(<Badge variant="warning">Pending</Badge>);
    const badge = screen.getByText("Pending");
    expect(badge).toHaveAttribute("data-variant", "warning");
    expect(badge.className).toMatch(/bg-warning/);
    expect(badge.className).toMatch(/text-warning-foreground/);
  });

  it("renders info variant with semantic info classes", () => {
    render(<Badge variant="info">Note</Badge>);
    const badge = screen.getByText("Note");
    expect(badge).toHaveAttribute("data-variant", "info");
    expect(badge.className).toMatch(/bg-info/);
    expect(badge.className).toMatch(/text-info-foreground/);
  });

  it("renders success variant with semantic success classes", () => {
    render(<Badge variant="success">Done</Badge>);
    const badge = screen.getByText("Done");
    expect(badge).toHaveAttribute("data-variant", "success");
    expect(badge.className).toMatch(/bg-success/);
    expect(badge.className).toMatch(/text-success-foreground/);
  });

  it.each([
    ["stage-cultivation", "bg-stage-cultivation", "text-stage-cultivation-foreground"],
    ["stage-solicitation", "bg-stage-solicitation", "text-stage-solicitation-foreground"],
    ["stage-stewardship", "bg-stage-stewardship", "text-stage-stewardship-foreground"],
    ["stage-donor", "bg-stage-donor", "text-stage-donor-foreground"],
    ["stage-lapsed", "bg-stage-lapsed", "text-stage-lapsed-foreground"],
  ] as const)("renders %s variant", (variant, bgClass, fgClass) => {
    render(<Badge variant={variant}>Stage</Badge>);
    const badge = screen.getByText("Stage");
    expect(badge).toHaveAttribute("data-variant", variant);
    expect(badge.className).toContain(bgClass);
    expect(badge.className).toContain(fgClass);
  });

  it.each([
    ["gs-discovery", "bg-gs-discovery", "text-gs-discovery-foreground"],
    ["gs-application", "bg-gs-application", "text-gs-application-foreground"],
    ["gs-submitted", "bg-gs-submitted", "text-gs-submitted-foreground"],
    ["gs-awarded", "bg-gs-awarded", "text-gs-awarded-foreground"],
    ["gs-active", "bg-gs-active", "text-gs-active-foreground"],
    ["gs-reporting", "bg-gs-reporting", "text-gs-reporting-foreground"],
    ["gs-closeout", "bg-gs-closeout", "text-gs-closeout-foreground"],
    ["gs-renewal", "bg-gs-renewal", "text-gs-renewal-foreground"],
    ["gs-declined", "bg-gs-declined", "text-gs-declined-foreground"],
  ] as const)("renders %s grant-stage badge variant", (variant, bgClass, fgClass) => {
    render(<Badge variant={variant}>Grant</Badge>);
    const badge = screen.getByText("Grant");
    expect(badge).toHaveAttribute("data-variant", variant);
    expect(badge.className).toContain(bgClass);
    expect(badge.className).toContain(fgClass);
  });

  it("separates the Active and Reporting grant-stage badges into distinct hue families", () => {
    render(
      <>
        <Badge variant="gs-active">Active</Badge>
        <Badge variant="gs-reporting">Reporting</Badge>
      </>,
    );
    const activeBadge = screen.getByText("Active");
    const reportingBadge = screen.getByText("Reporting");

    // Both stay on the semantic gs-* token pattern; the hue separation lives
    // in globals.css (--color-gs-reporting → archival-ochre accent family),
    // guarded by grant-stage-colors-source.test.ts.
    expect(activeBadge.className).toContain("bg-gs-active");
    expect(reportingBadge.className).toContain("bg-gs-reporting");
    expect(reportingBadge.className).not.toContain("bg-gs-active");
  });
});
