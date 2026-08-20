import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestrictionAlertList } from "./restriction-alert-list";
import { RestrictionBalanceCard } from "./restriction-balance-card";
import { RestrictionEvidenceChecklist } from "./restriction-evidence-checklist";
import { RestrictionLifecyclePanel } from "./restriction-lifecycle-panel";
import { RestrictionReleaseForm } from "./restriction-release-form";
import { RestrictionTermForm } from "./restriction-term-form";

const hoisted = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOrgBilling: vi.fn(),
  mockUseRestrictionTerms: vi.fn(),
  mockUseRestrictionAlerts: vi.fn(),
  mockUseCreateRestrictionTerm: vi.fn(),
}));

const DialogOpenContext = React.createContext<((open: boolean) => void) | null>(null);

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
}>({ value: "", onValueChange: () => {} });

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    hash,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; hash?: string }) => (
    <a href={hash ? `${to ?? ""}#${hash}` : to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("lucide-react", () => ({
  LockKeyhole: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
}));

vi.mock("@grantpipe/ui", () => ({
  Alert: ({
    title,
    children,
    variant,
  }: React.HTMLAttributes<HTMLDivElement> & { title?: string; variant?: string }) => (
    <div role="alert" data-variant={variant}>
      {title ? <p>{title}</p> : null}
      {children}
    </div>
  ),
  Button: ({
    children,
    asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild && React.isValidElement(children) ? children : <button {...props}>{children}</button>,
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 {...props}>{children}</h3>
  ),
  Dialog: ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <DialogOpenContext.Provider value={onOpenChange ?? null}>
      <div>{children}</div>
    </DialogOpenContext.Provider>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  DialogTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => {
    const onOpenChange = React.useContext(DialogOpenContext);

    if (React.isValidElement<React.ButtonHTMLAttributes<HTMLButtonElement>>(children)) {
      const child = children;

      return React.cloneElement(child, {
        onClick: (event) => {
          child.props.onClick?.(event);
          onOpenChange?.(true);
        },
      });
    }

    return <button onClick={() => onOpenChange?.(true)}>{children}</button>;
  },
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children, htmlFor }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  Select: ({
    value = "",
    onValueChange = (_v: string) => {},
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: React.ReactNode;
  }) => <SelectCtx.Provider value={{ value, onValueChange }}>{children}</SelectCtx.Provider>,
  SelectTrigger: ({
    "aria-label": ariaLabel,
    id,
    children: _children,
  }: {
    "aria-label"?: string;
    id?: string;
    children?: React.ReactNode;
  }) => {
    const { value, onValueChange } = React.useContext(SelectCtx);
    return (
      <input
        role="combobox"
        id={id}
        aria-label={ariaLabel ?? id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        readOnly={false}
      />
    );
  },
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => {
    const { onValueChange } = React.useContext(SelectCtx);
    return (
      <span
        role="option"
        aria-selected={false}
        data-slot="select-item"
        onClick={() => onValueChange(value)}
      >
        {children}
      </span>
    );
  },
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => hoisted.mockUseSession(),
}));

vi.mock("../../hooks/use-org-settings", () => ({
  useOrgBilling: () => hoisted.mockUseOrgBilling(),
}));

vi.mock("../../hooks/use-restrictions", () => ({
  useRestrictionTerms: (...args: unknown[]) => hoisted.mockUseRestrictionTerms(...args),
  useRestrictionAlerts: (...args: unknown[]) => hoisted.mockUseRestrictionAlerts(...args),
  useCreateRestrictionTerm: () => hoisted.mockUseCreateRestrictionTerm(),
}));

describe("restriction components", () => {
  beforeEach(() => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "admin" });
    hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "growth" } });
    hoisted.mockUseRestrictionTerms.mockReturnValue({
      data: {
        data: [
          {
            id: "term-1",
            title: "Scholarship",
            restrictionType: "purpose_and_time",
            purposeStatement: "Scholarships",
            beginningBalanceCents: 10000,
            additionsCents: 2500,
            releasesCents: 1000,
            endingBalanceCents: 11500,
          },
        ],
      },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: {
        data: [{ id: "alert-1", label: "Missing support", alertType: "release_without_support" }],
      },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseCreateRestrictionTerm.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: "term-2" }),
      isPending: false,
    });
  });

  it("renders balance, alert, and evidence states", () => {
    render(
      <RestrictionBalanceCard
        beginningBalanceCents={100}
        additionsCents={50}
        releasesCents={25}
        endingBalanceCents={125}
      />,
    );
    expect(screen.getAllByText("$1").length).toBeGreaterThan(0);
    expect(screen.getByText("Current")).toBeInTheDocument();

    render(
      <RestrictionBalanceCard
        beginningBalanceCents={0}
        additionsCents={0}
        releasesCents={100}
        endingBalanceCents={-100}
      />,
    );
    expect(screen.getByText("At risk")).toBeInTheDocument();

    render(<RestrictionAlertList alerts={[]} />);
    expect(screen.getByText("No restriction lifecycle alerts.")).toBeInTheDocument();

    render(
      <RestrictionAlertList
        alerts={[{ id: "alert-1", label: "Missing support", alertType: "release_without_support" }]}
      />,
    );
    expect(screen.getByText("release without support")).toBeInTheDocument();

    render(
      <RestrictionEvidenceChecklist
        items={[
          { id: "a", label: "Invoice", linked: true },
          { id: "b", label: "Receipt", linked: false },
        ]}
      />,
    );
    expect(screen.getByText("Linked")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("submits term and release forms with normalized values", async () => {
    const onTerm = vi.fn();
    render(<RestrictionTermForm defaultGrantId="grant-1" onSubmit={onTerm} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Term" } });
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "  Education  " } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-06-30" } });
    fireEvent.change(screen.getByLabelText("Opening balance ($)"), { target: { value: "12.34" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save term" }).closest("form")!);
    expect(onTerm).toHaveBeenCalledWith(
      expect.objectContaining({
        grantId: "grant-1",
        fundId: undefined,
        purposeStatement: "Education",
        beginningBalanceCents: 1234,
      }),
    );

    const onRelease = vi.fn();
    render(<RestrictionReleaseForm availableBalanceCents={1000} onSubmit={onRelease} />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5.50" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-05-01" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Eligible spend" } });
    fireEvent.submit(screen.getByRole("button", { name: "Record release" }).closest("form")!);
    expect(onRelease).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 550, reason: "Eligible spend" }),
    );

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "20" } });
    fireEvent.submit(screen.getByRole("button", { name: "Record release" }).closest("form")!);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("submits unrestricted manual-fund terms and release defaults", () => {
    const onTerm = vi.fn();
    render(<RestrictionTermForm onSubmit={onTerm} />);
    fireEvent.change(screen.getByLabelText("Fund ID"), { target: { value: " fund-9 " } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Manual term" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "unrestricted" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save term" }).closest("form")!);

    expect(onTerm).toHaveBeenCalledWith(
      expect.objectContaining({
        fundId: "fund-9",
        title: "Manual term",
        restrictionType: "unrestricted",
        beginningBalanceCents: 0,
      }),
    );
    const submittedTerm = onTerm.mock.calls[0]?.[0];
    expect(submittedTerm).toBeDefined();
    expect(submittedTerm).toHaveProperty("purposeStatement", undefined);
    expect(submittedTerm).toHaveProperty("endDate", undefined);

    const onRelease = vi.fn();
    render(<RestrictionReleaseForm availableBalanceCents={100} onSubmit={onRelease} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-05-02" } });
    fireEvent.submit(screen.getByRole("button", { name: "Record release" }).closest("form")!);
    expect(onRelease).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a release amount greater than zero.")).toBeInTheDocument();

    const onDefaultFundTerm = vi.fn();
    const defaultFundRender = render(
      <RestrictionTermForm defaultFundId="fund-default" onSubmit={onDefaultFundTerm} />,
    );
    fireEvent.change(within(defaultFundRender.container).getByLabelText("Title"), {
      target: { value: "Default fund" },
    });
    fireEvent.submit(
      within(defaultFundRender.container)
        .getByRole("button", { name: "Save term" })
        .closest("form")!,
    );
    expect(onDefaultFundTerm).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: "fund-default" }),
    );
  });

  it("rejects blank reason and invalid release date before submit", () => {
    const onRelease = vi.fn();
    render(<RestrictionReleaseForm availableBalanceCents={1000} onSubmit={onRelease} />);

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    const dateInput = screen.getByLabelText("Date");
    dateInput.setAttribute("type", "text");
    fireEvent.change(dateInput, { target: { value: "not-a-date" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("button", { name: "Record release" }).closest("form")!);

    expect(onRelease).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid release date.")).toBeInTheDocument();
    expect(screen.getByText("Reason is required.")).toBeInTheDocument();
  });

  it("rejects malformed release amount before submit", () => {
    const onRelease = vi.fn();
    render(<RestrictionReleaseForm availableBalanceCents={10000} onSubmit={onRelease} />);

    const amountInput = screen.getByLabelText("Amount");
    amountInput.setAttribute("type", "text");
    fireEvent.change(amountInput, { target: { value: "0x10" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-05-02" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Eligible spend" } });
    fireEvent.submit(screen.getByRole("button", { name: "Record release" }).closest("form")!);

    expect(onRelease).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a release amount greater than zero.")).toBeInTheDocument();
  });

  it.each([
    ["zero", "0"],
    ["non-finite", "9".repeat(400)],
  ])("rejects %s release amount before submit", (_caseName, amount) => {
    const onRelease = vi.fn();
    render(<RestrictionReleaseForm availableBalanceCents={10000} onSubmit={onRelease} />);

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: amount } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-05-02" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Eligible spend" } });
    fireEvent.submit(screen.getByRole("button", { name: "Record release" }).closest("form")!);

    expect(onRelease).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a release amount greater than zero.")).toBeInTheDocument();
  });

  it("rejects blank release date before submit", () => {
    const onRelease = vi.fn();
    render(<RestrictionReleaseForm availableBalanceCents={1000} onSubmit={onRelease} />);

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Eligible spend" } });
    fireEvent.submit(screen.getByRole("button", { name: "Record release" }).closest("form")!);

    expect(onRelease).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid release date.")).toBeInTheDocument();
  });

  it("rejects normalized invalid calendar dates before submit", () => {
    const onRelease = vi.fn();
    render(<RestrictionReleaseForm availableBalanceCents={1000} onSubmit={onRelease} />);

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    const dateInput = screen.getByLabelText("Date");
    dateInput.setAttribute("type", "text");
    fireEvent.change(dateInput, { target: { value: "2026-02-31" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Eligible spend" } });
    fireEvent.submit(screen.getByRole("button", { name: "Record release" }).closest("form")!);

    expect(onRelease).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid release date.")).toBeInTheDocument();
  });

  it("rejects calendar dates that match the date shape but cannot parse", () => {
    const onRelease = vi.fn();
    render(<RestrictionReleaseForm availableBalanceCents={1000} onSubmit={onRelease} />);

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    const dateInput = screen.getByLabelText("Date");
    dateInput.setAttribute("type", "text");
    fireEvent.change(dateInput, { target: { value: "2026-13-01" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Eligible spend" } });
    fireEvent.submit(screen.getByRole("button", { name: "Record release" }).closest("form")!);

    expect(onRelease).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid release date.")).toBeInTheDocument();
  });

  it("treats missing amount and date form fields as blank values", () => {
    const onRelease = vi.fn();
    const { container } = render(
      <RestrictionReleaseForm availableBalanceCents={1000} onSubmit={onRelease} />,
    );

    screen.getByLabelText("Amount").removeAttribute("name");
    screen.getByLabelText("Date").removeAttribute("name");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Eligible spend" } });
    fireEvent.submit(container.querySelector("form")!);

    expect(onRelease).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a release amount greater than zero.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid release date.")).toBeInTheDocument();
  });

  it("rejects unknown restriction-type values from invalid select input", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onTerm = vi.fn();
    const { container } = render(<RestrictionTermForm defaultFundId="fund-x" onSubmit={onTerm} />);
    fireEvent.change(within(container).getByLabelText("Type"), {
      target: { value: "invalid_type" },
    });
    fireEvent.change(within(container).getByLabelText("Title"), { target: { value: "Term" } });
    fireEvent.submit(within(container).getByRole("button", { name: "Save term" }).closest("form")!);
    expect(onTerm).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("renders lifecycle data and creates terms", async () => {
    const mutation = vi.fn().mockResolvedValue({ id: "term-new" });
    hoisted.mockUseCreateRestrictionTerm.mockReturnValue({
      mutateAsync: mutation,
      isPending: false,
    });
    render(<RestrictionLifecyclePanel fundId="fund-1" title="Restrictions" />);

    expect(screen.getByRole("heading", { name: "Restrictions" })).toBeInTheDocument();
    expect(screen.getByText("Scholarship")).toBeInTheDocument();
    expect(screen.getByText("Missing support")).toBeInTheDocument();
    expect(hoisted.mockUseRestrictionTerms).toHaveBeenCalledWith(
      expect.objectContaining({ fundId: "fund-1" }),
      { enabled: true },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add restriction term" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New term" } });
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Program" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save term" }).closest("form")!);
    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ fundId: "fund-1" })),
    );
  });

  it("highlights a deep-linked restriction term", () => {
    render(<RestrictionLifecyclePanel fundId="fund-1" highlightTermId="term-1" />);

    expect(screen.getByTestId("restriction-term-term-1")).toHaveAttribute(
      "data-highlighted",
      "true",
    );
  });

  it("renders lifecycle controls for every paid tier regardless of billing data", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({ data: { planTier: "starter" } });

    render(<RestrictionLifecyclePanel grantId="grant-1" />);

    expect(screen.getByText("Scholarship")).toBeInTheDocument();
    expect(
      screen.queryByText("Restriction lifecycle is available on Growth"),
    ).not.toBeInTheDocument();
    expect(hoisted.mockUseRestrictionTerms).toHaveBeenLastCalledWith(
      expect.objectContaining({ grantId: "grant-1" }),
      { enabled: true },
    );
  });

  it("renders lifecycle controls while billing data is unavailable", () => {
    hoisted.mockUseOrgBilling.mockReturnValue({ data: undefined });

    render(<RestrictionLifecyclePanel />);

    expect(screen.getByText("Scholarship")).toBeInTheDocument();
    expect(
      screen.queryByText("Restriction lifecycle is available on Growth"),
    ).not.toBeInTheDocument();
    expect(hoisted.mockUseRestrictionTerms).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 50 }),
      { enabled: true },
    );
  });

  it("handles read-only members and fallback terms", () => {
    hoisted.mockUseSession.mockReturnValue({ memberRole: "auditor" });
    hoisted.mockUseRestrictionTerms.mockReturnValue({
      data: {
        data: [
          {
            id: "term-2",
            title: "No statement",
            restrictionType: "board_designated",
          },
        ],
      },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
    });

    render(<RestrictionLifecyclePanel />);

    expect(screen.queryByRole("button", { name: "Add restriction term" })).not.toBeInTheDocument();
    expect(screen.getByText("Restriction lifecycle")).toBeInTheDocument();
    expect(screen.getByText("No purpose statement recorded.")).toBeInTheDocument();
    expect(hoisted.mockUseRestrictionTerms).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 50 }),
      { enabled: true },
    );
  });

  it("uses explicit funds edit permission for lifecycle term creation", () => {
    hoisted.mockUseSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { funds: "edit" },
    });

    render(<RestrictionLifecyclePanel fundId="fund-1" />);

    expect(screen.getByRole("button", { name: "Add restriction term" })).toBeInTheDocument();
  });

  it("renders loading lifecycle data without empty-state noise", () => {
    hoisted.mockUseRestrictionTerms.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });

    render(<RestrictionLifecyclePanel />);

    expect(screen.getByText("Restriction lifecycle")).toBeInTheDocument();
    expect(screen.queryByText("No restriction terms recorded yet.")).not.toBeInTheDocument();
    expect(screen.getByText("No restriction lifecycle alerts.")).toBeInTheDocument();
  });

  it("shows lifecycle loading errors and create failures", async () => {
    hoisted.mockUseRestrictionTerms.mockReturnValue({
      data: { data: [] },
      isPending: false,
      isError: true,
    });
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: { data: [] },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseCreateRestrictionTerm.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Nope")),
      isPending: false,
    });
    render(<RestrictionLifecyclePanel fundId="fund-1" />);
    expect(screen.getByText("Unable to load restriction terms.")).toBeInTheDocument();
    expect(screen.getByText("No restriction terms recorded yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add restriction term" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Bad term" } });
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Program" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save term" }).closest("form")!);
    await screen.findByText("Nope");
  });

  it("uses the generic lifecycle create error for non-Error failures", async () => {
    hoisted.mockUseRestrictionTerms.mockReturnValue({
      data: { data: [] },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseRestrictionAlerts.mockReturnValue({
      data: { data: [] },
      isPending: false,
      isError: false,
    });
    hoisted.mockUseCreateRestrictionTerm.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue("failed"),
      isPending: false,
    });

    render(<RestrictionLifecyclePanel />);

    fireEvent.click(screen.getByRole("button", { name: "Add restriction term" }));
    fireEvent.change(screen.getByLabelText("Fund ID"), { target: { value: "fund-1" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Bad term" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save term" }).closest("form")!);

    await waitFor(() =>
      expect(screen.getAllByText("Unable to save restriction term.").length).toBeGreaterThan(0),
    );
  });

  it("creates lifecycle terms scoped to a grant", async () => {
    const mutation = vi.fn().mockResolvedValue({ id: "term-new" });
    hoisted.mockUseCreateRestrictionTerm.mockReturnValue({
      mutateAsync: mutation,
      isPending: false,
    });

    render(<RestrictionLifecyclePanel grantId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Add restriction term" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Grant term" } });
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Grant program" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save term" }).closest("form")!);

    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ grantId: "grant-1" })),
    );
  });
});
