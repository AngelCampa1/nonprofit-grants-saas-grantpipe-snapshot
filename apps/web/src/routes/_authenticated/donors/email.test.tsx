import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockUseContacts: vi.fn(),
  mockUseSendDonorMailMerge: vi.fn(),
  mockUseSession: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: { component: unknown }) => config,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/donors/email" } }),
  Link: ({
    to,
    children,
    className,
    "aria-current": ariaCurrent,
    onClick,
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; "aria-current"?: "page" }) => (
    <a href={to} className={className} aria-current={ariaCurrent} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock("../../../hooks/use-donors", () => ({
  useContacts: mocks.mockUseContacts,
  useSendDonorMailMerge: mocks.mockUseSendDonorMailMerge,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: mocks.mockUseSession,
}));

vi.mock("../../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../../../components/shell/page-tabs", () => ({
  AppPageTabs: ({
    groupId,
    items,
    ariaLabel,
  }: {
    groupId: string;
    items: Array<{ label: string; to: string }>;
    ariaLabel?: string;
  }) => (
    <nav aria-label={ariaLabel || `${groupId.charAt(0).toUpperCase()}${groupId.slice(1)} sections`}>
      {items.map((item) => (
        <a key={item.to} href={item.to}>
          {item.label}
        </a>
      ))}
    </nav>
  ),
}));

import { DonorEmailPage } from "./email";

const mutateAsync = vi.fn().mockResolvedValue({
  requested: 1,
  sent: 1,
  skipped: 0,
  failed: 0,
  recipients: [],
});

function setupMocks() {
  mocks.mockUseSession.mockReturnValue({
    memberRole: "editor",
    memberPermissions: {
      donors: "edit",
    },
  });
  mocks.mockUseContacts.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          type: "individual",
          firstName: "Jane",
          lastName: "Doe",
          organizationName: null,
          email: "jane@example.org",
          pipelineStage: "donor",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          type: "organization",
          firstName: null,
          lastName: null,
          organizationName: "No Email Org",
          email: null,
          pipelineStage: "prospect",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          type: "individual",
          firstName: null,
          lastName: null,
          organizationName: null,
          email: "email-only@example.org",
          emailOptOut: false,
          pipelineStage: null,
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          type: "individual",
          firstName: null,
          lastName: null,
          organizationName: null,
          email: null,
          pipelineStage: "lead",
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          type: "individual",
          firstName: "No",
          lastName: "Batch",
          organizationName: null,
          email: "optout@example.org",
          emailOptOut: true,
          pipelineStage: "donor",
        },
        {
          id: "66666666-6666-4666-8666-666666666666",
          type: "individual",
          firstName: "Blank",
          lastName: "Email",
          organizationName: null,
          email: "   ",
          emailOptOut: false,
          pipelineStage: "prospect",
        },
      ],
    },
  });
  mocks.mockUseSendDonorMailMerge.mockReturnValue({
    mutateAsync,
    isPending: false,
    data: null,
  });
}

