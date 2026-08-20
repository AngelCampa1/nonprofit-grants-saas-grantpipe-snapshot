import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("EventDetailPage source contracts", () => {
  it("associates the event-type, attendee, and volunteer selects with their labels", () => {
    const source = readFileSync(join(__dirname, "$eventId.tsx"), "utf8");

    // Clicking each label should focus its select, not just the box.
    for (const id of ["event-overview-type", "attendee-existing-contact", "volunteer-contact"]) {
      expect(source).toContain(`htmlFor="${id}"`);
      expect(source).toContain(`id="${id}"`);
    }
  });

  it("gives the volunteer hours and date inputs visible labels, not just placeholders", () => {
    const source = readFileSync(join(__dirname, "$eventId.tsx"), "utf8");

    for (const id of ["volunteer-hours", "volunteer-date"]) {
      expect(source).toContain(`htmlFor="${id}"`);
      expect(source).toContain(`id="${id}"`);
    }
  });
});

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

const hoisted = vi.hoisted(() => ({
  mockCreateFileRoute: vi.fn((path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useParams: () => ({ eventId: "evt-test-1" }),
  })),
  mockUseEvent: vi.fn(),
  mockUseContacts: vi.fn(),
  mockUseEventMutations: vi.fn(),
  mockUseVolunteerHours: vi.fn(),
  mockUseCreateAttendee: vi.fn(),
  mockUseCreateVolunteerHour: vi.fn(),
  mockUseUpdateAttendee: vi.fn(),
  mockUseLinkAttendeeDonation: vi.fn(),
  mockUseCreateAttendeeDonation: vi.fn(),
  mockUseVolunteerHourMutations: vi.fn(),
  mockUseSession: vi.fn(),
  mockRefetch: vi.fn(),
}));

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => hoisted.mockUseSession(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    PageHeader: ({
      breadcrumb,
      title,
      description,
      actions,
    }: {
      breadcrumb?: React.ReactNode;
      title: string;
      description?: string;
      actions?: React.ReactNode;
    }) => (
      <div data-slot="page-header">
        {breadcrumb}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {actions}
      </div>
    ),
    Breadcrumb: ({ children }: { children: React.ReactNode }) => (
      <nav aria-label="breadcrumb">{children}</nav>
    ),
    BreadcrumbList: ({ children }: { children: React.ReactNode }) => <ol>{children}</ol>,
    BreadcrumbItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
    BreadcrumbLink: ({
      children,
      asChild,
      ...props
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    } & React.HTMLAttributes<HTMLSpanElement>) =>
      asChild
        ? React.cloneElement(children as React.ReactElement, props)
        : React.createElement("a", props, children),
    BreadcrumbPage: ({ children }: { children: React.ReactNode }) => (
      <span aria-current="page">{children}</span>
    ),
    BreadcrumbSeparator: () => <span aria-hidden="true">/</span>,
    Tabs: ({
      children,
      defaultValue,
      ...props
    }: {
      children: React.ReactNode;
      defaultValue?: string;
      [k: string]: unknown;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "tabs", "data-value": defaultValue, ...props },
        children,
      ),
    TabsList: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) =>
      React.createElement("div", { role: "tablist", ...props }, children),
    TabsTrigger: ({
      children,
      value,
      ...props
    }: {
      children: React.ReactNode;
      value: string;
      [k: string]: unknown;
    }) => React.createElement("button", { role: "tab", "data-value": value, ...props }, children),
    TabsContent: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      value: string;
      [k: string]: unknown;
    }) => React.createElement("div", { role: "tabpanel", ...props }, children),
    Alert: ({
      title,
      variant,
      children,
    }: {
      title?: React.ReactNode;
      variant?: string;
      children?: React.ReactNode;
    }) => (
      <div data-slot="alert" data-variant={variant}>
        {title ? <p data-slot="alert-title">{title}</p> : null}
        <div>{children}</div>
      </div>
    ),
    Button: ({
      children,
      asChild,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
      asChild ? (children as React.ReactElement) : <button {...props}>{children}</button>,
    Card: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    CardContent: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    CardHeader: ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div className={className} {...props}>
        {children}
      </div>
    ),
    CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2 {...props}>{children}</h2>
    ),
    Input: React.forwardRef(
      (props: React.InputHTMLAttributes<HTMLInputElement>, ref: React.Ref<HTMLInputElement>) => (
        <input ref={ref} {...props} />
      ),
    ),
    Label: ({ htmlFor, children }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
      <label htmlFor={htmlFor}>{children}</label>
    ),
    PageShell: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
    Select: ({
      children,
      value = "",
      onValueChange = () => {},
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
    SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
      <div role="option" data-value={value}>
        {children}
      </div>
    ),
    SelectTrigger: ({
      id,
      "aria-label": ariaLabel,
      children: _children,
    }: {
      id?: string;
      "aria-label"?: string;
      children?: React.ReactNode;
      className?: string;
    }) => {
      const { value, onValueChange, disabled } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          id={id}
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
  };
});

