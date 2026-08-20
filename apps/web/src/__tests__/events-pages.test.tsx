import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

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
    SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
      <div role="option" data-value={value}>
        {children}
      </div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});

const { routeState, mockEventsNavigate } = vi.hoisted(() => ({
  routeState: { params: { eventId: "event-1" } },
  mockEventsNavigate: vi.fn(),
}));

const mockUseEvents = vi.fn();
const mockUseCreateEvent = vi.fn();
const mockUseEvent = vi.fn();
const mockUseEventMutations = vi.fn();
const mockUseCreateAttendee = vi.fn();
const mockUseUpdateAttendee = vi.fn();
const mockUseLinkAttendeeDonation = vi.fn();
const mockUseCreateAttendeeDonation = vi.fn();
const mockUseVolunteerHours = vi.fn();
const mockUseCreateVolunteerHour = vi.fn();
const mockUseVolunteerHourMutations = vi.fn();
const mockUseContacts = vi.fn();
const mockUseSession = vi.fn(() => ({ memberRole: "admin", isLoading: false }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => routeState.params,
    useSearch: () => ({}),
  }),
  Link: ({
    children,
    to,
    params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    params?: Record<string, string>;
  }) => {
    const href =
      to && params
        ? Object.entries(params).reduce(
            (current, [key, value]) => current.replace(`$${key}`, value),
            to,
          )
        : to;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
  useNavigate: () => mockEventsNavigate,
}));

vi.mock("../hooks/use-events", () => ({
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
  useCreateEvent: (...args: unknown[]) => mockUseCreateEvent(...args),
  useEvent: (...args: unknown[]) => mockUseEvent(...args),
  useEventMutations: (...args: unknown[]) => mockUseEventMutations(...args),
  useCreateAttendee: (...args: unknown[]) => mockUseCreateAttendee(...args),
  useUpdateAttendee: (...args: unknown[]) => mockUseUpdateAttendee(...args),
  useLinkAttendeeDonation: (...args: unknown[]) => mockUseLinkAttendeeDonation(...args),
  useCreateAttendeeDonation: (...args: unknown[]) => mockUseCreateAttendeeDonation(...args),
  useVolunteerHours: (...args: unknown[]) => mockUseVolunteerHours(...args),
  useCreateVolunteerHour: (...args: unknown[]) => mockUseCreateVolunteerHour(...args),
  useVolunteerHourMutations: (...args: unknown[]) => mockUseVolunteerHourMutations(...args),
}));

vi.mock("../routes/_authenticated/events/index", async (importOriginal) => {
  // Let the real implementation through but mock NewEventDialog dependency
  return importOriginal();
});

vi.mock("../components/dialogs/new-event-dialog", () => ({
  NewEventDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) =>
    open
      ? React.createElement(
          "div",
          { "data-testid": "new-event-dialog" },
          React.createElement(
            "button",
            { type: "button", onClick: () => onOpenChange(false) },
            "Close New Event",
          ),
        )
      : null,
}));

vi.mock("../hooks/use-donors", () => ({
  useContacts: (...args: unknown[]) => mockUseContacts(...args),
}));

vi.mock("../hooks/use-documents", () => ({
  useEntityDocuments: () => ({
    data: { data: [], total: 0, page: 1, pageSize: 25 },
    isLoading: false,
    isError: false,
  }),
  useUploadDocument: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
  }),
  useDeleteDocument: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
  }),
}));

