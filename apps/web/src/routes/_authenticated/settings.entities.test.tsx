import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const {
  mockUseSession,
  mockUseOrgEntities,
  mockUseOrgSettingsMutations,
  mockCreateEntity,
  mockUpdateEntity,
  mockArchiveEntity,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOrgEntities: vi.fn(),
  mockUseOrgSettingsMutations: vi.fn(),
  mockCreateEntity: vi.fn(),
  mockUpdateEntity: vi.fn(),
  mockArchiveEntity: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../hooks/use-org-settings", () => ({
  useOrgEntities: (options?: unknown) => mockUseOrgEntities(options),
  useOrgSettingsMutations: () => mockUseOrgSettingsMutations(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  const SelectTrigger = ({
    id,
    "aria-label": ariaLabel,
    children,
  }: {
    id?: string;
    "aria-label"?: string;
    children?: React.ReactNode;
  }) => (
    <span data-select-id={id} data-select-label={ariaLabel}>
      {children}
    </span>
  );
  const SelectItem = ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  );
  function findTriggerProps(children: React.ReactNode): { id?: string; ariaLabel?: string } {
    let props: { id?: string; ariaLabel?: string } = {};
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === SelectTrigger) {
        const triggerProps = child.props as {
          id?: string;
          "aria-label"?: string;
        };
        props = {
          id: triggerProps.id,
          ariaLabel: triggerProps["aria-label"],
        };
      }
    });
    return props;
  }
  function collectOptions(children: React.ReactNode): React.ReactNode[] {
    const options: React.ReactNode[] = [];
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === SelectItem) {
        options.push(child);
        return;
      }
      options.push(...collectOptions((child.props as { children?: React.ReactNode }).children));
    });
    return options;
  }
  return {
    ...actual,
    Select: ({
      value,
      onValueChange,
      children,
      disabled,
    }: {
      value?: string;
      onValueChange?: (value: string) => void;
      children?: React.ReactNode;
      disabled?: boolean;
    }) => {
      const { id, ariaLabel } = findTriggerProps(children);
      return (
        <select
          id={id}
          aria-label={ariaLabel}
          disabled={disabled}
          value={value}
          onChange={(event) => onValueChange?.(event.target.value)}
        >
          {collectOptions(children)}
        </select>
      );
    },
    SelectTrigger,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem,
  };
});

import { EntitiesSettingsPage } from "./settings.entities";

describe("entity settings source contracts", () => {
  it("adds Entities to the settings shell sidebar as an admin-only child route", () => {
    const source = readFileSync(join(__dirname, "settings.tsx"), "utf8");

    expect(source).toContain("settings/entities");
    expect(source).toContain('label: "Entities"');
  });

  it("uses pill-shaped action buttons", () => {
    const source = readFileSync(join(__dirname, "settings.entities.tsx"), "utf8");

    expect(source).toContain("rounded-full");
  });
});

