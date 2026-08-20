import React, { useState, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Breadcrumb,
  InlineError,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@grantpipe/ui";
import {
  useFunder,
  useFunderContactMutations,
  useFunderUpdateMutations,
} from "../../../hooks/use-grants";
import {
  createFunderContactSchema,
  FUNDER_TYPES,
  type FunderType,
  updateFunderContactSchema as sharedUpdateFunderContactSchema,
} from "@grantpipe/shared";
import { EntityActivitySection } from "../../../components/entity-activity-section";
import { RetryButton } from "../../../components/retry-button";
import { EntityDocumentsSection } from "../../../components/entity-documents-section";
import { formatFunderTypeLabel, humanizeEnum } from "../../../lib/format";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import { captureDetailTabViewed } from "../../../lib/record-discovery-analytics";

export const Route = createFileRoute("/_authenticated/funders/$funderId")({
  component: FunderDetailPage,
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
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-40" />
    </div>
  ),
});

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildContactPayload(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const title = nullableText(String(form.get("title") ?? ""));
  const email = nullableText(String(form.get("email") ?? ""));

  return {
    name,
    ...(title ? { title } : {}),
    ...(email ? { email } : {}),
  };
}

function buildContactUpdatePayload(form: FormData) {
  return {
    name: String(form.get("name") ?? "").trim(),
    title: nullableText(String(form.get("title") ?? "")),
    email: nullableText(String(form.get("email") ?? "")),
  };
}

