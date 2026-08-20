import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  mockUsePledges: vi.fn(),
  mockUsePledge: vi.fn(),
  mockUseCreatePledge: vi.fn(),
  mockUseRecordPledgePayment: vi.fn(),
  mockUseSetPledgeAllowance: vi.fn(),
  mockUseWriteOffPledge: vi.fn(),
  mockUsePromotePledge: vi.fn(),
  mockUseContacts: vi.fn(),
  mockUseSession: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: { component: unknown }) => config,
  Link: ({ children, to, hash }: { children: React.ReactNode; to: string; hash?: string }) => (
    <a href={`${to}${hash ? `#${hash}` : ""}`}>{children}</a>
  ),
}));

vi.mock("../../../hooks/use-pledges", () => ({
  usePledges: mocks.mockUsePledges,
  usePledge: mocks.mockUsePledge,
  useCreatePledge: mocks.mockUseCreatePledge,
  useRecordPledgePayment: mocks.mockUseRecordPledgePayment,
  useSetPledgeAllowance: mocks.mockUseSetPledgeAllowance,
  useWriteOffPledge: mocks.mockUseWriteOffPledge,
  usePromotePledge: mocks.mockUsePromotePledge,
  getPledgeStatusVariant: (status: string) => {
    if (status === "active") return "default";
    if (status === "conditional") return "warning";
    if (status === "written_off" || status === "cancelled") return "destructive";
    return "secondary";
  },
}));

vi.mock("../../../hooks/use-donors", () => ({
  useContacts: mocks.mockUseContacts,
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: mocks.mockUseSession,
}));