describe("EntitiesSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseOrgEntities.mockReturnValue({
      data: {
        defaultEntityId: "entity-default",
        data: [],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgSettingsMutations.mockReturnValue({
      createEntity: { mutateAsync: mockCreateEntity, isPending: false },
      updateEntity: { mutateAsync: mockUpdateEntity, isPending: false },
      archiveEntity: { mutateAsync: mockArchiveEntity, isPending: false },
    });
    mockCreateEntity.mockResolvedValue({});
    mockUpdateEntity.mockResolvedValue({});
    mockArchiveEntity.mockResolvedValue({});
  });

  it("blocks non-admins from managing entities", () => {
    mockUseSession.mockReturnValue({ memberRole: "editor" });

    render(<EntitiesSettingsPage />);

    expect(screen.getByText("Only admins can manage entities.")).toBeInTheDocument();
    expect(mockUseOrgEntities).toHaveBeenCalledWith({ enabled: false });
  });

  it("shows an empty state explaining the default entity", () => {
    render(<EntitiesSettingsPage />);

    expect(
      screen.getAllByText(
        "Your org starts with one default entity. Add more for legal entities, sponsored projects, or managed entities.",
      ),
    ).toHaveLength(2);
  });

  it("offers related legal entity, sponsored project, and managed entity creation types", () => {
    render(<EntitiesSettingsPage />);

    expect(screen.getByRole("option", { name: "Related legal entity" })).toHaveValue(
      "legal_entity",
    );
    expect(screen.getByRole("option", { name: "Sponsored project" })).toHaveValue(
      "sponsored_project",
    );
    expect(screen.getByRole("option", { name: "Managed entity" })).toHaveValue("agency_client");
    expect(screen.queryByText(/agency client/i)).not.toBeInTheDocument();
  });

  it("shows the fiscal sponsor model field only for sponsored projects", () => {
    render(<EntitiesSettingsPage />);

    expect(screen.queryByLabelText("Fiscal sponsor model")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Entity type"), {
      target: { value: "sponsored_project" },
    });

    expect(screen.getByLabelText("Fiscal sponsor model")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Model A" })).toHaveValue("model_a");
    expect(screen.getByRole("option", { name: "Model C" })).toHaveValue("model_c");

    fireEvent.change(screen.getByLabelText("Entity type"), {
      target: { value: "legal_entity" },
    });

    expect(screen.queryByLabelText("Fiscal sponsor model")).not.toBeInTheDocument();
  });

  it("shows loading and error states for the entities list", () => {
    mockUseOrgEntities.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    const { rerender } = render(<EntitiesSettingsPage />);

    expect(screen.getByTestId("entities-loading")).toBeInTheDocument();

    mockUseOrgEntities.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Entity list failed"),
    });

    rerender(<EntitiesSettingsPage />);

    expect(screen.getByText("Unable to load entities.")).toBeInTheDocument();
    expect(screen.getByText("Entity list failed")).toBeInTheDocument();
  });

  it("renders default, active, and archived entities with safe labels", () => {
    mockUseOrgEntities.mockReturnValue({
      data: {
        defaultEntityId: "entity-default",
        data: [
          {
            id: "entity-default",
            name: "GrantPipe Foundation",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: true,
          },
          {
            id: "entity-sponsored",
            name: "Youth Project",
            kind: "sponsored_project",
            status: "active",
            fiscalSponsorModel: "model_a",
            parentEntityId: "entity-default",
            isDefault: false,
          },
          {
            id: "entity-archived",
            name: "Old Client",
            kind: "agency_client",
            status: "archived",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: false,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<EntitiesSettingsPage />);

    expect(screen.getAllByText("GrantPipe Foundation")).toHaveLength(2);
    expect(screen.getByText("Default entity")).toBeInTheDocument();
    expect(screen.getAllByText("Sponsored project")).toHaveLength(2);
    expect(screen.getAllByText("Managed entity")).toHaveLength(2);
    expect(screen.getAllByText("Active")).toHaveLength(2);
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Archive" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Archive" })[2]).toBeDisabled();
  });

  it("creates sponsored project entities with parent and sponsor model details", async () => {
    mockUseOrgEntities.mockReturnValue({
      data: {
        defaultEntityId: "entity-default",
        data: [
          {
            id: "entity-default",
            name: "GrantPipe Foundation",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<EntitiesSettingsPage />);

    fireEvent.change(screen.getByLabelText("Entity name"), {
      target: { value: " Youth Project " },
    });
    fireEvent.change(screen.getByLabelText("Entity type"), {
      target: { value: "sponsored_project" },
    });
    fireEvent.change(screen.getByLabelText("Parent entity"), {
      target: { value: "entity-default" },
    });
    fireEvent.change(screen.getByLabelText("Fiscal sponsor model"), {
      target: { value: "model_c" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add entity" }));

    await waitFor(() => {
      expect(mockCreateEntity).toHaveBeenCalledWith({
        name: "Youth Project",
        kind: "sponsored_project",
        fiscalSponsorModel: "model_c",
        parentEntityId: "entity-default",
      });
    });
    expect(await screen.findByText("Entity added.")).toBeInTheDocument();
  });

  it("creates legal entities without fiscal sponsor details", async () => {
    render(<EntitiesSettingsPage />);

    fireEvent.change(screen.getByLabelText("Entity name"), {
      target: { value: "Related Org" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add entity" }));

    await waitFor(() => {
      expect(mockCreateEntity).toHaveBeenCalledWith({
        name: "Related Org",
        kind: "legal_entity",
        fiscalSponsorModel: "none",
        parentEntityId: null,
      });
    });
  });

  it("shows create failures without unsafe fallback assumptions", async () => {
    mockCreateEntity.mockRejectedValueOnce("no details");

    render(<EntitiesSettingsPage />);

    fireEvent.change(screen.getByLabelText("Entity name"), {
      target: { value: "Related Org" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add entity" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });

  it("updates an entity name from the list", async () => {
    mockUseOrgEntities.mockReturnValue({
      data: {
        defaultEntityId: "entity-default",
        data: [
          {
            id: "entity-default",
            name: "GrantPipe Foundation",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<EntitiesSettingsPage />);

    fireEvent.blur(screen.getByLabelText("Name"), {
      target: { value: "GrantPipe Main" },
    });

    await waitFor(() => {
      expect(mockUpdateEntity).toHaveBeenCalledWith({
        entityId: "entity-default",
        data: { name: "GrantPipe Main" },
      });
    });
    expect(await screen.findByText("Entity saved.")).toBeInTheDocument();
  });

  it("does not update an entity when the name is unchanged or empty", () => {
    mockUseOrgEntities.mockReturnValue({
      data: {
        defaultEntityId: "entity-default",
        data: [
          {
            id: "entity-default",
            name: "GrantPipe Foundation",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<EntitiesSettingsPage />);

    fireEvent.blur(screen.getByLabelText("Name"), {
      target: { value: "GrantPipe Foundation" },
    });
    fireEvent.blur(screen.getByLabelText("Name"), {
      target: { value: "   " },
    });

    expect(mockUpdateEntity).not.toHaveBeenCalled();
  });

  it("shows update failures", async () => {
    mockUpdateEntity.mockRejectedValueOnce(new Error("Save failed"));
    mockUseOrgEntities.mockReturnValue({
      data: {
        defaultEntityId: "entity-default",
        data: [
          {
            id: "entity-default",
            name: "GrantPipe Foundation",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<EntitiesSettingsPage />);

    fireEvent.blur(screen.getByLabelText("Name"), {
      target: { value: "GrantPipe Main" },
    });

    expect(await screen.findByText("Save failed")).toBeInTheDocument();
  });

  it("archives active non-default entities", async () => {
    mockUseOrgEntities.mockReturnValue({
      data: {
        defaultEntityId: "entity-default",
        data: [
          {
            id: "entity-default",
            name: "GrantPipe Foundation",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: true,
          },
          {
            id: "entity-related",
            name: "Related Org",
            kind: "legal_entity",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: false,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<EntitiesSettingsPage />);

    const archiveButtons = screen.getAllByRole("button", { name: "Archive" });
    expect(archiveButtons).toHaveLength(2);
    const relatedArchiveButton = archiveButtons[1];
    if (!relatedArchiveButton) {
      throw new Error("Expected related entity archive button");
    }
    fireEvent.click(relatedArchiveButton);

    await waitFor(() => {
      expect(mockArchiveEntity).toHaveBeenCalledWith({
        entityId: "entity-related",
      });
    });
    expect(await screen.findByText("Entity archived.")).toBeInTheDocument();
  });

  it("shows archive failures", async () => {
    mockArchiveEntity.mockRejectedValueOnce(new Error("Archive failed"));
    mockUseOrgEntities.mockReturnValue({
      data: {
        defaultEntityId: "entity-default",
        data: [
          {
            id: "entity-related",
            name: "Related Org",
            kind: "legal_entity",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: false,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<EntitiesSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByText("Archive failed")).toBeInTheDocument();
  });

  it("shows full entity name as title attribute on truncated name p", () => {
    mockUseOrgEntities.mockReturnValue({
      data: {
        defaultEntityId: "entity-default",
        data: [
          {
            id: "entity-default",
            name: "GrantPipe Foundation",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<EntitiesSettingsPage />);

    expect(screen.getByTitle("GrantPipe Foundation")).toBeInTheDocument();
  });
});