vi.mock("../../../hooks/use-events", () => ({
  useEvent: hoisted.mockUseEvent,
  useContacts: vi.fn(),
  useEventMutations: hoisted.mockUseEventMutations,
  useVolunteerHours: hoisted.mockUseVolunteerHours,
  useCreateAttendee: hoisted.mockUseCreateAttendee,
  useCreateVolunteerHour: hoisted.mockUseCreateVolunteerHour,
  useUpdateAttendee: hoisted.mockUseUpdateAttendee,
  useLinkAttendeeDonation: hoisted.mockUseLinkAttendeeDonation,
  useCreateAttendeeDonation: hoisted.mockUseCreateAttendeeDonation,
  useVolunteerHourMutations: hoisted.mockUseVolunteerHourMutations,
}));

vi.mock("../../../hooks/use-donors", () => ({
  useContacts: hoisted.mockUseContacts,
}));

vi.mock("../../../lib/format", () => ({
  formatCurrency: (cents: number | null | undefined) => {
    if (cents == null) return "--";
    return `$${(cents / 100).toFixed(0)}`;
  },
  formatEventTypeLabel: (type: string) => type.charAt(0).toUpperCase() + type.slice(1),
  formatUtcDate: (value: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(new Date(value)),
}));

vi.mock("../../../components/entity-activity-section", () => ({
  EntityActivitySection: () => <div data-testid="entity-activity-section" />,
}));

vi.mock("../../../components/entity-documents-section", () => ({
  EntityDocumentsSection: () => <div data-testid="entity-documents-section" />,
}));

// The page component is intentionally not exported from the route module so the
// TanStack Router Vite plugin can code-split it out of the initial entry chunk
// (mirroring the donor/$contactId pattern). Pull it off the route config instead.
import { Route } from "./$eventId";

const EventDetailPage = (Route as unknown as { component: React.ComponentType }).component;

const defaultMutationStub = {
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
};

const eventWithAttendee = {
  id: "evt-test-1",
  name: "Annual Gala",
  type: "gala",
  summary: { attendeeCount: 1, revenueCents: 0, volunteerHoursTotal: 0 },
  attendees: [
    {
      id: "att-1",
      contactId: "contact-1",
      rsvpStatus: "invited",
      contact: { firstName: "Jane", lastName: "Doe" },
      donation: null,
    },
  ],
};

function setupDefaultMocks() {
  hoisted.mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
  hoisted.mockUseContacts.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
  hoisted.mockUseEventMutations.mockReturnValue({
    updateEvent: defaultMutationStub,
    deleteEvent: { mutateAsync: vi.fn(), isPending: false },
  });
  hoisted.mockUseVolunteerHours.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
  });
  hoisted.mockUseCreateAttendee.mockReturnValue(defaultMutationStub);
  hoisted.mockUseCreateVolunteerHour.mockReturnValue(defaultMutationStub);
  hoisted.mockUseUpdateAttendee.mockReturnValue(defaultMutationStub);
  hoisted.mockUseLinkAttendeeDonation.mockReturnValue(defaultMutationStub);
  hoisted.mockUseCreateAttendeeDonation.mockReturnValue(defaultMutationStub);
  hoisted.mockUseVolunteerHourMutations.mockReturnValue({
    updateVolunteerHour: defaultMutationStub,
  });
}

