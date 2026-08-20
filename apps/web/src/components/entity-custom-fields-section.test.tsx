import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

const mockUseEntityCustomFields = vi.fn();
const mockUseUpsertCustomFieldValue = vi.fn();

vi.mock("../hooks/use-custom-fields", () => ({
  useEntityCustomFields: (...args: unknown[]) => mockUseEntityCustomFields(...args),
  useUpsertCustomFieldValue: (...args: unknown[]) => mockUseUpsertCustomFieldValue(...args),
}));

vi.mock("@grantpipe/ui", () => ({
  Card: ({ children }: React.HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
  CardContent: ({ children }: React.HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
  CardHeader: ({ children }: React.HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
  CardTitle: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h2>{children}</h2>,
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
  Button: ({
    children,
    onClick,
    type,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} type={type} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Input: ({
    id,
    defaultValue,
    onChange,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input id={id} defaultValue={defaultValue} onChange={onChange} {...props} />
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
}));

import { EntityCustomFieldsSection } from "./entity-custom-fields-section";

const mockMutateAsync = vi.fn();

describe("EntityCustomFieldsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUpsertCustomFieldValue.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: {
            id: "field-1",
            name: "Program Area",
            fieldType: "text",
          },
          value: {
            id: "value-1",
            fieldId: "field-1",
            entityId: "grant-1",
            value: "STEM",
          },
        },
      ],
      isLoading: false,
      isError: false,
    });
  });

  it("renders custom field values", () => {
    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    expect(screen.getByText("Custom Fields")).toBeInTheDocument();
    expect(screen.getByText("Program Area")).toBeInTheDocument();
    expect(screen.getByText("STEM")).toBeInTheDocument();
  });

  it("renders an Edit button for each field", () => {
    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);
    expect(screen.getByRole("button", { name: "Edit Program Area" })).toBeInTheDocument();
  });

  it("hides the Edit affordance and shows values read-only when canEdit is false", () => {
    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" canEdit={false} />);
    expect(screen.getByText("Program Area")).toBeInTheDocument();
    expect(screen.getByText("STEM")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Program Area" })).not.toBeInTheDocument();
  });

  it("switches to edit mode when Edit is clicked", () => {
    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Program Area" }));
    expect(screen.getByRole("textbox", { name: "Edit Program Area" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("saves the field value and exits edit mode on form submit", async () => {
    mockMutateAsync.mockResolvedValue({});
    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Program Area" }));
    const input = screen.getByRole("textbox", { name: "Edit Program Area" });
    fireEvent.change(input, { target: { value: "Arts" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ fieldId: "field-1", value: "Arts" });
    });
  });

  it("saves the current value when text input is submitted unchanged", async () => {
    mockMutateAsync.mockResolvedValue({});
    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Program Area" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ fieldId: "field-1", value: "STEM" });
    });

    expect(screen.queryByRole("textbox", { name: "Edit Program Area" })).not.toBeInTheDocument();
  });

  it("exits edit mode without saving when Cancel is clicked", () => {
    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Program Area" }));
    expect(screen.getByRole("textbox", { name: "Edit Program Area" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Edit Program Area" })).not.toBeInTheDocument();
    expect(screen.getByText("STEM")).toBeInTheDocument();
  });

  it("shows upsert error message when save fails and clears it on cancel", async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error("Server rejected the value."));
    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Program Area" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Server rejected the value.")).toBeInTheDocument();
    });

    // Cancelling clears the error and exits edit mode
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Server rejected the value.")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Edit Program Area" })).not.toBeInTheDocument();
  });

  it("shows fallback upsert error message when save throws a non-Error", async () => {
    mockMutateAsync.mockRejectedValueOnce("plain string error");
    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Program Area" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to save field value.")).toBeInTheDocument();
    });
  });

  it("renders fallback text for blank values", () => {
    mockUseEntityCustomFields.mockReturnValueOnce({
      data: [
        {
          definition: {
            id: "field-2",
            name: "Campaign Notes",
            fieldType: "text",
          },
          value: {
            id: "value-2",
            fieldId: "field-2",
            entityId: "grant-1",
            value: "   ",
          },
        },
        {
          definition: {
            id: "field-3",
            name: "Optional Label",
            fieldType: "text",
          },
          value: null,
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    expect(screen.getByText("Campaign Notes")).toBeInTheDocument();
    expect(screen.getAllByText("Not provided")).toHaveLength(2);
  });

  it("renders number and date custom fields with matching input types", () => {
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: { id: "field-number", name: "Match Amount", fieldType: "number" },
          value: { id: "value-number", fieldId: "field-number", value: "2500" },
        },
        {
          definition: { id: "field-date", name: "Award Date", fieldType: "date" },
          value: { id: "value-date", fieldId: "field-date", value: "2026-04-15" },
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Match Amount" }));
    expect(screen.getByLabelText("Edit Match Amount")).toHaveAttribute("type", "number");

    fireEvent.click(screen.getByRole("button", { name: "Edit Award Date" }));
    expect(screen.getByLabelText("Edit Award Date")).toHaveAttribute("type", "date");
  });

  it("saves single-select custom fields and normalizes the empty option", async () => {
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: {
            id: "field-select",
            name: "Priority",
            fieldType: "single_select",
            options: ["High", "Low"],
          },
          value: null,
        },
      ],
      isLoading: false,
      isError: false,
    });
    mockMutateAsync.mockResolvedValue({});

    const { rerender } = render(
      <EntityCustomFieldsSection entityType="grant" entityId="grant-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Priority" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Edit Priority" }), {
      target: { value: "High" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenLastCalledWith({ fieldId: "field-select", value: "High" });
    });

    mockUseEntityCustomFields.mockReturnValueOnce({
      data: [
        {
          definition: {
            id: "field-select",
            name: "Priority",
            fieldType: "single_select",
            options: ["High", "Low"],
          },
          value: { id: "value-select", fieldId: "field-select", value: "High" },
        },
      ],
      isLoading: false,
      isError: false,
    });
    rerender(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Priority" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Edit Priority" }), {
      target: { value: "__none__" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenLastCalledWith({ fieldId: "field-select", value: "" });
    });
  });

  it("toggles multi-select custom field options before saving", async () => {
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: {
            id: "field-multi",
            name: "Regions",
            fieldType: "multi_select",
            options: ["North", "South", "West"],
          },
          value: { id: "value-multi", fieldId: "field-multi", value: "North, South" },
        },
      ],
      isLoading: false,
      isError: false,
    });
    mockMutateAsync.mockResolvedValue({});

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Regions" }));
    fireEvent.click(screen.getByLabelText("North"));
    fireEvent.click(screen.getByLabelText("West"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        fieldId: "field-multi",
        value: "South, West",
      });
    });
  });

  it("adds the first multi-select option when no value is stored", async () => {
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: {
            id: "field-multi-empty",
            name: "Focus Areas",
            fieldType: "multi_select",
            options: ["Housing", "Food"],
          },
          value: null,
        },
      ],
      isLoading: false,
      isError: false,
    });
    mockMutateAsync.mockResolvedValue({});

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Focus Areas" }));
    fireEvent.click(screen.getByLabelText("Housing"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        fieldId: "field-multi-empty",
        value: "Housing",
      });
    });
  });

  it("renders loading, empty, and error states", () => {
    mockUseEntityCustomFields.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { rerender } = render(
      <EntityCustomFieldsSection entityType="grant" entityId="grant-1" />,
    );
    expect(screen.getByText("Loading custom fields…")).toBeInTheDocument();

    mockUseEntityCustomFields.mockReturnValueOnce({
      data: [],
      isLoading: false,
      isError: false,
    });
    rerender(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);
    expect(screen.getByText("No custom fields set up yet.")).toBeInTheDocument();

    mockUseEntityCustomFields.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Custom fields failed"),
    });
    rerender(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);
    expect(screen.getByText("Custom fields failed")).toBeInTheDocument();

    mockUseEntityCustomFields.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: "unknown",
    });
    rerender(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);
    expect(screen.getByText("Unable to load custom fields.")).toBeInTheDocument();
  });

  it("clears upsertError when switching to edit mode for a different field", async () => {
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: { id: "field-a", name: "Field A", fieldType: "text" },
          value: { id: "v-a", fieldId: "field-a", value: "alpha" },
        },
        {
          definition: { id: "field-b", name: "Field B", fieldType: "text" },
          value: { id: "v-b", fieldId: "field-b", value: "beta" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockMutateAsync.mockRejectedValue(new Error("Save failed"));

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    // Enter edit mode for Field A
    const editButtons = screen.getAllByRole("button", { name: /^Edit / });
    fireEvent.click(editButtons[0]!);

    // Click Save to trigger upsertError (mockMutateAsync is set to reject)
    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    fireEvent.click(saveButtons[0]!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Now click Edit on Field B — upsertError should clear
    fireEvent.click(editButtons[1]!);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("saves a single-select value and clears it when the none option is selected", async () => {
    mockMutateAsync.mockResolvedValue({});
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: {
            id: "field-select",
            name: "Priority",
            fieldType: "single_select",
            options: ["High", "Low"],
          },
          value: null,
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Priority" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Edit Priority" }), {
      target: { value: "High" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        fieldId: "field-select",
        value: "High",
      });
    });

    mockMutateAsync.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Edit Priority" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Edit Priority" }), {
      target: { value: "__none__" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        fieldId: "field-select",
        value: "",
      });
    });
  });

  it("keeps the current single-select value when saving without a draft change", async () => {
    mockMutateAsync.mockResolvedValue({});
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: {
            id: "field-select",
            name: "Priority",
            fieldType: "single_select",
            options: ["High", "Low"],
          },
          value: {
            id: "value-select",
            fieldId: "field-select",
            entityId: "grant-1",
            value: "Low",
          },
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Priority" }));
    expect(screen.getByRole("combobox", { name: "Edit Priority" })).toHaveValue("Low");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        fieldId: "field-select",
        value: "Low",
      });
    });
  });

  it("toggles multi-select options before saving", async () => {
    mockMutateAsync.mockResolvedValue({});
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: {
            id: "field-multi",
            name: "Tags",
            fieldType: "multi_select",
            options: ["Education", "Health", "Arts"],
          },
          value: {
            id: "value-multi",
            fieldId: "field-multi",
            entityId: "grant-1",
            value: "Education, Health",
          },
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Tags" }));
    fireEvent.click(screen.getByLabelText("Health"));
    fireEvent.click(screen.getByLabelText("Arts"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        fieldId: "field-multi",
        value: "Education, Arts",
      });
    });
  });

  it("saves a multi-select value when starting from no selected options", async () => {
    mockMutateAsync.mockResolvedValue({});
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: {
            id: "field-multi",
            name: "Tags",
            fieldType: "multi_select",
            options: ["Education", "Health"],
          },
          value: null,
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Tags" }));
    fireEvent.click(screen.getByLabelText("Health"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        fieldId: "field-multi",
        value: "Health",
      });
    });
  });

  it("uses number and date input types for matching custom field definitions", () => {
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: { id: "field-number", name: "Goal Amount", fieldType: "number" },
          value: { id: "value-number", fieldId: "field-number", value: "5000" },
        },
        {
          definition: { id: "field-date", name: "Review Date", fieldType: "date" },
          value: { id: "value-date", fieldId: "field-date", value: "2026-04-27" },
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Goal Amount" }));
    expect(screen.getByLabelText("Edit Goal Amount")).toHaveAttribute("type", "number");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Review Date" }));
    expect(screen.getByLabelText("Edit Review Date")).toHaveAttribute("type", "date");
  });

  it("saves a text draft value after editing an existing field", async () => {
    mockMutateAsync.mockResolvedValue({});

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Program Area" }));
    fireEvent.change(screen.getByLabelText("Edit Program Area"), {
      target: { value: "Arts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        fieldId: "field-1",
        value: "Arts",
      });
    });
  });

  it("renders select fields without options as plain text inputs", () => {
    mockUseEntityCustomFields.mockReturnValue({
      data: [
        {
          definition: {
            id: "field-select-no-options",
            name: "Priority",
            fieldType: "single_select",
          },
          value: null,
        },
        {
          definition: {
            id: "field-multi-no-options",
            name: "Tags",
            fieldType: "multi_select",
          },
          value: null,
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<EntityCustomFieldsSection entityType="grant" entityId="grant-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Priority" }));
    expect(screen.getByLabelText("Edit Priority")).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit Tags" }));
    expect(screen.getByLabelText("Edit Tags")).toHaveAttribute("type", "text");
  });
});
