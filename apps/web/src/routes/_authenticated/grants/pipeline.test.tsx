import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRANT_PIPELINE_PHASES, GRANT_STAGE_DETAILS } from "../../../lib/grant-stages";

const hoisted = vi.hoisted(() => ({
  mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  })),
  mockCreateLazyFileRoute: vi.fn(
    (path: string) => (config: { component: React.ComponentType }) => ({
      ...config,
      path,
    }),
  ),
  mockUseGrantPipeline: vi.fn(),
  mockUseUpdateGrantStage: vi.fn(),
  mockUseSession: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  createLazyFileRoute: hoisted.mockCreateLazyFileRoute,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/grants/pipeline" } }),
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

vi.mock("@grantpipe/ui", () => ({
  PageShell: ({ children, className }: React.HTMLAttributes<HTMLDivElement>) => (
    <div
      data-slot="page-shell"
      className={["space-y-8", "p-4", "sm:p-6", "lg:p-8", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  ),
  PageHeader: ({
    title,
    description,
    kicker,
    actions,
  }: {
    title: React.ReactNode;
    description?: React.ReactNode;
    kicker?: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <div data-slot="page-header">
      {kicker ? <p data-slot="page-header-kicker">{kicker}</p> : null}
      <h1 data-slot="page-header-title">{title}</h1>
      {description ? <p data-slot="page-header-description">{description}</p> : null}
      {actions ? <div data-slot="page-header-actions">{actions}</div> : null}
    </div>
  ),
  SurfaceSection: ({
    title,
    description,
    children,
    className,
  }: React.HTMLAttributes<HTMLElement> & {
    title?: React.ReactNode;
    description?: React.ReactNode;
  }) => (
    <section data-slot="surface-section" className={className}>
      {title ? <h2 data-slot="surface-section-title">{title}</h2> : null}
      {description ? <p data-slot="surface-section-description">{description}</p> : null}
      <div data-slot="surface-section-content">{children}</div>
    </section>
  ),
  StatusPanel: ({
    title,
    children,
    variant,
  }: React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode; variant?: string }) => (
    <div data-slot="status-panel" data-variant={variant}>
      {title ? <p data-slot="status-panel-title">{title}</p> : null}
      <div data-slot="status-panel-description">{children}</div>
    </div>
  ),
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  IconButton: ({
    children,
    tooltip,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tooltip?: string }) => (
    <button title={tooltip} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="pipeline-card" {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
  Select: ({
    children,
    value = "",
    onValueChange = (_v: string) => {},
    disabled = false,
  }: {
    children?: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
  }) => (
    <SelectCtx.Provider value={{ value, onValueChange, disabled }}>{children}</SelectCtx.Provider>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) => {
    const { onValueChange, disabled } = React.useContext(SelectCtx);
    return (
      <button
        type="button"
        data-value={value}
        disabled={disabled}
        onClick={() => {
          if (!disabled && value !== undefined) onValueChange(value);
        }}
      >
        {children}
      </button>
    );
  },
  SelectTrigger: ({
    "aria-label": ariaLabel,
  }: {
    "aria-label"?: string;
    children?: React.ReactNode;
    className?: string;
  }) => {
    const { value, onValueChange, disabled } = React.useContext(SelectCtx);
    return (
      <input
        role="combobox"
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          if (!disabled) onValueChange(e.target.value);
        }}
      />
    );
  },
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  HelpTooltip: ({ label, children }: { label: string; children?: React.ReactNode }) => (
    <button type="button" aria-label={label}>
      {children}
    </button>
  ),
  PageTabs: ({
    items,
    activePath,
    linkComponent: TabLink,
    ariaLabel,
  }: {
    items: Array<{ to: string; label: string }>;
    activePath: string;
    linkComponent: React.ComponentType<{
      to: string;
      "aria-current"?: "page";
      children: React.ReactNode;
    }>;
    ariaLabel: string;
  }) => (
    <nav aria-label={ariaLabel}>
      {items.map((item) => (
        <TabLink
          key={item.to}
          to={item.to}
          aria-current={item.to === activePath ? "page" : undefined}
        >
          {item.label}
        </TabLink>
      ))}
    </nav>
  ),
}));

vi.mock("../../../hooks/use-grants", () => ({
  useGrantPipeline: hoisted.mockUseGrantPipeline,
  useUpdateGrantStage: hoisted.mockUseUpdateGrantStage,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: hoisted.mockUseSession,
}));

const mockCaptureEvent = vi.fn();
vi.mock("../../../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

import { Route as RouteShell } from "./pipeline";
import { GrantPipelinePage } from "./pipeline.lazy";

describe("GrantPipelinePage", () => {
  beforeEach(() => {
    hoisted.mockUseGrantPipeline.mockReset();
    hoisted.mockUseUpdateGrantStage.mockReset();
    hoisted.mockUseSession.mockReset();
    hoisted.mockCreateFileRoute.mockClear();

    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin" });
    hoisted.mockUseUpdateGrantStage.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("keeps the generated route shell free of eager component imports", () => {
    expect(RouteShell).toEqual({ path: "/_authenticated/grants/pipeline" });
  });

  it("renders PageShell and PageHeader with correct title", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {},
      isLoading: false,
      isError: false,
    });

    const { container } = render(<GrantPipelinePage />);

    expect(container.querySelector("[data-slot='page-shell']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grant Pipeline" })).toBeInTheDocument();
    expect(
      screen.queryByText(/This board shows where each grant is in its lifecycle/i),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass("space-y-8", "p-4", "sm:p-6", "lg:p-8");
  });

  it("shows a compact operational triage header", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 1,
          grants: [{ id: "g-1", name: "Youth Program" }],
        },
        reporting: {
          count: 2,
          grants: [
            { id: "g-2", name: "Arts Initiative" },
            { id: "g-3", name: "STEM Access Fund" },
          ],
        },
        declined: {
          count: 1,
          grants: [{ id: "g-4", name: "Past Opportunity" }],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantPipelinePage />);

    expect(screen.getByText("Pipeline overview")).toBeInTheDocument();
    expect(screen.getByText("3 active grants")).toBeInTheDocument();
    expect(screen.getByText("Declined archived below")).toBeInTheDocument();
    expect(screen.getByText(/Work left to right by phase/i)).toBeInTheDocument();
  });

  it("uses the singular label when exactly one grant is active", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 1,
          grants: [{ id: "g-1", name: "Youth Program" }],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantPipelinePage />);

    expect(screen.getByText("1 active grant")).toBeInTheDocument();
    expect(screen.queryByText("1 active grants")).not.toBeInTheDocument();
  });

  it("renders loading state via StatusPanel", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<GrantPipelinePage />);

    expect(container.querySelector("[data-slot='surface-section']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='status-panel'][data-variant='loading']"),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading pipeline…")).toBeInTheDocument();
  });

  it("renders error state via StatusPanel", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const { container } = render(<GrantPipelinePage />);

    expect(container.querySelector("[data-slot='surface-section']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='status-panel'][data-variant='error']"),
    ).toBeInTheDocument();
    expect(screen.getByText("Unable to load pipeline.")).toBeInTheDocument();
  });

  it("renders four operational phase groups with status subsections", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {},
      isLoading: false,
      isError: false,
    });

    render(<GrantPipelinePage />);

    for (const phase of GRANT_PIPELINE_PHASES) {
      expect(screen.getByRole("heading", { name: phase.label })).toBeInTheDocument();
      expect(screen.getByText(phase.description)).toBeInTheDocument();
      for (const status of phase.statuses) {
        expect(
          screen.getByRole("heading", {
            name: new RegExp(`^${getStageLabel(status)}\\b`),
            level: 3,
          }),
        ).toBeInTheDocument();
      }
    }
    expect(screen.queryByRole("heading", { name: /^Declined\b/ })).not.toBeInTheDocument();
  });

  it("keeps declined out of the exported main phase model", () => {
    expect(GRANT_PIPELINE_PHASES).toEqual([
      expect.objectContaining({
        label: "Pre-award",
        statuses: ["discovery", "application", "submitted"],
      }),
      expect.objectContaining({
        label: "Award setup",
        statuses: ["awarded"],
      }),
      expect.objectContaining({
        label: "Active delivery",
        statuses: ["active", "reporting"],
      }),
      expect.objectContaining({
        label: "Completion / next cycle",
        statuses: ["closeout", "renewal"],
      }),
    ]);
    expect(GRANT_PIPELINE_PHASES.flatMap((phase) => phase.statuses)).not.toContain("declined");
  });

  it("renders compact grant rows with links and stage-specific next steps", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 2,
          grants: [
            { id: "g-1", name: "Youth Program" },
            { id: "g-2", name: "Arts Initiative" },
          ],
        },
        awarded: {
          count: 1,
          grants: [{ id: "g-3", name: "STEM Access Fund" }],
        },
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<GrantPipelinePage />);

    expect(container.querySelector("[data-slot='surface-section']")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Youth Program" })).toHaveAttribute(
      "href",
      "/grants/$grantId",
    );
    expect(screen.getByText("Arts Initiative")).toBeInTheDocument();
    expect(screen.getByText("STEM Access Fund")).toBeInTheDocument();
    expect(
      screen.getAllByText("Next: confirm fit, deadline, funder requirements, and whether to apply.")
        .length,
    ).toBeGreaterThan(0);
  });

  it("moves declined grants into a collapsed archive strip", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        declined: {
          count: 2,
          grants: [
            { id: "g-4", name: "Past Opportunity" },
            { id: "g-5", name: "Cancelled Renewal" },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<GrantPipelinePage />);

    const archive = screen.getByRole("button", {
      name: /Archived \/ declined 2/i,
    });
    expect(archive).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Past Opportunity")).not.toBeInTheDocument();

    fireEvent.click(archive);

    expect(archive).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Past Opportunity")).toBeInTheDocument();
    expect(screen.getByText("Cancelled Renewal")).toBeInTheDocument();
  });

  it("shows the declined empty state when the archive is expanded without declined grants", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {},
      isLoading: false,
      isError: false,
    });

    render(<GrantPipelinePage />);
    fireEvent.click(screen.getByRole("button", { name: /Archived \/ declined 0/i }));

    expect(screen.getByText("No declined or cancelled grants.")).toBeInTheDocument();
  });

  it("preserves archived grant links and editor stage movement", () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    hoisted.mockUseSession.mockReturnValue({ memberRole: "editor" });
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        declined: {
          count: 1,
          grants: [{ id: "g-4", name: "Past Opportunity" }],
        },
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseUpdateGrantStage.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    render(<GrantPipelinePage />);
    fireEvent.click(screen.getByRole("button", { name: /Archived \/ declined 1/i }));

    expect(screen.getByRole("link", { name: "Past Opportunity" })).toHaveAttribute(
      "href",
      "/grants/$grantId",
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Move Past Opportunity to another stage" }),
      {
        target: { value: "active" },
      },
    );
    expect(mutateAsync).toHaveBeenCalledWith({
      grantId: "g-4",
      status: "active",
    });
  });

  it("keeps archived grant stage controls disabled for viewers", () => {
    const mutateAsync = vi.fn();
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer" });
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        declined: {
          count: 1,
          grants: [{ id: "g-4", name: "Past Opportunity" }],
        },
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseUpdateGrantStage.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    render(<GrantPipelinePage />);
    fireEvent.click(screen.getByRole("button", { name: /Archived \/ declined 1/i }));

    const trigger = screen.getByRole("combobox", {
      name: "Move Past Opportunity to another stage",
    });
    expect(trigger).toBeDisabled();
    fireEvent.change(trigger, { target: { value: "active" } });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows a stale-data warning when pipeline refresh fails after cached data exists", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 1,
          grants: [{ id: "g-1", name: "Youth Program" }],
        },
      },
      isLoading: false,
      isError: true,
      error: new Error("Pipeline refresh failed"),
      refetch: vi.fn(),
    });

    render(<GrantPipelinePage />);

    expect(screen.getByText("Grant pipeline may be stale.")).toBeInTheDocument();
    expect(screen.getByText("Pipeline refresh failed")).toBeInTheDocument();
    expect(screen.getByText("Youth Program")).toBeInTheDocument();
  });

  it("shows fallback stale-data copy and retries when the cached refresh error is unknown", () => {
    const refetch = vi.fn();
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 1,
          grants: [{ id: "g-1", name: "Youth Program" }],
        },
      },
      isLoading: false,
      isError: true,
      error: "offline",
      refetch,
    });

    render(<GrantPipelinePage />);

    expect(screen.getByText("Refresh the page and try again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("lets editors move grants with a clearer stage dropdown label", () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    hoisted.mockUseSession.mockReturnValue({ memberRole: "editor" });
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 1,
          grants: [{ id: "g-1", name: "Youth Program" }],
        },
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseUpdateGrantStage.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    render(<GrantPipelinePage />);

    fireEvent.change(
      screen.getByRole("combobox", { name: "Move Youth Program to another stage" }),
      {
        target: { value: "submitted" },
      },
    );

    expect(mutateAsync).toHaveBeenCalledWith({
      grantId: "g-1",
      status: "submitted",
    });
  });

  it("prevents viewers from changing grant stages", () => {
    const mutateAsync = vi.fn();
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer" });
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {
        discovery: {
          count: 1,
          grants: [{ id: "g-1", name: "Youth Program" }],
        },
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseUpdateGrantStage.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    render(<GrantPipelinePage />);

    const trigger = screen.getByRole("combobox", {
      name: "Move Youth Program to another stage",
    });
    expect(trigger).toBeDisabled();
    fireEvent.change(trigger, { target: { value: "submitted" } });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("renders a link back to the grants list", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {},
      isLoading: false,
      isError: false,
    });

    render(<GrantPipelinePage />);

    expect(screen.getByRole("link", { name: "List" })).toBeInTheDocument();
  });

  it("renders the Grants tab group with Pipeline marked as the active tab", () => {
    hoisted.mockUseGrantPipeline.mockReturnValue({
      data: {},
      isLoading: false,
      isError: false,
    });

    render(<GrantPipelinePage />);

    const nav = screen.getByRole("navigation", { name: "Grants sections" });
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/grants");
    expect(within(nav).getByRole("link", { name: "Pipeline" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Funders" })).toHaveAttribute("href", "/funders");
    expect(within(nav).getByRole("link", { name: "Subrecipients" })).toHaveAttribute(
      "href",
      "/subrecipients",
    );
    expect(within(nav).getByRole("link", { name: "Budget Sentinel" })).toHaveAttribute(
      "href",
      "/grants/sentinel",
    );
  });
});

function getStageLabel(status: (typeof GRANT_STAGE_DETAILS)[number]["status"]) {
  return GRANT_STAGE_DETAILS.find((stage) => stage.status === status)?.label ?? status;
}