describe("DonorEmailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("renders the page-tabs navigation with Overview, At-Risk, and Pledges links", () => {
    render(<DonorEmailPage />);

    const nav = screen.getByRole("navigation", { name: "Donors sections" });
    expect(nav).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "At-Risk" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pledges" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email" })).toBeInTheDocument();
  });

  it("renders donors and merge tokens", () => {
    render(<DonorEmailPage />);

    expect(screen.getByRole("heading", { name: "Donor Email" })).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("No Email Org")).toBeInTheDocument();
    expect(screen.getAllByText("email-only@example.org")).toHaveLength(2);
    expect(screen.getByText("Unnamed donor")).toBeInTheDocument();
    expect(screen.getByText("No Batch")).toBeInTheDocument();
    expect(screen.getByText("Opted out")).toBeInTheDocument();
    expect(screen.getByText("Blank Email")).toBeInTheDocument();
    expect(screen.getAllByText("No email")).toHaveLength(3);
    expect(screen.getAllByText("prospect")).toHaveLength(3);
    expect(screen.getByText("{{firstName}}")).toBeInTheDocument();
  });

  it("keeps the two-column layout shrinkable so the page never overflows horizontally on mobile", () => {
    render(<DonorEmailPage />);

    // Target the two-column layout grid by its unique column template (not the
    // shadcn CardHeader, which also uses `grid`).
    const grid = document.querySelector(
      'div[class*="xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]"]',
    );
    expect(grid).not.toBeNull();
    // Grid children must be allowed to shrink below their content's min-content
    // width (the Recipients table), or the layout bleeds past a 390px viewport.
    // The table's own overflow-x-auto then contains any horizontal scroll.
    expect(grid).toHaveClass("[&>*]:min-w-0");
  });

  it("donor and email cells expose title attributes matching displayed values", () => {
    render(<DonorEmailPage />);

    // Donor name cell titles (names that are unique to the name column)
    expect(screen.getByTitle("Jane Doe")).toBeInTheDocument();
    expect(screen.getByTitle("No Email Org")).toBeInTheDocument();
    expect(screen.getByTitle("Unnamed donor")).toBeInTheDocument();
    expect(screen.getByTitle("No Batch")).toBeInTheDocument();
    expect(screen.getByTitle("Blank Email")).toBeInTheDocument();
    // "email-only@example.org" is the display name AND the email value for that contact,
    // so both cells carry that title — use getAllByTitle
    expect(screen.getAllByTitle("email-only@example.org")).toHaveLength(2);

    // Email cell titles — emailLabel branches
    expect(screen.getByTitle("jane@example.org")).toBeInTheDocument(); // email present
    expect(screen.getByTitle("Opted out")).toBeInTheDocument(); // emailOptOut branch
    // "No email" branch: multiple contacts qualify — verify at least one title cell exists
    const noEmailTitles = document.querySelectorAll('[title="No email"]');
    expect(noEmailTitles.length).toBeGreaterThanOrEqual(1);
  });

  it("requires at least one donor before sending", async () => {
    render(<DonorEmailPage />);

    fireEvent.click(screen.getByRole("button", { name: /send email/i }));

    expect(await screen.findByText("Choose at least one donor.")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("sends selected donors with the composed subject and body", async () => {
    render(<DonorEmailPage />);

    fireEvent.click(screen.getByLabelText("Select Jane Doe"));
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Hello {{firstName}}" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Hi {{fullName}}" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send email/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        attemptId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
        contactIds: ["11111111-1111-4111-8111-111111111111"],
        subject: "Hello {{firstName}}",
        body: "Hi {{fullName}}",
      });
    });
  });

  it("reuses the attempt id after a transport failure", async () => {
    mutateAsync
      .mockRejectedValueOnce(new Error("network interrupted"))
      .mockResolvedValueOnce({ requested: 1, sent: 1, skipped: 0, failed: 0, recipients: [] });
    render(<DonorEmailPage />);
    fireEvent.click(screen.getByLabelText("Select Jane Doe"));

    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    expect(await screen.findByText("network interrupted")).toBeInTheDocument();
    const firstAttemptId = mutateAsync.mock.calls[0]?.[0].attemptId;

    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));

    expect(mutateAsync.mock.calls[1]?.[0].attemptId).toBe(firstAttemptId);
  });

  it("reuses the attempt id when recipient persistence remains incomplete", async () => {
    mutateAsync
      .mockResolvedValueOnce({ requested: 1, sent: 0, skipped: 0, failed: 1, recipients: [] })
      .mockResolvedValueOnce({ requested: 1, sent: 1, skipped: 0, failed: 0, recipients: [] });
    render(<DonorEmailPage />);
    fireEvent.click(screen.getByLabelText("Select Jane Doe"));

    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const firstAttemptId = mutateAsync.mock.calls[0]?.[0].attemptId;

    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));

    expect(mutateAsync.mock.calls[1]?.[0].attemptId).toBe(firstAttemptId);
  });

  it("rotates the attempt id after a complete send", async () => {
    render(<DonorEmailPage />);
    fireEvent.click(screen.getByLabelText("Select Jane Doe"));

    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const firstAttemptId = mutateAsync.mock.calls[0]?.[0].attemptId;

    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));

    expect(mutateAsync.mock.calls[1]?.[0].attemptId).not.toBe(firstAttemptId);
  });

  it("rotates the attempt id when the message changes after a failure", async () => {
    mutateAsync.mockRejectedValue(new Error("network interrupted"));
    render(<DonorEmailPage />);
    fireEvent.click(screen.getByLabelText("Select Jane Doe"));

    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    expect(await screen.findByText("network interrupted")).toBeInTheDocument();
    const firstAttemptId = mutateAsync.mock.calls[0]?.[0].attemptId;
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Changed subject" } });

    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));

    expect(mutateAsync.mock.calls[1]?.[0].attemptId).not.toBe(firstAttemptId);
  });

  it("shows send totals after a completed send", () => {
    mocks.mockUseSendDonorMailMerge.mockReturnValue({
      mutateAsync,
      isPending: false,
      data: { sent: 3, skipped: 1, failed: 0 },
    });

    render(<DonorEmailPage />);

    expect(screen.getByText("Sent 3; skipped 1; failed 0.")).toBeInTheDocument();
  });

  it("shows loading, error, and empty recipient states", () => {
    mocks.mockUseContacts.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    });
    const { rerender } = render(<DonorEmailPage />);

    expect(screen.getByText("Loading donors…")).toBeInTheDocument();
    expect(screen.getByText("Finding donors you can email.")).toBeInTheDocument();

    mocks.mockUseContacts.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    });
    rerender(<DonorEmailPage />);

    expect(screen.getByText("Unable to load donors.")).toBeInTheDocument();
    expect(screen.getByText("Refresh the page and try again.")).toBeInTheDocument();

    mocks.mockUseContacts.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: [] },
    });
    rerender(<DonorEmailPage />);

    expect(screen.getByText("No donors yet")).toBeInTheDocument();
    expect(screen.getByText("Add donors before sending email.")).toBeInTheDocument();
  });

  it("updates selected counts when donors are selected and cleared", () => {
    render(<DonorEmailPage />);

    const janeCheckbox = screen.getByLabelText("Select Jane Doe");
    const orgCheckbox = screen.getByLabelText("Select No Email Org");
    const optedOutCheckbox = screen.getByLabelText("Select No Batch");
    const blankEmailCheckbox = screen.getByLabelText("Select Blank Email");

    // The selection meta renders as a single line joined with a middle dot,
    // not two stacked lines with mismatched weight.
    expect(screen.getByText("0 selected · 0 can receive email.")).toBeInTheDocument();

    fireEvent.click(janeCheckbox);
    fireEvent.click(orgCheckbox);
    fireEvent.click(optedOutCheckbox);
    fireEvent.click(blankEmailCheckbox);

    expect(screen.getByText("4 selected · 1 can receive email.")).toBeInTheDocument();

    fireEvent.click(janeCheckbox);
    fireEvent.click(orgCheckbox);
    fireEvent.click(optedOutCheckbox);
    fireEvent.click(blankEmailCheckbox);

    expect(screen.getByText("0 selected · 0 can receive email.")).toBeInTheDocument();
  });

  it("renders the selection meta as a single centered line next to the Send Email button", () => {
    render(<DonorEmailPage />);

    const metaEl = screen.getByText("0 selected · 0 can receive email.");
    expect(metaEl).toHaveClass("text-sm", "text-muted-foreground");

    const sendButton = screen.getByRole("button", { name: /Send Email/ });
    const row = metaEl.closest("div")?.parentElement;
    expect(row).not.toBeNull();
    expect(row).toHaveClass("items-center");
    expect(row?.contains(sendButton)).toBe(true);
  });

  it("shows pending state while a send is in progress", () => {
    mocks.mockUseSendDonorMailMerge.mockReturnValue({
      mutateAsync,
      isPending: true,
      data: null,
    });

    render(<DonorEmailPage />);

    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  });

  it("shows mutation errors from failed sends", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Plan upgrade required."));
    render(<DonorEmailPage />);

    fireEvent.click(screen.getByLabelText("Select Jane Doe"));
    fireEvent.click(screen.getByRole("button", { name: /send email/i }));

    expect(await screen.findByText("Plan upgrade required.")).toBeInTheDocument();
  });

  it("falls back when a failed send throws a non-error value", async () => {
    mutateAsync.mockRejectedValueOnce("failed");
    render(<DonorEmailPage />);

    fireEvent.click(screen.getByLabelText("Select Jane Doe"));
    fireEvent.click(screen.getByRole("button", { name: /send email/i }));

    expect(await screen.findByText("Unable to send donor email.")).toBeInTheDocument();
  });
});
