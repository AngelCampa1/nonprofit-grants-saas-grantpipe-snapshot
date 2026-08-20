import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseSession,
  mockUseOrgBilling,
  mockUseSubrecipient,
  mockUseSubrecipientMutations,
  mockUseSubawardMonitoringMutations,
  mockUseSubrecipientRecordMutations,
  mockRouteUseSearch,
  mockRouteUseParams,
  mockHasSubrecipientMonitoring,
  mockGetEffectivePlanTier,
  mockCanAccessFeature,
  mockDownloadViaOrgFetch,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseSubrecipient: vi.fn(),
  mockUseSubrecipientMutations: vi.fn(),
  mockUseSubawardMonitoringMutations: vi.fn(),
  mockUseSubrecipientRecordMutations: vi.fn(),
  mockRouteUseSearch: vi.fn().mockReturnValue({ grantId: undefined }),
  mockRouteUseParams: vi.fn().mockReturnValue({ subrecipientId: "sub-1" }),
  mockHasSubrecipientMonitoring: vi.fn().mockReturnValue(true),
  mockGetEffectivePlanTier: vi.fn().mockReturnValue("audit_ready"),
  mockCanAccessFeature: vi.fn().mockReturnValue(true),
  mockDownloadViaOrgFetch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@grantpipe/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/shared")>();
  return {
    ...actual,
    hasSubrecipientMonitoring: mockHasSubrecipientMonitoring,
    getEffectivePlanTier: mockGetEffectivePlanTier,
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    (path: string) => (config: { component: React.ComponentType; validateSearch?: unknown }) => ({
      ...config,
      path,
      useSearch: mockRouteUseSearch,
      useParams: mockRouteUseParams,
    }),
  Link: ({
    to,
    params,
    hash,
    children,
    className,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    hash?: string;
    children: React.ReactNode;
    className?: string;
  }) => {
    const base = params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? "") : to;
    const href = hash ? `${base}#${hash}` : base;
    return React.createElement("a", { href, className, ...rest }, children);
  },
  useNavigate: () => vi.fn(),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../../hooks/use-org-settings", () => ({
  useOrgBilling: () => mockUseOrgBilling(),
}));

vi.mock("../../../hooks/use-subrecipients", () => ({
  useSubrecipient: (...args: unknown[]) => mockUseSubrecipient(...args),
  useSubrecipientMutations: (...args: unknown[]) => mockUseSubrecipientMutations(...args),
  useSubawardMonitoringMutations: (...args: unknown[]) =>
    mockUseSubawardMonitoringMutations(...args),
  useSubrecipientRecordMutations: (...args: unknown[]) =>
    mockUseSubrecipientRecordMutations(...args),
}));

vi.mock("../../../lib/access-control", () => ({
  canAccessFeature: (...args: unknown[]) => mockCanAccessFeature(...args),
}));

vi.mock("../../../lib/download", () => ({
  downloadViaOrgFetch: (...args: unknown[]) => mockDownloadViaOrgFetch(...args),
}));

vi.mock("../../../components/retry-button", () => ({
  RetryButton: () => React.createElement("button", { type: "button" }, "Retry"),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  const SelectCtx = React.createContext<{
    value: string;
    onValueChange: (v: string) => void;
  }>({ value: "", onValueChange: () => {} });
  return {
    ...actual,
    Select: ({
      value = "",
      onValueChange = (_v: string) => {},
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: React.ReactNode;
    }) => React.createElement(SelectCtx.Provider, { value: { value, onValueChange } }, children),
    SelectTrigger: ({ id }: { id?: string; children?: React.ReactNode }) => {
      const { value, onValueChange } = React.useContext(SelectCtx);
      return React.createElement("input", {
        role: "combobox",
        id,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value),
        readOnly: false,
      });
    },
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => {
      const { onValueChange } = React.useContext(SelectCtx);
      return React.createElement(
        "span",
        { role: "option", "aria-selected": false, onClick: () => onValueChange(value) },
        children,
      );
    },
  };
});

import { SubrecipientDetailPage, Route } from "./$subrecipientId";
import type { SubrecipientDetail } from "../../../hooks/use-subrecipients";

const PAST = "2020-01-01T00:00:00.000Z";
const FUTURE = "2999-01-01T00:00:00.000Z";

