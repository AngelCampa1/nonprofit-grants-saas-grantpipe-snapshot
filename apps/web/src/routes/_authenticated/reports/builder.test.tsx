import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSession = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/reports/builder" } }),
  Link: ({
    children,
    to,
    hash,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    to?: string;
    hash?: string;
    className?: string;
    [key: string]: unknown;
  }) => {
    let href = to ?? "";
    if (hash) {
      href = `${href}#${hash}`;
    }
    return (
      <a
        href={href}
        data-router-link="true"
        className={className}
        {...(rest as Record<string, unknown>)}
      >
        {children}
      </a>
    );
  },
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: mockUseSession,
}));

import { ReportBuilderPage } from "./builder";

const previewMutateAsync = vi.fn();
const createMutateAsync = vi.fn();
const runMutateAsync = vi.fn();
const useReportDefinitionsSpy = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({
  metadata: {
    data: {
      entities: {
        donors: {
          label: "Donors",
          columns: [{ id: "displayName", label: "Name" }],
          customFields: [],
        },
        donations: {
          label: "Donations",
          columns: [{ id: "amountCents", label: "Amount" }],
          customFields: [],
        },
        grants: {
          label: "Grants",
          columns: [
            { id: "name", label: "Name" },
            { id: "status", label: "Status" },
          ],
          customFields: [{ id: "field-1", entity: "grants", name: "Region", fieldType: "text" }],
        },
        funds: { label: "Funds", columns: [{ id: "name", label: "Name" }], customFields: [] },
      },
    },
    isPending: false,
    isError: false,
    isSuccess: true,
    isPlanGated: false,
    error: undefined as Error | undefined,
  },
  definitions: {
    data: [] as Array<{
      id: string;
      name: string;
      columns: string[];
      customFieldIds: string[];
    }>,
    isPending: false,
    isError: false,
  },
  previewPending: false,
  createPending: false,
  runPending: false,
}));

vi.mock("../../../hooks/use-report-builder", () => ({
  useReportBuilderMetadata: () => mockState.metadata,
  useReportDefinitions: (...args: unknown[]) => {
    useReportDefinitionsSpy(...args);
    return mockState.definitions;
  },
  useReportBuilderPreview: () => ({
    mutateAsync: previewMutateAsync,
    isPending: mockState.previewPending,
  }),
  useCreateReportDefinition: () => ({
    mutateAsync: createMutateAsync,
    isPending: mockState.createPending,
  }),
  useRunReportDefinition: () => ({ mutateAsync: runMutateAsync, isPending: mockState.runPending }),
}));

