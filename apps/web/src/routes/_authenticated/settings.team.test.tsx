import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const {
  mockUseSession,
  mockUseOrgTeam,
  mockUseOrgEntities,
  mockUseOrgSettingsMutations,
  mockCreateInvite,
  mockUpdateMember,
  mockAssignEntityAccess,
  mockUpdateEntityAccess,
  mockRevokeEntityAccess,
  mockCaptureAppException,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseOrgTeam: vi.fn(),
  mockUseOrgEntities: vi.fn(),
  mockUseOrgSettingsMutations: vi.fn(),
  mockCreateInvite: vi.fn(),
  mockUpdateMember: vi.fn(),
  mockAssignEntityAccess: vi.fn(),
  mockUpdateEntityAccess: vi.fn(),
  mockRevokeEntityAccess: vi.fn(),
  mockCaptureAppException: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
}));

vi.mock("../../components/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onOpenChange,
    onConfirm,
    confirmLabel = "Confirm",
    isPending,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
    isPending?: boolean;
  }) =>
    open
      ? React.createElement(
          "div",
          { role: "dialog" },
          React.createElement("button", { onClick: onConfirm, disabled: isPending }, confirmLabel),
          React.createElement("button", { onClick: () => onOpenChange(false) }, "Cancel"),
        )
      : null,
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../hooks/use-org-settings", () => ({
  useOrgEntities: (options?: unknown) => mockUseOrgEntities(options),
  useOrgTeam: (options?: unknown) => mockUseOrgTeam(options),
  useOrgSettingsMutations: () => mockUseOrgSettingsMutations(),
}));