function makeDetail(overrides: Partial<SubrecipientDetail> = {}): SubrecipientDetail {
  return {
    subrecipient: {
      id: "sub-1",
      name: "Community Health Network",
      uei: "ABC123DEF456",
      status: "active",
      notes: "Primary subrecipient",
    },
    subawards: [
      {
        id: "award-1",
        subrecipientId: "sub-1",
        grantId: "grant-1",
        title: "Year 1 services",
        amountCents: 5_000_00,
        startDate: PAST,
        endDate: FUTURE,
        status: "active",
        riskRating: "high",
        openTaskCount: 2,
        overdueTaskCount: 1,
        openFindingCount: 1,
      },
      {
        id: "award-2",
        subrecipientId: "sub-1",
        grantId: "grant-2",
        title: "Year 2 services",
        amountCents: 2_500_00,
        startDate: PAST,
        endDate: FUTURE,
        status: "active",
        riskRating: null,
      },
    ],
    riskAssessments: [
      {
        id: "ra-1",
        subawardId: "award-1",
        suggestedRiskRating: "medium",
        finalRiskRating: "high",
        overrideReason: "Documented prior findings",
        assessedAt: PAST,
      },
      {
        id: "ra-2",
        subawardId: "award-1",
        suggestedRiskRating: "low",
        finalRiskRating: "low",
        assessedAt: PAST,
      },
    ],
    monitoringTasks: [
      {
        id: "task-open",
        subawardId: "award-1",
        title: "Submit FFR",
        dueDate: PAST,
        status: "open",
      },
      {
        id: "task-done",
        subawardId: "award-1",
        title: "Kickoff call",
        dueDate: FUTURE,
        status: "completed",
      },
      {
        id: "task-waived",
        subawardId: "award-1",
        title: "Optional review",
        dueDate: FUTURE,
        status: "waived",
      },
    ],
    monitoringLogs: [
      {
        id: "log-1",
        subawardId: "award-1",
        logType: "site_visit",
        title: "Annual site visit",
        occurredAt: PAST,
        summary: "Reviewed controls.",
      },
    ],
    findings: [
      {
        id: "finding-open",
        subawardId: "award-1",
        title: "Missing receipts",
        severity: "medium",
        status: "open",
        description: "Receipts not provided.",
      },
      {
        id: "finding-review",
        subawardId: "award-1",
        title: "Late report",
        severity: "low",
        status: "in_review",
        description: "Report submitted late.",
      },
      {
        id: "finding-resolved",
        subawardId: "award-1",
        title: "Resolved item",
        severity: "low",
        status: "resolved",
        description: "Closed.",
      },
    ],
    correctiveActions: [
      {
        id: "ca-1",
        findingId: "finding-open",
        title: "Collect receipts",
        dueDate: FUTURE,
        status: "open",
      },
    ],
    documents: [
      { id: "doc-1", filename: "audit-2025.pdf", entityType: "subaward", entityId: "award-1" },
    ],
    ...overrides,
  };
}

function makeMutation<T = unknown>(impl?: (...args: unknown[]) => Promise<T>) {
  return {
    mutateAsync: vi.fn(impl ?? (() => Promise.resolve(undefined as T))),
    isPending: false,
  };
}

let createSubaward: ReturnType<typeof makeMutation>;
let updateSubrecipient: ReturnType<typeof makeMutation>;
let createRiskAssessment: ReturnType<typeof makeMutation>;
let generateTasks: ReturnType<typeof makeMutation>;
let createFinding: ReturnType<typeof makeMutation>;
let createMonitoringLog: ReturnType<typeof makeMutation>;
let createEvidenceBundle: ReturnType<typeof makeMutation>;
let updateTask: ReturnType<typeof makeMutation>;
let updateFinding: ReturnType<typeof makeMutation>;
let createCorrectiveAction: ReturnType<typeof makeMutation>;
let updateCorrectiveAction: ReturnType<typeof makeMutation>;

function setSubawardMutations() {
  mockUseSubawardMonitoringMutations.mockReturnValue({
    createRiskAssessment,
    generateTasks,
    createFinding,
    createMonitoringLog,
    createEvidenceBundle,
  });
}

