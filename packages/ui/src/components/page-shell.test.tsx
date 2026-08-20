import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  InsetPanel,
  MetricTile,
  PageHero,
  PageShell,
  StatusPanel,
  SurfaceSection,
} from "./page-shell";

describe("page shell primitives", () => {
  it("renders a shared page shell with consistent responsive spacing", () => {
    const { container } = render(
      <PageShell>
        <p>Settings content</p>
      </PageShell>,
    );

    expect(container.firstChild).toHaveAttribute("data-slot", "page-shell");
    expect(container.firstChild).toHaveClass("space-y-8", "p-4", "sm:p-6", "lg:p-8");
    expect(screen.getByText("Settings content")).toBeInTheDocument();
  });

  it("renders the shared page hero with hierarchy and metadata", () => {
    render(
      <PageHero
        eyebrow="Workspace controls"
        title="Settings"
        description="Manage the organization workspace."
        meta="Updated Apr 10, 2026, 8:00 PM UTC"
      />,
    );

    expect(screen.getByText("Workspace controls")).toHaveAttribute(
      "data-slot",
      "page-hero-eyebrow",
    );
    expect(screen.getByRole("heading", { name: "Settings" })).toHaveAttribute(
      "data-slot",
      "page-hero-title",
    );
    expect(screen.getByText("Manage the organization workspace.")).toHaveAttribute(
      "data-slot",
      "page-hero-description",
    );
    expect(screen.getByText("Updated Apr 10, 2026, 8:00 PM UTC")).toHaveAttribute(
      "data-slot",
      "page-hero-meta",
    );
  });

  it("omits optional page hero slots when props are not provided and still renders actions-only layouts", () => {
    const { rerender } = render(
      <PageHero title="Minimal hero" actions={<button type="button">Create grant</button>} />,
    );

    expect(screen.getByRole("heading", { name: "Minimal hero" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot='page-hero-eyebrow']")).toBeNull();
    expect(screen.queryByText("Manage the organization workspace.")).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot='page-hero-meta']")).toBeNull();
    expect(screen.getByRole("button", { name: "Create grant" }).parentElement).toHaveAttribute(
      "data-slot",
      "page-hero-actions",
    );

    rerender(<PageHero title="Bare hero" />);

    expect(screen.queryByRole("button", { name: "Create grant" })).not.toBeInTheDocument();
  });

  it("renders a shared section shell with title, description, and actions", () => {
    render(
      <SurfaceSection
        title="Team"
        description="Manage workspace access."
        actions={<button type="button">Invite</button>}
      >
        <p>Section body</p>
      </SurfaceSection>,
    );

    expect(screen.getByRole("heading", { name: "Team" })).toHaveAttribute(
      "data-slot",
      "surface-section-title",
    );
    expect(screen.getByText("Manage workspace access.")).toHaveAttribute(
      "data-slot",
      "surface-section-description",
    );
    expect(screen.getByRole("button", { name: "Invite" }).parentElement).toHaveAttribute(
      "data-slot",
      "surface-section-actions",
    );
    expect(screen.getByText("Section body").parentElement).toHaveAttribute(
      "data-slot",
      "surface-section-content",
    );
  });

  it("renders a shared section shell without header chrome when only content is provided", () => {
    render(
      <SurfaceSection className="custom-shell" contentClassName="custom-content">
        <p>Body only</p>
      </SurfaceSection>,
    );

    const section = screen.getByText("Body only").closest("[data-slot='surface-section']");
    expect(section).toHaveClass("custom-shell");
    expect(document.querySelector("[data-slot='surface-section-title']")).toBeNull();
    expect(document.querySelector("[data-slot='surface-section-actions']")).toBeNull();
    expect(screen.getByText("Body only").parentElement).toHaveClass("custom-content");
    expect(screen.getByText("Body only").parentElement).not.toHaveClass("mt-4");
  });

  it("renders a section header without an actions slot when only copy is provided", () => {
    render(
      <SurfaceSection title="Compliance" description="Track deadlines and generated artifacts.">
        <p>Report body</p>
      </SurfaceSection>,
    );

    expect(screen.getByRole("heading", { name: "Compliance" })).toHaveAttribute(
      "data-slot",
      "surface-section-title",
    );
    expect(screen.getByText("Track deadlines and generated artifacts.")).toHaveAttribute(
      "data-slot",
      "surface-section-description",
    );
    expect(document.querySelector("[data-slot='surface-section-actions']")).toBeNull();
    expect(screen.getByText("Report body").parentElement).toHaveClass("mt-4");
  });

  it("renders shared section actions without title or description copy", () => {
    render(
      <SurfaceSection actions={<button type="button">Export</button>}>
        <p>Action-led body</p>
      </SurfaceSection>,
    );

    expect(document.querySelector("[data-slot='surface-section-title']")).toBeNull();
    expect(document.querySelector("[data-slot='surface-section-description']")).toBeNull();
    expect(screen.getByRole("button", { name: "Export" }).parentElement).toHaveAttribute(
      "data-slot",
      "surface-section-actions",
    );
    expect(screen.getByText("Action-led body").parentElement).toHaveClass("mt-4");
  });

  it("renders semantic status panel variants without route-local color classes", () => {
    const { rerender } = render(
      <StatusPanel variant="loading" title="Loading settings">
        Loading team settings...
      </StatusPanel>,
    );

    expect(screen.getByText("Loading settings")).toHaveAttribute("data-slot", "status-panel-title");
    expect(screen.getByText("Loading team settings...")).toHaveAttribute(
      "data-slot",
      "status-panel-description",
    );
    expect(
      screen.getByText("Loading team settings...").closest("[data-slot='status-panel']"),
    ).toHaveAttribute("data-variant", "loading");
    expect(
      screen.getByText("Loading team settings...").closest("[data-slot='status-panel']"),
    ).toHaveAttribute("role", "status");
    expect(screen.getByTestId("status-panel-loading-indicator")).toBeInTheDocument();

    rerender(
      <StatusPanel variant="error" title="Unable to load settings">
        Try refreshing the workspace.
      </StatusPanel>,
    );
    expect(
      screen.getByText("Try refreshing the workspace.").closest("[data-slot='status-panel']"),
    ).toHaveAttribute("role", "alert");
    expect(
      screen.getByText("Try refreshing the workspace.").closest("[data-slot='status-panel']"),
    ).toHaveAttribute("data-variant", "error");

    rerender(
      <StatusPanel variant="success" title="Saved">
        Template updated.
      </StatusPanel>,
    );
    expect(
      screen.getByText("Template updated.").closest("[data-slot='status-panel']"),
    ).toHaveAttribute("data-variant", "success");

    rerender(
      <StatusPanel variant="empty" title="No reports yet">
        Generate a report to populate this list.
      </StatusPanel>,
    );
    expect(
      screen
        .getByText("Generate a report to populate this list.")
        .closest("[data-slot='status-panel']"),
    ).toHaveAttribute("data-variant", "empty");
    expect(screen.queryByTestId("status-panel-loading-indicator")).not.toBeInTheDocument();
  });

  it("allows explicit role and aria-live overrides on the status panel", () => {
    render(
      <StatusPanel variant="empty" role="status" aria-live="polite">
        Custom announcer
      </StatusPanel>,
    );

    const panel = screen.getByText("Custom announcer").closest("[data-slot='status-panel']");
    expect(panel).toHaveAttribute("role", "status");
    expect(panel).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByTestId("status-panel-loading-indicator")).not.toBeInTheDocument();
  });

  it("renders a title-only status panel without a description wrapper", () => {
    render(<StatusPanel title="Only a title" />);

    expect(screen.getByText("Only a title")).toHaveAttribute("data-slot", "status-panel-title");
    expect(document.querySelector("[data-slot='status-panel-description']")).toBeNull();
  });

  it("renders a metric tile with semantic content slots", () => {
    render(
      <MetricTile
        label="Retention rate"
        value="62.5%"
        description="Donors who gave again this fiscal year"
      />,
    );

    expect(screen.getByText("Retention rate")).toHaveAttribute("data-slot", "metric-tile-label");
    expect(screen.getByText("62.5%")).toHaveAttribute("data-slot", "metric-tile-value");
    expect(screen.getByText("Donors who gave again this fiscal year")).toHaveAttribute(
      "data-slot",
      "metric-tile-description",
    );
  });

  it("renders a metric tile without an optional description", () => {
    render(<MetricTile label="Open grants" value="12" />);

    expect(screen.getByText("Open grants")).toHaveAttribute("data-slot", "metric-tile-label");
    expect(screen.getByText("12")).toHaveAttribute("data-slot", "metric-tile-value");
    expect(document.querySelector("[data-slot='metric-tile-description']")).toBeNull();
  });

  it("uses rounded-2xl on PageHero container", () => {
    const { container } = render(<PageHero title="Radius test" />);
    const hero = container.querySelector("[data-slot='page-hero']");
    expect(hero).toHaveClass("rounded-2xl");
    expect(hero).not.toHaveClass("rounded-3xl");
  });

  it("uses rounded-2xl on SurfaceSection container", () => {
    const { container } = render(
      <SurfaceSection>
        <p>Content</p>
      </SurfaceSection>,
    );
    const section = container.querySelector("[data-slot='surface-section']");
    expect(section).toHaveClass("rounded-2xl");
    expect(section).not.toHaveClass("rounded-3xl");
  });

  it("renders a shared inset panel without route-local palette classes", () => {
    render(
      <InsetPanel>
        <p>Embedded content</p>
      </InsetPanel>,
    );

    expect(screen.getByText("Embedded content").parentElement).toHaveAttribute(
      "data-slot",
      "inset-panel",
    );
    expect(screen.getByText("Embedded content").parentElement).toHaveClass(
      "rounded-2xl",
      "border",
      "border-border",
      "bg-muted/50",
    );
  });
});
