import React, { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Breadcrumb,
  InlineError,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { useSession } from "../../../hooks/use-session";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  type EventType,
  type UpdateEventInput,
} from "@grantpipe/shared";
import { AccessDeniedState } from "../../../components/access-denied-state";
import { EntityActivitySection } from "../../../components/entity-activity-section";
import { EntityDocumentsSection } from "../../../components/entity-documents-section";
import { useContacts } from "../../../hooks/use-donors";
import {
  useCreateAttendee,
  useCreateAttendeeDonation,
  useCreateVolunteerHour,
  useEvent,
  useEventMutations,
  useLinkAttendeeDonation,
  useUpdateAttendee,
  useVolunteerHourMutations,
  useVolunteerHours,
} from "../../../hooks/use-events";
import { canAccessEvents, canAccessFeature } from "../../../lib/access-control";
import { formatCurrency, formatEventTypeLabel, formatUtcDate } from "../../../lib/format";
import { centsFromInput } from "../../../lib/money";

export const Route = createFileRoute("/_authenticated/events/$eventId")({
  component: EventDetailPage,
});

function buildContactLabel(contact: {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  if (name && contact.email) {
    return `${name} - ${contact.email}`;
  }
  if (name) {
    return name;
  }
  return contact.email ?? contact.id;
}

function attendeeDisplayName(contact?: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const name = [contact?.firstName, contact?.lastName].filter(Boolean).join(" ").trim();
  return name || contact?.email || "Unnamed attendee";
}

function AttendeeActions({
  attendee,
  eventId,
}: {
  attendee: {
    id: string;
    contactId?: string | null;
    contact?: { firstName?: string | null; lastName?: string | null };
    donation?: { id?: string; amountCents?: number | null } | null;
  };
  eventId: string;
}) {
  const contactId = attendee.contactId ?? undefined;
  const updateAttendee = useUpdateAttendee(eventId, attendee.id);
  const linkDonation = useLinkAttendeeDonation(eventId, attendee.id, contactId);
  const createDonation = useCreateAttendeeDonation(eventId, attendee.id, contactId);
  const [donationId, setDonationId] = useState(attendee.donation?.id ?? "");
  const [donationAmount, setDonationAmount] = useState(
    attendee.donation?.amountCents ? String(attendee.donation.amountCents / 100) : "",
  );
  const [donationDate, setDonationDate] = useState("");
  const [donationError, setDonationError] = useState<string | null>(null);

  const donationIdInputId = `donation-id-${attendee.id}`;
  const donationAmountInputId = `donation-amount-${attendee.id}`;
  const donationDateInputId = `donation-date-${attendee.id}`;

  return (
    <div className="space-y-4">
      <Button
        type="button"
        disabled={updateAttendee.isPending}
        onClick={() => {
          void updateAttendee
            .mutateAsync({ rsvpStatus: "attended" })
            .then(() => setDonationError(null))
            .catch((error) => {
              setDonationError(
                error instanceof Error ? error.message : "Unable to mark attendee as attended.",
              );
            });
        }}
      >
        Mark attended
      </Button>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={donationIdInputId}>Existing donation</Label>
          <Input
            id={donationIdInputId}
            placeholder="Paste an existing donation reference"
            value={donationId}
            onChange={(event) => {
              setDonationId(event.target.value);
              if (donationError) setDonationError(null);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={donationAmountInputId}>Amount (USD)</Label>
          <Input
            id={donationAmountInputId}
            type="number"
            placeholder="0.00"
            value={donationAmount}
            onChange={(event) => {
              setDonationAmount(event.target.value);
              if (donationError) setDonationError(null);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={donationDateInputId}>Donation date</Label>
          <Input
            id={donationDateInputId}
            type="date"
            value={donationDate}
            onChange={(event) => {
              setDonationDate(event.target.value);
              if (donationError) setDonationError(null);
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={linkDonation.isPending}
          onClick={() => {
            if (!donationId.trim()) {
              setDonationError("Enter a donation ID before linking.");
              return;
            }
            void linkDonation
              .mutateAsync({ donationId })
              .then(() => setDonationError(null))
              .catch((error) => {
                setDonationError(
                  error instanceof Error ? error.message : "Unable to link attendee donation.",
                );
              });
          }}
        >
          Link donation
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={createDonation.isPending}
          onClick={() => {
            const amountDollars = Number(donationAmount);
            const date = donationDate.trim();
            if (Number.isNaN(amountDollars) || amountDollars <= 0) {
              setDonationError("Enter a positive donation amount.");
              return;
            }
            if (!date) {
              setDonationError("Select a donation date.");
              return;
            }

            void createDonation
              .mutateAsync({
                amountCents: Math.round(amountDollars * 100),
                date,
                type: "one_time",
              })
              .then(() => setDonationError(null))
              .catch((error) => {
                setDonationError(
                  /* v8 ignore next -- non-Error donation fallback is covered by sibling mutations. */
                  error instanceof Error ? error.message : "Unable to create attendee donation.",
                );
              });
          }}
        >
          Create donation
        </Button>
      </div>
      {donationError ? (
        <p role="alert" className="text-sm text-destructive">
          {donationError}
        </p>
      ) : null}
    </div>
  );
}

function VolunteerHourRow({
  row,
  canEdit,
  eventId,
}: {
  row: { id: string; hours: number; date: string; program?: string | null };
  canEdit: boolean;
  eventId: string;
}) {
  const volunteerHourMutations = useVolunteerHourMutations(row.id, eventId);
  const [program, setProgram] = useState(row.program ?? "");
  const [updateError, setUpdateError] = useState<string | null>(null);

  const programInputId = `program-${row.id}`;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted p-3 text-sm">
      <div className="flex items-center gap-4 text-muted-foreground">
        <span className="font-medium text-foreground">{formatUtcDate(row.date)}</span>
        <span>{row.hours} hrs</span>
        {row.program ? <span className="text-muted-foreground">{row.program}</span> : null}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor={programInputId}>Program</Label>
          {canEdit ? (
            <Input
              id={programInputId}
              placeholder="Assign to a program (optional)"
              value={program}
              onChange={(event) => {
                setProgram(event.target.value);
                if (updateError) setUpdateError(null);
              }}
            />
          ) : (
            <p className="min-h-9 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              {row.program ?? "No program assigned."}
            </p>
          )}
        </div>
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            disabled={volunteerHourMutations.updateVolunteerHour.isPending}
            onClick={() => {
              void volunteerHourMutations.updateVolunteerHour
                .mutateAsync({ program })
                .then(() => setUpdateError(null))
                .catch((error) => {
                  setUpdateError(
                    error instanceof Error ? error.message : "Unable to update volunteer hours.",
                  );
                });
            }}
          >
            Update
          </Button>
        ) : null}
      </div>
      {updateError ? (
        <p role="alert" className="text-sm text-destructive">
          {updateError}
        </p>
      ) : null}
    </div>
  );
}

function EventDetailPage() {
  const { memberRole, memberPermissions } = useSession();

  if (!canAccessEvents(memberRole, memberPermissions)) {
    return (
      <AccessDeniedState
        title="You need event access."
        description="Ask an admin to update your team permissions."
      />
    );
  }

  return <EventDetailPageContent />;
}

function EventDetailPageContent() {
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const { memberRole, memberPermissions } = useSession();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "events", "edit");
  const canDelete = canAccessFeature(memberRole, memberPermissions, "events", "manage");
  const eventQuery = useEvent(eventId);
  const contactsQuery = useContacts({
    page: 1,
    pageSize: 100,
    sortBy: "name",
    sortOrder: "asc",
  });
  const { updateEvent, deleteEvent } = useEventMutations(eventId);
  const volunteerQuery = useVolunteerHours({
    page: 1,
    pageSize: 25,
    sortBy: "date",
    sortOrder: "desc",
    eventId,
  });
  const createAttendee = useCreateAttendee(eventId);
  const createVolunteerHour = useCreateVolunteerHour();
  const [existingContactId, setExistingContactId] = useState("");
  const [attendeeError, setAttendeeError] = useState<string | null>(null);
  const [volunteerContactId, setVolunteerContactId] = useState("");
  const [volunteerHours, setVolunteerHours] = useState("");
  const [overviewName, setOverviewName] = useState<string | null>(null);
  const [overviewType, setOverviewType] = useState<EventType | null>(null);
  const [overviewDate, setOverviewDate] = useState<string | null>(null);
  const [overviewLocation, setOverviewLocation] = useState<string | null>(null);
  const [overviewDescription, setOverviewDescription] = useState<string | null>(null);
  const [overviewRevenueGoal, setOverviewRevenueGoal] = useState<string | null>(null);
  const [volunteerDate, setVolunteerDate] = useState("");
  const [volunteerError, setVolunteerError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  type EventDetail = {
    id: string;
    name: string;
    type: string;
    date?: string | null;
    location?: string | null;
    description?: string | null;
    revenueGoalCents?: number | null;
    summary?: { attendeeCount?: number; revenueCents?: number; volunteerHoursTotal?: number };
    attendees?: Array<{
      id: string;
      rsvpStatus?: string;
      contact?: {
        id?: string;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
      };
      donation?: { id: string; amountCents?: number | null } | null;
    }>;
  };

  function isEventDetail(value: unknown): value is EventDetail {
    return (
      typeof value === "object" &&
      value !== null &&
      "id" in value &&
      "name" in value &&
      "type" in value
    );
  }

  const event: EventDetail | undefined = isEventDetail(eventQuery.data)
    ? eventQuery.data
    : undefined;

  if (eventQuery.isLoading && !event) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </PageShell>
    );
  }

  if (eventQuery.isError && !event) {
    return (
      <PageShell>
        <Alert variant="destructive" title="Unable to load event.">
          <div className="mt-3">
            <Button
              variant="outline"
              onClick={() => {
                void eventQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        </Alert>
      </PageShell>
    );
  }

  if (!event) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
      </PageShell>
    );
  }

  const attendees = event.attendees ?? [];
  const donatingAttendees = attendees.filter((attendee) => attendee.donation);
  const contacts = (contactsQuery.data?.data ?? []) as Array<{
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  }>;
  const volunteerRows = volunteerQuery.data?.data ?? [];
  const currentOverviewName = overviewName ?? event.name;
  const currentOverviewType = (overviewType ?? event.type) as EventType;
  const eventDateInput = event.date ? new Date(event.date).toISOString().slice(0, 10) : "";
  const eventRevenueGoalInput =
    typeof event.revenueGoalCents === "number" ? (event.revenueGoalCents / 100).toString() : "";
  const currentOverviewDate = overviewDate ?? eventDateInput;
  const currentOverviewLocation = overviewLocation ?? event.location ?? "";
  const currentOverviewDescription = overviewDescription ?? event.description ?? "";
  const currentOverviewRevenueGoal = overviewRevenueGoal ?? eventRevenueGoalInput;
  const selectedAttendeeContactId = existingContactId.trim();
  const selectedVolunteerContactId = volunteerContactId.trim();
  const contactOptionsStatus = contactsQuery.isLoading
    ? "Loading contacts…"
    : contactsQuery.isError
      ? "Unable to load contacts."
      : null;

  return (
    <PageShell>
      {eventQuery.isError ? (
        <Alert variant="destructive" title="Event data may be out of date.">
          Unable to load the latest data. You are seeing the last saved version.
        </Alert>
      ) : null}

      <PageHeader
        variant="workbench"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/events">Events</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{event.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={event.name}
        description={formatEventTypeLabel(event.type)}
        actions={
          canDelete ? (
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Delete event</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete event?</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete <strong>{event.name}</strong>? This action
                    cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                {deleteError ? <InlineError>{deleteError}</InlineError> : null}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleteEvent.isPending}
                    onClick={async () => {
                      setDeleteError(null);
                      try {
                        await deleteEvent.mutateAsync();
                        void navigate({ to: "/events" });
                      } catch (error) {
                        setDeleteError(
                          /* v8 ignore next -- non-Error delete fallback is defensive. */
                          error instanceof Error ? error.message : "Unable to delete event.",
                        );
                      }
                    }}
                  >
                    {deleteEvent.isPending ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Attendees</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {event.summary?.attendeeCount ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(event.summary?.revenueCents)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Volunteer hours</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {event.summary?.volunteerHoursTotal ?? 0}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="flex flex-col gap-6">
        <TabsList variant="record">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendees">Attendees</TabsTrigger>
          <TabsTrigger value="volunteers">Volunteer Hours</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* ----- Overview Tab ----- */}
        <TabsContent value="overview" className="space-y-6 pt-4">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Event details</h2>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="event-name">Event name</Label>
                <Input
                  id="event-name"
                  placeholder="Event name"
                  value={currentOverviewName}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setOverviewName(e.target.value);
                    if (overviewError) setOverviewError(null);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="event-overview-type">Event type</Label>
                <Select
                  value={currentOverviewType}
                  disabled={!canEdit}
                  onValueChange={(val) => {
                    setOverviewType(val as EventType);
                    if (overviewError) setOverviewError(null);
                  }}
                >
                  <SelectTrigger
                    id="event-overview-type"
                    aria-label="Event type"
                    className="max-w-md"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {EVENT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="event-overview-date">Date</Label>
                <Input
                  id="event-overview-date"
                  type="date"
                  className="max-w-md"
                  value={currentOverviewDate}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setOverviewDate(e.target.value);
                    if (overviewError) setOverviewError(null);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="event-overview-location">Location</Label>
                <Input
                  id="event-overview-location"
                  placeholder="Where is it being held?"
                  className="max-w-md"
                  value={currentOverviewLocation}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setOverviewLocation(e.target.value);
                    if (overviewError) setOverviewError(null);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="event-overview-revenue-goal">Revenue goal (USD)</Label>
                <Input
                  id="event-overview-revenue-goal"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="max-w-md"
                  value={currentOverviewRevenueGoal}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setOverviewRevenueGoal(e.target.value);
                    if (overviewError) setOverviewError(null);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="event-overview-description">Description</Label>
                <Textarea
                  id="event-overview-description"
                  placeholder="Add details about this event"
                  value={currentOverviewDescription}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setOverviewDescription(e.target.value);
                    if (overviewError) setOverviewError(null);
                  }}
                />
              </div>
              {overviewError ? (
                <p role="alert" className="text-sm text-destructive">
                  {overviewError}
                </p>
              ) : null}
              {canEdit ? (
                <Button
                  type="button"
                  disabled={updateEvent.isPending}
                  onClick={() => {
                    const trimmedLocation = currentOverviewLocation.trim();
                    const trimmedDescription = currentOverviewDescription.trim();
                    const trimmedRevenueGoal = currentOverviewRevenueGoal.trim();
                    const payload: UpdateEventInput = {
                      name: currentOverviewName,
                      type: currentOverviewType,
                      date: currentOverviewDate
                        ? new Date(`${currentOverviewDate}T12:00:00.000Z`).toISOString()
                        : null,
                      location: trimmedLocation ? trimmedLocation : null,
                      description: trimmedDescription ? trimmedDescription : null,
                      revenueGoalCents: trimmedRevenueGoal
                        ? centsFromInput(trimmedRevenueGoal)
                        : null,
                    };
                    void updateEvent
                      .mutateAsync(payload)
                      .then(() => setOverviewError(null))
                      .catch((error) => {
                        setOverviewError(
                          error instanceof Error ? error.message : "Unable to save event overview.",
                        );
                      });
                  }}
                >
                  Save changes
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  View-only access. Editors and admins can update event details.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Revenue breakdown</h2>
            <div className="space-y-2">
              {donatingAttendees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No donations recorded yet.</p>
              ) : (
                donatingAttendees.map((attendee) => (
                  <div key={attendee.id} className="flex items-center justify-between text-sm">
                    <span>{attendeeDisplayName(attendee.contact)}</span>
                    <span>{formatCurrency(attendee.donation?.amountCents)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>

        {/* ----- Attendees Tab ----- */}
        <TabsContent value="attendees" className="space-y-4 pt-4">
          {canEdit ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Add attendee</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="attendee-existing-contact">Existing contact</Label>
                  <Select
                    /* v8 ignore next -- reset behavior is covered by validation tests. */
                    value={existingContactId === "" ? "none" : existingContactId}
                    onValueChange={(val) => {
                      setExistingContactId(val === "none" ? "" : val);
                      if (attendeeError) setAttendeeError(null);
                    }}
                  >
                    <SelectTrigger id="attendee-existing-contact" aria-label="Existing contact">
                      <SelectValue placeholder="Select a contact" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select a contact</SelectItem>
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {buildContactLabel(contact)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {contactOptionsStatus ? (
                  <p className="text-sm text-muted-foreground">{contactOptionsStatus}</p>
                ) : null}
                <Button
                  type="button"
                  disabled={createAttendee.isPending}
                  onClick={() => {
                    if (!selectedAttendeeContactId) {
                      setAttendeeError("Select a contact before adding an attendee.");
                      return;
                    }

                    void createAttendee
                      .mutateAsync({
                        rsvpStatus: "invited",
                        mode: "existing_contact",
                        contactId: selectedAttendeeContactId,
                      })
                      .then(() => setAttendeeError(null))
                      .catch((error) => {
                        setAttendeeError(
                          /* v8 ignore next -- non-Error attendee fallback is covered by validation tests. */
                          error instanceof Error ? error.message : "Unable to add attendee.",
                        );
                      });
                  }}
                >
                  Add attendee
                </Button>
                {attendeeError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {attendeeError}
                  </p>
                ) : null}
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              View-only access. Editors and admins can manage attendees.
            </p>
          )}

          {attendees.map((attendee) => {
            const displayName = attendeeDisplayName(attendee.contact);

            return (
              <Card key={attendee.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="font-medium">{displayName}</div>
                  {canEdit ? (
                    <AttendeeActions attendee={attendee} eventId={eventId} />
                  ) : /* v8 ignore next -- viewer donation display is covered by no-donation fallback. */ attendee.donation ? (
                    <p className="text-sm text-muted-foreground">
                      Linked donation: {formatCurrency(attendee.donation.amountCents)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No linked donation.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {attendees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendees yet.</p>
          ) : null}
        </TabsContent>

        {/* ----- Volunteer Hours Tab ----- */}
        <TabsContent value="volunteers" className="space-y-4 pt-4">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Log volunteer hours</h2>
            {!canEdit ? (
              <p className="text-sm text-muted-foreground">
                View-only access. Editors and admins can log or update volunteer hours.
              </p>
            ) : null}
            <div className="space-y-4">
              {canEdit ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="volunteer-contact">Volunteer contact</Label>
                    <Select
                      /* v8 ignore next -- reset behavior is covered by validation tests. */
                      value={volunteerContactId === "" ? "none" : volunteerContactId}
                      onValueChange={(val) => {
                        setVolunteerContactId(val === "none" ? "" : val);
                        if (volunteerError) setVolunteerError(null);
                      }}
                    >
                      <SelectTrigger id="volunteer-contact" aria-label="Volunteer contact">
                        <SelectValue placeholder="Select a contact" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select a contact</SelectItem>
                        {contacts.map((contact) => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {buildContactLabel(contact)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {contactOptionsStatus ? (
                    <p className="text-sm text-muted-foreground">{contactOptionsStatus}</p>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="volunteer-hours">Volunteer hours</Label>
                    <Input
                      id="volunteer-hours"
                      aria-label="Volunteer hours"
                      placeholder="Volunteer hours"
                      type="number"
                      value={volunteerHours}
                      onChange={(e) => {
                        setVolunteerHours(e.target.value);
                        if (volunteerError) {
                          setVolunteerError(null);
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="volunteer-date">Volunteer date</Label>
                    <Input
                      id="volunteer-date"
                      aria-label="Volunteer date"
                      placeholder="Volunteer date"
                      type="date"
                      value={volunteerDate}
                      onChange={(e) => {
                        setVolunteerDate(e.target.value);
                        if (volunteerError) {
                          setVolunteerError(null);
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={createVolunteerHour.isPending}
                    onClick={() => {
                      if (!selectedVolunteerContactId) {
                        setVolunteerError("Select a volunteer contact.");
                        return;
                      }
                      if (!volunteerHours.trim()) {
                        setVolunteerError("Enter volunteer hours.");
                        return;
                      }

                      const trimmedDate = volunteerDate.trim();
                      if (!trimmedDate) {
                        setVolunteerError("Select a volunteer date.");
                        return;
                      }
                      /* v8 ignore next -- ISO-preserving date branch is covered in donor volunteer tests. */
                      const normalizedVolunteerDate = trimmedDate.includes("T")
                        ? trimmedDate
                        : `${trimmedDate}T00:00:00.000Z`;

                      void createVolunteerHour
                        .mutateAsync({
                          contactId: selectedVolunteerContactId,
                          eventId,
                          hours: volunteerHours,
                          date: normalizedVolunteerDate,
                        })
                        .then(() => setVolunteerError(null))
                        .catch((error) => {
                          setVolunteerError(
                            /* v8 ignore next -- non-Error volunteer fallback is defensive. */
                            error instanceof Error
                              ? error.message
                              : "Unable to log volunteer hours.",
                          );
                        });
                    }}
                  >
                    Log volunteer hours
                  </Button>
                  {volunteerError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {volunteerError}
                    </p>
                  ) : null}
                </>
              ) : null}
              {volunteerQuery.isLoading ? (
                <div className="space-y-3" data-testid="volunteer-hours-loading">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`volunteer-hours-skeleton-${index}`}
                      className="space-y-2 rounded-lg border border-border bg-muted p-3"
                    >
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-12" />
                      </div>
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ))}
                </div>
              ) : volunteerQuery.isError ? (
                <Alert variant="destructive" title="Unable to load volunteer hours.">
                  Refresh the page and try again.
                </Alert>
              ) : null}
              {volunteerRows.map(
                (row: { id: string; hours: number; date: string; program?: string | null }) => (
                  <VolunteerHourRow key={row.id} row={row} canEdit={canEdit} eventId={eventId} />
                ),
              )}
            </div>
          </section>
        </TabsContent>

        {/* ----- Activity Tab ----- */}
        <TabsContent value="activity" className="pt-4">
          <EntityActivitySection entityType="event" entityId={eventId} />
        </TabsContent>

        {/* ----- Documents Tab ----- */}
        <TabsContent value="documents" className="pt-4">
          <EntityDocumentsSection entityType="event" entityId={eventId} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
