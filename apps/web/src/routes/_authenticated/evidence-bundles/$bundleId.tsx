import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  PageHeader,
  PageShell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@grantpipe/ui";
import { EXTERNAL_REVIEW_SCOPE_TYPES, type ExternalReviewScopeType } from "@grantpipe/shared";
import { useBundle, useBundleMutations } from "../../../hooks/use-external-reviewers";
import { useSession } from "../../../hooks/use-session";
import { QuickShareSheet } from "../../../components/portal/QuickShareSheet";
import { canAccessFeature } from "../../../lib/access-control";
import { humanizeEnum, formatUtcCalendarDate } from "../../../lib/format";

export const Route = createFileRoute("/_authenticated/evidence-bundles/$bundleId")({
  component: BundleDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-destructive">
      <p className="font-semibold">Unable to load page</p>
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Unknown error"}
      </p>
    </div>
  ),
  pendingComponent: () => (
    <div className="p-8 space-y-4">
      <Skeleton className="h-8 w-64 mb-1" />
      <Skeleton className="h-4 w-48 mb-6" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  ),
});

type BundleItem = {
  id: string;
  itemType: string;
  itemId: string;
  caption?: string | null;
  sortOrder: number;
};

type BundleDetail = {
  id: string;
  title: string;
  purpose: string;
  description?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  publishedAt?: string | null;
  items?: BundleItem[];
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function isBundle(value: unknown): value is { bundle: BundleDetail } {
  return (
    typeof value === "object" &&
    value !== null &&
    "bundle" in value &&
    typeof (value as Record<string, unknown>).bundle === "object"
  );
}

function extractBundleItems(value: unknown, bundle: BundleDetail | undefined): BundleItem[] {
  if (typeof value === "object" && value !== null) {
    const topLevelItems = (value as Record<string, unknown>).items;
    if (Array.isArray(topLevelItems)) return topLevelItems as BundleItem[];
  }
  return bundle?.items ?? [];
}

function BundleDetailPage() {
  const { bundleId } = Route.useParams();
  const { memberRole, memberPermissions } = useSession();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "compliance", "edit");
  const canPublish = canAccessFeature(memberRole, memberPermissions, "compliance", "manage");

  const bundleQuery = useBundle(bundleId);
  const mutations = useBundleMutations();

  const rawData = bundleQuery.data;
  const bundle: BundleDetail | undefined = isBundle(rawData) ? rawData.bundle : undefined;
  const items: BundleItem[] = extractBundleItems(rawData, bundle).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const [addItemOpen, setAddItemOpen] = useState(false);
  const [itemType, setItemType] = useState<ExternalReviewScopeType>("grant");
  const [itemId, setItemId] = useState("");
  const [itemCaption, setItemCaption] = useState("");
  const [addItemError, setAddItemError] = useState<string | null>(null);

  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [reorderingItemId, setReorderingItemId] = useState<string | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const [editHeader, setEditHeader] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [mutationError, setMutationError] = useState<string | null>(null);

  if (bundleQuery.isLoading && !bundle) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-64 mb-1" />
        <Skeleton className="h-4 w-48 mb-6" />
        <Skeleton className="h-40 rounded-2xl" />
      </PageShell>
    );
  }

  if (bundleQuery.isError && !bundle) {
    return (
      <PageShell>
        <Alert variant="destructive" title="Unable to load bundle.">
          {getErrorMessage(bundleQuery.error)}
        </Alert>
      </PageShell>
    );
  }

  if (!bundle) {
    return (
      <PageShell>
        <Alert variant="destructive" title="Bundle not found." />
      </PageShell>
    );
  }

  async function handleAddItem() {
    if (!itemId.trim()) {
      setAddItemError("Entity ID is required.");
      return;
    }
    try {
      await mutations.addBundleItem.mutateAsync({
        bundleId,
        data: {
          itemType,
          itemId: itemId.trim(),
          caption: itemCaption.trim() || undefined,
          sortOrder: items.length,
        },
      });
      setAddItemOpen(false);
      setItemId("");
      setItemCaption("");
      setAddItemError(null);
    } catch (err) {
      setAddItemError(getErrorMessage(err));
    }
  }

  async function handleRemoveItem(itemId: string) {
    try {
      await mutations.removeBundleItem.mutateAsync({ bundleId, itemId });
      setRemoveConfirmId(null);
      setMutationError(null);
    } catch (err) {
      setMutationError(getErrorMessage(err));
      setRemoveConfirmId(null);
    }
  }

  async function handleMoveUp(index: number) {
    if (index === 0) return;
    const reordered = [...items];
    const above = reordered[index - 1];
    const current = reordered[index];
    if (!above || !current) return;
    reordered[index - 1] = current;
    reordered[index] = above;
    setReorderingItemId(current.id);
    try {
      await mutations.reorderBundleItems.mutateAsync({
        bundleId,
        itemIds: reordered.map((i) => i.id),
      });
    } catch (err) {
      setMutationError(getErrorMessage(err));
    } finally {
      setReorderingItemId(null);
    }
  }

  async function handleMoveDown(index: number) {
    if (index === items.length - 1) return;
    const reordered = [...items];
    const below = reordered[index + 1];
    const current = reordered[index];
    if (!below || !current) return;
    reordered[index + 1] = current;
    reordered[index] = below;
    setReorderingItemId(current.id);
    try {
      await mutations.reorderBundleItems.mutateAsync({
        bundleId,
        itemIds: reordered.map((i) => i.id),
      });
    } catch (err) {
      setMutationError(getErrorMessage(err));
    } finally {
      setReorderingItemId(null);
    }
  }

  async function handlePublish() {
    try {
      await mutations.publishBundle.mutateAsync(bundleId);
      setPublishConfirmOpen(false);
      setMutationError(null);
    } catch (err) {
      setMutationError(getErrorMessage(err));
    }
  }

  async function handleSaveHeader() {
    if (!editTitle.trim()) {
      setEditError("Title is required.");
      return;
    }
    try {
      await mutations.updateBundle.mutateAsync({
        id: bundleId,
        data: { title: editTitle.trim() },
      });
      setEditHeader(false);
      setEditError(null);
    } catch (err) {
      setEditError(getErrorMessage(err));
    }
  }

  return (
    <PageShell>
      {bundleQuery.isError ? (
        <Alert variant="destructive" title="Bundle data may be stale." />
      ) : null}

      {mutationError ? <Alert variant="destructive">{mutationError}</Alert> : null}

      <PageHeader
        variant="workbench"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/evidence-bundles">Evidence bundles</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{bundle.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={bundle.title}
        description={
          [
            humanizeEnum(bundle.purpose),
            bundle.periodStart && bundle.periodEnd
              ? `${formatUtcCalendarDate(bundle.periodStart)} to ${formatUtcCalendarDate(bundle.periodEnd)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={bundle.publishedAt ? "default" : "secondary"}
              className={bundle.publishedAt ? "bg-primary/10 text-primary" : undefined}
            >
              {bundle.publishedAt ? "Published" : "Draft"}
            </Badge>
            {canEdit && !editHeader ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditTitle(bundle.title);
                  setEditHeader(true);
                  setEditError(null);
                }}
              >
                Edit title
              </Button>
            ) : null}
            {!bundle.publishedAt && canPublish ? (
              <Button size="sm" onClick={() => setPublishConfirmOpen(true)}>
                Publish bundle
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
              Share bundle
            </Button>
          </div>
        }
      />

      {editHeader ? (
        <div className="flex items-center gap-2">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="max-w-sm"
            autoFocus
            aria-label="Bundle title"
          />
          <Button size="sm" onClick={() => void handleSaveHeader()}>
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditHeader(false);
              setEditError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {editError ? <Alert variant="destructive">{editError}</Alert> : null}

      {/* Bundle items */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-base font-semibold text-foreground">Bundle items</h2>
          {canEdit ? (
            <Dialog
              open={addItemOpen}
              onOpenChange={(next) => {
                setAddItemOpen(next);
                if (!next) {
                  setItemId("");
                  setItemCaption("");
                  setAddItemError(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">Add item</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add bundle item</DialogTitle>
                  <DialogDescription>
                    Add a grant, fund, document, or other record to this bundle.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Item type</Label>
                    <Select
                      value={itemType}
                      onValueChange={(v) => setItemType(v as ExternalReviewScopeType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXTERNAL_REVIEW_SCOPE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {humanizeEnum(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="item-id">Entity ID</Label>
                    <Input
                      id="item-id"
                      value={itemId}
                      onChange={(e) => setItemId(e.target.value)}
                      placeholder="Paste the entity ID from the record"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="item-caption">Caption (optional)</Label>
                    <Input
                      id="item-caption"
                      value={itemCaption}
                      onChange={(e) => setItemCaption(e.target.value)}
                      placeholder="e.g. Primary grant agreement"
                    />
                  </div>
                  {addItemError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {addItemError}
                    </p>
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAddItemOpen(false);
                        setAddItemError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={mutations.addBundleItem.isPending}
                      onClick={() => void handleAddItem()}
                    >
                      Add item
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No items yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add grants, funds, documents, or reports to this bundle.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    {canEdit ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={
                            index === 0 ||
                            (mutations.reorderBundleItems.isPending && reorderingItemId === item.id)
                          }
                          aria-label="Move up"
                          onClick={() => void handleMoveUp(index)}
                        >
                          ▲
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={
                            index === items.length - 1 ||
                            (mutations.reorderBundleItems.isPending && reorderingItemId === item.id)
                          }
                          aria-label="Move down"
                          onClick={() => void handleMoveDown(index)}
                        >
                          ▼
                        </Button>
                      </>
                    ) : null}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {humanizeEnum(item.itemType)}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">
                        {item.itemId.slice(0, 12)}...
                      </span>
                    </div>
                    {item.caption ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.caption}</p>
                    ) : null}
                  </div>
                </div>
                {canEdit ? (
                  <Button size="sm" variant="outline" onClick={() => setRemoveConfirmId(item.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remove item confirm dialog */}
      <Dialog
        open={removeConfirmId !== null}
        onOpenChange={(next) => {
          if (!next) setRemoveConfirmId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove item?</DialogTitle>
            <DialogDescription>Remove this item from the bundle?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setRemoveConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={mutations.removeBundleItem.isPending}
              onClick={() => removeConfirmId && void handleRemoveItem(removeConfirmId)}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Publish confirm dialog */}
      <Dialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish bundle</DialogTitle>
            <DialogDescription>
              Publishing lets you share this bundle with reviewers. You can still add items after
              you publish.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setPublishConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={mutations.publishBundle.isPending}
              onClick={() => void handlePublish()}
            >
              Publish
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick share sheet */}
      <QuickShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        scopeType="evidence_bundle"
        scopeId={bundleId}
        entityName={bundle.title}
      />
    </PageShell>
  );
}