describe("EventDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it("renders access denied for roles that cannot access events", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "auditor", isLoading: false });

    render(<EventDetailPage />);

    expect(screen.getByText("You need event access.")).toBeInTheDocument();
  });

  it("renders animate-pulse skeleton while event data is loading", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    const { container } = render(<EventDetailPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders animate-pulse skeleton when isLoading is false, isError is false, and data is invalid", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: { someOtherField: "value" },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    const { container } = render(<EventDetailPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders animate-pulse skeleton when data is undefined and not loading or error", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    const { container } = render(<EventDetailPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Fatal error state
  // ---------------------------------------------------------------------------

  it("renders Alert error state with retry button on fatal error (no stale data)", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Not found"),
      refetch: hoisted.mockRefetch,
    });

    const { container } = render(<EventDetailPage />);

    const alert = container.querySelector("[data-slot='alert'][data-variant='destructive']");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Unable to load event.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("calls refetch when Try again button is clicked", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(hoisted.mockRefetch).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Stale data banner
  // ---------------------------------------------------------------------------

  it("shows stale-data banner but keeps content visible when isError and stale data exists", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Annual Gala",
        type: "gala",
        summary: { attendeeCount: 5, revenueCents: 100000, volunteerHoursTotal: 20 },
        attendees: [],
      },
      isLoading: false,
      isError: true,
      error: new Error("Refresh failed"),
      refetch: hoisted.mockRefetch,
    });

    const { container } = render(<EventDetailPage />);

    // Content is visible
    expect(screen.getByRole("heading", { name: "Annual Gala" })).toBeInTheDocument();

    // Stale data banner
    const errorAlert = container.querySelector("[data-slot='alert'][data-variant='destructive']");
    expect(errorAlert).toBeInTheDocument();
    expect(screen.getByText("Event data may be out of date.")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it("renders populated event with PageHeader, breadcrumb, tabs, summary cards, and sections", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Annual Gala",
        type: "gala",
        summary: { attendeeCount: 12, revenueCents: 500000, volunteerHoursTotal: 48 },
        attendees: [
          {
            id: "att-1",
            rsvpStatus: "attended",
            contact: { firstName: "Jane", lastName: "Doe" },
            donation: { id: "don-1", amountCents: 25000 },
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    const { container } = render(<EventDetailPage />);

    // PageHeader heading
    expect(screen.getByRole("heading", { name: "Annual Gala" })).toBeInTheDocument();

    // PageHeader slot exists
    expect(container.querySelector("[data-slot='page-header']")).toBeInTheDocument();

    // Breadcrumb
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav).toBeInTheDocument();
    expect(nav.querySelector("a[href='/events']")).toBeInTheDocument();
    const currentPage = nav.querySelector("[aria-current='page']");
    expect(currentPage?.textContent).toBe("Annual Gala");

    // Tabs
    const tabs = screen.getByTestId("tabs");
    expect(tabs).toHaveAttribute("data-value", "overview");
    expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /attendees/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /volunteer hours/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /activity/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /documents/i })).toBeInTheDocument();

    // Summary cards — headline metrics use the canonical large-number style
    // (text-2xl font-semibold), consistent with the funds/grants detail cards.
    const attendeeMetric = screen.getByText("12");
    expect(attendeeMetric).toBeInTheDocument();
    expect(attendeeMetric).toHaveClass("text-2xl", "font-semibold");
    const volunteerMetric = screen.getByText("48");
    expect(volunteerMetric).toBeInTheDocument();
    expect(volunteerMetric).toHaveClass("text-2xl", "font-semibold");
    // Grouping separator differs between the jsdom test env and the browser
    // ("$5000" vs "$5,000"); match either so the assertion targets the metric, not ICU.
    const revenueMetric = screen.getByText(/^\$5,?000$/);
    expect(revenueMetric).toBeInTheDocument();
    expect(revenueMetric).toHaveClass("text-2xl", "font-semibold");

    // Attendee name (appears in the attendee card and the revenue breakdown row)
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThanOrEqual(1);

    // Revenue breakdown labels the row by donor name and shows the donation amount
    expect(screen.getByText("$250")).toBeInTheDocument();
    expect(screen.queryByText("Donation 1")).not.toBeInTheDocument();

    // Sections rendered
    expect(screen.getByTestId("entity-activity-section")).toBeInTheDocument();
    expect(screen.getByTestId("entity-documents-section")).toBeInTheDocument();

    // No fatal alert
    expect(container.querySelectorAll("[data-slot='alert']")).toHaveLength(0);
  });

  it("keeps content headings in sentence case and labels the volunteer metric by what it counts", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Annual Gala",
        type: "gala",
        summary: { attendeeCount: 12, revenueCents: 500000, volunteerHoursTotal: 48 },
        attendees: [
          {
            id: "att-1",
            rsvpStatus: "attended",
            contact: { firstName: "Jane", lastName: "Doe" },
            donation: { id: "don-1", amountCents: 25000 },
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    // Section heading is sentence case, coherent with "Event details".
    expect(screen.getByRole("heading", { name: "Revenue breakdown" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Revenue Breakdown" })).not.toBeInTheDocument();

    // The metric card counts volunteer hours; label it as such (was the ambiguous
    // "Volunteer Total"). getAllByText is case-sensitive, so this excludes the
    // Title-Case "Volunteer Hours" tab; the old ambiguous label must be gone.
    expect(screen.getAllByText("Volunteer hours").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Volunteer Total")).not.toBeInTheDocument();
  });

  it("revenue breakdown lists only attendees with a donation and omits non-donors", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Annual Gala",
        type: "gala",
        summary: { attendeeCount: 2, revenueCents: 99900, volunteerHoursTotal: 0 },
        attendees: [
          {
            id: "att-donor",
            rsvpStatus: "attended",
            contact: { firstName: "Jane", lastName: "Doe" },
            donation: { id: "don-1", amountCents: 25000 },
          },
          {
            id: "att-nondonor",
            rsvpStatus: "invited",
            contact: { firstName: "Mark", lastName: "Lee" },
            donation: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    // Donor appears as a revenue row labeled by name with their amount
    expect(screen.getByText("$250")).toBeInTheDocument();
    // The non-donor attendee is NOT listed as a "Donation" row and no $0.00 noise
    expect(screen.queryByText("Donation 2")).not.toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });

  it("shows an empty revenue breakdown message when no attendee has donated", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Annual Gala",
        type: "gala",
        summary: { attendeeCount: 1, revenueCents: 0, volunteerHoursTotal: 0 },
        attendees: [
          {
            id: "att-1",
            rsvpStatus: "invited",
            contact: { firstName: "Jane", lastName: "Doe" },
            donation: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    expect(screen.getByText("No donations recorded yet.")).toBeInTheDocument();
  });

  it("shows an empty state on the Attendees tab when the event has no attendees", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Annual Gala",
        type: "gala",
        summary: { attendeeCount: 0, revenueCents: 0, volunteerHoursTotal: 0 },
        attendees: [],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    expect(screen.getByText("No attendees yet.")).toBeInTheDocument();
  });

  it("falls back to a readable label when an attendee contact has no name", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Annual Gala",
        type: "gala",
        summary: { attendeeCount: 2, revenueCents: 0, volunteerHoursTotal: 0 },
        attendees: [
          {
            id: "att-email-only",
            rsvpStatus: "invited",
            contact: { firstName: null, lastName: null, email: "org@example.org" },
            donation: null,
          },
          {
            id: "att-no-identity",
            rsvpStatus: "invited",
            contact: { firstName: null, lastName: null, email: null },
            donation: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    expect(screen.getByText("org@example.org")).toBeInTheDocument();
    expect(screen.getByText("Unnamed attendee")).toBeInTheDocument();
  });

  it("shows view-only event controls for viewer role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseVolunteerHours.mockReturnValue({
      data: {
        data: [{ id: "vh-1", hours: 2, date: "2026-04-10T00:00:00.000Z", program: null }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Annual Gala",
        type: "gala",
        summary: { attendeeCount: 1, revenueCents: 0, volunteerHoursTotal: 2 },
        attendees: [
          {
            id: "att-1",
            rsvpStatus: "invited",
            contact: { firstName: "Jane", lastName: "Doe" },
            donation: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    expect(
      screen.getByText("View-only access. Editors and admins can update event details."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("View-only access. Editors and admins can manage attendees."),
    ).toBeInTheDocument();
    expect(screen.getByText("No linked donation.")).toBeInTheDocument();
    expect(
      screen.getByText("View-only access. Editors and admins can log or update volunteer hours."),
    ).toBeInTheDocument();
    expect(screen.getByText("No program assigned.")).toBeInTheDocument();
  });

  it("blocks event access for auditor role", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "auditor", isLoading: false });

    render(<EventDetailPage />);

    expect(screen.getByText("You need event access.")).toBeInTheDocument();
    expect(hoisted.mockUseEvent).not.toHaveBeenCalled();
  });

  it("keeps auditors blocked from event details even with explicit event permissions", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "auditor",
      memberPermissions: { events: "manage" },
      isLoading: false,
    });

    render(<EventDetailPage />);

    expect(screen.getByText("You need event access.")).toBeInTheDocument();
    expect(hoisted.mockUseEvent).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Mark attended
  // ---------------------------------------------------------------------------

  it("shows an error message when the Mark attended button mutation fails", async () => {
    const failingMutateAsync = vi.fn().mockRejectedValue(new Error("Network timeout"));
    hoisted.mockUseUpdateAttendee.mockReturnValue({
      mutateAsync: failingMutateAsync,
      isPending: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    const markAttendedButton = screen.getByRole("button", { name: "Mark attended" });
    fireEvent.click(markAttendedButton);

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Network timeout");
  });

  it("shows an error alert when Mark attended fails with a non-Error rejection", async () => {
    const failingMutateAsync = vi.fn().mockRejectedValue("plain string error");
    hoisted.mockUseUpdateAttendee.mockReturnValue({
      mutateAsync: failingMutateAsync,
      isPending: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mark attended" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to mark attendee as attended.");
  });

  // ---------------------------------------------------------------------------
  // Volunteer hours validation
  // ---------------------------------------------------------------------------

  it("shows error when Log volunteer hours is clicked without a contact selected", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Select a volunteer contact.");
  });

  it("shows error when Log volunteer hours is clicked with a contact but no hours entered", () => {
    hoisted.mockUseContacts.mockReturnValue({
      data: {
        data: [{ id: "contact-1", firstName: "John", lastName: "Smith", email: "j@example.com" }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    const volunteerSelect = screen.getByRole("combobox", { name: "Volunteer contact" });
    fireEvent.change(volunteerSelect, { target: { value: "contact-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter volunteer hours.");
  });

  it("shows error when Log volunteer hours is clicked with contact and hours but no date", () => {
    hoisted.mockUseContacts.mockReturnValue({
      data: {
        data: [{ id: "contact-1", firstName: "John", lastName: "Smith", email: "j@example.com" }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    const volunteerSelect = screen.getByRole("combobox", { name: "Volunteer contact" });
    fireEvent.change(volunteerSelect, { target: { value: "contact-1" } });

    const hoursInput = screen.getByRole("spinbutton", { name: "Volunteer hours" });
    fireEvent.change(hoursInput, { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Select a volunteer date.");
  });

  // ---------------------------------------------------------------------------
  // Volunteer hours loading/error states
  // ---------------------------------------------------------------------------

  it("shows loading skeleton for volunteer hours when volunteerQuery is loading", () => {
    hoisted.mockUseVolunteerHours.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    const { container } = render(<EventDetailPage />);

    const loadingSkeleton = container.querySelector("[data-testid='volunteer-hours-loading']");
    expect(loadingSkeleton).toBeInTheDocument();
  });

  it("shows error Alert for volunteer hours when volunteerQuery is error", () => {
    hoisted.mockUseVolunteerHours.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    const { container } = render(<EventDetailPage />);

    const errorAlert = container.querySelector("[data-slot='alert'][data-variant='destructive']");
    expect(errorAlert).toBeInTheDocument();
    expect(screen.getByText("Unable to load volunteer hours.")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Clear error on input change
  // ---------------------------------------------------------------------------

  it("clears volunteerError when volunteer hours input is changed", () => {
    hoisted.mockUseContacts.mockReturnValue({
      data: {
        data: [{ id: "contact-1", firstName: "John", lastName: "Smith", email: "j@example.com" }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select a volunteer contact.");

    const volunteerSelect = screen.getByRole("combobox", { name: "Volunteer contact" });
    fireEvent.change(volunteerSelect, { target: { value: "contact-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter volunteer hours.");

    const hoursInput = screen.getByRole("spinbutton", { name: "Volunteer hours" });
    fireEvent.change(hoursInput, { target: { value: "3" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears volunteerError when volunteer date input is changed", () => {
    hoisted.mockUseContacts.mockReturnValue({
      data: {
        data: [{ id: "contact-1", firstName: "John", lastName: "Smith", email: "j@example.com" }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    const volunteerSelect = screen.getByRole("combobox", { name: "Volunteer contact" });
    fireEvent.change(volunteerSelect, { target: { value: "contact-1" } });

    const hoursInput = screen.getByRole("spinbutton", { name: "Volunteer hours" });
    fireEvent.change(hoursInput, { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select a volunteer date.");

    const dateInputEl = document.querySelector("[aria-label='Volunteer date']") as HTMLInputElement;
    expect(dateInputEl).not.toBeNull();
    fireEvent.change(dateInputEl, { target: { value: "2026-04-15" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears volunteerError when the volunteer contact dropdown changes", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select a volunteer contact.");

    const volunteerSelect = screen.getByRole("combobox", { name: "Volunteer contact" });
    fireEvent.change(volunteerSelect, { target: { value: "contact-1" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears attendeeError when the attendee contact dropdown changes", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add attendee" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Select a contact before adding an attendee.",
    );

    const attendeeSelect = screen.getByRole("combobox", { name: "Existing contact" });
    fireEvent.change(attendeeSelect, { target: { value: "contact-1" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears overviewError when the event type selector changes after an update error", async () => {
    const failingUpdateEvent = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("Update failed")),
      isPending: false,
    };
    hoisted.mockUseEventMutations.mockReturnValue({
      updateEvent: failingUpdateEvent,
      deleteEvent: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(saveButton);

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Update failed");

    const typeSelect = screen.getByRole("combobox", { name: "Event type" });
    fireEvent.change(typeSelect, { target: { value: "fundraiser" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears overviewError when the event name input changes after an update error", async () => {
    const failingUpdateEvent = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("Update failed")),
      isPending: false,
    };
    hoisted.mockUseEventMutations.mockReturnValue({
      updateEvent: failingUpdateEvent,
      deleteEvent: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Update failed");

    const nameInput = screen.getByPlaceholderText("Event name");
    fireEvent.change(nameInput, { target: { value: "New Name" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("prefills date, location, revenue goal, and description from the loaded event", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Gala",
        type: "gala",
        date: "2026-09-12T12:00:00.000Z",
        location: "Civic Center",
        description: "Yearly fundraising dinner.",
        revenueGoalCents: 250000,
        attendees: [],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-09-12");
    expect((screen.getByLabelText("Location") as HTMLInputElement).value).toBe("Civic Center");
    expect((screen.getByLabelText("Revenue goal (USD)") as HTMLInputElement).value).toBe("2500");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
      "Yearly fundraising dinner.",
    );
  });

  it("saves edited date, location, revenue goal, and description in the update payload", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    hoisted.mockUseEventMutations.mockReturnValue({
      updateEvent: { mutateAsync, isPending: false },
      deleteEvent: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Grand Hall" } });
    fireEvent.change(screen.getByLabelText("Revenue goal (USD)"), { target: { value: "1500" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Black-tie evening." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      name: "Gala",
      type: "gala",
      date: "2026-10-01T12:00:00.000Z",
      location: "Grand Hall",
      description: "Black-tie evening.",
      revenueGoalCents: 150000,
    });
  });

  it("sends null for cleared optional event fields on save", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    hoisted.mockUseEventMutations.mockReturnValue({
      updateEvent: { mutateAsync, isPending: false },
      deleteEvent: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Gala",
        type: "gala",
        date: "2026-09-12T12:00:00.000Z",
        location: "Civic Center",
        description: "Yearly fundraising dinner.",
        revenueGoalCents: 250000,
        attendees: [],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "  " } });
    fireEvent.change(screen.getByLabelText("Revenue goal (USD)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      name: "Gala",
      type: "gala",
      date: null,
      location: null,
      description: null,
      revenueGoalCents: null,
    });
  });

  it("clears updateError in VolunteerHourRow when program input changes after an update error", async () => {
    const failingUpdateVolunteerHour = vi.fn().mockRejectedValue(new Error("Update failed"));
    hoisted.mockUseVolunteerHourMutations.mockReturnValue({
      updateVolunteerHour: { mutateAsync: failingUpdateVolunteerHour, isPending: false },
    });
    hoisted.mockUseVolunteerHours.mockReturnValue({
      data: {
        data: [{ id: "vh-1", hours: 3, date: "2026-04-10T00:00:00.000Z", program: "Youth" }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    const updateButton = screen.getByRole("button", { name: "Update" });
    fireEvent.click(updateButton);

    await screen.findByRole("alert");

    const programInput = screen.getByLabelText("Program");
    fireEvent.change(programInput, { target: { value: "Education" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Donation actions
  // ---------------------------------------------------------------------------

  it("shows donationError when Create donation is clicked with amount but no date, then clears on date input change", async () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Gala",
        type: "gala",
        attendees: [
          {
            id: "att-1",
            rsvpStatus: "invited",
            contact: { firstName: "Jane", lastName: "Doe" },
            donation: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    const amountInput = screen.getByLabelText("Amount (USD)");
    fireEvent.change(amountInput, { target: { value: "10000" } });

    fireEvent.click(screen.getByRole("button", { name: "Create donation" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Select a donation date.");

    const dateInput = screen.getByLabelText("Donation date");
    fireEvent.change(dateInput, { target: { value: "2026-04-15" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("requires a donation id before linking attendee donations", () => {
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Link donation" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a donation ID before linking.");
  });

  it("links an existing attendee donation and clears the error when the id changes", async () => {
    const linkDonation = vi.fn().mockResolvedValue({});
    hoisted.mockUseLinkAttendeeDonation.mockReturnValue({
      mutateAsync: linkDonation,
      isPending: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Link donation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a donation ID before linking.");

    expect(screen.queryByLabelText("Donation ID")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Existing donation"), { target: { value: "don-123" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Link donation" }));

    await waitFor(() => {
      expect(linkDonation).toHaveBeenCalledWith({ donationId: "don-123" });
    });
    // The attendee's contact id is threaded to the hook so the contact's giving
    // history is refreshed after linking the donation.
    expect(hoisted.mockUseLinkAttendeeDonation).toHaveBeenCalledWith(
      "evt-test-1",
      "att-1",
      "contact-1",
    );
  });

  it("shows fallback link-donation errors for non-Error rejections", async () => {
    hoisted.mockUseLinkAttendeeDonation.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue("plain string error"),
      isPending: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.change(screen.getByLabelText("Existing donation"), { target: { value: "don-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Link donation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to link attendee donation.");
  });

  it("creates attendee donations from amount and date", async () => {
    const createDonation = vi.fn().mockResolvedValue({});
    hoisted.mockUseCreateAttendeeDonation.mockReturnValue({
      mutateAsync: createDonation,
      isPending: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.change(screen.getByLabelText("Amount (USD)"), { target: { value: "123.45" } });
    fireEvent.change(screen.getByLabelText("Donation date"), { target: { value: "2026-04-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Create donation" }));

    await waitFor(() => {
      expect(createDonation).toHaveBeenCalledWith({
        amountCents: 12345,
        date: "2026-04-15",
        type: "one_time",
      });
    });
  });

  it("shows fallback create-donation errors for invalid amounts and non-Error rejections", async () => {
    hoisted.mockUseCreateAttendeeDonation.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue("plain string error"),
      isPending: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.change(screen.getByLabelText("Amount (USD)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Create donation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a positive donation amount.");

    fireEvent.change(screen.getByLabelText("Amount (USD)"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Donation date"), { target: { value: "2026-04-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Create donation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to create attendee donation.",
    );
  });

  it("logs volunteer hours and normalizes date-only input", async () => {
    const createVolunteerHour = vi.fn().mockResolvedValue({});
    hoisted.mockUseCreateVolunteerHour.mockReturnValue({
      mutateAsync: createVolunteerHour,
      isPending: false,
    });
    hoisted.mockUseContacts.mockReturnValue({
      data: {
        data: [{ id: "contact-1", firstName: "John", lastName: "Smith", email: "j@example.com" }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.change(screen.getByRole("combobox", { name: "Volunteer contact" }), {
      target: { value: "contact-1" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Volunteer hours" }), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Volunteer date"), {
      target: { value: "2026-04-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));

    await waitFor(() => {
      expect(createVolunteerHour).toHaveBeenCalledWith({
        contactId: "contact-1",
        eventId: "evt-test-1",
        hours: "4",
        date: "2026-04-15T00:00:00.000Z",
      });
    });
  });

  it("shows fallback volunteer logging errors for non-Error rejections", async () => {
    hoisted.mockUseCreateVolunteerHour.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue("plain string error"),
      isPending: false,
    });
    hoisted.mockUseContacts.mockReturnValue({
      data: {
        data: [{ id: "contact-1", firstName: "John", lastName: "Smith", email: "j@example.com" }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.change(screen.getByRole("combobox", { name: "Volunteer contact" }), {
      target: { value: "contact-1" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Volunteer hours" }), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Volunteer date"), {
      target: { value: "2026-04-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to log volunteer hours.");
  });

  it("renders view-only attendee and volunteer states for viewers", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });
    hoisted.mockUseEvent.mockReturnValue({
      data: {
        id: "evt-test-1",
        name: "Gala",
        type: "gala",
        attendees: [
          {
            id: "att-1",
            rsvpStatus: "attended",
            contact: { firstName: "Linked", lastName: "Donor" },
            donation: { id: "don-1", amountCents: 2500 },
          },
          {
            id: "att-2",
            rsvpStatus: "invited",
            contact: { firstName: "Unlinked", lastName: "Donor" },
            donation: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });
    hoisted.mockUseVolunteerHours.mockReturnValue({
      data: {
        data: [{ id: "vh-1", hours: 2, date: "2026-04-10T00:00:00.000Z", program: null }],
      },
      isLoading: false,
      isError: false,
    });

    render(<EventDetailPage />);

    expect(
      screen.getByText("View-only access. Editors and admins can update event details."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("View-only access. Editors and admins can manage attendees."),
    ).toBeInTheDocument();
    expect(screen.getByText("Linked donation: $25")).toBeInTheDocument();
    expect(screen.getByText("No linked donation.")).toBeInTheDocument();
    expect(
      screen.getByText("View-only access. Editors and admins can log or update volunteer hours."),
    ).toBeInTheDocument();
    expect(screen.getByText("No program assigned.")).toBeInTheDocument();
  });

  it("renders contact label with name only when contact has no email", () => {
    hoisted.mockUseContacts.mockReturnValue({
      data: {
        data: [{ id: "contact-1", firstName: "John", lastName: "Smith", email: null }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);
    // Contact without email just shows "John Smith" — may appear in multiple selects
    expect(screen.getAllByRole("option", { name: "John Smith" }).length).toBeGreaterThan(0);
  });

  it("renders contact label with id fallback when contact has no name or email", () => {
    hoisted.mockUseContacts.mockReturnValue({
      data: {
        data: [
          {
            id: "contact-no-name",
            firstName: null,
            lastName: null,
            email: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);
    expect(screen.getAllByRole("option", { name: "contact-no-name" }).length).toBeGreaterThan(0);
  });

  it("renders contact label with email fallback when contact has no name but has email", () => {
    hoisted.mockUseContacts.mockReturnValue({
      data: {
        data: [
          {
            id: "contact-no-name-2",
            firstName: null,
            lastName: null,
            email: "noname@example.com",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);
    expect(screen.getAllByRole("option", { name: "noname@example.com" }).length).toBeGreaterThan(0);
  });

  it("shows fallback error message when updateEvent rejects with a non-Error value", async () => {
    const failingUpdateEvent = {
      mutateAsync: vi.fn().mockRejectedValue("plain string error"),
      isPending: false,
    };
    hoisted.mockUseEventMutations.mockReturnValue({
      updateEvent: failingUpdateEvent,
      deleteEvent: { mutateAsync: vi.fn(), isPending: false },
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save event overview.");
  });

  it("shows fallback error when VolunteerHourRow update rejects with a non-Error value", async () => {
    const failingUpdateVolunteerHour = vi.fn().mockRejectedValue("plain string error");
    hoisted.mockUseVolunteerHourMutations.mockReturnValue({
      updateVolunteerHour: { mutateAsync: failingUpdateVolunteerHour, isPending: false },
    });
    hoisted.mockUseVolunteerHours.mockReturnValue({
      data: {
        data: [{ id: "vh-1", hours: 3, date: "2026-04-10T00:00:00.000Z", program: "Youth" }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    const updateButton = screen.getByRole("button", { name: "Update" });
    fireEvent.click(updateButton);

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to update volunteer hours.");
  });

  it("shows loading contacts status in attendee section", () => {
    hoisted.mockUseContacts.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);
    expect(screen.getAllByText("Loading contacts…").length).toBeGreaterThan(0);
  });

  it("shows error contacts status in attendee section", () => {
    hoisted.mockUseContacts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);
    expect(screen.getAllByText("Unable to load contacts.").length).toBeGreaterThan(0);
  });

  it("shows fallback error message when createAttendee rejects with a non-Error value", async () => {
    const failingMutateAsync = vi.fn().mockRejectedValue("plain string error");
    hoisted.mockUseCreateAttendee.mockReturnValue({
      mutateAsync: failingMutateAsync,
      isPending: false,
    });
    hoisted.mockUseContacts.mockReturnValue({
      data: {
        data: [{ id: "contact-1", firstName: "John", lastName: "Smith", email: "j@example.com" }],
      },
      isLoading: false,
      isError: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: { id: "evt-test-1", name: "Gala", type: "gala", attendees: [] },
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    const attendeeSelect = screen.getByRole("combobox", { name: "Existing contact" });
    fireEvent.change(attendeeSelect, { target: { value: "contact-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Add attendee" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to add attendee.");
  });

  it("calls deleteEvent.mutateAsync and navigates on delete confirm", async () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    hoisted.mockUseEventMutations.mockReturnValue({
      updateEvent: defaultMutationStub,
      deleteEvent: { mutateAsync: mockDelete, isPending: false },
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    // Let mutation promise resolve
    await Promise.resolve();
    await Promise.resolve();

    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/events" });
  });

  it("shows delete error when deleteEvent rejects", async () => {
    const mockDelete = vi.fn().mockRejectedValue(new Error("Delete blocked"));
    hoisted.mockUseEventMutations.mockReturnValue({
      updateEvent: defaultMutationStub,
      deleteEvent: { mutateAsync: mockDelete, isPending: false },
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Delete blocked");
  });

  it("closes the delete dialog when Cancel is clicked", () => {
    const mockDelete = vi.fn().mockResolvedValue({});
    hoisted.mockUseEventMutations.mockReturnValue({
      updateEvent: defaultMutationStub,
      deleteEvent: { mutateAsync: mockDelete, isPending: false },
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("links an existing donation after clearing the initial validation error", async () => {
    const linkDonation = vi.fn().mockResolvedValue({});
    hoisted.mockUseLinkAttendeeDonation.mockReturnValue({
      mutateAsync: linkDonation,
      isPending: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Link donation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a donation ID before linking.");

    fireEvent.change(screen.getByLabelText("Existing donation"), {
      target: { value: "donation-123" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Link donation" }));

    await waitFor(() => {
      expect(linkDonation).toHaveBeenCalledWith({ donationId: "donation-123" });
    });
  });

  it("creates an attendee donation with a normalized date", async () => {
    const createDonation = vi.fn().mockResolvedValue({});
    hoisted.mockUseCreateAttendeeDonation.mockReturnValue({
      mutateAsync: createDonation,
      isPending: false,
    });
    hoisted.mockUseEvent.mockReturnValue({
      data: eventWithAttendee,
      isLoading: false,
      isError: false,
      refetch: hoisted.mockRefetch,
    });

    render(<EventDetailPage />);

    fireEvent.change(screen.getByLabelText("Amount (USD)"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Donation date"), {
      target: { value: "2026-04-27" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create donation" }));

    await waitFor(() => {
      expect(createDonation).toHaveBeenCalledWith({
        amountCents: 2500,
        date: "2026-04-27",
        type: "one_time",
      });
    });
  });
});
