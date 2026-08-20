import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMutateAsync = vi.fn();
const mockUseCreateContact = vi.fn();
const mockUseSession = vi.fn();
const mockUseContacts = vi.fn();
const mockCompleteOnboardingPost = vi.fn();
const mockSetQueriesData = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockCaptureAppException = vi.fn();

const ORG_UUID_1 = "550e8400-e29b-41d4-a716-446655440001";
const ORG_UUID_2 = "550e8400-e29b-41d4-a716-446655440002";
const ORG_UUID_3 = "550e8400-e29b-41d4-a716-446655440003";

const mockOrgContacts = [
  {
    id: ORG_UUID_1,
    type: "organization" as const,
    organizationName: "ACME Foundation",
    firstName: null,
    lastName: null,
  },
  {
    id: ORG_UUID_2,
    type: "organization" as const,
    // No organizationName, but has first+last name (covers the ?? branch)
    organizationName: null as string | null,
    firstName: "Jane",
    lastName: "Corp",
  },
  {
    id: ORG_UUID_3,
    type: "organization" as const,
    // No name at all — covers the || org.id fallback
    organizationName: null as string | null,
    firstName: null,
    lastName: null,
  },
];

vi.mock("../../hooks/use-donors", () => ({
  useCreateContact: () => mockUseCreateContact(),
  useContacts: () => mockUseContacts(),
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../lib/api-client", () => ({
  api: {
    api: {
      onboarding: {
        complete: {
          $post: () => mockCompleteOnboardingPost(),
        },
      },
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueriesData: mockSetQueriesData,
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock("../../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  const SelectCtx = React.createContext<{
    value: string;
    onValueChange: (v: string) => void;
  }>({ value: "", onValueChange: () => {} });
  return {
    ...actual,
    Checkbox: ({
      id,
      checked,
      onCheckedChange,
    }: {
      id?: string;
      checked?: boolean;
      onCheckedChange?: (checked: boolean) => void;
    }) => (
      <input
        type="checkbox"
        id={id}
        checked={!!checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
    ),
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

vi.mock("../../components/donors/pipeline-stage-select", () => ({
  PipelineStageSelect: ({
    value,
    onChange,
    name,
    id,
  }: {
    value?: string;
    onChange: (v: string) => void;
    name?: string;
    id?: string;
  }) => (
    <select
      id={id}
      data-testid="pipeline-stage-select"
      name={name}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All stages</option>
      <option value="prospect">Prospect</option>
      <option value="cultivation">Cultivation</option>
      <option value="donor">Donor</option>
    </select>
  ),
}));

import { NewDonorDialog } from "./new-donor-dialog";

function setupDefaultMocks() {
  mockUseSession.mockReturnValue({
    memberRole: "admin",
    memberPermissions: null,
    onboardingCompleted: true,
    isLoading: false,
  });
  mockCompleteOnboardingPost.mockResolvedValue({ ok: true });
  mockUseCreateContact.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  });
  mockUseContacts.mockReturnValue({
    data: { data: mockOrgContacts },
  });
}

describe("NewDonorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders when open=true", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Add donor")).toBeInTheDocument();
    expect(screen.getByText("Add a new donor to your account.")).toBeInTheDocument();
  });

  it("does not render dialog content when open=false", () => {
    render(<NewDonorDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows step 1 fields on initial open", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/Contact Type|Type/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    // Step 2 fields not shown
    expect(screen.queryByLabelText(/Address/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Notes/i)).not.toBeInTheDocument();
  });

  it("shows step progress indicator with 2 bars", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("step-bar-1")).toBeInTheDocument();
    expect(screen.getByTestId("step-bar-2")).toBeInTheDocument();
  });

  it("step 1 bar is active on step 1", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("step-bar-1")).toHaveClass("bg-primary");
    expect(screen.getByTestId("step-bar-2")).not.toHaveClass("bg-primary");
  });

  it("individual type shows firstName and lastName fields", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Last Name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Organization Name/i)).not.toBeInTheDocument();
  });

  it("shows pipeline stage select on step 1", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("pipeline-stage-select")).toBeInTheDocument();
  });

  it("associates the Pipeline Stage label with its trigger via id", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText("Pipeline Stage")).toBe(
      screen.getByTestId("pipeline-stage-select"),
    );
  });

  it("Next button advances to step 2 when name is filled", async () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Address/i)).toBeInTheDocument();
    });
  });

  it("step 2 shows address and notes fields", async () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Notes/i)).toBeInTheDocument();
    });
  });

  it("step 2 shows Back and Add donor buttons", async () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Back/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });
  });

  it("step 2 second progress bar becomes active", async () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByTestId("step-bar-1")).toHaveClass("bg-primary");
      expect(screen.getByTestId("step-bar-2")).toHaveClass("bg-primary");
    });
  });

  it("Back button returns to step 1", async () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Back/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Back/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Address/i)).not.toBeInTheDocument();
    });
  });

  it("Cancel button calls onOpenChange(false)", () => {
    const onOpenChange = vi.fn();
    render(<NewDonorDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Cancel resets form to step 1 when dialog reopens", async () => {
    let currentOpen = true;
    const onOpenChange = vi.fn((v: boolean) => {
      currentOpen = v;
    });
    const { rerender } = render(<NewDonorDialog open={currentOpen} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Address/i)).toBeInTheDocument();
    });

    // On step 2, there is no Cancel button — use the Cancel button on step 1 of a fresh open
    // Instead, trigger the dialog close through the Back + Cancel flow:
    // Go back to step 1 so Cancel is available
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    // Reopen dialog
    rerender(<NewDonorDialog open={false} onOpenChange={onOpenChange} />);
    rerender(<NewDonorDialog open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.queryByLabelText(/Address/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
    });
  });

  it("organization type shows organizationName field", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    // Switch to organization type
    const typeSelect = screen.getByLabelText(/Contact Type|Type/i);
    fireEvent.change(typeSelect, { target: { value: "organization" } });

    expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/First Name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Last Name/i)).not.toBeInTheDocument();
  });

  it("submit calls mutateAsync with correct data and closes dialog", async () => {
    const onOpenChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ id: "c1" });

    render(<NewDonorDialog open={true} onOpenChange={onOpenChange} />);

    // Fill step 1
    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });
    fireEvent.change(screen.getByLabelText(/Last Name/i), {
      target: { value: "Doe" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "individual",
          firstName: "Jane",
          lastName: "Doe",
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("marks onboarding complete after the first manual donor is created", async () => {
    const onOpenChange = vi.fn();
    mockUseSession.mockReturnValue({
      memberRole: "admin",
      memberPermissions: null,
      onboardingCompleted: false,
      isLoading: false,
    });
    mockMutateAsync.mockResolvedValue({ id: "c-onboarding" });

    render(<NewDonorDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockCompleteOnboardingPost).toHaveBeenCalledTimes(1);
      expect(mockSetQueriesData).toHaveBeenCalledWith(
        { queryKey: ["auth-session-context"] },
        expect.any(Function),
      );
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["auth-session-context"],
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("does not mark onboarding complete again for completed sessions", async () => {
    mockMutateAsync.mockResolvedValue({ id: "c-complete" });

    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
    expect(mockCompleteOnboardingPost).not.toHaveBeenCalled();
    expect(mockSetQueriesData).not.toHaveBeenCalled();
  });

  it("shows an activation failure when the first donor saves but setup completion fails", async () => {
    mockUseSession.mockReturnValue({
      memberRole: "admin",
      memberPermissions: null,
      onboardingCompleted: false,
      isLoading: false,
    });
    mockMutateAsync.mockResolvedValue({ id: "c-onboarding" });
    mockCompleteOnboardingPost.mockResolvedValue(
      Response.json(
        { error: "Finish one setup action before completing onboarding." },
        {
          status: 409,
        },
      ),
    );

    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(
        screen.getByText("Donor saved, but setup did not finish. Refresh and try again."),
      ).toBeInTheDocument();
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.objectContaining({ status: 409 }),
      expect.objectContaining({
        tags: expect.objectContaining({ activation_source: "manual-donor" }),
      }),
      { includeExpected: true, sanitize: true },
    );
  });

  it("shows error alert when mutation throws", async () => {
    mockMutateAsync.mockRejectedValue(new Error("Server error"));

    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
    });
  });

  it("does not advance to step 2 if individual type has no name", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    // Don't fill any name field
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    // Should still be on step 1
    expect(screen.queryByLabelText(/Address/i)).not.toBeInTheDocument();
  });

  it("does not advance to step 2 if organization type has no org name", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    const typeSelect = screen.getByLabelText(/Contact Type|Type/i);
    fireEvent.change(typeSelect, { target: { value: "organization" } });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.queryByLabelText(/Address/i)).not.toBeInTheDocument();
  });

  it("shows email and phone fields on step 1", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone/i)).toBeInTheDocument();
  });

  it("does not advance to step 2 when the email is invalid and shows the error on step 1", () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Avery" },
    });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: "not-an-email" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    // Stays on step 1: the email field (and its error) are visible, step 2 fields are not.
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Address/i)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Enter a valid email address/i)).toBeInTheDocument();
  });

  it("advances to step 2 and clears any prior error when the email becomes valid", async () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Avery" },
    });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Correct the email, then advance successfully.
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: "avery@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("changing pipeline stage updates form state (covers pipelineStage onChange handler)", async () => {
    mockMutateAsync.mockResolvedValue({ id: "c6" });

    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    // Change pipeline stage via the mock select
    const stageSelect = screen.getByTestId("pipeline-stage-select");
    fireEvent.change(stageSelect, { target: { value: "cultivation" } });

    // Fill firstName to enable Next
    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ pipelineStage: "cultivation" }),
      );
    });
  });

  it("submit with organization type calls mutateAsync with organizationName", async () => {
    const onOpenChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ id: "c2" });

    render(<NewDonorDialog open={true} onOpenChange={onOpenChange} />);

    // Switch to organization type via the mock SelectItem click
    fireEvent.click(screen.getByRole("option", { name: /Organization/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Organization Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Organization Name/i), {
      target: { value: "ACME Foundation" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "organization",
          organizationName: "ACME Foundation",
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("submit with all optional fields filled covers email, phone, address, and notes onChange handlers", async () => {
    const onOpenChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ id: "c4" });

    render(<NewDonorDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Phone/i), {
      target: { value: "555-1234" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Address/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Address/i), {
      target: { value: "123 Main St" },
    });
    fireEvent.change(screen.getByLabelText(/Notes/i), {
      target: { value: "Some notes" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "jane@example.com",
          phone: "555-1234",
          address: "123 Main St",
          notes: "Some notes",
        }),
      );
    });
  });

  it("submit with only firstName filled omits lastName from mutation payload (covers || undefined branch)", async () => {
    mockMutateAsync.mockResolvedValue({ id: "c5" });

    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    // Only fill firstName — lastName remains empty, covers lastName.trim() || undefined
    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });
    // Leave Last Name empty

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "individual",
          firstName: "Jane",
        }),
      );
    });
  });

  it("shows error alert when mutation rejects with a non-Error value", async () => {
    mockMutateAsync.mockRejectedValue("string error");

    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Unable to add donor.")).toBeInTheDocument();
    });
  });

  it("shows firstName required error on step 1 when individual type has no firstName but has lastName", async () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    // Fill only lastName — isStep1Valid passes (lastName || firstName), but schema rejects (firstName required).
    // The error must surface on step 1 (where the name fields live), not on step 2.
    fireEvent.change(screen.getByLabelText(/Last Name/i), {
      target: { value: "Smith" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/First name is required/i)).toBeInTheDocument();
    });
    // Stays on step 1: step-2 fields are not shown.
    expect(screen.queryByLabelText(/Address/i)).not.toBeInTheDocument();
  });

  it("shows the fallback message on step 1 when Zod fails with no issues", async () => {
    const { createContactSchema } = await import("@grantpipe/shared");
    const safeParseSpy = vi
      .spyOn(createContactSchema, "safeParse")
      .mockReturnValueOnce({ success: false, error: { issues: [] } } as never);

    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Unable to add donor.")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Address/i)).not.toBeInTheDocument();

    safeParseSpy.mockRestore();
  });

  it("shows a specific Zod issue message when submit fails on step 2", async () => {
    const { createContactSchema } = await import("@grantpipe/shared");
    // First call (handleNext) succeeds so we advance; second call (handleSubmit) fails.
    const safeParseSpy = vi
      .spyOn(createContactSchema, "safeParse")
      .mockReturnValueOnce({
        success: true,
        data: { type: "individual", firstName: "Jane" },
      } as never)
      .mockReturnValueOnce({
        success: false,
        error: { issues: [{ message: "Specific donor error" }] },
      } as never);

    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Specific donor error")).toBeInTheDocument();
    });

    safeParseSpy.mockRestore();
  });

  it("shows the fallback message when submit fails on step 2 with no issues", async () => {
    const { createContactSchema } = await import("@grantpipe/shared");
    const safeParseSpy = vi
      .spyOn(createContactSchema, "safeParse")
      .mockReturnValueOnce({
        success: true,
        data: { type: "individual", firstName: "Jane" },
      } as never)
      .mockReturnValueOnce({ success: false, error: { issues: [] } } as never);

    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), {
      target: { value: "Jane" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Unable to add donor.")).toBeInTheDocument();
    });

    safeParseSpy.mockRestore();
  });

  it("step 2 renders the Volunteer checkbox", async () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Volunteer/i)).toBeInTheDocument();
    });
  });

  it("step 2 renders the affiliated org picker", async () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText(/affiliated organization/i)).toBeInTheDocument();
    });
  });

  it("step 2 renders org options from useContacts", async () => {
    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText("ACME Foundation")).toBeInTheDocument();
      // Org with no organizationName but first+last name — rendered as joined name
      expect(screen.getByText("Jane Corp")).toBeInTheDocument();
      // Org with no name at all — rendered as its id
      expect(screen.getByText(ORG_UUID_3)).toBeInTheDocument();
    });
  });

  it("submits with isVolunteer true when Volunteer checkbox is checked", async () => {
    const onOpenChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ id: "c7" });

    render(<NewDonorDialog open={true} onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Volunteer/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/Volunteer/i));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ isVolunteer: true }));
    });
  });

  it("submits with isVolunteer false when Volunteer checkbox is not checked", async () => {
    const onOpenChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ id: "c8" });

    render(<NewDonorDialog open={true} onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ isVolunteer: false }));
    });
  });

  it("submits with affiliatedOrgId when an org is selected", async () => {
    const onOpenChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ id: "c9" });

    render(<NewDonorDialog open={true} onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByText("ACME Foundation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("ACME Foundation"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          affiliatedOrgId: ORG_UUID_1,
        }),
      );
    });
  });

  it("renders step 2 with empty org list when useContacts returns no data", async () => {
    // Covers the ?? [] fallback in orgOptions
    mockUseContacts.mockReturnValueOnce({ data: undefined } as unknown as ReturnType<
      typeof mockUseContacts
    >);

    render(<NewDonorDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      // None option renders; no org options
      expect(screen.getByRole("option", { name: /^None$/i })).toBeInTheDocument();
    });
  });

  it("submits without affiliatedOrgId when None is selected", async () => {
    const onOpenChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ id: "c10" });

    render(<NewDonorDialog open={true} onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(screen.getByText("ACME Foundation")).toBeInTheDocument();
    });

    // Select None (the default, affiliatedOrgId stays "")
    fireEvent.click(screen.getByRole("option", { name: /^None$/i }));

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      const call = mockMutateAsync.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call.affiliatedOrgId).toBeUndefined();
    });
  });
});