function setRecordMutations() {
  mockUseSubrecipientRecordMutations.mockReturnValue({
    updateTask,
    updateFinding,
    createCorrectiveAction,
    updateCorrectiveAction,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasSubrecipientMonitoring.mockReturnValue(true);
  mockGetEffectivePlanTier.mockReturnValue("audit_ready");
  mockCanAccessFeature.mockReturnValue(true);
  mockRouteUseSearch.mockReturnValue({ grantId: undefined });
  mockRouteUseParams.mockReturnValue({ subrecipientId: "sub-1" });
  mockDownloadViaOrgFetch.mockResolvedValue(undefined);
  mockUseSession.mockReturnValue({ memberRole: "admin", memberPermissions: [] });
  mockUseOrgBilling.mockReturnValue({
    data: { planTier: "audit_ready", status: "active", trialEndsAt: null },
  });
  mockUseSubrecipient.mockReturnValue({ data: makeDetail(), isError: false, error: null });

  createSubaward = makeMutation();
  updateSubrecipient = makeMutation();
  createRiskAssessment = makeMutation();
  generateTasks = makeMutation();
  createFinding = makeMutation();
  createMonitoringLog = makeMutation();
  createEvidenceBundle = makeMutation(() =>
    Promise.resolve({ bundle: { id: "b-1", title: "Evidence pack" }, items: [{ id: "i-1" }] }),
  );
  updateTask = makeMutation();
  updateFinding = makeMutation();
  createCorrectiveAction = makeMutation();
  updateCorrectiveAction = makeMutation();

  mockUseSubrecipientMutations.mockReturnValue({ createSubaward, updateSubrecipient });
  setSubawardMutations();
  setRecordMutations();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Route.validateSearch", () => {
  it("keeps a string grantId and drops non-string values", () => {
    const { validateSearch } = Route as unknown as {
      validateSearch: (s: Record<string, unknown>) => { grantId: string | undefined };
    };
    expect(validateSearch({ grantId: "grant-1" })).toEqual({ grantId: "grant-1" });
    expect(validateSearch({ grantId: 42 })).toEqual({ grantId: undefined });
  });
});

describe("SubrecipientDetailPage gating and states", () => {
  it("shows the upgrade empty state when monitoring is not on the plan", () => {
    mockHasSubrecipientMonitoring.mockReturnValue(false);
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("Subrecipient monitoring requires Audit-Ready.")).toBeInTheDocument();
  });

  it("derives subrecipient detail plan gate copy from shared pricing data", () => {
    const source = readFileSync(join(__dirname, "$subrecipientId.tsx"), "utf8");

    expect(source).toMatch(/getPlanEntitlementLabelList\(\s*"hasSubrecipientMonitoring"/);
    expect(source).not.toContain("You need Audit-Ready or Enterprise");
    expect(source).not.toContain("require Audit-Ready or Enterprise");
  });

  it("falls back to no plan tier when billing data is missing", () => {
    mockUseOrgBilling.mockReturnValue({ data: undefined });
    mockHasSubrecipientMonitoring.mockReturnValue(false);
    render(<SubrecipientDetailPage />);
    expect(mockHasSubrecipientMonitoring).toHaveBeenCalledWith(null);
  });

  it("renders an error alert with the error message", () => {
    mockUseSubrecipient.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Boom"),
    });
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("Unable to load subrecipient")).toBeInTheDocument();
    expect(screen.getByText("Boom")).toBeInTheDocument();
  });

  it("renders a generic error message when error is not an Error instance", () => {
    mockUseSubrecipient.mockReturnValue({ data: undefined, isError: true, error: "nope" });
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("Try again.")).toBeInTheDocument();
  });

  it("shows a skeleton loading state while detail is undefined", () => {
    mockUseSubrecipient.mockReturnValue({ data: undefined, isError: false, error: null });
    const { container } = render(<SubrecipientDetailPage />);
    expect(screen.getByTestId("subrecipient-detail-loading")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("shows a read-only alert for non-editing roles and hides the add subaward dialog", () => {
    mockCanAccessFeature.mockReturnValue(false);
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("Read-only access")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add subaward" })).not.toBeInTheDocument();
  });

  it("falls back to the default description when notes are absent", () => {
    mockUseSubrecipient.mockReturnValue({
      data: makeDetail({
        subrecipient: { id: "sub-1", name: "No Notes Org", status: "active", notes: null },
      }),
      isError: false,
      error: null,
    });
    render(<SubrecipientDetailPage />);
    expect(
      screen.getByText("Profile, subawards, evidence, and corrective actions."),
    ).toBeInTheDocument();
  });
});

describe("SubrecipientDetailPage subawards", () => {
  it("shows the empty subawards state and no export action when there are none", () => {
    mockUseSubrecipient.mockReturnValue({
      data: makeDetail({ subawards: [] }),
      isError: false,
      error: null,
    });
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("No subawards linked yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Export evidence/ })).not.toBeInTheDocument();
  });

  it("humanizes the subaward risk rating badge", () => {
    render(<SubrecipientDetailPage />);
    expect(screen.queryByText("high")).not.toBeInTheDocument();
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
  });

  it("selects a second subaward for actions", () => {
    render(<SubrecipientDetailPage />);
    const selectButtons = screen.getAllByRole("button", { name: "Select for actions" });
    expect(selectButtons.length).toBeGreaterThan(0);
    fireEvent.click(selectButtons[0]!);
    expect(screen.getByRole("button", { name: "Selected" })).toBeInTheDocument();
  });

  it("validates the add subaward form and surfaces an error", async () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add subaward" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.submit(within(dialog).getByText("Save subaward").closest("form")!);
    expect(
      await screen.findByText("Grant, title, positive amount, and dates are required."),
    ).toBeInTheDocument();
    expect(createSubaward.mutateAsync).not.toHaveBeenCalled();
  });

  it("submits a valid add subaward form", async () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add subaward" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Grant ID"), {
      target: { value: "grant-9" },
    });
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "New subaward" },
    });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "1000" } });
    fireEvent.change(within(dialog).getByLabelText("Start"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("End"), { target: { value: "2026-12-31" } });
    fireEvent.submit(within(dialog).getByText("Save subaward").closest("form")!);
    await waitFor(() =>
      expect(createSubaward.mutateAsync).toHaveBeenCalledWith({
        grantId: "grant-9",
        title: "New subaward",
        amountCents: 100000,
        startDate: "2026-01-01T12:00:00.000Z",
        endDate: "2026-12-31T12:00:00.000Z",
        status: "active",
      }),
    );
  });

  it("prefills and locks the grant field when arriving from a grant", async () => {
    mockRouteUseSearch.mockReturnValue({ grantId: "grant-from-link" });
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add subaward" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Link this subrecipient to the grant you came from."),
    ).toBeInTheDocument();
    const grantInput = within(dialog).getByLabelText("Grant") as HTMLInputElement;
    expect(grantInput.value).toBe("grant-from-link");
    expect(grantInput).toHaveAttribute("readonly");
  });
});