function FunderDetailPage() {
  const { funderId } = Route.useParams();
  const { memberRole, memberPermissions } = useSession();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "grants", "edit");
  const canDelete = canAccessFeature(memberRole, memberPermissions, "grants", "manage");
  const navigate = useNavigate();
  const funderQuery = useFunder(funderId);
  const funderMutations = useFunderUpdateMutations(funderId);
  const contactMutations = useFunderContactMutations(funderId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const funder = funderQuery.data as Record<string, unknown> | undefined;
  const [funderType, setFunderType] = useState<FunderType>(
    () =>
      ((funderQuery.data as Record<string, unknown> | undefined)?.type as FunderType | undefined) ??
      "foundation",
  );
  // The funder loads asynchronously, so the lazy initializer above runs during
  // the loading render before `type` is known and falls back to "foundation".
  // Sync the editable select to the real type when it arrives (and whenever it
  // changes) so the dropdown can't misreport — and a blind Save can't
  // overwrite — the stored type. Adjusting state during render (rather than in
  // an effect) avoids a cascading re-render and preserves in-progress edits:
  // we only re-sync when the loaded value itself changes.
  const loadedFunderType = funder?.type as FunderType | undefined;
  const [lastSyncedType, setLastSyncedType] = useState<FunderType | undefined>(loadedFunderType);
  if (loadedFunderType && loadedFunderType !== lastSyncedType) {
    setLastSyncedType(loadedFunderType);
    setFunderType(loadedFunderType);
  }
  const previousTabRef = useRef("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const closeDeleteContact = () => setDeletingContactId(null);
  const [editingContactError, setEditingContactError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function runFunderAction(action: () => Promise<unknown>) {
    setActionError(null);
    return action().catch((error) => {
      setActionError(error instanceof Error ? error.message : "Unable to complete this action.");
    });
  }

  if (funderQuery.isLoading && !funder) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </PageShell>
    );
  }

  if (funderQuery.isError && !funder) {
    return (
      <PageShell>
        <Alert variant="destructive" title="Unable to load funder.">
          <RetryButton query={funderQuery} />
        </Alert>
      </PageShell>
    );
  }

  if (!funder) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </PageShell>
    );
  }

  const contacts = (funder.contacts ?? []) as Array<{
    id: string;
    name: string;
    title?: string | null;
    email?: string | null;
  }>;
  const grants = (funder.grants ?? []) as Array<{ id: string; name: string; status: string }>;
  const funderName = String(funder.name ?? "Funder");

  return (
    <PageShell>
      {funderQuery.isError ? (
        <Alert variant="destructive" title="Funder data may be stale.">
          Unable to refresh the funder data. You are seeing the last saved version.
        </Alert>
      ) : null}
      {actionError ? (
        <Alert variant="destructive" title="Unable to complete the action">
          <p>{actionError}</p>
        </Alert>
      ) : null}

      <PageHeader
        variant="workbench"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/funders">Funders</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{funderName}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={funderName}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {formatFunderTypeLabel(String(funder.type ?? "foundation"))}
            </Badge>
            {canDelete ? (
              <Dialog
                open={deleteOpen}
                onOpenChange={(nextOpen) => {
                  setDeleteOpen(nextOpen);
                  if (!nextOpen) setDeleteError(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Delete funder
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete funder?</DialogTitle>
                    <DialogDescription>
                      Permanently remove this funder from your organization.
                    </DialogDescription>
                  </DialogHeader>
                  <p>
                    Are you sure you want to delete{" "}
                    <strong>{String(funder.name ?? "this funder")}</strong>? This action cannot be
                    undone.
                  </p>
                  {deleteError ? <InlineError className="mt-4">{deleteError}</InlineError> : null}
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={funderMutations.deleteFunder.isPending}
                      onClick={async () => {
                        try {
                          await funderMutations.deleteFunder.mutateAsync();
                          void navigate({ to: "/funders" });
                        } catch (error) {
                          setDeleteError(
                            error instanceof Error ? error.message : "Unable to delete funder.",
                          );
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        }
      />

      <Tabs
        defaultValue="overview"
        className="flex flex-col gap-6"
        onValueChange={(value) => {
          captureDetailTabViewed("funders", value, previousTabRef.current);
          previousTabRef.current = value;
        }}
      >
        <TabsList variant="record">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Program Officers</TabsTrigger>
          <TabsTrigger value="grants">Grant History</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* ----- Overview Tab ----- */}
        <TabsContent value="overview" className="space-y-6 pt-4">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Funder details</h2>
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setSaveError(null);
                const form = new FormData(event.currentTarget);
                try {
                  await funderMutations.updateFunder.mutateAsync({
                    name: String(form.get("funderName") ?? "").trim() || undefined,
                    type: funderType,
                    website: nullableText(String(form.get("website") ?? "")),
                    priorities: nullableText(String(form.get("priorities") ?? "")),
                    notes: nullableText(String(form.get("notes") ?? "")),
                  });
                  setSaveError(null);
                } catch (error) {
                  setSaveError(error instanceof Error ? error.message : "Unable to save funder.");
                }
              }}
            >
              {saveError ? <InlineError className="w-full">{saveError}</InlineError> : null}
              <div className="space-y-1">
                <Label htmlFor="funder-name">Funder name</Label>
                <Input
                  id="funder-name"
                  name="funderName"
                  placeholder="e.g. National Science Foundation"
                  defaultValue={String(funder.name ?? "")}
                  required
                  className="max-w-md"
                />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select
                  value={funderType}
                  onValueChange={(val) => setFunderType(val as FunderType)}
                >
                  <SelectTrigger aria-label="Type" className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUNDER_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {formatFunderTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="funder-website">Website</Label>
                <Input
                  id="funder-website"
                  name="website"
                  type="url"
                  placeholder="https://example.org"
                  defaultValue={String(funder.website ?? "")}
                  className="max-w-md"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="funder-priorities">Funding priorities</Label>
                <Textarea
                  id="funder-priorities"
                  name="priorities"
                  placeholder="Describe the funder's focus areas and priorities."
                  defaultValue={String(funder.priorities ?? "")}
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="funder-notes">Notes</Label>
                <Textarea
                  id="funder-notes"
                  name="notes"
                  placeholder="Internal notes, relationship history, and context."
                  defaultValue={String(funder.notes ?? "")}
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                {canEdit ? <Button type="submit">Save changes</Button> : null}
              </div>
            </form>
          </section>
        </TabsContent>

        {/* ----- Program Officers Tab ----- */}
        <TabsContent value="contacts" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Program officers</h2>
            {canEdit ? (
              <Dialog
                open={open}
                onOpenChange={(nextOpen) => {
                  setOpen(nextOpen);
                  setContactError(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm">Add contact</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add funder contact</DialogTitle>
                    <DialogDescription>
                      Add a program officer or staff contact for this funder.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onChange={() => {
                      if (contactError) setContactError(null);
                    }}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const payload = buildContactPayload(form);

                      if (payload.name.length === 0) {
                        setContactError("Contact name is required");
                        return;
                      }

                      const parsed = createFunderContactSchema.safeParse(payload);
                      if (!parsed.success) {
                        setContactError(
                          parsed.error.issues[0]?.message ?? "Unable to save funder contact.",
                        );
                        return;
                      }

                      try {
                        await contactMutations.createContact.mutateAsync(parsed.data);
                        setContactError(null);
                        setOpen(false);
                      } catch (error) {
                        setContactError(
                          error instanceof Error ? error.message : "Unable to save funder contact.",
                        );
                      }
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="new-contact-name">Name</Label>
                      <Input id="new-contact-name" name="name" placeholder="Full name" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-contact-title">Title</Label>
                      <Input
                        id="new-contact-title"
                        name="title"
                        placeholder="e.g. Program Officer"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-contact-email">Email</Label>
                      <Input
                        id="new-contact-email"
                        name="email"
                        type="email"
                        placeholder="name@example.org"
                      />
                    </div>
                    {contactError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {contactError}
                      </p>
                    ) : null}
                    <Button
                      className="w-full"
                      type="submit"
                      disabled={contactMutations.createContact.isPending}
                    >
                      Save contact
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          {contacts.map((contact) => (
            <div key={contact.id} className="rounded-2xl border p-4">
              <p className="font-medium text-foreground">{contact.name}</p>
              <p className="text-sm text-muted-foreground">{contact.title ?? "No title"}</p>
              <p className="text-sm text-muted-foreground">{contact.email ?? "No email"}</p>
              {canEdit || canDelete ? (
                <div className="mt-2 flex gap-2">
                  {canEdit ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setEditingContactId(contact.id);
                        setEditingContactError(null);
                      }}
                    >
                      Edit contact {contact.name}
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDeletingContactId(contact.id)}
                      >
                        Delete contact {contact.name}
                      </Button>
                      <Dialog
                        open={deletingContactId === contact.id}
                        onOpenChange={closeDeleteContact}
                      >
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Delete contact?</DialogTitle>
                            <DialogDescription>
                              Remove this program officer from this funder.
                            </DialogDescription>
                          </DialogHeader>
                          <p>
                            Are you sure you want to delete <strong>{contact.name}</strong>? This
                            action cannot be undone.
                          </p>
                          <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={closeDeleteContact}>
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={contactMutations.deleteContact.isPending}
                              onClick={() => {
                                void runFunderAction(() =>
                                  contactMutations.deleteContact.mutateAsync(contact.id),
                                ).finally(() => setDeletingContactId(null));
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>
                  ) : null}
                </div>
              ) : null}
              {canEdit && editingContactId === contact.id ? (
                <form
                  className="mt-3 space-y-3 border-t pt-3"
                  onChange={() => {
                    if (editingContactError) setEditingContactError(null);
                  }}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const payload = buildContactUpdatePayload(form);

                    if (payload.name.length === 0) {
                      setEditingContactError("Contact name is required");
                      return;
                    }

                    const parsed = sharedUpdateFunderContactSchema.safeParse(payload);
                    if (!parsed.success) {
                      setEditingContactError(
                        parsed.error.issues[0]?.message ?? "Unable to save funder contact.",
                      );
                      return;
                    }

                    try {
                      await contactMutations.updateContact.mutateAsync({
                        contactId: contact.id,
                        data: parsed.data,
                      });
                      setEditingContactError(null);
                      setEditingContactId(null);
                    } catch (error) {
                      setEditingContactError(
                        error instanceof Error ? error.message : "Unable to save funder contact.",
                      );
                    }
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor={`edit-name-${contact.id}`}>Name</Label>
                    <Input
                      id={`edit-name-${contact.id}`}
                      name="name"
                      placeholder="Full name"
                      defaultValue={contact.name}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`edit-title-${contact.id}`}>Title</Label>
                    <Input
                      id={`edit-title-${contact.id}`}
                      name="title"
                      placeholder="e.g. Program Officer"
                      defaultValue={String(contact.title ?? "")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`edit-email-${contact.id}`}>Email</Label>
                    <Input
                      id={`edit-email-${contact.id}`}
                      name="email"
                      type="email"
                      placeholder="name@example.org"
                      defaultValue={String(contact.email ?? "")}
                    />
                  </div>
                  {editingContactError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {editingContactError}
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={contactMutations.updateContact.isPending}
                    >
                      Save contact
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingContactId(null);
                        setEditingContactError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          ))}
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground">No funder contacts recorded.</p>
          )}
        </TabsContent>

        {/* ----- Grant History Tab ----- */}
        <TabsContent value="grants" className="space-y-4 pt-4">
          <h2 className="text-lg font-semibold text-foreground">Grant history</h2>
          {grants.map((grant) => (
            <div
              key={grant.id}
              className="flex items-center justify-between rounded-lg border p-3 text-sm"
            >
              <span>{grant.name}</span>
              <Badge variant="outline">{humanizeEnum(grant.status)}</Badge>
            </div>
          ))}
          {grants.length === 0 && (
            <p className="text-sm text-muted-foreground">No grants tied to this funder yet.</p>
          )}
        </TabsContent>

        {/* ----- Activity Tab ----- */}
        <TabsContent value="activity" className="pt-4">
          <EntityActivitySection entityType="funder" entityId={funderId} />
        </TabsContent>

        {/* ----- Documents Tab ----- */}
        <TabsContent value="documents" className="pt-4">
          <EntityDocumentsSection entityType="funder" entityId={funderId} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