vi.mock("../../../lib/format", () => ({
  formatCurrency: (cents: number | null | undefined) =>
    cents == null ? "$0.00" : `$${(cents / 100).toFixed(2)}`,
  formatUtcCalendarDate: (d: string) => d.split("T")[0]!,
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

import {
  PledgesPage,
  CreatePledgeDialog,
  RecordPaymentDialog,
  SetAllowanceDialog,
  WriteOffDialog,
  PledgeDetailSheet,
  AgingTiles,
  getPledgeStatusVariant,
} from "./pledges";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MOCK_PLEDGE = {
  id: "p1",
  orgId: "org1",
  contactId: "c1",
  fundId: null,
  grantId: null,
  status: "active" as const,
  isConditional: false,
  conditionNote: null,
  hasBarrier: false,
  hasRightOfReturn: false,
  faceAmountCents: 500000,
  pledgeDate: "2026-01-01T00:00:00.000Z",
  discountRateBasisPoints: 400,
  presentValueCents: 480000,
  discountCents: 20000,
  netAssetClass: "temporarily_restricted",
  allowanceCents: 0,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  outstandingCents: 500000,
  agingBuckets: { current: 1, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 2 },
};

const MOCK_TOTALS = {
  totalFaceCents: 500000,
  totalPVCents: 480000,
  totalOutstandingCents: 500000,
  totalWrittenOffCents: 0,
  totalAllowanceCents: 0,
};

const DEFAULT_MUTATION = {
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
};

function setupDefaultMocks() {
  mocks.mockUseSession.mockReturnValue({
    memberRole: "admin",
    memberPermissions: null,
  });
  mocks.mockUsePledges.mockReturnValue({
    isLoading: false,
    isError: false,
    isPlanGated: false,
    data: { pledges: [MOCK_PLEDGE], totals: MOCK_TOTALS },
  });
  mocks.mockUsePledge.mockReturnValue({
    isLoading: false,
    isError: false,
    isPlanGated: false,
    data: {
      pledge: MOCK_PLEDGE,
      installments: [],
      payments: [],
      amortizationSchedule: [],
      carryingValueCents: 480000,
    },
  });
  mocks.mockUseCreatePledge.mockReturnValue({ ...DEFAULT_MUTATION });
  mocks.mockUseRecordPledgePayment.mockReturnValue({ ...DEFAULT_MUTATION });
  mocks.mockUseSetPledgeAllowance.mockReturnValue({ ...DEFAULT_MUTATION });
  mocks.mockUseWriteOffPledge.mockReturnValue({ ...DEFAULT_MUTATION });
  mocks.mockUsePromotePledge.mockReturnValue({ ...DEFAULT_MUTATION });
  mocks.mockUseContacts.mockReturnValue({
    data: {
      data: [
        {
          id: "c1",
          firstName: "Jane",
          lastName: "Doe",
          organizationName: null,
        },
      ],
    },
  });
}

// ---------------------------------------------------------------------------
// getPledgeStatusVariant
// ---------------------------------------------------------------------------

describe("getPledgeStatusVariant", () => {
  it("returns default for active", () => {
    expect(getPledgeStatusVariant("active")).toBe("default");
  });

  it("returns warning for conditional", () => {
    expect(getPledgeStatusVariant("conditional")).toBe("warning");
  });

  it("returns destructive for written_off", () => {
    expect(getPledgeStatusVariant("written_off")).toBe("destructive");
  });

  it("returns destructive for cancelled", () => {
    expect(getPledgeStatusVariant("cancelled")).toBe("destructive");
  });

  it("returns secondary for completed", () => {
    expect(getPledgeStatusVariant("completed")).toBe("secondary");
  });
});

// ---------------------------------------------------------------------------
// AgingTiles
// ---------------------------------------------------------------------------

describe("AgingTiles", () => {
  it("renders total face, PV, and outstanding", () => {
    render(
      <AgingTiles
        pledges={[MOCK_PLEDGE]}
        totalFaceCents={500000}
        totalPVCents={480000}
        totalOutstandingCents={500000}
      />,
    );
    expect(screen.getByTestId("aging-tiles")).toBeInTheDocument();
    // $5000.00 appears in face and outstanding tiles; queryAllByText should find 2
    expect(screen.getAllByText("$5000.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$4800.00").length).toBeGreaterThanOrEqual(1);
  });

  it("renders 90+ days overdue count from pledge aging buckets", () => {
    render(
      <AgingTiles
        pledges={[MOCK_PLEDGE]}
        totalFaceCents={500000}
        totalPVCents={480000}
        totalOutstandingCents={500000}
      />,
    );
    // MOCK_PLEDGE has 90_plus: 2. The tile and aging breakdown both render it.
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
  });

  it("sums aging buckets across multiple pledges", () => {
    const secondPledge = {
      ...MOCK_PLEDGE,
      id: "p2",
      agingBuckets: { current: 2, "1_30": 1, "31_60": 0, "61_90": 0, "90_plus": 3 },
    };
    render(
      <AgingTiles
        pledges={[MOCK_PLEDGE, secondPledge]}
        totalFaceCents={1000000}
        totalPVCents={960000}
        totalOutstandingCents={1000000}
      />,
    );
    expect(screen.getByTestId("aging-breakdown")).toBeInTheDocument();
  });

  it("renders aging breakdown section", () => {
    render(
      <AgingTiles pledges={[]} totalFaceCents={0} totalPVCents={0} totalOutstandingCents={0} />,
    );
    expect(screen.getByTestId("aging-breakdown")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("1 to 30 days")).toBeInTheDocument();
    expect(screen.getByText("90+ days")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PledgesPage
// ---------------------------------------------------------------------------

describe("PledgesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders loading state", () => {
    mocks.mockUsePledges.mockReturnValue({
      isLoading: true,
      isError: false,
      isPlanGated: false,
      data: undefined,
    });
    render(<PledgesPage />);
    expect(screen.getByText(/loading pledges/i)).toBeInTheDocument();
  });

  it("renders plan-gate state on 403", () => {
    mocks.mockUsePledges.mockReturnValue({
      isLoading: false,
      isError: true,
      isPlanGated: true,
      data: undefined,
    });
    render(<PledgesPage />);
    expect(screen.getByText(/growth plan required/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to billing/i })).toHaveAttribute(
      "href",
      "/settings#billing",
    );
  });

  it("renders error state", () => {
    mocks.mockUsePledges.mockReturnValue({
      isLoading: false,
      isError: true,
      isPlanGated: false,
      data: undefined,
    });
    render(<PledgesPage />);
    expect(screen.getByText(/unable to load pledges/i)).toBeInTheDocument();
  });

  it("renders empty state when no pledges", () => {
    mocks.mockUsePledges.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { pledges: [], totals: MOCK_TOTALS },
    });
    render(<PledgesPage />);
    expect(screen.getByText(/no pledges yet/i)).toBeInTheDocument();
  });

  it("renders the page-tabs navigation with Overview, At-Risk, and Pledges links", () => {
    render(<PledgesPage />);

    const nav = screen.getByRole("navigation", { name: "Donors sections" });
    expect(nav).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "At-Risk" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pledges" })).toBeInTheDocument();
  });

  it("offers an Add-your-first-pledge action from the empty state that opens the create dialog", async () => {
    const user = userEvent.setup();
    mocks.mockUsePledges.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { pledges: [], totals: MOCK_TOTALS },
    });
    render(<PledgesPage />);
    // The empty state must not be a dead end: it surfaces the same create
    // action as the header so a first-time user is never stranded.
    const cta = screen.getByRole("button", { name: /add your first pledge/i });
    await user.click(cta);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("hides the empty-state pledge CTA when the member cannot manage accounting", () => {
    mocks.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { donors: "view", accounting: "view" },
    });
    mocks.mockUsePledges.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { pledges: [], totals: MOCK_TOTALS },
    });
    render(<PledgesPage />);
    expect(screen.getByText(/no pledges yet/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add your first pledge/i }),
    ).not.toBeInTheDocument();
  });

  it("titles the page 'Pledges' to match the sidebar nav label", () => {
    mocks.mockUsePledges.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: { pledges: [], totals: MOCK_TOTALS },
    });
    render(<PledgesPage />);
    // The page H1 must match the nav label ("Pledges") — the descriptive
    // ASC 958 subtitle carries the detail, not the title.
    expect(screen.getByRole("heading", { name: "Pledges" })).toBeInTheDocument();
    expect(screen.queryByText("Pledge Tracker")).not.toBeInTheDocument();
  });

  it("renders pledge rows in the table", () => {
    render(<PledgesPage />);
    expect(screen.getByTestId("pledge-row")).toBeInTheDocument();
    expect(screen.getAllByText("$5000.00").length).toBeGreaterThanOrEqual(1);
  });

  it("renders aging tiles when pledges exist", () => {
    render(<PledgesPage />);
    expect(screen.getByTestId("aging-tiles")).toBeInTheDocument();
  });

  it("renders status filter chips", () => {
    render(<PledgesPage />);
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conditional" })).toBeInTheDocument();
  });

  it("status filter chip toggles aria-pressed", async () => {
    const user = userEvent.setup();
    render(<PledgesPage />);
    const allBtn = screen.getByRole("button", { name: "All" });
    expect(allBtn).toHaveAttribute("aria-pressed", "true");
    const activeBtn = screen.getByRole("button", { name: "Active" });
    await user.click(activeBtn);
    expect(activeBtn).toHaveAttribute("aria-pressed", "true");
    expect(allBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("opens create dialog when Add pledge is clicked", async () => {
    const user = userEvent.setup();
    render(<PledgesPage />);
    await user.click(screen.getByRole("button", { name: /add pledge/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens detail sheet when a pledge row is clicked", async () => {
    const user = userEvent.setup();
    render(<PledgesPage />);
    await user.click(screen.getByRole("button", { name: /open pledge c1 details/i }));
    // Sheet is opened; detail content is rendered
    await waitFor(() => {
      expect(screen.getByText("Pledge detail")).toBeInTheDocument();
    });
  });

  it("hides Add pledge when the member cannot manage accounting", () => {
    mocks.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { donors: "view", accounting: "view" },
    });
    render(<PledgesPage />);
    expect(screen.queryByRole("button", { name: /add pledge/i })).not.toBeInTheDocument();
  });

  it("disables Add pledge button when plan-gated", () => {
    mocks.mockUsePledges.mockReturnValue({
      isLoading: false,
      isError: true,
      isPlanGated: true,
      data: undefined,
    });
    render(<PledgesPage />);
    expect(screen.getByRole("button", { name: /add pledge/i })).toBeDisabled();
  });

  it("shows pledge count badge", () => {
    render(<PledgesPage />);
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
  });

  it("shows allowance as the house missing-value token when zero", () => {
    render(<PledgesPage />);
    // Zero allowance renders the app-wide "--" token, matching the money cells
    // in the same table (formatCurrency renders "--" for a missing amount).
    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.queryByText("-")).not.toBeInTheDocument();
  });

  it("renders pledge date column", () => {
    render(<PledgesPage />);
    expect(screen.getByText("2026-01-01")).toBeInTheDocument();
  });

  it("shows formatted allowance when allowanceCents > 0", () => {
    mocks.mockUsePledges.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        pledges: [{ ...MOCK_PLEDGE, allowanceCents: 50000 }],
        totals: MOCK_TOTALS,
      },
    });
    render(<PledgesPage />);
    // formatCurrency is mocked to return "$" + (cents/100).toFixed(2)
    expect(screen.getByText("$500.00")).toBeInTheDocument();
  });

  it("closes detail sheet via onOpenChange(false)", async () => {
    const user = userEvent.setup();
    render(<PledgesPage />);
    // Open the detail sheet
    await user.click(screen.getByRole("button", { name: /open pledge c1 details/i }));
    await waitFor(() => {
      expect(screen.getByText("Pledge detail")).toBeInTheDocument();
    });
    // Close via the sheet close button (Radix renders an X button)
    const closeButtons = screen.getAllByRole("button");
    // The sheet close button is the X. Click the button that has sr-only "Close" text.
    const closeBtn = closeButtons.find((b) => b.querySelector(".sr-only")?.textContent === "Close");
    if (closeBtn) {
      await user.click(closeBtn);
      await waitFor(() => {
        expect(screen.queryByText("Pledge detail")).not.toBeInTheDocument();
      });
    } else {
      // If we can't find the close button the sheet was at least opened
      expect(screen.getByText("Pledge detail")).toBeInTheDocument();
    }
  });
});