describe("SubrecipientDetailPage risk assessment", () => {
  it("suggests low risk when no risk signals are present", () => {
    render(<SubrecipientDetailPage />);
    const comboboxes = screen.getAllByRole("combobox");
    // First five comboboxes are the checklist questions.
    for (let i = 0; i < 5; i += 1) {
      fireEvent.change(comboboxes[i]!, { target: { value: "no" } });
    }
    expect(screen.getByText(/Suggested risk:/)).toHaveTextContent("low");
  });

  it("suggests high risk when multiple signals are yes", () => {
    render(<SubrecipientDetailPage />);
    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.change(comboboxes[0]!, { target: { value: "yes" } });
    fireEvent.change(comboboxes[1]!, { target: { value: "yes" } });
    expect(screen.getByText(/Suggested risk:/)).toHaveTextContent("high");
  });

  it("suggests medium risk when a single signal is yes", () => {
    render(<SubrecipientDetailPage />);
    const comboboxes = screen.getAllByRole("combobox");
    for (let i = 0; i < 5; i += 1) {
      fireEvent.change(comboboxes[i]!, { target: { value: "no" } });
    }
    fireEvent.change(comboboxes[0]!, { target: { value: "yes" } });
    expect(screen.getByText(/Suggested risk:/)).toHaveTextContent("medium");
  });

  it("requires an override reason before saving when risk differs from suggestion", () => {
    render(<SubrecipientDetailPage />);
    // Select a subaward so the action is enabled.
    fireEvent.click(screen.getAllByRole("button", { name: "Select for actions" })[0]!);
    const save = screen.getByRole("button", { name: "Save risk assessment" });
    // Default suggestion is medium and manual risk defaults to medium -> not override required,
    // but flipping checklist to all "no" makes suggestion low while manual stays medium.
    const comboboxes = screen.getAllByRole("combobox");
    for (let i = 0; i < 5; i += 1) {
      fireEvent.change(comboboxes[i]!, { target: { value: "no" } });
    }
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Override reason"), {
      target: { value: "Reviewed controls" },
    });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(createRiskAssessment.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ overrideReason: "Reviewed controls", finalRiskRating: "medium" }),
    );
  });

  it("updates the final risk rating from the manual select", () => {
    render(<SubrecipientDetailPage />);
    fireEvent.change(screen.getByLabelText("Final risk"), { target: { value: "high" } });
    // Default suggestion is medium, so a manual "high" now requires an override reason.
    const save = screen.getByRole("button", { name: "Save risk assessment" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Override reason"), {
      target: { value: "Manual escalation" },
    });
    fireEvent.click(save);
    expect(createRiskAssessment.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ finalRiskRating: "high", overrideReason: "Manual escalation" }),
    );
  });

  it("saves a risk assessment without an override when it matches the suggestion", () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Select for actions" })[0]!);
    // Suggestion is medium (all unknown), manual default medium -> not override required.
    fireEvent.click(screen.getByRole("button", { name: "Save risk assessment" }));
    expect(createRiskAssessment.mutateAsync).toHaveBeenCalledWith(
      expect.not.objectContaining({ overrideReason: expect.anything() }),
    );
  });

  it("generates monitoring tasks using the subaward risk rating", () => {
    render(<SubrecipientDetailPage />);
    // The first subaward (riskRating "high") is selected by default.
    fireEvent.click(screen.getByRole("button", { name: "Generate monitoring tasks" }));
    expect(generateTasks.mutateAsync).toHaveBeenCalledWith({ riskRating: "high" });
  });

  it("falls back to manual risk when generating tasks for an unassessed subaward", () => {
    render(<SubrecipientDetailPage />);
    // The second subaward (riskRating null) is the only one offering a select action,
    // since the first is selected by default.
    fireEvent.click(screen.getByRole("button", { name: "Select for actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate monitoring tasks" }));
    expect(generateTasks.mutateAsync).toHaveBeenCalledWith({ riskRating: "medium" });
  });
});