vi.mock("../hooks/use-activity", () => ({
  useEntityActivity: () => ({
    data: { data: [] },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

// EventDetailPage is not exported from the route module (code-splitting); read it
// off the route config like the donor/$contactId tests do.
import { Route as EventDetailRoute } from "../routes/_authenticated/events/$eventId";
import { EventsListPage } from "../routes/_authenticated/events/index";

const EventDetailPage = (EventDetailRoute as unknown as { component: React.ComponentType })
  .component;

describe("EventsListPage", () => {
  beforeEach(() => {
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    mockUseEvents.mockReset();
    mockUseCreateEvent.mockReset();
    mockUseEvents.mockReturnValue({ data: { data: [] } });
    mockUseCreateEvent.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    mockEventsNavigate.mockReset();
  });

  it("renders the empty state and create action", () => {
    render(<EventsListPage />);

    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Your events live here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your first event" })).toBeInTheDocument();
  });

  it("blocks direct events page access for auditor role", () => {
    mockUseSession.mockReturnValue({ memberRole: "auditor", isLoading: false });

    render(<EventsListPage />);

    expect(screen.getByText("You need event access.")).toBeInTheDocument();
    expect(screen.getByText("Ask an admin to update your team permissions.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add event" })).not.toBeInTheDocument();
  });

  it("opens the new event dialog when Add event is clicked", async () => {
    render(<EventsListPage />);

    expect(screen.queryByTestId("new-event-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() => {
      expect(screen.getByTestId("new-event-dialog")).toBeInTheDocument();
    });
  });

  it("opens the new event dialog from the empty state primary action", async () => {
    render(<EventsListPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add your first event" }));

    await waitFor(() => {
      expect(screen.getByTestId("new-event-dialog")).toBeInTheDocument();
    });
  });

  it("renders linked event cards when data exists", () => {
    mockUseEvents.mockReturnValue({
      data: {
        data: [{ id: "event-1", name: "Spring Gala", type: "gala" }],
      },
    });

    render(<EventsListPage />);

    const eventLink = screen.getByRole("link", { name: /Spring Gala/ });
    expect(eventLink).toHaveAttribute("href", "/events/event-1");
    expect(screen.getAllByText("Gala").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/^gala$/)).not.toBeInTheDocument();
  });

  it("falls back to an empty state when the events query has no payload", () => {
    mockUseEvents.mockReturnValue({ data: undefined, isLoading: false, isError: false });

    render(<EventsListPage />);

    expect(screen.getByRole("region", { name: "Your events live here" })).toBeInTheDocument();
  });

  it("updates the search filter when the search input changes", () => {
    mockUseEvents.mockReturnValue({
      data: { data: [{ id: "event-1", name: "Spring Gala", type: "gala" }] },
    });

    render(<EventsListPage />);

    fireEvent.change(screen.getByPlaceholderText("Search events…"), {
      target: { value: "gala" },
    });

    // Search now syncs to the URL via navigate; verify the route update carries the search term
    expect(mockEventsNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.objectContaining({ q: "gala" }),
      }),
    );
  });
});

describe("EventDetailPage", () => {
  beforeEach(() => {
    routeState.params = { eventId: "event-1" };
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({ memberRole: "admin", isLoading: false });
    mockUseEvent.mockReset();
    mockUseEventMutations.mockReset();
    mockUseCreateAttendee.mockReset();
    mockUseUpdateAttendee.mockReset();
    mockUseLinkAttendeeDonation.mockReset();
    mockUseCreateAttendeeDonation.mockReset();
    mockUseVolunteerHours.mockReset();
    mockUseCreateVolunteerHour.mockReset();
    mockUseVolunteerHourMutations.mockReset();
    mockUseContacts.mockReset();

    mockUseEvent.mockReturnValue({
      data: {
        id: "event-1",
        name: "Spring Gala",
        type: "gala",
        summary: { attendeeCount: 1, revenueCents: 50000, volunteerHoursTotal: 2.5 },
        attendees: [
          {
            id: "attendee-1",
            rsvpStatus: "invited",
            contact: { id: "contact-1", firstName: "Sam", lastName: "Rivera" },
            donation: null,
          },
        ],
      },
    });
    mockUseVolunteerHours.mockReturnValue({
      data: {
        data: [
          {
            id: "vh-1",
            hours: 2.5,
            date: "2026-05-01T12:00:00Z",
            event: { id: "event-1", name: "Spring Gala" },
          },
        ],
      },
    });
    mockUseEventMutations.mockReturnValue({
      updateEvent: { mutateAsync: vi.fn().mockResolvedValue({}) },
      deleteEvent: { mutateAsync: vi.fn().mockResolvedValue({}) },
    });
    mockUseCreateAttendee.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    mockUseUpdateAttendee.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    mockUseLinkAttendeeDonation.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    mockUseCreateAttendeeDonation.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    mockUseCreateVolunteerHour.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    mockUseVolunteerHourMutations.mockReturnValue({
      updateVolunteerHour: { mutateAsync: vi.fn().mockResolvedValue({}) },
      deleteVolunteerHour: { mutateAsync: vi.fn().mockResolvedValue({}) },
    });
    mockUseContacts.mockReturnValue({
      data: {
        data: [
          {
            id: "contact-1",
            firstName: "Sam",
            lastName: "Rivera",
            email: "sam@example.com",
          },
          {
            id: "contact-2",
            firstName: "Jordan",
            lastName: "Lee",
            email: "jordan@example.com",
          },
        ],
      },
    });
  });

  it("renders attendee, revenue, and volunteer sections", () => {
    render(<EventDetailPage />);

    expect(screen.getAllByText("Spring Gala").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getAllByText("Volunteer Hours").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Sam Rivera")).toBeInTheDocument();
    // Sam has no linked donation, so the revenue breakdown shows its empty state.
    expect(screen.getByText("No donations recorded yet.")).toBeInTheDocument();
    expect(screen.getAllByText("Documents").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Activity").length).toBeGreaterThanOrEqual(1);
  });

  it("blocks direct event detail access for auditor role", () => {
    mockUseSession.mockReturnValue({ memberRole: "auditor", isLoading: false });

    render(<EventDetailPage />);

    expect(screen.getByText("You need event access.")).toBeInTheDocument();
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("renders event detail in read-only mode for viewer role", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer", isLoading: false });

    render(<EventDetailPage />);

    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByLabelText("Event name")).toBeDisabled();
    expect(screen.getByLabelText("Event type")).toBeDisabled();
    expect(
      screen.getByText("View-only access. Editors and admins can update event details."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add attendee" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark attended" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link donation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create donation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log volunteer hours" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
  });

  it("renders volunteer hour dates in UTC so midnight entries do not shift backward", () => {
    mockUseVolunteerHours.mockReturnValue({
      data: {
        data: [
          {
            id: "vh-utc",
            hours: 1,
            date: "2026-05-01T00:00:00.000Z",
            event: { id: "event-1", name: "Spring Gala" },
          },
        ],
      },
    });

    render(<EventDetailPage />);

    expect(screen.getByText("May 1, 2026")).toBeInTheDocument();
  });

  it("renders a loading state while the event query is pending", () => {
    mockUseEvent.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { container } = render(<EventDetailPage />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders an explicit error state when the event query fails", () => {
    mockUseEvent.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Unable to load event."),
    });

    const { container } = render(<EventDetailPage />);

    expect(screen.getByText("Unable to load event.")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });

  it("renders fallback values when event summary data is sparse", () => {
    mockUseEvent.mockReturnValue({
      data: {
        id: "event-1",
        name: "Community Day",
        type: "meeting",
      },
    });
    mockUseVolunteerHours.mockReturnValue({ data: undefined });

    render(<EventDetailPage />);

    expect(screen.getAllByText("Community Day").length).toBeGreaterThanOrEqual(1);
    // formatCurrency(null/undefined) returns "--" from lib/format.ts
    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
  });

  it("renders explicit contact picker loading and error states instead of a blank selector", () => {
    mockUseContacts.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false });

    const { rerender } = render(<EventDetailPage />);

    expect(screen.getAllByText("Loading contacts…").length).toBeGreaterThanOrEqual(2);

    mockUseContacts.mockReturnValueOnce({ data: undefined, isLoading: false, isError: true });
    rerender(<EventDetailPage />);

    expect(screen.getAllByText("Unable to load contacts.").length).toBeGreaterThanOrEqual(2);
  });

  it("renders volunteer history loading and error states instead of a false empty list", () => {
    mockUseVolunteerHours.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false });

    const { container, rerender } = render(<EventDetailPage />);

    expect(container.querySelector("[data-testid='volunteer-hours-loading']")).toBeInTheDocument();

    mockUseVolunteerHours.mockReturnValueOnce({ data: undefined, isLoading: false, isError: true });
    rerender(<EventDetailPage />);

    expect(screen.getByText("Unable to load volunteer hours.")).toBeInTheDocument();
  });

  it("supports attendee creation, RSVP update, donation actions, and volunteer logging", async () => {
    const createAttendee = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const updateAttendee = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const linkDonation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const createDonation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const createVolunteerHour = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const volunteerMutations = {
      updateVolunteerHour: { mutateAsync: vi.fn().mockResolvedValue({}) },
      deleteVolunteerHour: { mutateAsync: vi.fn().mockResolvedValue({}) },
    };

    mockUseCreateAttendee.mockReturnValue(createAttendee);
    mockUseUpdateAttendee.mockReturnValue(updateAttendee);
    mockUseLinkAttendeeDonation.mockReturnValue(linkDonation);
    mockUseCreateAttendeeDonation.mockReturnValue(createDonation);
    mockUseCreateVolunteerHour.mockReturnValue(createVolunteerHour);
    mockUseVolunteerHourMutations.mockReturnValue(volunteerMutations);

    render(<EventDetailPage />);

    fireEvent.change(screen.getByLabelText("Event name"), {
      target: { value: "Spring Gala 2026" },
    });
    fireEvent.change(screen.getByLabelText("Event type"), {
      target: { value: "fundraiser" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    fireEvent.change(screen.getByLabelText("Existing contact"), {
      target: { value: "contact-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add attendee" }));

    fireEvent.click(screen.getByRole("button", { name: "Mark attended" }));
    fireEvent.change(screen.getByLabelText("Existing donation"), {
      target: { value: "donation-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link donation" }));
    fireEvent.change(screen.getByLabelText("Amount (USD)"), {
      target: { value: "500" },
    });
    fireEvent.change(screen.getByLabelText("Donation date"), {
      target: { value: "2026-05-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create donation" }));

    fireEvent.change(screen.getByLabelText("Volunteer contact"), {
      target: { value: "contact-1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Volunteer hours"), { target: { value: "3" } });
    fireEvent.change(screen.getByPlaceholderText("Volunteer date"), {
      target: { value: "2026-05-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));
    fireEvent.change(screen.getByLabelText("Program"), {
      target: { value: "Food Pantry" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(
        mockUseEventMutations.mock.results[0]?.value.updateEvent.mutateAsync,
      ).toHaveBeenCalledWith({
        name: "Spring Gala 2026",
        type: "fundraiser",
        date: null,
        location: null,
        description: null,
        revenueGoalCents: null,
      });
      expect(createAttendee.mutateAsync).toHaveBeenCalledWith({
        rsvpStatus: "invited",
        mode: "existing_contact",
        contactId: "contact-2",
      });
      expect(updateAttendee.mutateAsync).toHaveBeenCalledWith({ rsvpStatus: "attended" });
      expect(linkDonation.mutateAsync).toHaveBeenCalledWith({ donationId: "donation-1" });
      expect(createDonation.mutateAsync).toHaveBeenCalledWith({
        amountCents: 50000,
        date: "2026-05-01",
        type: "one_time",
      });
      expect(createVolunteerHour.mutateAsync).toHaveBeenCalledWith({
        contactId: "contact-1",
        eventId: "event-1",
        hours: "3",
        date: "2026-05-01T00:00:00.000Z",
      });
      expect(volunteerMutations.updateVolunteerHour.mutateAsync).toHaveBeenCalledWith({
        program: "Food Pantry",
      });
    });
  });

  it("blocks attendee creation, donation actions, and volunteer logging when required inputs are missing", async () => {
    const createAttendee = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const linkDonation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const createDonation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const createVolunteerHour = { mutateAsync: vi.fn().mockResolvedValue({}) };

    mockUseCreateAttendee.mockReturnValue(createAttendee);
    mockUseLinkAttendeeDonation.mockReturnValue(linkDonation);
    mockUseCreateAttendeeDonation.mockReturnValue(createDonation);
    mockUseCreateVolunteerHour.mockReturnValue(createVolunteerHour);

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add attendee" }));
    expect(
      await screen.findByText("Select a contact before adding an attendee."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Link donation" }));
    expect(await screen.findByText("Enter a donation ID before linking.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Amount (USD)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create donation" }));
    expect(await screen.findByText("Enter a positive donation amount.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Volunteer contact"), {
      target: { value: "contact-1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Volunteer hours"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));
    expect(await screen.findByText("Select a volunteer date.")).toBeInTheDocument();

    await waitFor(() => {
      expect(createAttendee.mutateAsync).not.toHaveBeenCalled();
      expect(linkDonation.mutateAsync).not.toHaveBeenCalled();
      expect(createDonation.mutateAsync).not.toHaveBeenCalled();
      expect(createVolunteerHour.mutateAsync).not.toHaveBeenCalled();
    });
  });

  it("disables duplicate-submit event detail actions while related mutations are pending", () => {
    mockUseEventMutations.mockReturnValue({
      updateEvent: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: true },
      deleteEvent: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    });
    mockUseCreateAttendee.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: true,
    });
    mockUseUpdateAttendee.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: true,
    });
    mockUseLinkAttendeeDonation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: true,
    });
    mockUseCreateAttendeeDonation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: true,
    });
    mockUseCreateVolunteerHour.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: true,
    });
    mockUseVolunteerHourMutations.mockReturnValue({
      updateVolunteerHour: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: true },
      deleteVolunteerHour: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    });

    render(<EventDetailPage />);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add attendee" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mark attended" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Link donation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create donation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Log volunteer hours" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
  });

  it("clears attendee, donation, and volunteer validation errors when the user edits the related inputs", async () => {
    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add attendee" }));
    expect(
      await screen.findByText("Select a contact before adding an attendee."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Existing contact"), {
      target: { value: "contact-2" },
    });

    await waitFor(() => {
      expect(
        screen.queryByText("Select a contact before adding an attendee."),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Link donation" }));
    expect(await screen.findByText("Enter a donation ID before linking.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Existing donation"), {
      target: { value: "donation-1" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Enter a donation ID before linking.")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));
    expect(await screen.findByText("Select a volunteer contact.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Volunteer contact"), {
      target: { value: "contact-1" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Select a volunteer contact.")).not.toBeInTheDocument();
    });
  });

  it("pre-populates attendee donation inputs when a linked donation exists", () => {
    mockUseEvent.mockReturnValue({
      data: {
        id: "event-1",
        name: "Spring Gala",
        type: "gala",
        attendees: [
          {
            id: "attendee-1",
            contact: { firstName: "Sam", lastName: "Rivera" },
            donation: { id: "donation-9", amountCents: 12500 },
          },
        ],
      },
    });

    render(<EventDetailPage />);

    expect(screen.queryByPlaceholderText("Existing contact ID")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Volunteer contact ID")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Existing contact")).toBeInTheDocument();
    expect(screen.getByLabelText("Volunteer contact")).toBeInTheDocument();
    expect(
      screen.getAllByRole("option", {
        name: "Jordan Lee - jordan@example.com",
      }),
    ).toHaveLength(2);

    expect(screen.getByLabelText("Existing donation")).toHaveValue("donation-9");
    expect(screen.getByLabelText("Amount (USD)")).toHaveValue(125);
    expect(screen.getByText("$125")).toBeInTheDocument();
  });

  it("shows an inline error when attendee donation creation fails", async () => {
    const createDonation = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("Invalid donation date")),
    };
    mockUseCreateAttendeeDonation.mockReturnValue(createDonation);

    render(<EventDetailPage />);

    fireEvent.change(screen.getByLabelText("Amount (USD)"), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getByLabelText("Donation date"), {
      target: { value: "2026-05-12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create donation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid donation date");
  });

  it("shows an inline error when saving the event overview fails", async () => {
    mockUseEventMutations.mockReturnValue({
      updateEvent: { mutateAsync: vi.fn().mockRejectedValue(new Error("Event type is invalid")) },
      deleteEvent: { mutateAsync: vi.fn().mockResolvedValue({}) },
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Event type is invalid");
  });

  it("shows an inline error when volunteer hour creation fails", async () => {
    const createVolunteerHour = {
      mutateAsync: vi.fn().mockRejectedValue(new Error("Volunteer date must be ISO-8601")),
    };
    mockUseCreateVolunteerHour.mockReturnValue(createVolunteerHour);

    render(<EventDetailPage />);

    fireEvent.change(screen.getByLabelText("Volunteer contact"), {
      target: { value: "contact-1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Volunteer hours"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByPlaceholderText("Volunteer date"), {
      target: { value: "2026-05-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log volunteer hours" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Volunteer date must be ISO-8601");
  });

  it("shows an inline error when updating a volunteer hour row fails", async () => {
    mockUseVolunteerHourMutations.mockReturnValue({
      updateVolunteerHour: {
        mutateAsync: vi.fn().mockRejectedValue(new Error("Program is too long")),
      },
      deleteVolunteerHour: { mutateAsync: vi.fn().mockResolvedValue({}) },
    });

    render(<EventDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Program is too long");
  });
});