vi.mock("../../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

describe("team settings card radius contracts", () => {
  it("uses rounded-2xl (not rounded-lg) on the invite-settings card container", () => {
    const source = readFileSync(
      join(process.cwd(), "src/routes/_authenticated/settings.team.tsx"),
      "utf8",
    );
    // The invite-settings form card must use the canonical rounded-2xl radius
    expect(source).toContain('className="grid gap-4 rounded-2xl border border-border bg-card p-4"');
  });

  it("uses rounded-2xl (not rounded-lg) on each team member card", () => {
    const source = readFileSync(
      join(process.cwd(), "src/routes/_authenticated/settings.team.tsx"),
      "utf8",
    );
    // Member cards iterated in the team list must use rounded-2xl
    expect(source).toContain('className="rounded-2xl border border-border bg-card p-4"');
  });
});

describe("team settings source contracts", () => {
  it("derives editable roles from shared role policy constants", () => {
    const source = readFileSync(
      join(process.cwd(), "src/routes/_authenticated/settings.team.tsx"),
      "utf8",
    );

    expect(source).toContain("ROLES");
    expect(source).not.toContain("const EDITABLE_ROLES");
  });

  it("associates each invite and member-role select with its label via matching htmlFor and id", () => {
    const source = readFileSync(
      join(process.cwd(), "src/routes/_authenticated/settings.team.tsx"),
      "utf8",
    );

    // Clicking a label should focus its control. The invite selects use static ids;
    // each member-role select is keyed per member so the association stays unique.
    expect(source).toContain('htmlFor="invite-type"');
    expect(source).toContain('id="invite-type"');
    expect(source).toContain('htmlFor="invite-role"');
    expect(source).toContain('id="invite-role"');
    expect(source).toContain("htmlFor={`member-role-${member.id}`}");
    expect(source).toContain("id={`member-role-${member.id}`}");
  });
});

vi.mock("@grantpipe/ui", async () => {
  const React = await import("react");
  const actual = await vi.importActual<typeof import("@grantpipe/ui")>("@grantpipe/ui");

  type MockSelectProps = {
    children?: React.ReactNode;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
    value?: string;
  };
  type MockSelectItemProps = {
    children?: React.ReactNode;
    value: string;
  };
  type MockSelectTriggerProps = {
    "aria-label"?: string;
    children?: React.ReactNode;
  };

  function isElement(node: React.ReactNode): node is React.ReactElement<Record<string, unknown>> {
    return React.isValidElement(node);
  }

  function collectOptions(node: React.ReactNode): React.ReactElement[] {
    const options: React.ReactElement[] = [];
    React.Children.forEach(node, (child) => {
      if (!isElement(child)) return;
      if (child.type === SelectItem) {
        const props = child.props as MockSelectItemProps;
        options.push(
          React.createElement("option", { key: props.value, value: props.value }, props.children),
        );
        return;
      }
      options.push(...collectOptions(child.props.children as React.ReactNode));
    });
    return options;
  }

  function findLabel(node: React.ReactNode): string | undefined {
    let label: string | undefined;
    React.Children.forEach(node, (child) => {
      if (label || !isElement(child)) return;
      if (child.type === SelectTrigger) {
        label = (child.props as MockSelectTriggerProps)["aria-label"];
        return;
      }
      label = findLabel(child.props.children as React.ReactNode);
    });
    return label;
  }

  function Select({ children, disabled, onValueChange, value }: MockSelectProps) {
    return React.createElement(
      "select",
      {
        "aria-label": findLabel(children),
        disabled,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
          onValueChange?.(event.target.value),
        value,
      },
      collectOptions(children),
    );
  }

  function SelectTrigger({ children }: MockSelectTriggerProps) {
    return React.createElement(React.Fragment, null, children);
  }

  function SelectContent({ children }: { children?: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }

  function SelectValue() {
    return null;
  }

  function SelectItem(_props: MockSelectItemProps) {
    return null;
  }

  return {
    ...actual,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  };
});

import { TeamSettingsPage } from "./settings.team";

describe("TeamSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseOrgTeam.mockReturnValue({
      data: [
        {
          id: "member-1",
          role: "viewer",
          permissions: { grants: "edit" },
          user: { name: "Case Manager", email: "case@example.org" },
          entityAccess: [
            {
              entityId: "entity-default",
              entityName: "Main Organization",
              role: "viewer",
              permissions: { grants: "view", reports: "view" },
            },
          ],
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgEntities.mockReturnValue({
      data: {
        defaultEntityId: "entity-default",
        data: [
          {
            id: "entity-default",
            name: "Main Organization",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            isDefault: true,
          },
          {
            id: "entity-client",
            name: "Client Project",
            kind: "agency_client",
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
    mockCreateInvite.mockResolvedValue({ id: "invite-1", token: "token-1" });
    mockUpdateMember.mockResolvedValue({ id: "member-1", role: "viewer" });
    mockAssignEntityAccess.mockResolvedValue({ id: "entity-member-2" });
    mockUpdateEntityAccess.mockResolvedValue({ id: "entity-member-1", role: "editor" });
    mockRevokeEntityAccess.mockResolvedValue({ id: "entity-member-1", role: "viewer" });
    mockUseOrgSettingsMutations.mockReturnValue({
      createInvite: { mutateAsync: mockCreateInvite, isPending: false },
      updateMember: { mutateAsync: mockUpdateMember, isPending: false },
      assignEntityAccess: { mutateAsync: mockAssignEntityAccess, isPending: false },
      updateEntityAccess: { mutateAsync: mockUpdateEntityAccess, isPending: false },
      revokeEntityAccess: { mutateAsync: mockRevokeEntityAccess, isPending: false },
    });
  });

  it("renders the dedicated team and permissions page for admins", () => {
    render(React.createElement(TeamSettingsPage));

    expect(
      screen.queryByRole("heading", { level: 1, name: "Team & permissions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Team & permissions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Case Manager")).toBeInTheDocument();
    expect(screen.getByText("Invite settings")).toBeInTheDocument();
    expect(screen.getAllByText("Grants").length).toBeGreaterThan(0);
  });

  it("creates a shareable invite with permission overrides", async () => {
    render(React.createElement(TeamSettingsPage));

    fireEvent.change(screen.getByLabelText("Invite Grants permission"), {
      target: { value: "manage" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create invite" }));

    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalledTimes(1));
    expect(mockCreateInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "shareable",
        role: "viewer",
        permissions: expect.objectContaining({
          donors: "view",
          grants: "manage",
          settings: "view",
          team: "none",
        }),
      }),
    );
    expect(
      await screen.findByDisplayValue("http://localhost:3000/app/invite/token-1"),
    ).toBeVisible();
  });

  it("can scope an invite to one entity", async () => {
    render(React.createElement(TeamSettingsPage));

    fireEvent.change(screen.getByLabelText("Invite entity scope"), {
      target: { value: "entity-client" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create invite" }));

    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalledTimes(1));
    expect(mockCreateInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "entity-client",
      }),
    );
  });

  it("shows the entity access matrix and assigns missing entity access", async () => {
    render(React.createElement(TeamSettingsPage));

    expect(screen.getByText("Entity access")).toBeInTheDocument();
    expect(screen.getAllByText("Client Project").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Grant Client Project access" }));

    await waitFor(() => expect(mockAssignEntityAccess).toHaveBeenCalledTimes(1));
    expect(mockAssignEntityAccess).toHaveBeenCalledWith({
      memberId: "member-1",
      data: {
        entityId: "entity-client",
        role: "viewer",
      },
    });
  });

  it("gives the entity access role/revoke row a min width that fits its content", () => {
    render(React.createElement(TeamSettingsPage));

    const revokeButton = screen.getByRole("button", { name: "Revoke" });
    const row = revokeButton.closest("[class*='min-w-']") as HTMLElement;

    expect(row).toBeInTheDocument();
    expect(row).toHaveClass("sm:min-w-[280px]");
    expect(row).not.toHaveClass("sm:min-w-[260px]");
  });

  it("updates and revokes existing entity access", async () => {
    render(React.createElement(TeamSettingsPage));

    fireEvent.change(screen.getByLabelText("Main Organization entity role"), {
      target: { value: "editor" },
    });
    fireEvent.change(screen.getByLabelText("Main Organization Reports permission"), {
      target: { value: "manage" },
    });
    // Revoking entity access is destructive: the row button opens a confirm
    // dialog, and the revoke only fires after the user confirms.
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));

    await waitFor(() => expect(mockUpdateEntityAccess).toHaveBeenCalledTimes(2));
    expect(mockUpdateEntityAccess).toHaveBeenCalledWith({
      memberId: "member-1",
      entityId: "entity-default",
      data: { role: "editor" },
    });
    expect(mockUpdateEntityAccess).toHaveBeenCalledWith({
      memberId: "member-1",
      entityId: "entity-default",
      data: { permissions: { grants: "view", reports: "manage" } },
    });
    expect(mockRevokeEntityAccess).toHaveBeenCalledWith({
      memberId: "member-1",
      entityId: "entity-default",
    });
  });

  it("hides entity access controls when no active entities are loaded", () => {
    mockUseOrgEntities.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(TeamSettingsPage));

    expect(screen.queryByText("Entity access")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Invite entity scope")).toBeInTheDocument();
  });

  it("surfaces entity access mutation errors", async () => {
    mockAssignEntityAccess.mockRejectedValueOnce(new Error("Assign failed"));
    mockUpdateEntityAccess
      .mockRejectedValueOnce(new Error("Role failed"))
      .mockRejectedValueOnce(new Error("Permission failed"));
    mockRevokeEntityAccess.mockRejectedValueOnce(new Error("Revoke failed"));

    render(React.createElement(TeamSettingsPage));

    fireEvent.click(screen.getByRole("button", { name: "Grant Client Project access" }));
    expect(await screen.findByText("Assign failed")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Main Organization entity role"), {
      target: { value: "editor" },
    });
    expect(await screen.findByText("Role failed")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Main Organization Reports permission"), {
      target: { value: "manage" },
    });
    expect(await screen.findByText("Permission failed")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));
    expect(await screen.findByText("Revoke failed")).toBeVisible();
  });

  it("confirms before revoking entity access instead of firing immediately", () => {
    render(React.createElement(TeamSettingsPage));

    // Clicking the row Revoke trigger must NOT fire the destructive mutation.
    // It opens a confirmation dialog first — the same safety pattern every
    // other delete in the app uses.
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(mockRevokeEntityAccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Only after confirming does the revoke run.
    fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));
    expect(mockRevokeEntityAccess).toHaveBeenCalledTimes(1);
  });

  it("uses an empty entity permission object when current permissions are null", async () => {
    mockUseOrgTeam.mockReturnValue({
      data: [
        {
          id: "member-null-entity-perms",
          role: "viewer",
          permissions: { grants: "view" },
          user: { name: "Null Entity Perms", email: "entityperms@example.org" },
          entityAccess: [
            {
              entityId: "entity-default",
              entityName: "Main Organization",
              role: "viewer",
              permissions: null,
            },
          ],
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(TeamSettingsPage));

    fireEvent.change(screen.getByLabelText("Main Organization Reports permission"), {
      target: { value: "manage" },
    });

    await waitFor(() => expect(mockUpdateEntityAccess).toHaveBeenCalledTimes(1));
    expect(mockUpdateEntityAccess).toHaveBeenCalledWith({
      memberId: "member-null-entity-perms",
      entityId: "entity-default",
      data: { permissions: { reports: "manage" } },
    });
  });

  it("scopes entity mutation pending states to the matching row", () => {
    mockUseOrgTeam.mockReturnValue({
      data: [
        {
          id: "member-A",
          role: "viewer",
          permissions: null,
          user: { name: "Alice" },
          entityAccess: [
            {
              entityId: "entity-default",
              entityName: "Main Organization",
              role: "viewer",
              permissions: { grants: "view" },
            },
          ],
        },
        {
          id: "member-B",
          role: "viewer",
          permissions: null,
          user: { name: "Bob" },
          entityAccess: [],
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgSettingsMutations.mockReturnValue({
      createInvite: { mutateAsync: vi.fn(), isPending: false },
      updateMember: { mutateAsync: vi.fn(), isPending: false },
      assignEntityAccess: {
        mutateAsync: vi.fn(),
        isPending: true,
        variables: { memberId: "member-B", data: { entityId: "entity-client", role: "viewer" } },
      },
      updateEntityAccess: {
        mutateAsync: vi.fn(),
        isPending: true,
        variables: { memberId: "member-A", entityId: "entity-default", data: { role: "editor" } },
      },
      revokeEntityAccess: {
        mutateAsync: vi.fn(),
        isPending: true,
        variables: { memberId: "member-A", entityId: "entity-default" },
      },
    });

    render(React.createElement(TeamSettingsPage));

    expect(screen.getByLabelText("Main Organization entity role")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDisabled();
    const clientAccessButtons = screen.getAllByRole("button", {
      name: "Grant Client Project access",
    });
    expect(clientAccessButtons.some((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(clientAccessButtons.some((button) => !button.hasAttribute("disabled"))).toBe(true);
    expect(screen.getByRole("button", { name: "Grant Main Organization access" })).toBeDisabled();
  });

  it("shows non-admins that team management is admin-only", () => {
    mockUseSession.mockReturnValue({ memberRole: "viewer" });

    render(React.createElement(TeamSettingsPage));

    expect(screen.getByText("Only organization admins can manage the team.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create invite" })).not.toBeInTheDocument();
    expect(mockUseOrgTeam).toHaveBeenCalledWith({ enabled: false });
  });

  it("renders team loading, missing, and stale error states", () => {
    mockUseOrgTeam.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    const { rerender } = render(React.createElement(TeamSettingsPage));

    expect(screen.getByText("Loading team settings…")).toBeVisible();

    mockUseOrgTeam.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: false,
      error: "plain failure",
    });
    rerender(React.createElement(TeamSettingsPage));

    expect(screen.getByText("Unable to load team settings.")).toBeVisible();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeVisible();

    mockUseOrgTeam.mockReturnValueOnce({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error("Team cache is stale"),
    });
    rerender(React.createElement(TeamSettingsPage));

    expect(screen.getByText("Team cache is stale")).toBeVisible();
  });

  it("creates an email invite, copies it, and surfaces clipboard errors", async () => {
    render(React.createElement(TeamSettingsPage));

    fireEvent.change(screen.getByLabelText("Invite type"), {
      target: { value: "email" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "finance@example.org" },
    });
    fireEvent.change(screen.getByLabelText("Invite role"), {
      target: { value: "admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create invite" }));

    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalledTimes(1));
    expect(mockCreateInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "finance@example.org",
        mode: "email",
        role: "admin",
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Copy invite link" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "http://localhost:3000/app/invite/token-1",
      ),
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {},
    });
    fireEvent.click(screen.getByRole("button", { name: "Copied" }));

    expect(
      await screen.findByText("Clipboard access is unavailable in this browser."),
    ).toBeVisible();
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      {
        tags: { feature: "team", operation: "copy_invite_link" },
      },
      { sanitize: true },
    );
    expect(JSON.stringify(mockCaptureAppException.mock.calls)).not.toContain("token-1");
  });

  it("surfaces invite creation errors", async () => {
    mockCreateInvite.mockRejectedValueOnce("nope");

    render(React.createElement(TeamSettingsPage));
    fireEvent.click(screen.getByRole("button", { name: "Create invite" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeVisible();
  });

  it("updates member role, permissions, and active state", async () => {
    render(React.createElement(TeamSettingsPage));

    fireEvent.change(screen.getByLabelText("Case Manager role"), {
      target: { value: "editor" },
    });
    fireEvent.change(screen.getByLabelText("Case Manager Grants permission"), {
      target: { value: "manage" },
    });
    // Click the row-level Remove button to open the confirm dialog
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    // Confirm in the dialog (the dialog confirm button also has label "Remove")
    fireEvent.click(screen.getByRole("dialog").querySelector("button")!);

    await waitFor(() => expect(mockUpdateMember).toHaveBeenCalledTimes(3));
    expect(mockUpdateMember).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: "member-1",
        data: expect.objectContaining({ role: "editor" }),
      }),
    );
    expect(mockUpdateMember).toHaveBeenCalledWith({
      memberId: "member-1",
      data: { permissions: { grants: "manage" } },
    });
    expect(mockUpdateMember).toHaveBeenCalledWith({
      memberId: "member-1",
      data: { active: false },
    });
  });

  it("surfaces member mutation errors and locks admin controls", async () => {
    mockUseOrgTeam.mockReturnValue({
      data: [
        {
          id: "member-admin",
          role: "admin",
          permissions: null,
          user: { email: "admin@example.org" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUpdateMember.mockRejectedValueOnce(new Error("Role update failed"));

    render(React.createElement(TeamSettingsPage));

    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("member-admin Grants permission")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("member-admin role"), {
      target: { value: "viewer" },
    });

    expect(await screen.findByText("Role update failed")).toBeVisible();
  });

  it("surfaces member permission update errors", async () => {
    mockUpdateMember.mockRejectedValueOnce(new Error("Permission update failed"));

    render(React.createElement(TeamSettingsPage));

    fireEvent.change(screen.getByLabelText("Case Manager Grants permission"), {
      target: { value: "manage" },
    });

    expect(await screen.findByText("Permission update failed")).toBeVisible();
  });

  it("uses member id fallbacks and surfaces remove errors", async () => {
    mockUseOrgTeam.mockReturnValue({
      data: [
        {
          id: "member-fallback",
          role: "auditor",
          permissions: undefined,
          user: null,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUpdateMember.mockRejectedValueOnce(new Error("Remove failed"));

    render(React.createElement(TeamSettingsPage));

    expect(screen.getByText("member-fallback")).toBeVisible();
    expect(screen.getByLabelText("member-fallback Grants permission")).toBeEnabled();

    // Click the row-level Remove button to open the confirm dialog
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    // Confirm in the dialog
    fireEvent.click(screen.getByRole("dialog").querySelector("button")!);

    expect(await screen.findByText("Remove failed")).toBeVisible();
  });

  it("shows confirm dialog when Remove is clicked and cancels without removing", () => {
    render(React.createElement(TeamSettingsPage));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mockUpdateMember).not.toHaveBeenCalled();
  });

  it("closes the confirm dialog when Cancel is clicked and does not remove the member", () => {
    render(React.createElement(TeamSettingsPage));

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockUpdateMember).not.toHaveBeenCalled();
  });

  it("uses the member email in the confirm dialog title when the user has no display name", () => {
    mockUseOrgTeam.mockReturnValue({
      data: [
        {
          id: "member-email-only",
          role: "viewer",
          permissions: null,
          user: { name: null, email: "noname@example.org" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(TeamSettingsPage));

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("scopes the Remove button disable to the in-flight row only", () => {
    mockUseOrgTeam.mockReturnValue({
      data: [
        { id: "member-A", role: "viewer", permissions: null, user: { name: "Alice" } },
        { id: "member-B", role: "viewer", permissions: null, user: { name: "Bob" } },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseOrgSettingsMutations.mockReturnValue({
      createInvite: { mutateAsync: vi.fn(), isPending: false },
      updateMember: {
        mutateAsync: vi.fn(),
        isPending: true,
        variables: { memberId: "member-A", data: { active: false } },
      },
      assignEntityAccess: { mutateAsync: vi.fn(), isPending: false },
      updateEntityAccess: { mutateAsync: vi.fn(), isPending: false },
      revokeEntityAccess: { mutateAsync: vi.fn(), isPending: false },
    });

    render(React.createElement(TeamSettingsPage));

    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons[0]).toBeDisabled();
    expect(removeButtons[1]).not.toBeDisabled();
  });

  it("uses empty permissions object when member.permissions is null and a permission is changed", async () => {
    mockUseOrgTeam.mockReturnValue({
      data: [
        {
          id: "member-null-perms",
          role: "viewer",
          permissions: null,
          user: { name: "Null Perms User", email: "nullperms@example.org" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(React.createElement(TeamSettingsPage));

    fireEvent.change(screen.getByLabelText("Null Perms User Grants permission"), {
      target: { value: "edit" },
    });

    await waitFor(() => {
      expect(mockUpdateMember).toHaveBeenCalledWith(
        expect.objectContaining({
          memberId: "member-null-perms",
          data: expect.objectContaining({ permissions: expect.any(Object) }),
        }),
      );
    });
  });
});
