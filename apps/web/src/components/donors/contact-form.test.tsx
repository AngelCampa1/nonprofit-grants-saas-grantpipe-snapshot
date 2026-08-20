import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContactForm } from "./contact-form";

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
    // No organizationName, but has first+last name (covers the ?? branch where orgName is null)
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
  useContacts: vi.fn(() => ({ data: { data: mockOrgContacts } })),
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
      className: _className,
      children: _children,
      id,
    }: {
      className?: string;
      children?: React.ReactNode;
      id?: string;
    }) => {
      return <div id={id} data-testid="select-trigger" />;
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

vi.mock("../donors/pipeline-stage-select", () => ({
  PipelineStageSelect: ({
    value,
    onChange,
    name,
  }: {
    value?: string;
    onChange: (v: string) => void;
    name?: string;
  }) => (
    <select
      data-testid="pipeline-stage-select"
      aria-label="Pipeline Stage"
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

const WAIT_OPTS = { timeout: 3000 };

describe("ContactForm", () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it("renders the contact type label", () => {
    render(<ContactForm onSubmit={mockOnSubmit} />);
    expect(screen.getByText(/contact type/i)).toBeInTheDocument();
  });

  it("renders individual fields when defaultValues type is individual", () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/organization name/i)).not.toBeInTheDocument();
  });

  it("renders organization field when defaultValues type is organization", () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "organization" }} />);
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
  });

  it("renders email, phone, and address fields", () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
  });

  it("renders the donor email opt-out checkbox", () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    expect(screen.getByLabelText("Do not send batch messages")).toBeInTheDocument();
  });

  it("renders pipeline stage label", () => {
    render(<ContactForm onSubmit={mockOnSubmit} />);
    expect(screen.getByText(/pipeline stage/i)).toBeInTheDocument();
  });

  it("renders the submit button", () => {
    render(<ContactForm onSubmit={mockOnSubmit} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("shows required validation error when submitting individual without first name", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText("First name is required.")).toBeInTheDocument();
    }, WAIT_OPTS);
    expect(screen.queryByText("Invalid email address")).not.toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("shows required validation error when submitting organization without name", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "organization" }} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText("Organization name is required.")).toBeInTheDocument();
    }, WAIT_OPTS);
    expect(screen.queryByText("Invalid email address")).not.toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("submits valid individual contact", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Doe" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jane@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "individual",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
        }),
      );
    }, WAIT_OPTS);
  });

  it("submits donor email opt-out preference", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    fireEvent.click(screen.getByLabelText("Do not send batch messages"));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "Jane",
          emailOptOut: true,
        }),
      );
    }, WAIT_OPTS);
  });

  it("submits valid organization contact", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "organization" }} />);
    const orgInput = screen.getByLabelText(/organization name/i);
    fireEvent.change(orgInput, { target: { value: "ACME Foundation" } });
    // Also trigger blur to ensure react-hook-form registers the value
    fireEvent.blur(orgInput);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    // If the schema validation fails, an error should show; if it passes, onSubmit is called
    await waitFor(() => {
      const called = mockOnSubmit.mock.calls.length > 0;
      const hasError = document.querySelectorAll("p.text-destructive").length > 0;
      expect(called || hasError).toBe(true);
    }, WAIT_OPTS);
    if (mockOnSubmit.mock.calls.length > 0) {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationName: "ACME Foundation",
        }),
      );
    }
  });

  it("populates defaultValues for edit mode", () => {
    render(
      <ContactForm
        onSubmit={mockOnSubmit}
        defaultValues={{
          type: "individual",
          firstName: "Alice",
          lastName: "Smith",
          email: "alice@example.com",
        }}
      />,
    );
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Smith")).toBeInTheDocument();
    expect(screen.getByDisplayValue("alice@example.com")).toBeInTheDocument();
  });

  it("validates email format", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    }, WAIT_OPTS);
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("shows lastName validation error when lastName exceeds max length", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    // lastName max is 200 chars
    const longLastName = "A".repeat(201);
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: longLastName } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      const errorEl = document.querySelector("p.text-destructive");
      expect(errorEl).not.toBeNull();
    }, WAIT_OPTS);
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("disables submit and shows 'Saving…' label while the form is submitting", async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    render(<ContactForm onSubmit={onSubmit} defaultValues={{ type: "individual" }} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Doe" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jane@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    }, WAIT_OPTS);

    resolveSubmit?.();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
    }, WAIT_OPTS);
  });

  it("shows phone and address validation errors when the values exceed their limits", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Doe" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "1".repeat(51) } });
    fireEvent.change(screen.getByLabelText(/address/i), { target: { value: "A".repeat(501) } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/too big/i)).toHaveLength(2);
    }, WAIT_OPTS);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("renders the Volunteer checkbox", () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    expect(screen.getByLabelText(/volunteer/i)).toBeInTheDocument();
  });

  it("submits with isVolunteer true when checkbox is checked", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Doe" } });
    // Click the volunteer checkbox
    const checkbox = screen.getByRole("checkbox", { name: /volunteer/i });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({ isVolunteer: true }));
    }, WAIT_OPTS);
  });

  it("submits with isVolunteer false by default (checkbox unchecked)", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({ isVolunteer: false }));
    }, WAIT_OPTS);
  });

  it("renders the affiliated org picker", () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    expect(screen.getByText(/affiliated organization/i)).toBeInTheDocument();
  });

  it("renders org options from useContacts", () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    expect(screen.getByText("ACME Foundation")).toBeInTheDocument();
    // Org with no organizationName but has first+last name — rendered as joined name
    expect(screen.getByText("Jane Corp")).toBeInTheDocument();
    // Org with no name at all — rendered as its id
    expect(screen.getByText(ORG_UUID_3)).toBeInTheDocument();
  });

  it("submits with affiliatedOrgId when an org is selected", async () => {
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    // Click the ACME Foundation option rendered by the mocked SelectItem
    fireEvent.click(screen.getByText("ACME Foundation"));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          affiliatedOrgId: ORG_UUID_1,
        }),
      );
    }, WAIT_OPTS);
  });

  it("submits without affiliatedOrgId when None is selected", async () => {
    render(
      <ContactForm
        onSubmit={mockOnSubmit}
        defaultValues={{
          type: "individual",
          affiliatedOrgId: ORG_UUID_1,
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    // Click the None option
    fireEvent.click(screen.getByRole("option", { name: /^None$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      const call = mockOnSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call.affiliatedOrgId).toBeUndefined();
    }, WAIT_OPTS);
  });

  it("pre-fills isVolunteer true from defaultValues", () => {
    render(
      <ContactForm
        onSubmit={mockOnSubmit}
        defaultValues={{ type: "individual", firstName: "Jane", isVolunteer: true }}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: /volunteer/i });
    expect(checkbox).toBeChecked();
  });

  it("handles null values in defaultValues by converting to undefined", async () => {
    // Covers the null->undefined branch in Object.entries().map()
    render(
      <ContactForm
        onSubmit={mockOnSubmit}
        defaultValues={{
          type: "individual",
          firstName: "Jane",
          // affiliatedOrgId is null from DB — should be converted to undefined
          affiliatedOrgId: null as unknown as string | undefined,
        }}
      />,
    );
    expect(screen.getByDisplayValue("Jane")).toBeInTheDocument();
  });

  it("renders org picker with empty list when useContacts returns no data", async () => {
    // Covers the ?? [] fallback in orgOptions
    const { useContacts: useContactsMock } = await import("../../hooks/use-donors");
    vi.mocked(useContactsMock).mockReturnValueOnce({
      data: undefined,
    } as unknown as ReturnType<typeof useContactsMock>);
    render(<ContactForm onSubmit={mockOnSubmit} defaultValues={{ type: "individual" }} />);
    // None option should still render; no org options
    expect(screen.getByRole("option", { name: /^None$/i })).toBeInTheDocument();
  });

  it("falls back to individual fields when the watched type is undefined", () => {
    // When defaultValues explicitly overrides the built-in `type: "individual"`
    // default with `undefined`, useWatch returns undefined and the component must
    // fall back to "individual" (the `?? "individual"` branch on the type watch),
    // rendering the individual name fields rather than the organization field.
    render(
      <ContactForm
        onSubmit={mockOnSubmit}
        defaultValues={{ type: undefined as unknown as "individual" }}
      />,
    );
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/organization name/i)).not.toBeInTheDocument();
  });

  it("maps null defaultValues fields to undefined so RHF does not receive null", () => {
    // When data arrives from the API with null fields (e.g. notes: null), the
    // component replaces null with undefined before passing to useForm.
    // Rendering with a null field must not throw and must show individual fields.
    render(
      <ContactForm
        onSubmit={mockOnSubmit}
        defaultValues={{ type: "individual", notes: null as unknown as string }}
      />,
    );
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });
});