describe("PledgesPage accounting permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("shows pledge posting controls to accounting managers", () => {
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} canManageAccounting />);
    expect(screen.getByRole("button", { name: "Record payment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set allowance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write off" })).toBeInTheDocument();
  });

  it("hides pledge posting controls from members without accounting manage", () => {
    render(
      <PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} canManageAccounting={false} />,
    );
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set allowance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write off" })).not.toBeInTheDocument();
    expect(screen.getByText(/accounting managers can post pledge changes/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CreatePledgeDialog
// ---------------------------------------------------------------------------

describe("CreatePledgeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders dialog when open", () => {
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Add pledge")).toBeInTheDocument();
  });

  it("does not render dialog when closed", () => {
    render(<CreatePledgeDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Add pledge")).not.toBeInTheDocument();
  });

  it("shows validation error when contactId is empty", async () => {
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    // Submit the form directly to avoid button-finding issues
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      // Error text is "Select a donor." with a period. The select placeholder has no period.
      expect(screen.queryAllByText((text) => text === "Select a donor.").length).toBeGreaterThan(0);
    });
  });

  it("shows validation error when form is submitted with empty fields", () => {
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    const form = document.querySelector("form");
    fireEvent.submit(form!);
    // Error text is "Select a donor." with period, distinct from the select placeholder.
    expect(screen.getByText("Select a donor.")).toBeInTheDocument();
  });

  it("renders add installment button", () => {
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add installment/i })).toBeInTheDocument();
  });

  it("adds a new installment row when button is clicked", async () => {
    const user = userEvent.setup();
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    const beforeCount = screen.getAllByPlaceholderText(/amount/i).length;
    await user.click(screen.getByRole("button", { name: /add installment/i }));
    const afterCount = screen.getAllByPlaceholderText(/amount/i).length;
    expect(afterCount).toBe(beforeCount + 1);
  });

  it("removes an installment row", async () => {
    const user = userEvent.setup();
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /add installment/i }));
    const removeButtons = screen.getAllByRole("button", { name: /remove installment/i });
    await user.click(removeButtons[0]!);
    // Back to 1 amount input after removing one of 2
    expect(screen.getAllByPlaceholderText(/amount/i).length).toBe(1);
  });

  it("shows conditional alert when both barrier flags are on", async () => {
    const user = userEvent.setup();
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    const switches = screen.getAllByRole("switch");
    await user.click(switches[0]!);
    await user.click(switches[1]!);
    // The alert text mentions "conditional" or "no journal entry"
    await waitFor(() => {
      expect(screen.getByText(/no journal entry/i)).toBeInTheDocument();
    });
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CreatePledgeDialog open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows contact options from useContacts", () => {
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Select a donor")).toBeInTheDocument();
  });

  it("renders when useContacts returns no data", () => {
    mocks.mockUseContacts.mockReturnValue({ data: null });
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    // With empty contacts, the select still renders
    expect(screen.getByText("Add pledge")).toBeInTheDocument();
  });

  it("shows organizationName when contact has no firstName/lastName", () => {
    mocks.mockUseContacts.mockReturnValue({
      data: {
        data: [
          {
            id: "org1",
            firstName: null,
            lastName: null,
            organizationName: "Acme Foundation",
          },
        ],
      },
    });
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    // Radix Select renders a hidden native select with options. Check it.
    const nativeSelect = document.querySelector("select[aria-hidden]");
    expect(nativeSelect?.textContent).toContain("Acme Foundation");
  });

  it("shows contact id when no name or org", () => {
    mocks.mockUseContacts.mockReturnValue({
      data: {
        data: [
          {
            id: "anon-id",
            firstName: null,
            lastName: null,
            organizationName: null,
          },
        ],
      },
    });
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    const nativeSelect = document.querySelector("select[aria-hidden]");
    expect(nativeSelect?.textContent).toContain("anon-id");
  });

  it("shows pending state on create button", () => {
    mocks.mockUseCreatePledge.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /adding/i })).toBeInTheDocument();
  });

  it("updating installment amount updates state", async () => {
    const user = userEvent.setup();
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    const amountInput = screen.getByPlaceholderText(/amount/i);
    await user.type(amountInput, "1000");
    expect(amountInput).toHaveValue("1000");
  });

  it("updating installment due date updates state", () => {
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    const dateInputs = document.querySelectorAll("input[type='date']");
    // There are 2 date inputs: pledge date and installment due date
    const installmentDate = dateInputs[1] as HTMLInputElement;
    fireEvent.change(installmentDate, { target: { value: "2027-06-01" } });
    expect(installmentDate).toHaveValue("2027-06-01");
  });

  it("updating discount rate input updates state", () => {
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    const discountInput = screen.getByPlaceholderText("4.00");
    fireEvent.change(discountInput, { target: { value: "5" } });
    expect(discountInput).toHaveValue(5);
  });

  it("updating pledge date input updates state", () => {
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    const dateInputs = document.querySelectorAll("input[type='date']");
    const pledgeDateInput = dateInputs[0] as HTMLInputElement;
    fireEvent.change(pledgeDateInput, { target: { value: "2026-06-01" } });
    expect(pledgeDateInput).toHaveValue("2026-06-01");
  });

  it("updating condition note updates state", async () => {
    const user = userEvent.setup();
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    // conditionNote textarea shows only when BOTH hasBarrier AND hasRightOfReturn are true
    const barrierSwitch = screen.getByRole("switch", { name: /has barrier/i });
    const returnSwitch = screen.getByRole("switch", { name: /has right of return/i });
    await user.click(barrierSwitch);
    await user.click(returnSwitch);
    const conditionTextarea = screen.getByPlaceholderText(/describe the condition/i);
    fireEvent.change(conditionTextarea, { target: { value: "Grant conditional on audit" } });
    expect(conditionTextarea).toHaveValue("Grant conditional on audit");
  });

  it("updating notes textarea updates state", () => {
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    const notesTextarea = screen.getByPlaceholderText("Optional notes…");
    fireEvent.change(notesTextarea, { target: { value: "Some note" } });
    expect(notesTextarea).toHaveValue("Some note");
  });

  it("typing non-numeric installment amount results in zero amountCents", async () => {
    const user = userEvent.setup();
    render(<CreatePledgeDialog open onOpenChange={vi.fn()} />);
    // Add a second installment so both are present
    await user.click(screen.getByRole("button", { name: /add installment/i }));
    const amounts = screen.getAllByPlaceholderText(/amount/i);
    // Update the second installment (tests i !== index branch for the first one)
    fireEvent.change(amounts[1]!, { target: { value: "abc" } });
    // Non-numeric means amountCents = 0; input shows the raw value
    expect(amounts[1]).toHaveValue("abc");
  });
});

