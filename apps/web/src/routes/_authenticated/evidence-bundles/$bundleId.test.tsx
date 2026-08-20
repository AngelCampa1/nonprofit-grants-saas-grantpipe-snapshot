import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  useBundle: vi.fn(),
  useBundleMutations: vi.fn(),
  addBundleItem: vi.fn(),
  removeBundleItem: vi.fn(),
  reorderBundleItems: vi.fn(),
  publishBundle: vi.fn(),
  updateBundle: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useParams: () => ({ bundleId: "bundle-1" }),
  }),
  Link: ({
    children,
    to = "",
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../../../hooks/use-session", () => ({
  useSession: () => mocks.useSession(),
}));

vi.mock("../../../hooks/use-external-reviewers", () => ({
  useBundle: (id: string) => mocks.useBundle(id),
  useBundleMutations: () => mocks.useBundleMutations(),
}));

vi.mock("../../../components/portal/QuickShareSheet", () => ({
  QuickShareSheet: ({
    open,
    entityName,
    scopeType,
    scopeId,
  }: {
    open: boolean;
    entityName: string;
    scopeType: string;
    scopeId: string;
  }) =>
    open ? (
      <div data-testid="quick-share">
        Share {entityName} as {scopeType}:{scopeId}
      </div>
    ) : null,
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    Dialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
      children?: React.ReactNode;
    }) => (
      <div data-open={open ? "true" : "false"}>
        {children}
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Mock close dialog
        </button>
      </div>
    ),
    DialogTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
    Breadcrumb: ({ children }: { children?: React.ReactNode }) => <nav>{children}</nav>,
    BreadcrumbList: ({ children }: { children?: React.ReactNode }) => <ol>{children}</ol>,
    BreadcrumbItem: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
    BreadcrumbLink: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    BreadcrumbPage: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    BreadcrumbSeparator: () => <span>/</span>,
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string;
      onValueChange?: (value: string) => void;
      children?: React.ReactNode;
    }) => (
      <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
        {children}
      </select>
    ),
    SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

import { Route } from "./$bundleId";