describe("ReportBuilderPage", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      memberRole: "admin",
      memberPermissions: null,
    });
    previewMutateAsync.mockReset();
    createMutateAsync.mockReset();
    runMutateAsync.mockReset();
    useReportDefinitionsSpy.mockClear();
    mockState.metadata.isError = false;
    mockState.metadata.isSuccess = true;
    mockState.metadata.isPlanGated = false;
    mockState.metadata.error = undefined;
    mockState.metadata.data = {
      entities: {
        donors: {
          label: "Donors",
          columns: [{ id: "displayName", label: "Name" }],
          customFields: [],
        },
        donations: {
          label: "Donations",
          columns: [{ id: "amountCents", label: "Amount" }],
          customFields: [],
        },
        grants: {
          label: "Grants",
          columns: [
            { id: "name", label: "Name" },
            { id: "status", label: "Status" },
          ],
          customFields: [{ id: "field-1", entity: "grants", name: "Region", fieldType: "text" }],
        },
        funds: {
          label: "Funds",
          columns: [{ id: "name", label: "Name" }],
          customFields: [],
        },
      },
    };
    mockState.definitions.data = [];
    mockState.definitions.isPending = false;
    mockState.previewPending = false;
    mockState.createPending = false;
    mockState.runPending = false;
    previewMutateAsync.mockResolvedValue({
      columns: [{ id: "name", label: "Name" }],
      rows: [{ name: "Youth Grant" }],
      totalRows: 1,
    });
    createMutateAsync.mockResolvedValue({ id: "definition-1" });
    runMutateAsync.mockResolvedValue({ id: "report-1" });
  });

  it("shows a guided builder with entity and column choices", () => {
    render(<ReportBuilderPage />);

    expect(screen.getByRole("heading", { name: "Report Builder" })).toBeInTheDocument();
    expect(screen.getByLabelText("Report name")).toHaveValue("Grant report");
    expect(screen.getByLabelText("Status")).toBeChecked();
    expect(screen.getByLabelText("Region")).toBeInTheDocument();
    // definitions fetch only after metadata confirms the plan allows it
    expect(useReportDefinitionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "grants" }),
      { enabled: true },
    );
  });

  it("previews, saves, and exports the selected report", async () => {
    const user = userEvent.setup();
    render(<ReportBuilderPage />);

    await user.click(screen.getByRole("button", { name: "Preview report" }));
    expect(await screen.findByText("Youth Grant")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save report" }));
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Grant report", entity: "grants" }),
    );

    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(runMutateAsync).toHaveBeenCalledWith({
      definitionId: "definition-1",
      title: "Grant report",
    });
  });

  it("loads saved reports and uses the selected definition for export", async () => {
    const user = userEvent.setup();
    mockState.definitions.data = [
      {
        id: "saved-1",
        name: "Saved grant report",
        columns: ["name"],
        customFieldIds: ["field-1"],
      },
      {
        id: "saved-2",
        name: "Wide grant report",
        columns: ["name", "status"],
        customFieldIds: [],
      },
    ];
    render(<ReportBuilderPage />);

    // Column counts pluralize correctly: singular for one, plural for many.
    expect(screen.getByText("1 column")).toBeInTheDocument();
    expect(screen.getByText("2 columns")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Saved grant report/ }));
    expect(screen.getByText("Saved report loaded.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(runMutateAsync).toHaveBeenCalledWith({
      definitionId: "saved-1",
      title: "Saved grant report",
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("shows loading, empty, disabled, and metadata error states", async () => {
    const user = userEvent.setup();
    mockState.definitions.isPending = true;
    mockState.metadata.isError = true;
    mockState.metadata.error = new Error("Metadata failed");
    render(<ReportBuilderPage />);

    expect(screen.getByText("Unable to load report builder.")).toBeInTheDocument();
    expect(screen.getByText("Metadata failed")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Report name"));
    expect(screen.getByRole("button", { name: "Preview report" })).toBeDisabled();
  });

  it("resets fields when the base record type changes", async () => {
    const user = userEvent.setup();
    render(<ReportBuilderPage />);

    await user.click(screen.getByRole("combobox", { name: "Base records" }));
    await user.click(await screen.findByRole("option", { name: "Donors" }));

    expect(screen.getByLabelText("Report name")).toHaveValue("Donor report");
    expect(screen.getByLabelText("Name")).toBeChecked();
    expect(screen.getByText("No custom fields for this record type yet.")).toBeInTheDocument();
  });

  it("handles column and custom field toggles plus preview and save failures", async () => {
    const user = userEvent.setup();
    previewMutateAsync.mockRejectedValueOnce("preview exploded");
    createMutateAsync.mockRejectedValueOnce(new Error("Save failed"));
    render(<ReportBuilderPage />);

    await user.click(screen.getByLabelText("Name"));
    await user.click(screen.getByLabelText("Status"));
    expect(screen.getByText("Choose at least one column.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview report" })).toBeDisabled();

    await user.click(screen.getByLabelText("Name"));
    await user.click(screen.getByLabelText("Region"));
    await user.click(screen.getByLabelText("Region"));
    await user.click(screen.getByRole("button", { name: "Preview report" }));
    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save report" }));
    expect(await screen.findByText("Save failed")).toBeInTheDocument();
  });

  it("auto-saves before export and shows export failures", async () => {
    const user = userEvent.setup();
    runMutateAsync.mockRejectedValueOnce(new Error("Export failed"));
    render(<ReportBuilderPage />);

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Grant report", entity: "grants" }),
    );
    expect(await screen.findByText("Export failed")).toBeInTheDocument();
  });

  it("shows fallback copy when metadata labels are missing", async () => {
    const user = userEvent.setup();
    mockState.metadata.data = {
      entities: {
        grants: {
          label: "Grants",
          columns: [{ id: "name", label: "Name" }],
          customFields: [],
        },
      },
    } as unknown as typeof mockState.metadata.data;
    previewMutateAsync.mockResolvedValueOnce({
      columns: [{ id: "name", label: "Name" }],
      rows: [{}],
      totalRows: 1,
    });
    render(<ReportBuilderPage />);

    await user.click(screen.getByRole("combobox", { name: "Base records" }));
    expect(await screen.findByRole("option", { name: "donors" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByText("Saved reports for grants will show here.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview report" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(document.querySelectorAll("td")).toHaveLength(1);
  });

  it("shows a calm plan gate instead of the builder when the plan is insufficient", () => {
    mockState.metadata.isPlanGated = true;
    mockState.metadata.isError = true;
    mockState.metadata.isSuccess = false;
    mockState.metadata.error = new Error("insufficient_plan");
    render(<ReportBuilderPage />);

    // the saved-definitions query must stay disabled so no forbidden call fires
    expect(useReportDefinitionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "grants" }),
      { enabled: false },
    );

    expect(screen.getByText("Enterprise plan required")).toBeInTheDocument();
    expect(
      screen.getByText("The Report Builder is on the Enterprise plan.", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByText("insufficient_plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to load report builder.")).not.toBeInTheDocument();
    const upgradeLink = screen.getByRole("link", { name: "Open billing settings" });
    expect(upgradeLink).toHaveAttribute("href", "/settings#billing");
    expect(upgradeLink).toHaveAttribute("data-router-link", "true");
    // builder controls are hidden while gated
    expect(screen.queryByLabelText("Report name")).not.toBeInTheDocument();
  });

  it("falls back when report builder metadata is unavailable", async () => {
    const user = userEvent.setup();
    mockState.metadata.data = undefined as unknown as typeof mockState.metadata.data;
    render(<ReportBuilderPage />);

    expect(
      screen.getByText("Saved reports for this record type will show here."),
    ).toBeInTheDocument();
    expect(screen.getByText("No fields available.")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Base records" }));
    expect(await screen.findByRole("option", { name: "donors" })).toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "donors" }));

    expect(screen.getByLabelText("Report name")).toHaveValue("Report report");
  });

  it("renders the Reports tab navigation after the page header", () => {
    render(<ReportBuilderPage />);

    const nav = screen.getByRole("navigation", { name: "Reports sections" });
    expect(nav).toBeInTheDocument();

    const links = within(nav).getAllByRole("link");
    const labels = links.map((link) => link.textContent);
    expect(labels).toContain("Overview");
    expect(labels).toContain("Builder");
    expect(labels).toContain("Drafts");
    expect(labels).toContain("Ask Ledger");
  });
});