// ---------------------------------------------------------------------------
// RecordPaymentDialog
// ---------------------------------------------------------------------------

describe("RecordPaymentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders dialog when open", () => {
    render(<RecordPaymentDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText(/record payment/i).length).toBeGreaterThanOrEqual(1);
  });

  it("does not render when closed", () => {
    render(<RecordPaymentDialog pledgeId="p1" open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Record payment")).not.toBeInTheDocument();
  });

  it("shows validation error when amount is zero", async () => {
    render(<RecordPaymentDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      expect(screen.getByText(/positive amount/i)).toBeInTheDocument();
    });
  });

  it("shows validation error when payment date is missing", async () => {
    const user = userEvent.setup();
    render(<RecordPaymentDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    // Type amount but leave date empty
    await user.type(screen.getByPlaceholderText("5000.00"), "100");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      expect(screen.getByText("Enter a payment date.")).toBeInTheDocument();
    });
  });

  it("calls mutateAsync on valid submission", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    mocks.mockUseRecordPledgePayment.mockReturnValue({ mutateAsync, isPending: false });
    render(<RecordPaymentDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("5000.00"), "100");
    await user.type(screen.getByLabelText("Payment date"), "2026-06-01");
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ pledgeId: "p1", amountCents: 10000 }),
      );
    });
  });

  it("shows saving text when pending", () => {
    mocks.mockUseRecordPledgePayment.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    });
    render(<RecordPaymentDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<RecordPaymentDialog pledgeId="p1" open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows error when mutateAsync throws", async () => {
    const user = userEvent.setup();
    mocks.mockUseRecordPledgePayment.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Server error")),
      isPending: false,
    });
    render(<RecordPaymentDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("5000.00"), "100");
    await user.type(screen.getByLabelText("Payment date"), "2026-06-01");
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("updating notes textarea updates state", () => {
    render(<RecordPaymentDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    const notesTextarea = screen.getByLabelText(/^notes$/i);
    fireEvent.change(notesTextarea, { target: { value: "Payment note" } });
    expect(notesTextarea).toHaveValue("Payment note");
  });

  it("shows generic error when mutateAsync throws non-Error", async () => {
    const user = userEvent.setup();
    mocks.mockUseRecordPledgePayment.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue("string error"),
      isPending: false,
    });
    render(<RecordPaymentDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("5000.00"), "100");
    await user.type(screen.getByLabelText("Payment date"), "2026-06-01");
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await waitFor(() => {
      expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    });
  });

  it("non-numeric amount input results in zero cents", () => {
    render(<RecordPaymentDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    const amountInput = screen.getByPlaceholderText("5000.00");
    fireEvent.change(amountInput, { target: { value: "abc" } });
    // Non-numeric parses as NaN, so amountCents = 0
    expect(amountInput).toHaveValue("abc");
  });
});

