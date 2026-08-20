import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders the title as an h1", () => {
    render(<PageHeader title="Grants" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Grants" });
    expect(heading).toBeInTheDocument();
  });

  it("sets data-slot='page-header-title' on the h1", () => {
    render(<PageHeader title="Grants" />);
    const heading = screen.getByRole("heading", { level: 1, name: "Grants" });
    expect(heading).toHaveAttribute("data-slot", "page-header-title");
  });

  it("sets data-slot on the root element", () => {
    const { container } = render(<PageHeader title="Grants" />);
    expect(container.firstChild).toHaveAttribute("data-slot", "page-header");
  });

  it("renders kicker above the title when provided", () => {
    render(<PageHeader title="Overview" kicker="Grants / Detail" />);
    const kicker = screen.getByText("Grants / Detail");
    expect(kicker).toBeInTheDocument();
    expect(kicker).toHaveAttribute("data-slot", "page-header-kicker");
  });

  it("does not render kicker element when omitted", () => {
    render(<PageHeader title="Overview" />);
    expect(screen.queryByTestId("page-header-kicker")).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot='page-header-kicker']")).not.toBeInTheDocument();
  });

  it("renders description below the title when provided", () => {
    render(<PageHeader title="Grants" description="Manage your grant portfolio." />);
    const desc = screen.getByText("Manage your grant portfolio.");
    expect(desc).toBeInTheDocument();
    expect(desc).toHaveAttribute("data-slot", "page-header-description");
  });

  it("does not render description element when omitted", () => {
    render(<PageHeader title="Grants" />);
    expect(document.querySelector("[data-slot='page-header-description']")).not.toBeInTheDocument();
  });

  it("renders actions on the right side when provided", () => {
    render(<PageHeader title="Grants" actions={<button type="button">New Grant</button>} />);
    const btn = screen.getByRole("button", { name: "New Grant" });
    expect(btn).toBeInTheDocument();
    const actionsWrapper = btn.closest("[data-slot='page-header-actions']");
    expect(actionsWrapper).toBeInTheDocument();
  });

  it("renders contextual help beside the title when provided", () => {
    render(<PageHeader title="Funds" help="Funds keep restricted money separate." />);

    expect(screen.getByRole("button", { name: "Help for Funds" })).toBeInTheDocument();
  });

  it("does not render actions wrapper when omitted", () => {
    render(<PageHeader title="Grants" />);
    expect(document.querySelector("[data-slot='page-header-actions']")).not.toBeInTheDocument();
  });

  it("renders breadcrumb at the very top when provided", () => {
    render(
      <PageHeader
        title="Grant Detail"
        breadcrumb={<nav aria-label="breadcrumb">Home / Grants</nav>}
      />,
    );
    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb).toBeInTheDocument();
    const root = document.querySelector("[data-slot='page-header']");
    expect(root).toContainElement(breadcrumb);
  });

  it("does not render breadcrumb slot when omitted", () => {
    render(<PageHeader title="Grants" />);
    expect(document.querySelector("[data-slot='page-header-breadcrumb']")).not.toBeInTheDocument();
  });

  it("applies additional className to root element", () => {
    const { container } = render(<PageHeader title="Grants" className="mt-8" />);
    expect(container.firstChild).toHaveClass("mt-8");
  });

  it("supports a compact workbench variant for authenticated app pages", () => {
    const { container } = render(<PageHeader title="Donors" variant="workbench" />);
    expect(container.firstChild).toHaveAttribute("data-variant", "workbench");
    expect(screen.getByRole("heading", { level: 1, name: "Donors" })).toHaveClass("text-2xl");
  });

  it("tightens kicker and description rhythm in the workbench variant", () => {
    render(
      <PageHeader
        title="Donors"
        kicker="CRM"
        description="Prioritize follow-up and giving activity."
        variant="workbench"
      />,
    );

    expect(screen.getByText("CRM")).toHaveClass("tracking-caps");
    expect(screen.getByText("Prioritize follow-up and giving activity.")).toHaveClass("leading-5");
  });

  it("renders status metadata below the description when provided", () => {
    render(
      <PageHeader
        title="Dashboard"
        description="Review what needs attention."
        statusMeta={<span>Updated today</span>}
      />,
    );

    expect(screen.getByText("Updated today")).toBeInTheDocument();
    expect(
      screen.getByText("Updated today").closest("[data-slot='page-header-status-meta']"),
    ).toBeInTheDocument();
  });

  it("allows long titles to wrap without colliding with help or actions", () => {
    render(
      <PageHeader
        title="A very long grant title that should wrap inside the available page header width"
        help="Help text"
        actions={<button type="button">Export report</button>}
      />,
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: /A very long grant title/,
    });
    const titleRow = heading.parentElement;
    expect(titleRow).toHaveClass("min-w-0", "flex-wrap");
    expect(heading).toHaveClass("min-w-0", "break-words");
    expect(screen.getByRole("button", { name: /Help for/ })).toHaveClass("shrink-0");
  });

  it("lets header actions shrink and wrap inside the page width", () => {
    render(
      <PageHeader
        title="Programs"
        actions={
          <>
            <button type="button">Add program</button>
            <button type="button">Export budget vs actual</button>
            <span>CSV export is on Growth and above. Go to Billing.</span>
          </>
        }
      />,
    );

    const actions = screen
      .getByRole("button", { name: "Add program" })
      .closest("[data-slot='page-header-actions']");

    expect(actions).toHaveClass("min-w-0", "max-w-full", "flex-wrap");
    expect(actions).not.toHaveClass("shrink-0");
  });

  it("renders all optional slots together correctly", () => {
    render(
      <PageHeader
        title="Grant Overview"
        kicker="Grants / Detail"
        description="All active grants for this fiscal year."
        actions={<button type="button">Export</button>}
        breadcrumb={<nav aria-label="breadcrumb">Breadcrumb</nav>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Grant Overview" })).toBeInTheDocument();
    expect(screen.getByText("Grants / Detail")).toHaveAttribute("data-slot", "page-header-kicker");
    expect(screen.getByText("All active grants for this fiscal year.")).toHaveAttribute(
      "data-slot",
      "page-header-description",
    );
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toBeInTheDocument();
  });
});