describe("SubrecipientDetailPage records and panels", () => {
  it("renders risk history including override reason", () => {
    render(<SubrecipientDetailPage />);
    expect(screen.getByText(/Documented prior findings/)).toBeInTheDocument();
  });

  it("shows empty risk history when there are none", () => {
    mockUseSubrecipient.mockReturnValue({
      data: makeDetail({ riskAssessments: [] }),
      isError: false,
      error: null,
    });
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("No risk assessments recorded.")).toBeInTheDocument();
  });

  it("completes an open monitoring task", () => {
    render(<SubrecipientDetailPage />);
    // Both the open and waived tasks render a Complete button; the open task is first.
    fireEvent.click(screen.getAllByRole("button", { name: "Complete monitoring task" })[0]!);
    expect(updateTask.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "task-open" }),
    );
  });

  it("shows empty monitoring board when there are no tasks", () => {
    mockUseSubrecipient.mockReturnValue({
      data: makeDetail({ monitoringTasks: [] }),
      isError: false,
      error: null,
    });
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("No monitoring tasks recorded.")).toBeInTheDocument();
  });

  it("shows empty monitoring logs when there are none", () => {
    mockUseSubrecipient.mockReturnValue({
      data: makeDetail({ monitoringLogs: [] }),
      isError: false,
      error: null,
    });
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("No monitoring logs recorded.")).toBeInTheDocument();
  });

  it("adds a finding for the selected subaward", () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Select for actions" })[0]!);
    fireEvent.change(screen.getByPlaceholderText("Finding title"), {
      target: { value: "New finding" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(createFinding.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New finding", severity: "medium" }),
    );
  });

  it("renders findings with their corrective actions", () => {
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("Missing receipts")).toBeInTheDocument();
    expect(screen.getByText(/Collect receipts/)).toBeInTheDocument();
  });

  it("shows empty findings when there are none", () => {
    mockUseSubrecipient.mockReturnValue({
      data: makeDetail({ findings: [], correctiveActions: [] }),
      isError: false,
      error: null,
    });
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("No findings recorded.")).toBeInTheDocument();
  });
});

