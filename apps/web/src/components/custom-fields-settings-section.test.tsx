import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  disabled: boolean;
}>({ value: "", onValueChange: () => {}, disabled: false });

const mockUseList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockDeletePending = vi.fn<() => boolean>();
const mockDeleteVariables = vi.fn<() => { definitionId: string } | undefined>();

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
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

vi.mock("../hooks/use-custom-field-definitions", () => ({
  useCustomFieldDefinitions: (...args: unknown[]) => mockUseList(...args),
  useCreateCustomFieldDefinition: () => ({
    mutateAsync: mockCreate,
    isPending: false,
  }),
  useUpdateCustomFieldDefinition: () => ({
    mutateAsync: mockUpdate,
    isPending: false,
  }),
  useDeleteCustomFieldDefinition: () => ({
    mutateAsync: mockDelete,
    isPending: mockDeletePending(),
    variables: mockDeleteVariables(),
  }),
}));

import { CustomFieldsSettingsSection } from "./custom-fields-settings-section";

function listOk(data: unknown) {
  mockUseList.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
  });
}

describe("CustomFieldsSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
    mockDelete.mockResolvedValue({});
    mockDeletePending.mockReturnValue(false);
    mockDeleteVariables.mockReturnValue(undefined);
  });

  it("shows empty state when no definitions exist", () => {
    listOk([]);
    render(<CustomFieldsSettingsSection />);
    expect(screen.getByText(/No custom fields for contacts/i)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockUseList.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<CustomFieldsSettingsSection />);
    expect(screen.getByText(/Loading custom fields/i)).toBeInTheDocument();
  });

  it("shows error state", () => {
    mockUseList.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
    });
    render(<CustomFieldsSettingsSection />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("renders definitions with their field type label and options", () => {
    listOk([
      {
        id: "def-1",
        orgId: "org-1",
        entityType: "contact",
        name: "Preferred Name",
        fieldType: "text",
        options: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
      {
        id: "def-2",
        orgId: "org-1",
        entityType: "contact",
        name: "T-shirt size",
        fieldType: "single_select",
        options: ["S", "M", "L"],
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    render(<CustomFieldsSettingsSection />);
    expect(screen.getByText("Preferred Name")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText(/Single select: S, M, L/)).toBeInTheDocument();
  });

  it("only disables the Delete button for the definition whose removal is in flight", () => {
    listOk([
      {
        id: "def-1",
        orgId: "org-1",
        entityType: "contact",
        name: "Preferred Name",
        fieldType: "text",
        options: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
      {
        id: "def-2",
        orgId: "org-1",
        entityType: "contact",
        name: "T-shirt size",
        fieldType: "single_select",
        options: ["S", "M", "L"],
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    mockDeletePending.mockReturnValue(true);
    mockDeleteVariables.mockReturnValue({ definitionId: "def-1" });

    render(<CustomFieldsSettingsSection />);

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[1]).not.toBeDisabled();
  });

  it("opens the dialog and creates a text custom field", async () => {
    listOk([]);
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Add custom field" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Preferred Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save custom field" }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        entityType: "contact",
        name: "Preferred Name",
        fieldType: "text",
        sortOrder: 0,
      }),
    );
  });

  it("shows options input when field type requires it and creates select field", async () => {
    listOk([]);
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Add custom field" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Shirt" } });
    fireEvent.change(screen.getByLabelText("Field type"), { target: { value: "single_select" } });
    fireEvent.change(screen.getByLabelText("Options"), { target: { value: "S, M, L" } });
    fireEvent.click(screen.getByRole("button", { name: "Save custom field" }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        entityType: "contact",
        name: "Shirt",
        fieldType: "single_select",
        sortOrder: 0,
        options: ["S", "M", "L"],
      }),
    );
  });

  it("disables Save custom field until a name is entered", () => {
    listOk([]);
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Add custom field" }));
    const save = screen.getByRole("button", { name: "Save custom field" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Preferred Name" } });
    expect(save).toBeEnabled();
  });

  it("surfaces validation errors inside the dialog", async () => {
    listOk([]);
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Add custom field" }));
    // Empty name fails schema; submit the form directly since the Save button is
    // disabled while the name is empty.
    const form = screen
      .getByRole("button", { name: "Save custom field" })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("surfaces create errors from the mutation", async () => {
    listOk([]);
    mockCreate.mockRejectedValueOnce(new Error("server said no"));
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Add custom field" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Thing" } });
    fireEvent.click(screen.getByRole("button", { name: "Save custom field" }));

    expect(await screen.findByText("server said no")).toBeInTheDocument();
  });

  it("edits a definition name", async () => {
    listOk([
      {
        id: "def-1",
        orgId: "org-1",
        entityType: "contact",
        name: "Old",
        fieldType: "text",
        options: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Custom field name"), {
      target: { value: "New" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        definitionId: "def-1",
        entityType: "contact",
        data: { name: "New" },
      }),
    );
  });

  it("blocks edit save with empty name", async () => {
    listOk([
      {
        id: "def-1",
        orgId: "org-1",
        entityType: "contact",
        name: "Old",
        fieldType: "text",
        options: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Custom field name"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Name is required/)).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("surfaces update errors", async () => {
    listOk([
      {
        id: "def-1",
        orgId: "org-1",
        entityType: "contact",
        name: "Old",
        fieldType: "text",
        options: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    mockUpdate.mockRejectedValueOnce(new Error("patch broke"));
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Custom field name"), { target: { value: "New" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("patch broke")).toBeInTheDocument();
  });

  it("cancels edit mode", () => {
    listOk([
      {
        id: "def-1",
        orgId: "org-1",
        entityType: "contact",
        name: "Old",
        fieldType: "text",
        options: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Custom field name")).not.toBeInTheDocument();
  });

  it("requires an inline destructive confirmation before deleting a definition", async () => {
    listOk([
      {
        id: "def-1",
        orgId: "org-1",
        entityType: "contact",
        name: "Old",
        fieldType: "text",
        options: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete "Old"?')).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", { name: "Delete custom field" });
    expect(confirmButton).toHaveAttribute("data-variant", "destructive");

    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith({
        definitionId: "def-1",
        entityType: "contact",
      }),
    );
  });

  it("skips delete when inline destructive confirmation is cancelled", () => {
    listOk([
      {
        id: "def-1",
        orgId: "org-1",
        entityType: "contact",
        name: "Old",
        fieldType: "text",
        options: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel delete" }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete "Old"?')).not.toBeInTheDocument();
  });

  it("closes the delete confirmation when the dialog requests close", async () => {
    listOk([
      {
        id: "def-1",
        orgId: "org-1",
        entityType: "contact",
        name: "Old",
        fieldType: "text",
        options: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText('Delete "Old"?')).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(mockDelete).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText('Delete "Old"?')).not.toBeInTheDocument();
    });
  });

  it("surfaces delete errors", async () => {
    listOk([
      {
        id: "def-1",
        orgId: "org-1",
        entityType: "contact",
        name: "Old",
        fieldType: "text",
        options: null,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      },
    ]);
    mockDelete.mockRejectedValueOnce(new Error("delete refused"));
    render(<CustomFieldsSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete custom field" }));

    expect(await screen.findByText("delete refused")).toBeInTheDocument();
  });

  it("switches tabs and queries the selected entity type", async () => {
    listOk([]);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<CustomFieldsSettingsSection />);

    await user.click(screen.getByRole("tab", { name: "Grants" }));
    await waitFor(() => {
      const calledWith = mockUseList.mock.calls.map((call) => call[0]);
      expect(calledWith).toContain("grant");
    });
  });
});

describe("CustomFieldsSettingsSection source contracts", () => {
  it("Field type Label has htmlFor and SelectTrigger has matching id", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/custom-fields-settings-section.tsx"),
      "utf8",
    );
    expect(source).toContain('htmlFor="custom-field-type"');
    expect(source).toContain('id="custom-field-type"');
  });
});