const BundleDetailPage = (Route as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

describe("BundleDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ memberRole: "admin" });
    mocks.useBundle.mockReturnValue({
      data: {
        bundle: {
          id: "bundle-1",
          title: "FY2026 Audit Pack",
          purpose: "audit",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
          publishedAt: null,
          items: [
            {
              id: "item-2",
              itemType: "document",
              itemId: "document-abcdefghijk",
              caption: "Grant agreement",
              sortOrder: 2,
            },
            {
              id: "item-1",
              itemType: "grant",
              itemId: "grant-abcdefghijk",
              caption: null,
              sortOrder: 1,
            },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });
    mocks.addBundleItem.mockResolvedValue({});
    mocks.removeBundleItem.mockResolvedValue({});
    mocks.reorderBundleItems.mockResolvedValue({});
    mocks.publishBundle.mockResolvedValue({});
    mocks.updateBundle.mockResolvedValue({});
    mocks.useBundleMutations.mockReturnValue({
      addBundleItem: { mutateAsync: mocks.addBundleItem, isPending: false },
      removeBundleItem: { mutateAsync: mocks.removeBundleItem, isPending: false },
      reorderBundleItems: { mutateAsync: mocks.reorderBundleItems, isPending: false },
      publishBundle: { mutateAsync: mocks.publishBundle, isPending: false },
      updateBundle: { mutateAsync: mocks.updateBundle, isPending: false },
    });
  });

  it("renders bundle metadata, sorted items, and opens quick share", () => {
    render(<BundleDetailPage />);

    expect(screen.getByRole("heading", { name: "FY2026 Audit Pack" })).toBeVisible();
    expect(screen.getByText("Audit · Jan 1, 2026 to Mar 31, 2026")).toBeVisible();
    expect(screen.getByText("grant-abcdef...")).toBeVisible();
    expect(screen.getByText("document-abc...")).toBeVisible();
    expect(screen.getByText("Grant agreement")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Share bundle" }));
    expect(screen.getByTestId("quick-share")).toHaveTextContent(
      "Share FY2026 Audit Pack as evidence_bundle:bundle-1",
    );
  });

  it("renders items returned from the API detail response shape", () => {
    mocks.useBundle.mockReturnValue({
      data: {
        bundle: {
          id: "bundle-1",
          title: "Title III-C Closeout Evidence Pack",
          purpose: "closeout",
          periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-03-31T00:00:00.000Z",
          publishedAt: "2026-05-12T00:00:00.000Z",
        },
        items: [
          {
            id: "item-1",
            itemType: "document",
            itemId: "document-abcdefghijk",
            caption: "Signed grant agreement used as source documentation.",
            sortOrder: 0,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<BundleDetailPage />);

    expect(screen.getByText("document-abc...")).toBeVisible();
    expect(screen.getByText("Signed grant agreement used as source documentation.")).toBeVisible();
    expect(screen.queryByText("No items yet")).not.toBeInTheDocument();
  });

  it("adds, removes, reorders, publishes, and edits bundle data", async () => {
    render(<BundleDetailPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Add item" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Add item" }).at(-1)!);
    expect(screen.getByText("Entity ID is required.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Entity ID"), { target: { value: "fund-1" } });
    fireEvent.change(screen.getByLabelText("Caption (optional)"), {
      target: { value: "Fund ledger" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add item" }).at(-1)!);
    await waitFor(() =>
      expect(mocks.addBundleItem).toHaveBeenCalledWith({
        bundleId: "bundle-1",
        data: {
          itemType: "grant",
          itemId: "fund-1",
          caption: "Fund ledger",
          sortOrder: 2,
        },
      }),
    );

    fireEvent.click(screen.getAllByLabelText("Move down")[0]!);
    await waitFor(() =>
      expect(mocks.reorderBundleItems).toHaveBeenCalledWith({
        bundleId: "bundle-1",
        itemIds: ["item-2", "item-1"],
      }),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" }).at(-1)!);
    await waitFor(() =>
      expect(mocks.removeBundleItem).toHaveBeenCalledWith({
        bundleId: "bundle-1",
        itemId: "item-1",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish bundle" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(mocks.publishBundle).toHaveBeenCalledWith("bundle-1"));

    fireEvent.click(screen.getByRole("button", { name: "Edit title" }));
    fireEvent.change(screen.getByLabelText("Bundle title"), {
      target: { value: "Updated Audit Pack" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.updateBundle).toHaveBeenCalledWith({
        id: "bundle-1",
        data: { title: "Updated Audit Pack" },
      }),
    );
  });

  it("covers route fallback components and secondary dialog controls", async () => {
    const routeForTest = Route as unknown as {
      errorComponent?: React.ComponentType<{ error: unknown }>;
      pendingComponent?: React.ComponentType;
    };
    const ErrorComponent = routeForTest.errorComponent;
    const PendingComponent = routeForTest.pendingComponent;

    if (!ErrorComponent || !PendingComponent) {
      throw new Error("Expected route fallback components");
    }

    const { rerender } = render(<ErrorComponent error={new Error("Route broke")} />);
    expect(screen.getByText("Unable to load page")).toBeVisible();
    expect(screen.getByText("Route broke")).toBeVisible();

    rerender(<ErrorComponent error="not-an-error" />);
    expect(screen.getByText("Unknown error")).toBeVisible();

    rerender(<PendingComponent />);
    expect(document.querySelector("[data-slot='skeleton']")).toBeInTheDocument();

    render(<BundleDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Edit title" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);

    fireEvent.click(screen.getAllByRole("button", { name: "Add item" })[0]!);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "document" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Mock close dialog" })[0]!);
    fireEvent.change(screen.getByLabelText("Entity ID"), {
      target: { value: " document-from-secondary-test " },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add item" }).at(-1)!);

    await waitFor(() =>
      expect(mocks.addBundleItem).toHaveBeenLastCalledWith({
        bundleId: "bundle-1",
        data: {
          itemType: "document",
          itemId: "document-from-secondary-test",
          caption: undefined,
          sortOrder: 2,
        },
      }),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Add item" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);

    fireEvent.click(screen.getAllByLabelText("Move up")[1]!);
    await waitFor(() =>
      expect(mocks.reorderBundleItems).toHaveBeenLastCalledWith({
        bundleId: "bundle-1",
        itemIds: ["item-2", "item-1"],
      }),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Mock close dialog" })[1]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);

    fireEvent.click(screen.getByRole("button", { name: "Publish bundle" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);
  });

  it("surfaces mutation errors from item, reorder, publish, and title actions", async () => {
    mocks.addBundleItem.mockRejectedValueOnce("bad add");
    mocks.removeBundleItem.mockRejectedValueOnce(new Error("Remove failed"));
    mocks.reorderBundleItems
      .mockRejectedValueOnce(new Error("Move up failed"))
      .mockRejectedValueOnce(new Error("Move down failed"));
    mocks.publishBundle.mockRejectedValueOnce(new Error("Publish failed"));
    mocks.updateBundle.mockRejectedValueOnce(new Error("Rename failed"));

    render(<BundleDetailPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Add item" })[0]!);
    fireEvent.change(screen.getByLabelText("Entity ID"), { target: { value: "grant-fail" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add item" }).at(-1)!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" }).at(-1)!);
    expect(await screen.findByText("Remove failed")).toBeVisible();

    fireEvent.click(screen.getAllByLabelText("Move up")[1]!);
    expect(await screen.findByText("Move up failed")).toBeVisible();

    fireEvent.click(screen.getAllByLabelText("Move down")[0]!);
    expect(await screen.findByText("Move down failed")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Publish bundle" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Publish failed")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Edit title" }));
    fireEvent.change(screen.getByLabelText("Bundle title"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Title is required.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Bundle title"), {
      target: { value: "Rename failure" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Rename failed")).toBeVisible();
  });

  it("renders loading, load-error, not-found, stale-error, and viewer states", () => {
    mocks.useBundle.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false });
    const { rerender } = render(<BundleDetailPage />);
    expect(document.querySelector("[data-slot='skeleton']")).toBeInTheDocument();

    mocks.useBundle.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Bundle failed"),
    });
    rerender(<BundleDetailPage />);
    expect(screen.getByText("Unable to load bundle.")).toBeVisible();
    expect(screen.getByText("Bundle failed")).toBeVisible();

    mocks.useBundle.mockReturnValueOnce({ data: {}, isLoading: false, isError: false });
    rerender(<BundleDetailPage />);
    expect(screen.getByText("Bundle not found.")).toBeVisible();

    mocks.useSession.mockReturnValue({ memberRole: "viewer" });
    mocks.useBundle.mockReturnValue({
      data: {
        bundle: {
          id: "bundle-1",
          title: "Published Pack",
          purpose: "audit",
          items: [
            {
              id: "item-viewer",
              itemType: "grant",
              itemId: "grant-viewer-item",
              sortOrder: 0,
            },
          ],
        },
      },
      isLoading: false,
      isError: true,
      error: new Error("stale"),
    });
    rerender(<BundleDetailPage />);
    expect(screen.getByText("Bundle data may be stale.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit title" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish bundle" })).not.toBeInTheDocument();

    mocks.useBundle.mockReturnValue({
      data: { bundle: { id: "bundle-1", title: "Untyped Pack", purpose: "", items: [] } },
      isLoading: false,
      isError: false,
    });
    rerender(<BundleDetailPage />);
    expect(screen.getByRole("heading", { name: "Untyped Pack" })).toBeVisible();
  });

  it("uses explicit compliance permissions for edit and publish actions", () => {
    mocks.useSession.mockReturnValue({
      memberRole: "viewer",
      memberPermissions: { compliance: "manage" },
    });

    render(<BundleDetailPage />);

    expect(screen.getByRole("button", { name: "Edit title" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Add item" })[0]).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish bundle" })).toBeVisible();
  });

  it("while a reorder is pending for one row, other rows' reorder buttons remain enabled", async () => {
    // item-1 (sortOrder 1) maps to row[0] after sort; item-2 (sortOrder 2) maps to row[1]
    // Simulate reorder mutation pending scoped to item-1's id
    mocks.useBundleMutations.mockReturnValue({
      addBundleItem: { mutateAsync: mocks.addBundleItem, isPending: false },
      removeBundleItem: { mutateAsync: mocks.removeBundleItem, isPending: false },
      reorderBundleItems: { mutateAsync: mocks.reorderBundleItems, isPending: true },
      publishBundle: { mutateAsync: mocks.publishBundle, isPending: false },
      updateBundle: { mutateAsync: mocks.updateBundle, isPending: false },
    });

    // Render with two items so both up/down buttons exist
    render(<BundleDetailPage />);

    // Trigger move-down on first item (item-1) to set reorderingItemId to "item-1"
    // Since isPending=true from the start we need to simulate mid-flight state
    // by capturing state after a click while isPending is true
    mocks.reorderBundleItems.mockImplementation(
      () =>
        new Promise((resolve) => {
          // never resolves during this test — simulates in-flight
          void resolve;
        }),
    );

    const moveDownButtons = screen.getAllByLabelText("Move down");
    const moveUpButtons = screen.getAllByLabelText("Move up");

    // Before any click: isPending=true globally, but reorderingItemId=null,
    // so ALL buttons should still be enabled (no row is actively being moved yet)
    expect(moveDownButtons[0]).not.toBeDisabled();
    expect(moveUpButtons[1]).not.toBeDisabled();

    // Click move-down on row[0] — this sets reorderingItemId = "item-1"
    fireEvent.click(moveDownButtons[0]!);

    // Row[0] (item-1) button that was clicked should now be disabled (pending + matching id)
    // Row[1] (item-2) buttons should remain enabled (pending but different id)
    await waitFor(() => {
      const updatedMoveDown = screen.getAllByLabelText("Move down");
      const updatedMoveUp = screen.getAllByLabelText("Move up");
      expect(updatedMoveDown[0]).toBeDisabled();
      expect(updatedMoveUp[1]).not.toBeDisabled();
    });
  });
});
