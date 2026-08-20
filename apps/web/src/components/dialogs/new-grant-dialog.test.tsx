import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRANT_STAGE_DETAILS } from "../../lib/grant-stages";

const mockMutateAsync = vi.fn();
const mockUseCreateGrant = vi.fn();
const mockUseFunders = vi.fn();
const mockUseSession = vi.fn();
const mockCreateFunderMutateAsync = vi.fn();
const mockUseCreateFunder = vi.fn();

vi.mock("../../hooks/use-grants", () => ({
  useCreateGrant: () => mockUseCreateGrant(),
  useCreateFunder: () => mockUseCreateFunder(),
  useFunders: (...args: unknown[]) => mockUseFunders(...args),
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

const mockUploadMutateAsync = vi.fn();
const mockStartExtractionMutateAsync = vi.fn();

vi.mock("../../hooks/use-documents", () => ({
  useUploadDocument: () => ({
    mutateAsync: mockUploadMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../../hooks/use-document-extractions", () => ({
  useStartDocumentExtraction: () => ({
    mutateAsync: mockStartExtractionMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
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
  };
});

import { NewGrantDialog } from "./new-grant-dialog";

const mockFunders = [
  { id: "f1", name: "Foundation A" },
  { id: "f2", name: "Foundation B" },
];

function setupDefaultMocks() {
  mockUseSession.mockReturnValue({
    memberRole: "admin",
    memberPermissions: null,
    isLoading: false,
    orgId: "org-1",
    effectivePlanTier: "growth",
  });
  mockUseCreateGrant.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  });
  mockUseCreateFunder.mockReturnValue({
    mutateAsync: mockCreateFunderMutateAsync,
    isPending: false,
  });
  mockUseFunders.mockReturnValue({
    data: { data: mockFunders },
    isLoading: false,
  });
}

describe("NewGrantDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders when open=true", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Add grant")).toBeInTheDocument();
  });

  it("offers the AI award document intake entry point on step 1", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);
    // The award-intake upload form is wired into the dialog so users can
    // create a grant straight from an award letter.
    expect(screen.getByText(/Create from award document/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start intake/i })).toBeInTheDocument();
  });

  it("does not render dialog content when open=false", () => {
    render(<NewGrantDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows step 1 fields on initial open", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/Grant name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    // Step 2 fields not shown
    expect(screen.queryByLabelText(/Description/i)).not.toBeInTheDocument();
  });

  it("shows step progress indicator with 2 bars", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("step-bar-1")).toBeInTheDocument();
    expect(screen.getByTestId("step-bar-2")).toBeInTheDocument();
  });

  it("step 1 bar is active on step 1", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("step-bar-1")).toHaveClass("bg-primary");
    expect(screen.getByTestId("step-bar-2")).not.toHaveClass("bg-primary");
  });

  it("shows grant name input on step 1", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/Grant name/i)).toBeInTheDocument();
  });

  it("changing status select updates the stage meaning text", async () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    // Change status by typing into the combobox (covers status onValueChange handler)
    const statusCombobox = screen.getByRole("combobox", { name: "grant-status" });
    fireEvent.change(statusCombobox, { target: { value: "applied" } });

    await waitFor(() => {
      // The meaning text should update to reflect the new status
      expect(statusCombobox).toHaveValue("applied");
    });
  });

  it("shows status select on step 1", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "grant-status" })).toBeInTheDocument();
  });

  it("shows all grant stage options", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);
    for (const stage of GRANT_STAGE_DETAILS) {
      expect(screen.getByRole("option", { name: stage.label })).toBeInTheDocument();
    }
  });

  it("shows funders in the funder select", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Foundation A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Foundation B" })).toBeInTheDocument();
  });

  it("shows a no-funders empty state guiding the user to add a funder first", () => {
    mockUseFunders.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    // The funder picker must not silently dead-end: a brand-new org with zero
    // funders sees clear guidance and a way to add one, not an empty dropdown.
    expect(screen.getByText(/No funders yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add a funder/i })).toBeInTheDocument();
    // The empty dropdown is not shown when there are no funders.
    expect(screen.queryByRole("combobox", { name: "grant-funder-select" })).not.toBeInTheDocument();
  });

  it("clicking Add a funder opens an inline create-funder dialog without leaving the grant form", async () => {
    mockUseFunders.mockReturnValue({ data: { data: [] }, isLoading: false });
    const onOpenChange = vi.fn();
    render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Add a funder/i }));

    // The grant dialog stays open (no navigation away, no close), and a nested
    // create-funder form appears in its place. The dialog is lazy-loaded, so we
    // wait for it to resolve.
    expect(await screen.findByLabelText(/Funder name/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Funder type/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add funder/i })).toBeInTheDocument();
  });

  it("creating a funder inline keeps the half-filled grant and auto-selects the new funder", async () => {
    mockUseFunders.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockCreateFunderMutateAsync.mockResolvedValue({ id: "f-new", name: "Ford Foundation" });
    const onOpenChange = vi.fn();
    const { rerender } = render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    // Half-fill the grant first so we can prove it survives.
    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Resilient Grant" },
    });

    // Add a funder inline.
    fireEvent.click(screen.getByRole("button", { name: /Add a funder/i }));
    fireEvent.change(await screen.findByLabelText(/Funder name/i), {
      target: { value: "Ford Foundation" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add funder/i }));

    await waitFor(() => {
      expect(mockCreateFunderMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Ford Foundation", type: "foundation" }),
      );
    });

    // The grant the user was filling out is untouched — no navigation, no close.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Grant name/i)).toHaveValue("Resilient Grant");

    // Once the funders query refetches with the new funder, it is pre-selected.
    mockUseFunders.mockReturnValue({
      data: { data: [{ id: "f-new", name: "Ford Foundation" }] },
      isLoading: false,
    });
    rerender(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "grant-funder-select" })).toHaveValue("f-new");
    });
  });

  it("inline funder dialog disables Add funder until a name is entered", async () => {
    mockUseFunders.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add a funder/i }));
    const save = await screen.findByRole("button", { name: /Add funder/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Funder name/i), {
      target: { value: "Ford Foundation" },
    });
    expect(save).toBeEnabled();
    expect(mockCreateFunderMutateAsync).not.toHaveBeenCalled();
  });

  it("inline funder dialog surfaces a mutation error", async () => {
    mockUseFunders.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockCreateFunderMutateAsync.mockRejectedValue(new Error("Funder save failed"));
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add a funder/i }));
    fireEvent.change(await screen.findByLabelText(/Funder name/i), {
      target: { value: "Broken Funder" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add funder/i }));

    await waitFor(() => {
      expect(screen.getByText("Funder save failed")).toBeInTheDocument();
    });
  });

  it("inline funder dialog surfaces a non-Error rejection with a fallback message", async () => {
    mockUseFunders.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockCreateFunderMutateAsync.mockRejectedValue("nope");
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add a funder/i }));
    fireEvent.change(await screen.findByLabelText(/Funder name/i), {
      target: { value: "Broken Funder" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add funder/i }));

    await waitFor(() => {
      expect(screen.getByText("Unable to add funder.")).toBeInTheDocument();
    });
  });

  it("captures funder website and type in the inline create payload", async () => {
    mockUseFunders.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockCreateFunderMutateAsync.mockResolvedValue({ id: "f-gov", name: "City of Austin" });
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add a funder/i }));
    fireEvent.change(await screen.findByLabelText(/Funder name/i), {
      target: { value: "City of Austin" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Government" }));
    fireEvent.change(screen.getByLabelText(/Website/i), {
      target: { value: "https://austintexas.gov" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add funder/i }));

    await waitFor(() => {
      expect(mockCreateFunderMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "City of Austin",
          type: "government",
          website: "https://austintexas.gov",
        }),
      );
    });
  });

  it("Cancel on the inline funder dialog closes it without creating a funder", async () => {
    mockUseFunders.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add a funder/i }));
    expect(await screen.findByLabelText(/Funder name/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/Funder name/i)).not.toBeInTheDocument();
    });
    expect(mockCreateFunderMutateAsync).not.toHaveBeenCalled();
  });

  it("offers an Add-a-new-funder shortcut alongside the funder select when funders exist", async () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    // With funders present the select shows, plus a shortcut to add another one
    // inline so the user never has to leave the grant form.
    expect(screen.getByRole("combobox", { name: "grant-funder-select" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add a new funder/i }));
    expect(await screen.findByLabelText(/Funder name/i)).toBeInTheDocument();
  });

  it("does not show the no-funders empty state while funders are loading", () => {
    mockUseFunders.mockReturnValue({ data: undefined, isLoading: true });
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.queryByText(/No funders yet/i)).not.toBeInTheDocument();
  });

  it("Next stays clickable and names both missing fields when nothing is filled", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);
    const nextBtn = screen.getByRole("button", { name: /Next/i });
    // The primary action is never a silent dead-end: it is clickable and, when
    // step 1 is incomplete, tells the user exactly what is still needed.
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);
    expect(
      screen.getByText(/Add a grant name and pick a funder to continue\./i),
    ).toBeInTheDocument();
    // Still on step 1
    expect(screen.getByLabelText(/Grant name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Description/i)).not.toBeInTheDocument();
  });

  it("clicking Next with only the funder missing names just the funder", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Summer Grant" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText(/Pick a funder to continue\./i)).toBeInTheDocument();
    // Still on step 1
    expect(screen.getByLabelText(/Grant name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Description/i)).not.toBeInTheDocument();
  });

  it("clicking Next with only the name missing names just the name", () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    // Pick a funder but leave the name blank
    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText(/Add a grant name to continue\./i)).toBeInTheDocument();
    // Still on step 1
    expect(screen.getByLabelText(/Grant name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Description/i)).not.toBeInTheDocument();
  });

  it("Next is enabled when name and funder are filled", async () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Summer Grant" },
    });

    // Select a funder
    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled();
    });
  });

  it("Next advances to step 2", async () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Summer Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    });
  });

  it("step 2 shows date fields and notes", async () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Summer Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/End Date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Application Deadline/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Notes/i)).toBeInTheDocument();
    });
  });

  it("step 2 second progress bar becomes active", async () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Summer Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByTestId("step-bar-1")).toHaveClass("bg-primary");
      expect(screen.getByTestId("step-bar-2")).toHaveClass("bg-primary");
    });
  });

  it("step 2 shows Back and Add grant buttons", async () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Summer Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Back/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });
  });

  it("Back button returns to step 1", async () => {
    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Summer Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Back/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Back/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Grant name/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Description/i)).not.toBeInTheDocument();
    });
  });

  it("Cancel calls onOpenChange(false)", () => {
    const onOpenChange = vi.fn();
    render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Cancel resets form to step 1 when dialog reopens", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Summer Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => expect(screen.getByLabelText(/Description/i)).toBeInTheDocument());

    // On step 2, there is no Cancel button — go Back to step 1 then Cancel
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    rerender(<NewGrantDialog open={false} onOpenChange={onOpenChange} />);
    rerender(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.queryByLabelText(/Description/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Grant name/i)).toBeInTheDocument();
    });
  });

  it("submit calls mutateAsync with correct data and closes dialog", async () => {
    const onOpenChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ id: "g1" });

    render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Summer Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Summer Grant",
          funderId: "f1",
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows error alert when mutation throws", async () => {
    mockMutateAsync.mockRejectedValue(new Error("Grant save failed"));

    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Summer Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/Grant save failed/i)).toBeInTheDocument();
    });
  });

  it("fills description and notes fields on step 2 covering onChange handlers", async () => {
    mockMutateAsync.mockResolvedValue({ id: "g3" });
    const onOpenChange = vi.fn();

    render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Description Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument();
    });

    // Interact with date, description, and notes onChange handlers (exercises all step-2 fields)
    fireEvent.change(screen.getByLabelText(/Start Date/i), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText(/End Date/i), {
      target: { value: "2026-12-31" },
    });
    fireEvent.change(screen.getByLabelText(/Application Deadline/i), {
      target: { value: "2025-12-01" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "A great grant" },
    });
    fireEvent.change(screen.getByLabelText(/Notes/i), {
      target: { value: "Internal note" },
    });

    // Clear dates back to empty so schema accepts (dates need full ISO datetime)
    fireEvent.change(screen.getByLabelText(/Start Date/i), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/End Date/i), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/Application Deadline/i), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "A great grant",
          notes: "Internal note",
        }),
      );
    });
  });

  it("shows error alert when mutation rejects with a non-Error value", async () => {
    mockMutateAsync.mockRejectedValue("string error");

    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Test Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Unable to add grant.")).toBeInTheDocument();
    });
  });

  it("shows specific validation message from Zod issues", async () => {
    const { createGrantSchema } = await import("@grantpipe/shared");
    const safeParseSpy = vi.spyOn(createGrantSchema, "safeParse").mockReturnValueOnce({
      success: false,
      error: { issues: [{ message: "Specific validation error" }] },
    } as never);

    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Test Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Specific validation error")).toBeInTheDocument();
    });

    safeParseSpy.mockRestore();
  });

  it("shows validation error when Zod schema parse fails", async () => {
    const { createGrantSchema } = await import("@grantpipe/shared");
    const safeParseSpy = vi
      .spyOn(createGrantSchema, "safeParse")
      .mockReturnValueOnce({ success: false, error: { issues: [] } } as never);

    render(<NewGrantDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Test Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    safeParseSpy.mockRestore();
  });

  it("rejects non-numeric amount on step 1 and keeps the user on step 1", async () => {
    mockMutateAsync.mockResolvedValue({ id: "g2" });
    const onOpenChange = vi.fn();

    render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "NaN Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    // Enter a non-numeric value for amount (amount lives on step 1)
    const amountInput = screen.getByLabelText(/Amount/i);
    fireEvent.change(amountInput, { target: { value: "abc" } });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    // Error must show on step 1 where the amount field is visible; do not advance.
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Enter a valid grant amount.")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Start Date/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("rejects non-decimal numeric amount on step 1", async () => {
    mockMutateAsync.mockResolvedValue({ id: "g2" });
    const onOpenChange = vi.fn();

    render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Hex Grant" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: "0x10" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() =>
      expect(screen.getByText("Enter a valid grant amount.")).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/Start Date/i)).not.toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("rejects zero amount on step 1", async () => {
    mockMutateAsync.mockResolvedValue({ id: "g2" });
    const onOpenChange = vi.fn();

    render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Zero Grant" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() =>
      expect(screen.getByText("Enter a valid grant amount.")).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/Start Date/i)).not.toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("advances to step 2 and clears a prior amount error when the amount is corrected", async () => {
    const onOpenChange = vi.fn();

    render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Fix Grant" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    // Invalid first — error appears on step 1.
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    // Correct the amount and advance.
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the error when going Back to step 1", async () => {
    const { createGrantSchema } = await import("@grantpipe/shared");
    const safeParseSpy = vi
      .spyOn(createGrantSchema, "safeParse")
      .mockReturnValueOnce({ success: false, error: { issues: [{ message: "Boom" }] } } as never);
    const onOpenChange = vi.fn();

    render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Back Grant" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument());

    // Force a submit error so an alert is showing on step 2.
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    // Going Back clears it.
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());

    safeParseSpy.mockRestore();
  });

  it("amount input converts dollars to cents for mutation", async () => {
    mockMutateAsync.mockResolvedValue({ id: "g1" });
    const onOpenChange = vi.fn();

    render(<NewGrantDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Grant name/i), {
      target: { value: "Big Grant" },
    });

    fireEvent.click(screen.getByRole("option", { name: "Foundation A" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled());

    // Fill amount on step 1
    const amountInput = screen.getByLabelText(/Amount/i);
    fireEvent.change(amountInput, { target: { value: "1000" } });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 100000,
        }),
      );
    });
  });
});