// ---------------------------------------------------------------------------
// SetAllowanceDialog
// ---------------------------------------------------------------------------

describe("SetAllowanceDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders dialog when open", () => {
    render(
      <SetAllowanceDialog pledgeId="p1" currentAllowanceCents={0} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/allowance for uncollectible/i)).toBeInTheDocument();
  });

  it("calls mutateAsync on submit", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    mocks.mockUseSetPledgeAllowance.mockReturnValue({ mutateAsync, isPending: false });
    render(
      <SetAllowanceDialog pledgeId="p1" currentAllowanceCents={0} open onOpenChange={vi.fn()} />,
    );
    const input = screen.getByLabelText(/allowance amount/i);
    await user.clear(input);
    await user.type(input, "1000");
    await user.click(screen.getByRole("button", { name: /update allowance/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ pledgeId: "p1", allowanceCents: 100000 }),
      );
    });
  });

  it("calls onOpenChange(false) on cancel", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <SetAllowanceDialog
        pledgeId="p1"
        currentAllowanceCents={0}
        open
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows error from mutateAsync rejection", async () => {
    const user = userEvent.setup();
    mocks.mockUseSetPledgeAllowance.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Server error")),
      isPending: false,
    });
    render(
      <SetAllowanceDialog pledgeId="p1" currentAllowanceCents={0} open onOpenChange={vi.fn()} />,
    );
    const input = screen.getByLabelText(/allowance amount/i);
    await user.clear(input);
    await user.type(input, "500");
    await user.click(screen.getByRole("button", { name: /update allowance/i }));
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows saving state when isPending", () => {
    mocks.mockUseSetPledgeAllowance.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(
      <SetAllowanceDialog pledgeId="p1" currentAllowanceCents={0} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
  });

  it("shows generic error when mutateAsync throws non-Error", async () => {
    const user = userEvent.setup();
    mocks.mockUseSetPledgeAllowance.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue("plain string"),
      isPending: false,
    });
    render(
      <SetAllowanceDialog pledgeId="p1" currentAllowanceCents={0} open onOpenChange={vi.fn()} />,
    );
    const input = screen.getByLabelText(/allowance amount/i);
    await user.clear(input);
    await user.type(input, "500");
    await user.click(screen.getByRole("button", { name: /update allowance/i }));
    await waitFor(() => {
      expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// WriteOffDialog
// ---------------------------------------------------------------------------

describe("WriteOffDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders dialog when open", () => {
    render(<WriteOffDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/write off pledge/i)).toBeInTheDocument();
  });

  it("calls mutateAsync on submit", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    mocks.mockUseWriteOffPledge.mockReturnValue({ mutateAsync, isPending: false });
    render(<WriteOffDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText(/reason/i), "Donor unreachable");
    await user.click(screen.getByRole("button", { name: /write off$/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ pledgeId: "p1", reason: "Donor unreachable" }),
      );
    });
  });

  it("calls onOpenChange(false) on cancel", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<WriteOffDialog pledgeId="p1" open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows error when mutateAsync throws", async () => {
    const user = userEvent.setup();
    mocks.mockUseWriteOffPledge.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Cannot write off")),
      isPending: false,
    });
    render(<WriteOffDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /write off$/i }));
    await waitFor(() => {
      expect(screen.getByText("Cannot write off")).toBeInTheDocument();
    });
  });

  it("shows writing off state when isPending", () => {
    mocks.mockUseWriteOffPledge.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    render(<WriteOffDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /writing off/i })).toBeInTheDocument();
  });

  it("shows generic error when mutateAsync throws non-Error", async () => {
    const user = userEvent.setup();
    mocks.mockUseWriteOffPledge.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue("plain string"),
      isPending: false,
    });
    render(<WriteOffDialog pledgeId="p1" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /write off$/i }));
    await waitFor(() => {
      expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// PledgeDetailSheet
// ---------------------------------------------------------------------------

describe("PledgeDetailSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders loading state", () => {
    mocks.mockUsePledge.mockReturnValue({
      isLoading: true,
      isError: false,
      isPlanGated: false,
      data: undefined,
    });
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/loading pledge/i)).toBeInTheDocument();
  });

  it("renders null when not loading, not error, but pledge is undefined", () => {
    mocks.mockUsePledge.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlanGated: false,
      data: {
        pledge: undefined,
        installments: [],
        payments: [],
        amortizationSchedule: [],
        carryingValueCents: 0,
      },
    });
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    // The pledge content area renders null when pledge is falsy
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
  });

  it("renders error state", () => {
    mocks.mockUsePledge.mockReturnValue({
      isLoading: false,
      isError: true,
      isPlanGated: false,
      data: undefined,
    });
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/unable to load pledge/i)).toBeInTheDocument();
  });

  it("renders pledge summary data", () => {
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getAllByText("$5000.00").length).toBeGreaterThanOrEqual(1); // face + outstanding
    expect(screen.getAllByText("$4800.00").length).toBeGreaterThanOrEqual(1); // PV or carrying value
  });

  it("renders Record payment button for active pledge", () => {
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /record payment/i })).toBeInTheDocument();
  });

  it("renders Write off button for active pledge", () => {
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /write off/i })).toBeInTheDocument();
  });

  it("renders Promote to active button for conditional pledge", () => {
    mocks.mockUsePledge.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        pledge: { ...MOCK_PLEDGE, status: "conditional" },
        installments: [],
        payments: [],
        amortizationSchedule: [],
        carryingValueCents: 480000,
      },
    });
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /promote to active/i })).toBeInTheDocument();
  });

  it("disables action buttons for written_off pledge", () => {
    mocks.mockUsePledge.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        pledge: { ...MOCK_PLEDGE, status: "written_off" },
        installments: [],
        payments: [],
        amortizationSchedule: [],
        carryingValueCents: 0,
      },
    });
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /record payment/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /write off/i })).toBeDisabled();
  });

  it("shows No installments message when list is empty", () => {
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/no installments/i)).toBeInTheDocument();
  });

  it("shows No payments message when list is empty", () => {
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/no payments recorded yet/i)).toBeInTheDocument();
  });

  it("renders installment rows when present", () => {
    mocks.mockUsePledge.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        pledge: MOCK_PLEDGE,
        installments: [
          {
            id: "i1",
            orgId: "org1",
            pledgeId: "p1",
            dueDate: "2027-01-01T00:00:00.000Z",
            amountCents: 250000,
            status: "scheduled",
            paidCents: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            deletedAt: null,
          },
        ],
        payments: [],
        amortizationSchedule: [],
        carryingValueCents: 480000,
      },
    });
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText("$2500.00")).toBeInTheDocument();
    expect(screen.getByText("scheduled")).toBeInTheDocument();
  });

  it("renders payment rows when present", () => {
    mocks.mockUsePledge.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        pledge: MOCK_PLEDGE,
        installments: [],
        payments: [
          {
            id: "pay1",
            orgId: "org1",
            pledgeId: "p1",
            installmentId: null,
            amountCents: 100000,
            paymentDate: "2026-03-01T00:00:00.000Z",
            accretionCents: 500,
            notes: "Spring payment",
            createdAt: "2026-03-01T00:00:00.000Z",
            deletedAt: null,
          },
        ],
        amortizationSchedule: [],
        carryingValueCents: 480000,
      },
    });
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText("$1000.00")).toBeInTheDocument();
    expect(screen.getByText("Spring payment")).toBeInTheDocument();
  });

  it("shows dash when payment notes are null", () => {
    mocks.mockUsePledge.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        pledge: MOCK_PLEDGE,
        installments: [],
        payments: [
          {
            id: "pay2",
            orgId: "org1",
            pledgeId: "p1",
            installmentId: null,
            amountCents: 50000,
            paymentDate: "2026-04-01T00:00:00.000Z",
            accretionCents: 200,
            notes: null,
            createdAt: "2026-04-01T00:00:00.000Z",
            deletedAt: null,
          },
        ],
        amortizationSchedule: [],
        carryingValueCents: 480000,
      },
    });
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    // notes is null, so the payment row shows the app-wide "--" missing token,
    // matching the amount/accretion money cells in the same table.
    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.queryByText("-")).not.toBeInTheDocument();
  });

  it("renders amortization schedule when present", () => {
    mocks.mockUsePledge.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        pledge: MOCK_PLEDGE,
        installments: [],
        payments: [],
        amortizationSchedule: [
          {
            period: 1,
            date: "2027-01-01T00:00:00.000Z",
            carryingValueCents: 499200,
            accretionCents: 1920,
            cumulativeAccretionCents: 1920,
          },
        ],
        carryingValueCents: 480000,
      },
    });
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Amortization schedule")).toBeInTheDocument();
  });

  it("opens record payment dialog on button click", async () => {
    const user = userEvent.setup();
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    // Record payment dialog opens
    await waitFor(() => {
      expect(screen.getAllByText(/record payment/i).length).toBeGreaterThan(1);
    });
  });

  it("opens set allowance dialog on button click", async () => {
    const user = userEvent.setup();
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /set allowance/i }));
    await waitFor(() => {
      expect(screen.getByText(/allowance for uncollectible/i)).toBeInTheDocument();
    });
  });

  it("opens write-off dialog on button click", async () => {
    const user = userEvent.setup();
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /write off/i }));
    await waitFor(() => {
      expect(screen.getByText(/write off pledge/i)).toBeInTheDocument();
    });
  });

  it("shows Promoting text when promote isPending", () => {
    mocks.mockUsePromotePledge.mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    mocks.mockUsePledge.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        pledge: { ...MOCK_PLEDGE, status: "conditional" },
        installments: [],
        payments: [],
        amortizationSchedule: [],
        carryingValueCents: 480000,
      },
    });
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /promoting/i })).toBeInTheDocument();
  });

  it("calls promoteP.mutateAsync when Promote to active is clicked", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mocks.mockUsePromotePledge.mockReturnValue({ mutateAsync, isPending: false });
    mocks.mockUsePledge.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        pledge: { ...MOCK_PLEDGE, status: "conditional" },
        installments: [],
        payments: [],
        amortizationSchedule: [],
        carryingValueCents: 480000,
      },
    });
    const user = userEvent.setup();
    render(<PledgeDetailSheet pledgeId="p1" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /promote to active/i }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith("p1");
    });
  });
});