describe("SubrecipientDetailPage monitoring lifecycle", () => {
  it("updates a finding status and disables the action until it changes", () => {
    render(<SubrecipientDetailPage />);
    const row = screen.getByTestId("finding-row-finding-open");
    const update = within(row).getByRole("button", { name: "Update finding" });
    expect(update).toBeDisabled();
    fireEvent.change(within(row).getByRole("combobox"), { target: { value: "resolved" } });
    expect(update).not.toBeDisabled();
    fireEvent.click(update);
    expect(updateFinding.mutateAsync).toHaveBeenCalledWith({
      findingId: "finding-open",
      data: { status: "resolved" },
    });
  });

  it("adds a corrective action to a finding", () => {
    render(<SubrecipientDetailPage />);
    const row = screen.getByTestId("finding-row-finding-open");
    fireEvent.change(within(row).getByPlaceholderText("Corrective action title"), {
      target: { value: "Collect W-9" },
    });
    fireEvent.change(within(row).getByLabelText("Corrective action due date"), {
      target: { value: "2026-06-30" },
    });
    fireEvent.click(within(row).getByRole("button", { name: "Add corrective action" }));
    expect(createCorrectiveAction.mutateAsync).toHaveBeenCalledWith({
      findingId: "finding-open",
      data: {
        findingId: "finding-open",
        title: "Collect W-9",
        dueDate: "2026-06-30T12:00:00.000Z",
        status: "open",
      },
    });
  });

  it("exposes the corrective action title input with an accessible label", () => {
    render(<SubrecipientDetailPage />);
    const row = screen.getByTestId("finding-row-finding-open");
    expect(within(row).getByLabelText("Corrective action title")).toBeInTheDocument();
  });

  it("disables add corrective action until title and due date are present", () => {
    render(<SubrecipientDetailPage />);
    const row = screen.getByTestId("finding-row-finding-open");
    const add = within(row).getByRole("button", { name: "Add corrective action" });
    expect(add).toBeDisabled();
    fireEvent.change(within(row).getByPlaceholderText("Corrective action title"), {
      target: { value: "Collect W-9" },
    });
    expect(add).toBeDisabled();
    fireEvent.change(within(row).getByLabelText("Corrective action due date"), {
      target: { value: "2026-06-30" },
    });
    expect(add).not.toBeDisabled();
  });

  it("completes an open corrective action", () => {
    render(<SubrecipientDetailPage />);
    const row = screen.getByTestId("finding-row-finding-open");
    fireEvent.click(within(row).getByRole("button", { name: "Complete action" }));
    expect(updateCorrectiveAction.mutateAsync).toHaveBeenCalledWith({
      actionId: "ca-1",
      data: { status: "completed" },
    });
  });

  it("hides the complete control for an already completed corrective action", () => {
    mockUseSubrecipient.mockReturnValue({
      data: makeDetail({
        correctiveActions: [
          {
            id: "ca-done",
            findingId: "finding-open",
            title: "Filed",
            dueDate: FUTURE,
            status: "completed",
          },
        ],
      }),
      isError: false,
      error: null,
    });
    render(<SubrecipientDetailPage />);
    const row = screen.getByTestId("finding-row-finding-open");
    expect(within(row).queryByRole("button", { name: "Complete action" })).not.toBeInTheDocument();
  });

  it("logs a monitoring activity for the selected subaward", () => {
    render(<SubrecipientDetailPage />);
    const log = screen.getByRole("button", { name: "Log activity" });
    expect(log).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Activity type"), {
      target: { value: "financial_review" },
    });
    fireEvent.change(screen.getByPlaceholderText("Activity title"), {
      target: { value: "Q2 financial review" },
    });
    fireEvent.change(screen.getByLabelText("Activity date"), { target: { value: "2026-05-01" } });
    fireEvent.change(screen.getByPlaceholderText("Activity summary"), {
      target: { value: "Reviewed Q2 financials." },
    });
    expect(log).not.toBeDisabled();
    fireEvent.click(log);
    expect(createMonitoringLog.mutateAsync).toHaveBeenCalledWith({
      logType: "financial_review",
      title: "Q2 financial review",
      occurredAt: "2026-05-01T12:00:00.000Z",
      summary: "Reviewed Q2 financials.",
    });
  });

  it("disables the monitoring log form when no subaward is selectable", () => {
    mockUseSubrecipient.mockReturnValue({
      data: makeDetail({ subawards: [] }),
      isError: false,
      error: null,
    });
    render(<SubrecipientDetailPage />);
    expect(screen.getByRole("button", { name: "Log activity" })).toBeDisabled();
  });

  it("surfaces an error when updating a finding fails", async () => {
    updateFinding = makeMutation(() => Promise.reject(new Error("Finding update failed")));
    setRecordMutations();
    render(<SubrecipientDetailPage />);
    const row = screen.getByTestId("finding-row-finding-open");
    fireEvent.change(within(row).getByRole("combobox"), { target: { value: "resolved" } });
    fireEvent.click(within(row).getByRole("button", { name: "Update finding" }));
    expect(await screen.findByText("Finding update failed")).toBeInTheDocument();
  });

  it("surfaces an error when completing a corrective action fails", async () => {
    updateCorrectiveAction = makeMutation(() => Promise.reject(new Error("Action update failed")));
    setRecordMutations();
    render(<SubrecipientDetailPage />);
    const row = screen.getByTestId("finding-row-finding-open");
    fireEvent.click(within(row).getByRole("button", { name: "Complete action" }));
    expect(await screen.findByText("Action update failed")).toBeInTheDocument();
  });

  it("surfaces an error when logging a monitoring activity fails", async () => {
    createMonitoringLog = makeMutation(() => Promise.reject(new Error("Log failed")));
    setSubawardMutations();
    render(<SubrecipientDetailPage />);
    fireEvent.change(screen.getByPlaceholderText("Activity title"), {
      target: { value: "Visit" },
    });
    fireEvent.change(screen.getByLabelText("Activity date"), { target: { value: "2026-05-01" } });
    fireEvent.change(screen.getByPlaceholderText("Activity summary"), {
      target: { value: "Notes." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log activity" }));
    expect(await screen.findByText("Log failed")).toBeInTheDocument();
  });
});

describe("SubrecipientDetailPage action error surfaces", () => {
  it("surfaces an error when saving a risk assessment fails", async () => {
    createRiskAssessment = makeMutation(() => Promise.reject(new Error("Risk save failed")));
    setSubawardMutations();
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Select for actions" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save risk assessment" }));
    expect(await screen.findByText("Risk save failed")).toBeInTheDocument();
  });

  it("surfaces an error when generating monitoring tasks fails", async () => {
    generateTasks = makeMutation(() => Promise.reject(new Error("Generate failed")));
    setSubawardMutations();
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Generate monitoring tasks" }));
    expect(await screen.findByText("Generate failed")).toBeInTheDocument();
  });

  it("surfaces an error when completing a task fails", async () => {
    updateTask = makeMutation(() => Promise.reject(new Error("Complete failed")));
    setRecordMutations();
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Complete monitoring task" })[0]!);
    expect(await screen.findByText("Complete failed")).toBeInTheDocument();
  });

  it("shows a generic action error when adding a finding rejects with a non-Error", async () => {
    createFinding = makeMutation(() => Promise.reject("nope"));
    mockUseSubawardMonitoringMutations.mockReturnValue({
      createRiskAssessment,
      generateTasks,
      createFinding,
      createEvidenceBundle,
    });
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Select for actions" })[0]!);
    fireEvent.change(screen.getByPlaceholderText("Finding title"), {
      target: { value: "Receipts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Unable to complete this action.")).toBeInTheDocument();
  });

  it("surfaces a create-subaward error and keeps the dialog open", async () => {
    createSubaward = makeMutation(() => Promise.reject(new Error("Grant not found")));
    mockUseSubrecipientMutations.mockReturnValue({ createSubaward, updateSubrecipient });
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add subaward" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Grant ID"), { target: { value: "grant-9" } });
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "1000" } });
    fireEvent.change(within(dialog).getByLabelText("Start"), { target: { value: "2026-01-01" } });
    fireEvent.change(within(dialog).getByLabelText("End"), { target: { value: "2026-12-31" } });
    fireEvent.submit(within(dialog).getByText("Save subaward").closest("form")!);
    expect(await screen.findByText("Grant not found")).toBeInTheDocument();
    expect(within(dialog).getByText("Save subaward")).toBeInTheDocument();
  });

  it("shows a generic create-subaward error when it rejects with a non-Error", async () => {
    createSubaward = makeMutation(() => Promise.reject("bad"));
    mockUseSubrecipientMutations.mockReturnValue({ createSubaward, updateSubrecipient });
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add subaward" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Grant ID"), { target: { value: "grant-9" } });
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "1000" } });
    fireEvent.change(within(dialog).getByLabelText("Start"), { target: { value: "2026-01-01" } });
    fireEvent.change(within(dialog).getByLabelText("End"), { target: { value: "2026-12-31" } });
    fireEvent.submit(within(dialog).getByText("Save subaward").closest("form")!);
    expect(await screen.findByText("Unable to save subaward.")).toBeInTheDocument();
  });
});

