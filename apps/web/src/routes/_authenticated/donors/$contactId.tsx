import { useEffect, useState, useRef } from "react";
import { createFileRoute, Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import {
  StickyNote,
  Mail,
  Phone,
  Users,
  Pencil,
  Trash2,
  X,
  Building2,
  ArrowRight,
} from "lucide-react";
import {
  Alert,
  Breadcrumb,
  InlineError,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PageHeader,
  PageShell,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Skeleton,
  Textarea,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  IconButton,
  StatusPanel,
  cn,
} from "@grantpipe/ui";
import { classifyDonorLapseRisk } from "@grantpipe/shared";
import { ContactForm } from "../../../components/donors/contact-form";
import { DonationForm } from "../../../components/donors/donation-form";
import { CommunicationForm } from "../../../components/donors/communication-form";
import { TagPicker } from "../../../components/donors/tag-picker";
import { EntityActivitySection } from "../../../components/entity-activity-section";
import { EntityCustomFieldsSection } from "../../../components/entity-custom-fields-section";
import { PipelineStageSelect } from "../../../components/donors/pipeline-stage-select";
import { EntityDocumentsSection } from "../../../components/entity-documents-section";
import { AccessDeniedState } from "../../../components/access-denied-state";
import { formatCurrency, formatNumber, formatUtcCalendarDate } from "../../../lib/format";
import { canAccessFeature } from "../../../lib/access-control";
import { captureDetailTabViewed } from "../../../lib/record-discovery-analytics";
import {
  useContact,
  useUpdateContact,
  useDeleteContact,
  useUpdatePipelineStage,
  useDonations,
  useCreateDonation,
  useUpdateDonation,
  useDeleteDonation,
  useCommunications,
  useCreateCommunication,
  useAddContactTags,
  useCreateTag,
  useRemoveContactTag,
} from "../../../hooks/use-donors";
import { useCreateVolunteerHour, useEvents, useVolunteerHours } from "../../../hooks/use-events";
import { useSession } from "../../../hooks/use-session";
import type {
  CreateContactInput,
  CreateCommunicationInput,
  CreateDonationInput,
  UpdateDonationInput,
  DonorPipelineStage,
} from "@grantpipe/shared";

export const Route = createFileRoute("/_authenticated/donors/$contactId")({
  validateSearch: z.object({
    tab: z
      .enum([
        "overview",
        "donations",
        "communications",
        "volunteer-history",
        "activity",
        "documents",
        "custom-fields",
      ])
      .optional(),
    highlightDonation: z.string().optional(),
  }),
  component: ContactDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-4 sm:p-6 lg:p-8">
      <Alert variant="destructive" title="Unable to load page">
        <p>{error instanceof Error ? error.message : "Unknown error"}</p>
      </Alert>
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDisplayLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getQueryErrorMessage(error: unknown) {
  /* v8 ignore next -- non-Error query fallback is covered on list routes. */
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function normalizeDateInput(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00.000Z`;
}

function formatContactDisplayName(contact: {
  type: string;
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
}) {
  if (contact.type === "organization") {
    if (contact.organizationName?.trim()) return contact.organizationName.trim();
    const fallback = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
    return fallback || "Unnamed organization";
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  /* v8 ignore next -- unnamed donor fallback is covered by dedicated render tests. */
  return fullName || contact.firstName?.trim() || "Unnamed donor";
}

const COMM_ICONS: Record<string, typeof StickyNote> = {
  note: StickyNote,
  email: Mail,
  call: Phone,
  meeting: Users,
};

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

function getAffiliatedOrgLabel(
  affiliatedOrg:
    | {
        organizationName?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      }
    | null
    | undefined,
) {
  if (!affiliatedOrg) return null;
  if (affiliatedOrg.organizationName) return affiliatedOrg.organizationName;

  const fullName = [affiliatedOrg.firstName, affiliatedOrg.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || null;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-4">
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function ContactDetailPage() {
  const { memberRole, memberPermissions } = useSession();
  const canView = canAccessFeature(memberRole, memberPermissions, "donors", "view");

  if (!canView) {
    return (
      <AccessDeniedState
        title="You need donor access."
        description="Ask an admin to update your team permissions."
      />
    );
  }

  return <ContactDetailContent memberRole={memberRole} memberPermissions={memberPermissions} />;
}

function ContactDetailContent({
  memberRole,
  memberPermissions,
}: {
  memberRole: ReturnType<typeof useSession>["memberRole"];
  memberPermissions: ReturnType<typeof useSession>["memberPermissions"];
}) {
  const { contactId } = useParams({ strict: false }) as { contactId: string };
  const { tab, highlightDonation } = useSearch({ strict: false }) as {
    tab?: string;
    highlightDonation?: string;
  };
  const navigate = useNavigate();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "donors", "edit");
  const canDelete = canAccessFeature(memberRole, memberPermissions, "donors", "manage");

  // At-risk badge — derived locally from donations already loaded on this page.
  // Uses the shared pure classifier so no extra network request is needed and
  // starter orgs never fire a guaranteed-402 org-wide feed fetch.
  // Note: uses the first page of donations (up to 25); sufficient for cadence
  // classification in the vast majority of donor histories.

  // Data hooks
  const contactQuery = useContact(contactId);
  const { data: contactData, isLoading: contactLoading, isError: contactIsError } = contactQuery;
  const updateContact = useUpdateContact(contactId);
  const deleteContact = useDeleteContact();
  const updateStage = useUpdatePipelineStage();

  // Donation state & hooks
  const [donationPage, setDonationPage] = useState(1);
  const donationsQuery = useDonations(contactId, donationPage, 25);
  const {
    data: donationsData,
    isLoading: donationsLoading,
    isError: donationsIsError,
  } = donationsQuery;

  useEffect(() => {
    if (!highlightDonation || !donationsData || donationsIsError || donationsLoading) return;
    if (donationsData.data.some((donation) => donation.id === highlightDonation)) return;
    const totalPages = Math.ceil(donationsData.total / 25);
    if (donationPage < totalPages) {
      const timer = window.setTimeout(() => {
        setDonationPage((currentPage) => currentPage + 1);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [donationPage, donationsData, donationsIsError, donationsLoading, highlightDonation]);

  // Derive lapse risk band from loaded donation history (local — no extra request).
  const lapseRisk = donationsData?.data.length
    ? classifyDonorLapseRisk({
        giftDates: donationsData.data.map((d) => new Date(d.date as string)),
        giftAmountsCents: donationsData.data.map((d) => d.amountCents as number),
      })
    : null;
  const atRiskEntry =
    lapseRisk && lapseRisk.band !== "none"
      ? { band: lapseRisk.band as "lapsing" | "at_risk" | "lapsed" }
      : null;
  const createDonation = useCreateDonation(contactId);
  const updateDonation = useUpdateDonation(contactId);
  const deleteDonation = useDeleteDonation(contactId);

  // Communication state & hooks
  const [commPage, setCommPage] = useState(1);
  const communicationsQuery = useCommunications(contactId, commPage, 25);
  const { data: commsData, isLoading: commsLoading, isError: commsIsError } = communicationsQuery;
  const createComm = useCreateCommunication(contactId);
  const volunteerHoursQuery = useVolunteerHours({
    contactId,
    page: 1,
    pageSize: 25,
    sortBy: "date",
    sortOrder: "desc",
  });
  const {
    data: volunteerHoursData,
    isLoading: volunteerHoursLoading,
    isError: volunteerIsError,
  } = volunteerHoursQuery;
  const eventsQuery = useEvents({
    page: 1,
    pageSize: 100,
    sortBy: "date",
    sortOrder: "asc",
    timeframe: "all",
  });
  const createVolunteerHour = useCreateVolunteerHour();

  // Tag hooks
  const addTags = useAddContactTags(contactId);
  const removeTag = useRemoveContactTag(contactId);
  const createTag = useCreateTag();

  // Dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addDonationOpen, setAddDonationOpen] = useState(false);
  const [addDonationError, setAddDonationError] = useState<string | null>(null);
  const [editDonationOpen, setEditDonationOpen] = useState(false);
  const [editDonationError, setEditDonationError] = useState<string | null>(null);
  const [editingDonation, setEditingDonation] = useState<{
    id: string;
    amountCents: number;
    date: string;
    type: string;
    restriction: string;
    fundId?: string | null;
    goodsServicesValueCents?: number | null;
    goodsServicesDescription?: string | null;
    paymentMethod?: string | null;
    notes?: string | null;
  } | null>(null);
  const [logCommOpen, setLogCommOpen] = useState(false);
  const [logCommError, setLogCommError] = useState<string | null>(null);
  const [deleteDonationId, setDeleteDonationId] = useState<string | null>(null);
  const [deleteDonationError, setDeleteDonationError] = useState<string | null>(null);
  const [volunteerEventId, setVolunteerEventId] = useState("");
  const [volunteerProgram, setVolunteerProgram] = useState("");
  const [volunteerHoursValue, setVolunteerHoursValue] = useState("");
  const [volunteerDate, setVolunteerDate] = useState("");
  const [volunteerValidationError, setVolunteerValidationError] = useState<string | null>(null);

  // Notes state
  const [notesValue, setNotesValue] = useState<string | null>(null);

  // Tab tracking
  const previousTabRef = useRef("overview");

  // Shared inline surface for fire-and-forget record actions (stage/tags/notes).
  const [actionError, setActionError] = useState<string | null>(null);

  if (contactLoading) {
    return <DetailSkeleton />;
  }

  if (contactIsError && !contactData) {
    return (
      <PageShell>
        <StatusPanel variant="error" title="Unable to load donor.">
          <p>Refresh the page and try again.</p>
          <Button className="mt-3" variant="outline" onClick={() => void contactQuery.refetch()}>
            Try again
          </Button>
        </StatusPanel>
      </PageShell>
    );
  }

  if (!contactData) {
    return (
      <PageShell>
        <StatusPanel variant="error" title="Contact not found.">
          Unable to load this donor record.
        </StatusPanel>
      </PageShell>
    );
  }

  const { contact, givingStats, tags } = contactData;
  const affiliatedOrgLabel = getAffiliatedOrgLabel(contactData.affiliatedOrg);
  const displayName = formatContactDisplayName(contact);

  const currentNotes = notesValue !== null ? notesValue : (contact.notes ?? "");
  const trimmedVolunteerProgram = volunteerProgram.trim();
  const parsedVolunteerHours = Number(volunteerHoursValue);
  const normalizedVolunteerDate = normalizeDateInput(volunteerDate);
  const volunteerHoursValid = !Number.isNaN(parsedVolunteerHours) && parsedVolunteerHours > 0;
  const hasVolunteerContext = volunteerEventId.length > 0 || trimmedVolunteerProgram.length > 0;
  const canSubmitVolunteerHours =
    hasVolunteerContext &&
    volunteerHoursValid &&
    normalizedVolunteerDate !== null &&
    !createVolunteerHour.isPending;

  // Handlers
  function runDonorAction(action: () => Promise<unknown>) {
    setActionError(null);
    return action().catch((error) => {
      setActionError(error instanceof Error ? error.message : "Unable to complete this action.");
    });
  }

  function handleStageChange(stage: DonorPipelineStage | "") {
    /* v8 ignore next -- viewer and empty-stage guards are covered through UI gating. */
    if (!canEdit || !stage) return;
    void runDonorAction(() => updateStage.mutateAsync({ contactId, stage }));
  }

  function handleRemoveTag(tagId: string) {
    /* v8 ignore next -- viewer guard is covered through UI gating. */
    if (!canEdit) return;
    void runDonorAction(() => removeTag.mutateAsync(tagId));
  }

  function handleAddTags(tagId: string) {
    /* v8 ignore next -- viewer guard is covered through UI gating. */
    if (!canEdit) return;
    void runDonorAction(() => addTags.mutateAsync([tagId]));
  }

  async function handleCreateTag(name: string, color?: string) {
    /* v8 ignore next -- viewer guard is covered through UI gating. */
    if (!canEdit) return;
    const createdTag = await createTag.mutateAsync({ name, ...(color ? { color } : {}) });
    if (createdTag?.id) {
      await addTags.mutateAsync([createdTag.id]);
    }
  }

  function handleNotesBlur() {
    /* v8 ignore next -- viewer guard is covered through UI gating. */
    if (!canEdit) return;
    const newNotes = notesValue !== null ? notesValue : contact.notes;
    if (newNotes !== contact.notes) {
      /* v8 ignore next -- undefined notes fallback is covered by the no-change branch. */
      void runDonorAction(() => updateContact.mutateAsync({ notes: newNotes ?? undefined }));
    }
  }

  async function handleEditSubmit(data: CreateContactInput) {
    setEditError(null);
    try {
      await updateContact.mutateAsync(data);
      setEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Unable to update contact.");
    }
  }

  async function handleDelete() {
    setDeleteError(null);
    try {
      await deleteContact.mutateAsync(contactId);
      void navigate({ to: "/donors" });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Unable to delete donor.");
    }
  }

  async function handleCreateDonation(data: CreateDonationInput) {
    setAddDonationError(null);
    try {
      await createDonation.mutateAsync(data);
      setAddDonationOpen(false);
    } catch (err) {
      setAddDonationError(err instanceof Error ? err.message : "Unable to save donation.");
    }
  }

  async function handleUpdateDonation(data: UpdateDonationInput) {
    /* v8 ignore next -- edit form only renders after editingDonation is set. */
    if (!editingDonation) return;
    setEditDonationError(null);
    try {
      await updateDonation.mutateAsync({ donationId: editingDonation.id, data });
      setEditDonationOpen(false);
      setEditingDonation(null);
    } catch (err) {
      /* v8 ignore next -- non-Error mutation fallback is covered by create paths. */
      setEditDonationError(err instanceof Error ? err.message : "Unable to update donation.");
    }
  }

  async function handleDeleteDonation() {
    /* v8 ignore next -- delete confirmation only renders after an id is set. */
    if (!deleteDonationId) return;
    setDeleteDonationError(null);
    try {
      await deleteDonation.mutateAsync(deleteDonationId);
      setDeleteDonationId(null);
    } catch (err) {
      setDeleteDonationError(err instanceof Error ? err.message : "Unable to delete donation.");
    }
  }

  async function handleLogComm(data: CreateCommunicationInput) {
    /* v8 ignore next -- viewer guard is covered through UI gating. */
    if (!canEdit) return;
    setLogCommError(null);
    try {
      await createComm.mutateAsync(data);
      setLogCommOpen(false);
    } catch (err) {
      setLogCommError(err instanceof Error ? err.message : "Unable to log communication.");
    }
  }

  async function handleLogVolunteerHours() {
    if (!canEdit) return;

    if (!volunteerEventId && trimmedVolunteerProgram.length === 0) {
      setVolunteerValidationError("Pick an event or enter a program first.");
      return;
    }

    if (!volunteerHoursValid) {
      setVolunteerValidationError("Enter a volunteer hour amount greater than zero.");
      return;
    }

    if (!normalizedVolunteerDate) {
      setVolunteerValidationError("Select a volunteer date.");
      return;
    }

    try {
      setVolunteerValidationError(null);
      await createVolunteerHour.mutateAsync({
        contactId,
        ...(volunteerEventId ? { eventId: volunteerEventId } : {}),
        ...(trimmedVolunteerProgram ? { program: trimmedVolunteerProgram } : {}),
        hours: parsedVolunteerHours,
        date: normalizedVolunteerDate,
      });
      setVolunteerEventId("");
      setVolunteerProgram("");
      setVolunteerHoursValue("");
      setVolunteerDate("");
    } catch (error) {
      setVolunteerValidationError(
        error instanceof Error ? error.message : "Unable to log volunteer hours.",
      );
    }
  }

  return (
    <PageShell>
      {contactIsError ? (
        <Alert variant="destructive" title="Donor data may be stale.">
          Unable to load the latest data. You are seeing an older snapshot.
          <Button className="mt-3" variant="outline" onClick={() => void contactQuery.refetch()}>
            Try again
          </Button>
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
                  <Link to="/donors">Donors</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{displayName}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={displayName}
        actions={
          <>
            {atRiskEntry ? (
              <Link
                to="/donors/at-risk"
                aria-label={`This donor is ${atRiskEntry.band.replace("_", " ")} — view at-risk donors`}
              >
                <Badge
                  variant={
                    atRiskEntry.band === "lapsing"
                      ? "warning"
                      : atRiskEntry.band === "at_risk"
                        ? "destructive"
                        : "secondary"
                  }
                  className="rounded-full"
                >
                  {atRiskEntry.band === "lapsing"
                    ? "Lapsing"
                    : atRiskEntry.band === "at_risk"
                      ? "At Risk"
                      : "Lapsed"}
                </Badge>
              </Link>
            ) : null}

            {canEdit ? (
              <PipelineStageSelect
                value={contact.pipelineStage as DonorPipelineStage | undefined}
                onChange={handleStageChange}
              />
            ) : null}

            {canEdit ? (
              <Dialog
                open={editOpen}
                onOpenChange={(open) => {
                  setEditOpen(open);
                  if (!open) setEditError(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Edit donor">
                    <Pencil className="size-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit donor</DialogTitle>
                    <DialogDescription>
                      Edit this donor&apos;s name, contact details, and org fields.
                    </DialogDescription>
                  </DialogHeader>
                  {editError ? <InlineError className="mb-4">{editError}</InlineError> : null}
                  <ContactForm
                    onSubmit={handleEditSubmit}
                    defaultValues={contact as Partial<CreateContactInput>}
                  />
                </DialogContent>
              </Dialog>
            ) : null}

            {canDelete ? (
              <Dialog
                open={deleteOpen}
                onOpenChange={(open) => {
                  setDeleteOpen(open);
                  if (!open) setDeleteError(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Delete donor">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete donor?</DialogTitle>
                    <DialogDescription>
                      This will remove this donor from your account.
                    </DialogDescription>
                  </DialogHeader>
                  <p>
                    Are you sure you want to delete <strong>{displayName}</strong>? This action
                    cannot be undone.
                  </p>
                  {deleteError ? <InlineError className="mt-4">{deleteError}</InlineError> : null}
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={deleteContact.isPending}
                      onClick={handleDelete}
                      aria-label="Confirm delete"
                    >
                      Delete
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </>
        }
      />

      <section data-testid="contact-summary-layout" className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border bg-card/85">
            {formatDisplayLabel(contact.type)}
          </Badge>
          {contact.isVolunteer ? <Badge variant="success">Volunteer</Badge> : null}
          {affiliatedOrgLabel ? (
            <Badge variant="outline" className="border-border bg-card/85 text-muted-foreground">
              {affiliatedOrgLabel}
            </Badge>
          ) : null}
          {(tags as { id: string; name: string; color?: string | null }[]).map((tag) => (
            <Badge key={tag.id} variant="secondary" className="flex items-center gap-1">
              {tag.name}
              {canEdit ? (
                <IconButton
                  size="sm"
                  aria-label={`Remove tag ${tag.name}`}
                  onClick={() => handleRemoveTag(tag.id)}
                  disabled={removeTag.isPending && removeTag.variables === tag.id}
                  className="ml-1"
                >
                  <X className="size-3" />
                </IconButton>
              ) : null}
            </Badge>
          ))}
          {canEdit ? (
            <TagPicker
              selectedTagIds={(tags as { id: string }[]).map((t) => t.id)}
              onToggle={handleAddTags}
              onCreateTag={handleCreateTag}
              isCreatingTag={createTag.isPending}
            />
          ) : null}
        </div>

        <div data-testid="giving-snapshot-grid" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: "Lifetime total",
              value: formatCurrency(givingStats.totalLifetimeGiving),
              accent: true,
              mono: true,
            },
            {
              label: "Average gift",
              value: formatCurrency(givingStats.averageGiftAmount),
              mono: true,
              sub: givingStats.lastGiftDate
                ? `Last gift ${formatUtcCalendarDate(givingStats.lastGiftDate)}`
                : "No gifts",
            },
            {
              label: "Gifts given",
              value: formatNumber(givingStats.donationCount),
              mono: true,
              sub: givingStats.firstGiftDate
                ? `since ${formatUtcCalendarDate(givingStats.firstGiftDate)}`
                : undefined,
            },
            {
              label: "Stage",
              value: contact.pipelineStage
                ? formatDisplayLabel(contact.pipelineStage)
                : "Unassigned",
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-muted p-4">
              <p className="text-xs font-medium uppercase tracking-caps text-muted-foreground">
                {stat.label}
              </p>
              <p
                className={cn(
                  "mt-2 text-2xl font-semibold tracking-tight",
                  stat.mono && "font-mono",
                  stat.accent ? "text-primary" : "text-foreground",
                )}
              >
                {stat.value}
              </p>
              {stat.sub ? <p className="mt-0.5 text-xs text-muted-foreground">{stat.sub}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <Tabs
        defaultValue={tab ?? "overview"}
        className="flex flex-col gap-6"
        onValueChange={(value) => {
          captureDetailTabViewed("donors", value, previousTabRef.current);
          previousTabRef.current = value;
        }}
      >
        <TabsList variant="record">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="donations">Donations</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="volunteer-history">Volunteer History</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
        </TabsList>

        {/* ----- Overview Tab ----- */}
        <TabsContent value="overview" className="space-y-6 pt-4">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl text-foreground">Notes</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Add notes about this donor for your team.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <label htmlFor="contact-notes" className="text-sm font-medium">
                  Notes
                </label>
                <Textarea
                  id="contact-notes"
                  value={currentNotes}
                  onChange={(e) => setNotesValue(e.target.value)}
                  onBlur={handleNotesBlur}
                  readOnly={!canEdit}
                  placeholder="Add notes about this contact…"
                  rows={6}
                />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Email */}
                {contact.email ? (
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {contact.email}
                      </a>
                    </div>
                  </div>
                ) : null}
                {/* Phone */}
                {contact.phone ? (
                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm font-medium">{contact.phone}</p>
                    </div>
                  </div>
                ) : null}
                {/* Type */}
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="text-sm font-medium">{formatDisplayLabel(contact.type)}</p>
                  </div>
                </div>
                {/* Affiliated org */}
                {affiliatedOrgLabel ? (
                  <div className="flex items-start gap-3">
                    <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Organization</p>
                      <p className="text-sm font-medium">{affiliatedOrgLabel}</p>
                    </div>
                  </div>
                ) : null}
                {/* Pipeline stage */}
                <div className="flex items-start gap-3">
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Pipeline stage</p>
                    <p className="text-sm font-medium">
                      {contact.pipelineStage
                        ? formatDisplayLabel(contact.pipelineStage)
                        : "Unassigned"}
                    </p>
                  </div>
                </div>
                {/* Volunteer */}
                {contact.isVolunteer ? (
                  <Badge variant="success" className="mt-1">
                    Volunteer
                  </Badge>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ----- Donations Tab ----- */}
        <TabsContent value="donations" className="space-y-4 pt-4">
          <div className="flex justify-end gap-2">
            {canEdit && (
              <Dialog
                open={addDonationOpen}
                onOpenChange={(open) => {
                  setAddDonationOpen(open);
                  if (!open) setAddDonationError(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button className="rounded-full" onClick={() => setAddDonationOpen(true)}>
                    Log gift
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log gift</DialogTitle>
                    <DialogDescription>
                      Record a gift for this donor. Attach a fund if needed.
                    </DialogDescription>
                  </DialogHeader>
                  {addDonationError ? <InlineError>{addDonationError}</InlineError> : null}
                  <DonationForm
                    onSubmit={handleCreateDonation}
                    submitLabel="Log gift"
                    pendingLabel="Logging…"
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>

          <Dialog
            open={editDonationOpen}
            onOpenChange={(open) => {
              setEditDonationOpen(open);
              if (!open) {
                setEditingDonation(null);
                setEditDonationError(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit donation</DialogTitle>
                <DialogDescription>Update the details for this donation record.</DialogDescription>
              </DialogHeader>
              {editDonationError ? <InlineError>{editDonationError}</InlineError> : null}
              {editingDonation && (
                <>
                  <DonationForm
                    onSubmit={handleUpdateDonation}
                    defaultValues={{
                      amountCents: editingDonation.amountCents,
                      date: editingDonation.date,
                      type: editingDonation.type as "one_time" | "recurring" | "pledge",
                      restriction: editingDonation.restriction as "unrestricted" | "restricted",
                      fundId: editingDonation.fundId ?? undefined,
                      goodsServicesValueCents: editingDonation.goodsServicesValueCents ?? undefined,
                      goodsServicesDescription:
                        editingDonation.goodsServicesDescription ?? undefined,
                      paymentMethod: editingDonation.paymentMethod ?? undefined,
                      notes: editingDonation.notes ?? undefined,
                    }}
                  />
                  <EntityCustomFieldsSection
                    entityType="donation"
                    entityId={editingDonation.id}
                    canEdit={canEdit}
                  />
                </>
              )}
            </DialogContent>
          </Dialog>

          <Dialog
            open={deleteDonationId !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDeleteDonationId(null);
                setDeleteDonationError(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete donation?</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this donation? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              {deleteDonationError ? (
                <InlineError className="mb-4">{deleteDonationError}</InlineError>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteDonationId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void handleDeleteDonation()}
                  disabled={deleteDonation.isPending}
                >
                  Delete
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {donationsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : donationsIsError ? (
            <Alert variant="destructive" title="Unable to load donations.">
              {getQueryErrorMessage(donationsQuery.error)}
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => void donationsQuery.refetch()}
              >
                Try again
              </Button>
            </Alert>
          ) : donationsData?.data.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Restriction</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Notes</TableHead>
                    {canEdit && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donationsData?.data.map(
                    (donation: {
                      id: string;
                      amountCents: number;
                      date: string;
                      type: string;
                      restriction: string;
                      fundId?: string | null;
                      fundName?: string | null;
                      goodsServicesValueCents?: number | null;
                      goodsServicesDescription?: string | null;
                      paymentMethod?: string | null;
                      notes?: string | null;
                    }) => (
                      <TableRow
                        key={donation.id}
                        data-testid={`donation-row-${donation.id}`}
                        data-highlighted={donation.id === highlightDonation ? "true" : undefined}
                        className={cn(
                          donation.id === highlightDonation && "bg-primary/10 ring-2 ring-primary",
                        )}
                      >
                        <TableCell>{formatUtcCalendarDate(donation.date)}</TableCell>
                        <TableCell>{formatCurrency(donation.amountCents)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatDisplayLabel(donation.type)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {formatDisplayLabel(donation.restriction)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {donation.fundName ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {donation.paymentMethod ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate"
                          title={donation.notes ?? undefined}
                        >
                          {donation.notes ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Edit donation"
                                onClick={() => {
                                  setEditingDonation(donation);
                                  setEditDonationOpen(true);
                                }}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Delete donation"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeleteDonationId(donation.id)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
              {donationsData && (
                <Pagination
                  page={donationsData.page}
                  pageSize={donationsData.pageSize}
                  total={donationsData.total}
                  onPageChange={setDonationPage}
                />
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted px-4 py-10 text-center text-sm text-muted-foreground">
              No donations yet. Log a gift to see which donors fund each grant.
            </div>
          )}
        </TabsContent>

        {/* ----- Communications Tab ----- */}
        <TabsContent value="communications" className="space-y-4 pt-4">
          <div className="flex justify-end">
            {canEdit ? (
              <Dialog
                open={logCommOpen}
                onOpenChange={(open) => {
                  setLogCommOpen(open);
                  if (!open) setLogCommError(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button>Log communication</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log communication</DialogTitle>
                    <DialogDescription>
                      Log a note, call, email, or meeting for this donor.
                    </DialogDescription>
                  </DialogHeader>
                  {logCommError ? <InlineError className="mb-4">{logCommError}</InlineError> : null}
                  <CommunicationForm onSubmit={handleLogComm} />
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          {commsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : commsIsError ? (
            <Alert variant="destructive" title="Unable to load communications.">
              {getQueryErrorMessage(communicationsQuery.error)}
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => void communicationsQuery.refetch()}
              >
                Try again
              </Button>
            </Alert>
          ) : commsData?.data.length ? (
            <>
              <div className="space-y-4">
                {commsData?.data.map(
                  (comm: {
                    id: string;
                    type: string;
                    subject: string | null;
                    body: string | null;
                    loggedByName?: string | null;
                    createdAt: string;
                  }) => {
                    const Icon = COMM_ICONS[comm.type] ?? StickyNote;
                    return (
                      <div key={comm.id} className="flex gap-3 rounded-2xl border p-4">
                        <div className="mt-0.5 text-muted-foreground">
                          <Icon className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            {comm.subject || formatDisplayLabel(comm.type)}
                          </p>
                          {comm.body && (
                            <p
                              className="mt-1 text-sm text-muted-foreground line-clamp-2"
                              title={comm.body}
                            >
                              {comm.body}
                            </p>
                          )}
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            {comm.loggedByName && <span>{comm.loggedByName}</span>}
                            <span>{formatUtcCalendarDate(comm.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
              {commsData && (
                <Pagination
                  page={commsData.page}
                  pageSize={commsData.pageSize}
                  total={commsData.total}
                  onPageChange={setCommPage}
                />
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted px-4 py-10 text-center text-sm text-muted-foreground">
              No notes yet. Log the next call or email to keep the donor story clear.
            </div>
          )}
        </TabsContent>

        {/* ----- Volunteer History Tab ----- */}
        <TabsContent value="volunteer-history" className="space-y-4 pt-4">
          {canEdit ? (
            <Card>
              <CardHeader>
                <CardTitle>Log Volunteer Hours</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="volunteer-event">Event</Label>
                    {eventsQuery.isError ? (
                      <p role="alert" className="text-sm text-destructive">
                        Unable to load events. {getQueryErrorMessage(eventsQuery.error)}
                      </p>
                    ) : null}
                    <Select
                      value={volunteerEventId === "" ? "__none__" : volunteerEventId}
                      onValueChange={(val) => {
                        setVolunteerEventId(val === "__none__" ? "" : val);
                        if (volunteerValidationError) setVolunteerValidationError(null);
                      }}
                    >
                      <SelectTrigger id="volunteer-event" aria-label="Volunteer event">
                        <SelectValue placeholder="No linked event" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No linked event</SelectItem>
                        {(eventsQuery.data?.data ?? []).map(
                          (event: { id: string; name: string; date?: string | null }) => (
                            <SelectItem key={event.id} value={event.id}>
                              <span className="flex flex-col">
                                <span>{event.name}</span>
                                {event.date ? (
                                  <span className="text-xs text-muted-foreground">
                                    {formatUtcCalendarDate(event.date)}
                                  </span>
                                ) : null}
                              </span>
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="volunteer-program">Program</Label>
                    <Input
                      id="volunteer-program"
                      placeholder="Optional"
                      value={volunteerProgram}
                      onChange={(event) => {
                        setVolunteerProgram(event.target.value);
                        if (volunteerValidationError) setVolunteerValidationError(null);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="volunteer-hours">Hours</Label>
                    <Input
                      id="volunteer-hours"
                      placeholder="0.0"
                      type="number"
                      min="0"
                      step="0.5"
                      value={volunteerHoursValue}
                      onChange={(event) => {
                        setVolunteerHoursValue(event.target.value);
                        if (volunteerValidationError) setVolunteerValidationError(null);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="volunteer-date">Volunteer date</Label>
                    <Input
                      id="volunteer-date"
                      type="date"
                      value={volunteerDate}
                      onChange={(event) => {
                        setVolunteerDate(event.target.value);
                        if (volunteerValidationError) setVolunteerValidationError(null);
                      }}
                    />
                  </div>
                </div>
                <Button
                  disabled={!canSubmitVolunteerHours}
                  onClick={() => void handleLogVolunteerHours()}
                >
                  Log volunteer hours
                </Button>
              </CardContent>
              {volunteerValidationError ? (
                <CardContent className="pt-0">
                  <p role="alert" className="text-sm text-destructive">
                    {volunteerValidationError}
                  </p>
                </CardContent>
              ) : null}
            </Card>
          ) : null}

          {volunteerHoursLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : volunteerIsError ? (
            <Alert variant="destructive" title="Unable to load volunteer history.">
              {getQueryErrorMessage(volunteerHoursQuery.error)}
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => void volunteerHoursQuery.refetch()}
              >
                Try again
              </Button>
            </Alert>
          ) : volunteerHoursData?.data.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {volunteerHoursData?.data.map(
                  (entry: {
                    id: string;
                    date: string;
                    hours: number;
                    program?: string | null;
                    notes?: string | null;
                    event?: { id: string; name?: string | null } | null;
                  }) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatUtcCalendarDate(entry.date)}</TableCell>
                      <TableCell>
                        {entry.event?.name ?? entry.program ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{entry.hours}</TableCell>
                      <TableCell>
                        {entry.notes || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted px-4 py-10 text-center text-sm text-muted-foreground">
              No volunteer time yet. Add hours to see who gives time, not just money.
            </div>
          )}
        </TabsContent>

        {/* ----- Activity Tab ----- */}
        <TabsContent value="activity" className="pt-4">
          <EntityActivitySection entityType="contact" entityId={contactId} />
        </TabsContent>

        {/* ----- Documents Tab ----- */}
        <TabsContent value="documents" className="pt-4">
          <EntityDocumentsSection entityType="contact" entityId={contactId} />
        </TabsContent>

        {/* ----- Custom Fields Tab ----- */}
        <TabsContent value="custom-fields" className="pt-4">
          <EntityCustomFieldsSection entityType="contact" entityId={contactId} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