describe("SubrecipientDetailPage evidence export", () => {
  it("exports an evidence bundle and surfaces a success message", async () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Export evidence/ }));
    expect(
      await screen.findByText("Evidence bundle Evidence pack is ready with 1 item."),
    ).toBeInTheDocument();
  });

  it("surfaces evidence bundle export errors", async () => {
    createEvidenceBundle = makeMutation(() => Promise.reject(new Error("Export failed")));
    mockUseSubawardMonitoringMutations.mockReturnValue({
      createRiskAssessment,
      generateTasks,
      createFinding,
      createEvidenceBundle,
    });
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Export evidence/ }));
    await waitFor(() => expect(createEvidenceBundle.mutateAsync).toHaveBeenCalled());
    expect(await screen.findByText("Export failed")).toBeInTheDocument();
    expect(screen.queryByText(/Evidence bundle .* is ready/)).not.toBeInTheDocument();
  });
});

describe("SubrecipientDetailPage documents", () => {
  it("downloads a document via the org fetch helper", async () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() =>
      expect(mockDownloadViaOrgFetch).toHaveBeenCalledWith(
        "/api/documents/doc-1/download",
        "audit-2025.pdf",
      ),
    );
  });

  it("surfaces a download error with the error message", async () => {
    mockDownloadViaOrgFetch.mockRejectedValue(new Error("Network down"));
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText("Unable to download document")).toBeInTheDocument();
    expect(screen.getByText("Network down")).toBeInTheDocument();
  });

  it("uses a generic message when the download rejects with a non-Error", async () => {
    mockDownloadViaOrgFetch.mockRejectedValue("oops");
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText("Unable to download file.")).toBeInTheDocument();
  });

  it("shows an empty documents state when there are none", () => {
    mockUseSubrecipient.mockReturnValue({
      data: makeDetail({ documents: [] }),
      isError: false,
      error: null,
    });
    render(<SubrecipientDetailPage />);
    expect(screen.getByText("No documents attached.")).toBeInTheDocument();
  });
});

describe("SubrecipientDetailPage edit", () => {
  it("opens the edit dialog prefilled with the subrecipient fields", async () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Edit subrecipient/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Community Health Network");
    expect(within(dialog).getByLabelText("UEI")).toHaveValue("ABC123DEF456");
    expect(within(dialog).getByLabelText("Notes")).toHaveValue("Primary subrecipient");
    expect(within(dialog).getByRole("combobox")).toHaveValue("active");
  });

  it("submits the edited fields to the update mutation", async () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Edit subrecipient/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Renamed Network" },
    });
    fireEvent.change(within(dialog).getByLabelText("UEI"), { target: { value: "ZZZ999" } });
    fireEvent.change(within(dialog).getByLabelText("Notes"), { target: { value: "Updated" } });
    fireEvent.click(within(dialog).getByText("Watchlist"));
    fireEvent.submit(within(dialog).getByText("Save changes").closest("form")!);
    await waitFor(() =>
      expect(updateSubrecipient.mutateAsync).toHaveBeenCalledWith({
        name: "Renamed Network",
        status: "watchlist",
        uei: "ZZZ999",
        notes: "Updated",
      }),
    );
  });

  it("omits empty uei and notes from the update payload", async () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Edit subrecipient/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("UEI"), { target: { value: "  " } });
    fireEvent.change(within(dialog).getByLabelText("Notes"), { target: { value: "" } });
    fireEvent.submit(within(dialog).getByText("Save changes").closest("form")!);
    await waitFor(() =>
      expect(updateSubrecipient.mutateAsync).toHaveBeenCalledWith({
        name: "Community Health Network",
        status: "active",
      }),
    );
  });

  it("blocks submit and shows an error when the name is empty", async () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Edit subrecipient/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "  " } });
    fireEvent.submit(within(dialog).getByText("Save changes").closest("form")!);
    expect(await within(dialog).findByText("Name is required.")).toBeInTheDocument();
    expect(updateSubrecipient.mutateAsync).not.toHaveBeenCalled();
  });

  it("clears a validation error once the user edits a field", async () => {
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Edit subrecipient/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "  " } });
    fireEvent.submit(within(dialog).getByText("Save changes").closest("form")!);
    expect(await within(dialog).findByText("Name is required.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Fixed Name" } });
    expect(within(dialog).queryByText("Name is required.")).not.toBeInTheDocument();
  });

  it("seeds the status to active when the stored status is out of enum", async () => {
    mockUseSubrecipient.mockReturnValue({
      data: makeDetail({
        subrecipient: {
          id: "sub-1",
          name: "Community Health Network",
          uei: null,
          status: "archived",
          notes: null,
        },
      }),
      isError: false,
      error: null,
    });
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Edit subrecipient/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("UEI")).toHaveValue("");
    expect(within(dialog).getByRole("combobox")).toHaveValue("active");
  });

  it("surfaces an update error and keeps the dialog open", async () => {
    updateSubrecipient = makeMutation(() => Promise.reject(new Error("Save failed")));
    mockUseSubrecipientMutations.mockReturnValue({ createSubaward, updateSubrecipient });
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Edit subrecipient/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.submit(within(dialog).getByText("Save changes").closest("form")!);
    expect(await within(dialog).findByText("Save failed")).toBeInTheDocument();
  });

  it("shows a generic update error when it rejects with a non-Error", async () => {
    updateSubrecipient = makeMutation(() => Promise.reject("nope"));
    mockUseSubrecipientMutations.mockReturnValue({ createSubaward, updateSubrecipient });
    render(<SubrecipientDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: /Edit subrecipient/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.submit(within(dialog).getByText("Save changes").closest("form")!);
    expect(await within(dialog).findByText("Unable to save subrecipient.")).toBeInTheDocument();
  });

  it("hides the edit button for read-only roles", () => {
    mockCanAccessFeature.mockReturnValue(false);
    render(<SubrecipientDetailPage />);
    expect(screen.queryByRole("button", { name: /Edit subrecipient/ })).not.toBeInTheDocument();
  });
});
