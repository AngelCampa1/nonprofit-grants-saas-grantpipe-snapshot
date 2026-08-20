import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@grantpipe/ui";
import {
  REVIEWER_TYPES,
  EXTERNAL_REVIEW_SCOPE_TYPES,
  PORTAL_SESSION_DEFAULT_TTL_MS,
  PORTAL_SESSION_EXTENSION_OPTIONS,
  PORTAL_SESSION_TTL_OPTIONS,
  type ReviewerType,
  type ExternalReviewScopeType,
} from "@grantpipe/shared";
import {
  useReviewers,
  useReviewerMutations,
  useSessions,
  useSessionMutations,
  useAuditEvents,
} from "../../hooks/use-external-reviewers";
import { useSession } from "../../hooks/use-session";
import {
  AUDIT_READY_PLAN_GATE_MESSAGE,
  AUDIT_READY_PLAN_GATE_TITLE,
  isAuditReadyPlanGate,
} from "../../lib/api-errors";
import { formatUtcDateTime, humanizeEnum } from "../../lib/format";
import { downloadViaOrgFetch } from "../../lib/download";
import { captureAppException } from "../../lib/sentry";

export const Route = createFileRoute("/_authenticated/settings/portal-access")({
  component: PortalAccessSettingsPage,
});

const DEFAULT_PORTAL_SESSION_EXTENSION = PORTAL_SESSION_EXTENSION_OPTIONS[0];

const SESSION_COLUMN_LABELS = ["Reviewer", "Purpose", "Expires", "Status", "Scopes"] as const;
const REVIEWER_COLUMN_LABELS = ["Name", "Email", "Type", "Actions"] as const;
const ACTIVITY_COLUMN_LABELS = ["Reviewer", "Event", "Target", "When"] as const;

function PortalTableSkeleton({ columns, testId }: { columns: readonly string[]; testId: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border" data-testid={testId}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 4 }).map((_, rowIdx) => (
            <TableRow key={`skeleton-${testId}-${rowIdx}`}>
              {columns.map((label) => (
                <TableCell key={`skeleton-${testId}-${rowIdx}-${label}`}>
                  <Skeleton className="h-4 w-3/4" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type ReviewerRow = {
  id: string;
  email: string;
  name: string;
  reviewerType: string;
  organizationName?: string | null;
};

type SessionRow = {
  id: string;
  reviewerId: string;
  purpose: string;
  expiresAt: string;
  revokedAt: string | null;
  scopes?: Array<{ scopeType: string; scopeId: string }>;
};

type AuditEventRow = {
  id: string;
  reviewerId: string;
  eventType: string;
  targetType?: string | null;
  targetId?: string | null;
  createdAt: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatRelativeTime(dateStr: string): string {
  const ms = new Date(dateStr).getTime() - Date.now();
  const absDays = Math.abs(Math.ceil(ms / (1000 * 60 * 60 * 24)));
  if (ms < 0) return `${absDays}d ago`;
  if (absDays === 0) return "today";
  return `in ${absDays}d`;
}

function getSessionStatus(session: SessionRow): "active" | "expired" | "revoked" {
  if (session.revokedAt) return "revoked";
  if (new Date(session.expiresAt) <= new Date()) return "expired";
  return "active";
}

function extractList<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data as T[];
  if (Array.isArray(obj.items)) return obj.items as T[];
  return [];
}

export function PortalAccessSettingsPage() {
  const { memberRole } = useSession();
  const canManage = memberRole === "admin";

  const sessionsQuery = useSessions({ includeExpired: true }, { enabled: canManage });
  const reviewersQuery = useReviewers(undefined, { enabled: canManage });
  const auditEventsQuery = useAuditEvents(undefined, { enabled: canManage });
  const sessionMutations = useSessionMutations();
  const reviewerMutations = useReviewerMutations();

  const sessions = extractList<SessionRow>(sessionsQuery.data);
  const reviewers = extractList<ReviewerRow>(reviewersQuery.data);
  const auditEvents = extractList<AuditEventRow>(auditEventsQuery.data);

  // Invite sheet state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteStep, setInviteStep] = useState<"reviewer" | "session">("reviewer");
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [newReviewerMode, setNewReviewerMode] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ReviewerType>("auditor");
  const [purpose, setPurpose] = useState("");
  const [ttlMs, setTtlMs] = useState<number>(PORTAL_SESSION_DEFAULT_TTL_MS);
  const [initialScopeType, setInitialScopeType] = useState<ExternalReviewScopeType>("grant");
  const [initialScopeId, setInitialScopeId] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Edit reviewer sheet state
  const [editReviewer, setEditReviewer] = useState<ReviewerRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<ReviewerType>("auditor");
  const [editError, setEditError] = useState<string | null>(null);

  // Add reviewer sheet state
  const [addReviewerOpen, setAddReviewerOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<ReviewerType>("auditor");
  const [addOrgName, setAddOrgName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [mutationError, setMutationError] = useState<string | null>(null);
  const [confirmRemoveReviewerId, setConfirmRemoveReviewerId] = useState<string | null>(null);
  const [confirmRevokeSessionId, setConfirmRevokeSessionId] = useState<string | null>(null);
  const reviewerToRemove = reviewers.find((r) => r.id === confirmRemoveReviewerId);

  // Audit-trail CSV export state
  const [exportingAudit, setExportingAudit] = useState(false);
  const [auditExportError, setAuditExportError] = useState<string | null>(null);

  const hasAuditReadyGate =
    (sessionsQuery.isError && isAuditReadyPlanGate(sessionsQuery.error)) ||
    (reviewersQuery.isError && isAuditReadyPlanGate(reviewersQuery.error)) ||
    (auditEventsQuery.isError && isAuditReadyPlanGate(auditEventsQuery.error));

  function resetInviteSheet() {
    setInviteStep("reviewer");
    setSelectedReviewerId("");
    setNewReviewerMode(false);
    setNewEmail("");
    setNewName("");
    setNewType("auditor");
    setPurpose("");
    setTtlMs(PORTAL_SESSION_DEFAULT_TTL_MS);
    setInitialScopeType("grant");
    setInitialScopeId("");
    setGeneratedUrl(null);
    setUrlCopied(false);
    setInviteError(null);
  }

  useEffect(() => {
    if (canManage) return;
    resetInviteSheet();
    setInviteOpen(false);
    setEditReviewer(null);
    setEditError(null);
    setAddReviewerOpen(false);
    setAddError(null);
    setMutationError(null);
  }, [canManage]);

  async function handleExportAuditCsv() {
    setAuditExportError(null);
    setExportingAudit(true);
    try {
      await downloadViaOrgFetch(
        "/api/external-reviewers/audit-events/export.csv",
        "reviewer-activity.csv",
      );
    } catch (error) {
      setAuditExportError(getErrorMessage(error));
    } finally {
      setExportingAudit(false);
    }
  }

  async function handleCreateReviewer() {
    /* v8 ignore next -- stale event guard; non-admin renders unmount invite controls. */
    if (!canManage) return;
    if (!newEmail.trim() || !newName.trim()) {
      setInviteError("Email and name are required.");
      return;
    }
    try {
      const result = await reviewerMutations.createReviewer.mutateAsync({
        email: newEmail.trim(),
        name: newName.trim(),
        reviewerType: newType,
      });
      setSelectedReviewerId((result as ReviewerRow).id);
      setInviteStep("session");
      setInviteError(null);
    } catch (err) {
      setInviteError(getErrorMessage(err));
    }
  }

  async function handleCreateSession() {
    if (!canManage) return;
    if (!purpose.trim()) {
      setInviteError("Purpose is required.");
      return;
    }
    const scopes =
      initialScopeId.trim().length > 0
        ? [{ scopeType: initialScopeType, scopeId: initialScopeId.trim() }]
        : [];
    try {
      const result = await sessionMutations.createSession.mutateAsync({
        reviewerId: selectedReviewerId,
        purpose: purpose.trim(),
        ttlMs,
        scopes,
      });
      const data = result as { portalUrl?: string };
      setGeneratedUrl(data.portalUrl ?? null);
      setInviteError(null);
    } catch (err) {
      setInviteError(getErrorMessage(err));
    }
  }

  async function handleCopyUrl() {
    if (!generatedUrl) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable.");
      await navigator.clipboard.writeText(generatedUrl);
      setUrlCopied(true);
    } catch (err) {
      setInviteError(getErrorMessage(err));
      captureAppException(
        new Error("Portal link copy failed"),
        {
          tags: { feature: "portal", operation: "copy_portal_link" },
        },
        { sanitize: true },
      );
    }
  }

  async function handleRevoke(sessionId: string) {
    if (!canManage) return;
    try {
      await sessionMutations.revokeSession.mutateAsync(sessionId);
      setMutationError(null);
    } catch (err) {
      setMutationError(getErrorMessage(err));
    }
  }

  async function handleExtend(sessionId: string) {
    if (!canManage) return;
    try {
      await sessionMutations.extendSession.mutateAsync({
        id: sessionId,
        extensionMs: DEFAULT_PORTAL_SESSION_EXTENSION.value,
      });
      setMutationError(null);
    } catch (err) {
      setMutationError(getErrorMessage(err));
    }
  }

  async function handleUpdateReviewer() {
    if (!canManage) return;
    if (!editReviewer) return;
    if (!editName.trim()) {
      setEditError("Name is required.");
      return;
    }
    try {
      await reviewerMutations.updateReviewer.mutateAsync({
        id: editReviewer.id,
        data: { name: editName.trim(), reviewerType: editType },
      });
      setEditReviewer(null);
      setEditError(null);
    } catch (err) {
      setEditError(getErrorMessage(err));
    }
  }

  async function handleDeleteReviewer(id: string) {
    if (!canManage) return;
    try {
      await reviewerMutations.deleteReviewer.mutateAsync(id);
      setMutationError(null);
    } catch (err) {
      setMutationError(getErrorMessage(err));
    }
  }

  async function handleAddReviewer() {
    if (!canManage) return;
    if (!addEmail.trim() || !addName.trim()) {
      setAddError("Email and name are required.");
      return;
    }
    try {
      await reviewerMutations.createReviewer.mutateAsync({
        email: addEmail.trim(),
        name: addName.trim(),
        reviewerType: addType,
        organizationName: addOrgName.trim() || undefined,
      });
      setAddReviewerOpen(false);
      setAddEmail("");
      setAddName("");
      setAddType("auditor");
      setAddOrgName("");
      setAddError(null);
    } catch (err) {
      setAddError(getErrorMessage(err));
    }
  }

  const reviewerNameMap = Object.fromEntries(reviewers.map((r) => [r.id, r.name]));

  if (!canManage) {
    return (
      <section className="space-y-6" aria-labelledby="portal-access-heading">
        <h2
          id="portal-access-heading"
          className="font-heading text-base font-semibold text-foreground"
        >
          Portal access
        </h2>
        <Separator className="mb-6 mt-2" />
        <Alert>Only admins can manage portal access.</Alert>
      </section>
    );
  }

  if (hasAuditReadyGate) {
    return (
      <section className="space-y-6" aria-labelledby="portal-access-heading">
        <h2
          id="portal-access-heading"
          className="font-heading text-base font-semibold text-foreground"
        >
          Portal access
        </h2>
        <Separator className="mb-6 mt-2" />
        <Alert title={AUDIT_READY_PLAN_GATE_TITLE}>
          <div className="space-y-3">
            <p>{AUDIT_READY_PLAN_GATE_MESSAGE}</p>
            <Button asChild>
              <Link to="/settings" hash="billing">
                Open billing settings
              </Link>
            </Button>
          </div>
        </Alert>
      </section>
    );
  }

  return (
    <section className="space-y-8" aria-labelledby="portal-access-heading">
      <div>
        <h2
          id="portal-access-heading"
          className="font-heading text-base font-semibold text-foreground"
        >
          Portal access
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Board members can use this for board packets.
        </p>
        <Separator className="mb-6 mt-2" />
      </div>

      {mutationError ? <Alert variant="destructive">{mutationError}</Alert> : null}

      {/* Active sessions */}
      <section className="space-y-4" aria-labelledby="sessions-heading">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="sessions-heading"
              className="font-heading text-base font-semibold text-foreground"
            >
              Reviewer sessions
            </h2>
            <Separator className="mt-2" />
          </div>
          <Button
            onClick={() => {
              resetInviteSheet();
              setInviteOpen(true);
            }}
          >
            Invite a reviewer
          </Button>
        </div>

        {sessionsQuery.isLoading ? (
          <PortalTableSkeleton columns={SESSION_COLUMN_LABELS} testId="sessions-loading" />
        ) : sessionsQuery.isError ? (
          <Alert variant="destructive" title="Unable to load sessions.">
            {getErrorMessage(sessionsQuery.error)}
          </Alert>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reviewer sessions yet. Invite a reviewer to create a portal link.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {SESSION_COLUMN_LABELS.map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  const status = getSessionStatus(session);
                  return (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">
                        {reviewerNameMap[session.reviewerId] ?? session.reviewerId.slice(0, 8)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm" title={session.purpose}>
                        {session.purpose}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(session.expiresAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === "active"
                              ? "default"
                              : status === "expired"
                                ? "secondary"
                                : "destructive"
                          }
                          className={status === "active" ? "bg-primary/15 text-primary" : undefined}
                        >
                          {humanizeEnum(status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(session.scopes ?? []).length}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {status === "active" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  sessionMutations.extendSession.isPending &&
                                  sessionMutations.extendSession.variables?.id === session.id
                                }
                                onClick={() => void handleExtend(session.id)}
                              >
                                {DEFAULT_PORTAL_SESSION_EXTENSION.label}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={
                                  sessionMutations.revokeSession.isPending &&
                                  sessionMutations.revokeSession.variables === session.id
                                }
                                onClick={() => setConfirmRevokeSessionId(session.id)}
                              >
                                Revoke
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Reviewers management */}
      <section className="space-y-4" aria-labelledby="reviewers-heading">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="reviewers-heading"
              className="font-heading text-base font-semibold text-foreground"
            >
              Reviewers
            </h2>
            <Separator className="mt-2" />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setAddReviewerOpen(true);
              setAddError(null);
            }}
          >
            Add reviewer
          </Button>
        </div>

        {reviewersQuery.isLoading ? (
          <PortalTableSkeleton columns={REVIEWER_COLUMN_LABELS} testId="reviewers-loading" />
        ) : reviewersQuery.isError ? (
          <Alert variant="destructive" title="Unable to load reviewers.">
            {getErrorMessage(reviewersQuery.error)}
          </Alert>
        ) : reviewers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviewers added yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewers.map((reviewer) => (
                  <TableRow key={reviewer.id}>
                    <TableCell className="font-medium">{reviewer.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {reviewer.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{humanizeEnum(reviewer.reviewerType)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditReviewer(reviewer);
                            setEditName(reviewer.name);
                            setEditType(reviewer.reviewerType as ReviewerType);
                            setEditError(null);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={
                            reviewerMutations.deleteReviewer.isPending &&
                            reviewerMutations.deleteReviewer.variables === reviewer.id
                          }
                          onClick={() => setConfirmRemoveReviewerId(reviewer.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Audit events */}
      <section className="space-y-4" aria-labelledby="audit-heading">
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="audit-heading" className="font-heading text-base font-semibold text-foreground">
              Reviewer activity
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportingAudit || auditEvents.length === 0}
              onClick={() => void handleExportAuditCsv()}
            >
              {exportingAudit ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
          <Separator className="mt-2" />
        </div>

        {auditExportError ? (
          <Alert variant="destructive" title="Unable to export reviewer activity.">
            {auditExportError}
          </Alert>
        ) : null}

        {auditEventsQuery.isLoading ? (
          <PortalTableSkeleton columns={ACTIVITY_COLUMN_LABELS} testId="activity-loading" />
        ) : auditEventsQuery.isError ? (
          <Alert variant="destructive" title="Unable to load activity.">
            {getErrorMessage(auditEventsQuery.error)}
          </Alert>
        ) : auditEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviewer activity yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {ACTIVITY_COLUMN_LABELS.map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm">
                      {reviewerNameMap[event.reviewerId] ?? event.reviewerId.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{humanizeEnum(event.eventType)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {event.targetType
                        ? `${humanizeEnum(event.targetType)}${event.targetId ? ` · ${event.targetId.slice(0, 8)}` : ""}`
                        : ""}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatUtcDateTime(event.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Invite reviewer sheet */}
      <Sheet
        open={inviteOpen}
        onOpenChange={(next) => {
          if (!next) resetInviteSheet();
          setInviteOpen(next);
        }}
      >
        <SheetContent className="flex flex-col gap-5 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Invite a reviewer</SheetTitle>
            <SheetDescription>
              Create a portal link for specific records. It expires on its own.
            </SheetDescription>
          </SheetHeader>

          {inviteError ? <Alert variant="destructive">{inviteError}</Alert> : null}

          {inviteStep === "reviewer" && !generatedUrl ? (
            <div className="flex flex-col gap-4">
              {!newReviewerMode ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="portal-reviewer">Reviewer</Label>
                    {reviewers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No reviewers yet.{" "}
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto p-0 text-sm text-primary underline-offset-4 hover:underline"
                          onClick={() => setNewReviewerMode(true)}
                        >
                          Create one
                        </Button>
                        .
                      </p>
                    ) : (
                      <Select value={selectedReviewerId} onValueChange={setSelectedReviewerId}>
                        <SelectTrigger id="portal-reviewer" aria-label="Reviewer">
                          <SelectValue placeholder="Select reviewer…" />
                        </SelectTrigger>
                        <SelectContent>
                          {reviewers.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name} ({r.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto justify-start p-0 text-sm text-primary underline-offset-4 hover:underline"
                    onClick={() => {
                      setNewReviewerMode(true);
                      setInviteError(null);
                    }}
                  >
                    New reviewer
                  </Button>
                  <div className="flex justify-end pt-2">
                    <Button
                      disabled={!selectedReviewerId}
                      onClick={() => {
                        setInviteError(null);
                        setInviteStep("session");
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="inv-email">Email</Label>
                      <Input
                        id="inv-email"
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="reviewer@example.org"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="inv-name">Name</Label>
                      <Input
                        id="inv-name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Jane Smith"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="portal-new-reviewer-type">Type</Label>
                      <Select value={newType} onValueChange={(v) => setNewType(v as ReviewerType)}>
                        <SelectTrigger id="portal-new-reviewer-type" aria-label="Reviewer type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REVIEWER_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {humanizeEnum(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-between gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setNewReviewerMode(false);
                        setInviteError(null);
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      disabled={reviewerMutations.createReviewer.isPending}
                      onClick={() => void handleCreateReviewer()}
                    >
                      Create & continue
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {inviteStep === "session" && !generatedUrl ? (
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-purpose">Purpose</Label>
                <Textarea
                  id="inv-purpose"
                  rows={2}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Year-end compliance review"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-session-duration">Duration</Label>
                <Select value={String(ttlMs)} onValueChange={(v) => setTtlMs(Number(v))}>
                  <SelectTrigger id="portal-session-duration" aria-label="Duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PORTAL_SESSION_TTL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-initial-scope-type">Initial scope type (optional)</Label>
                <Select
                  value={initialScopeType}
                  onValueChange={(v) => setInitialScopeType(v as ExternalReviewScopeType)}
                >
                  <SelectTrigger id="portal-initial-scope-type" aria-label="Initial scope type">
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
                <Label htmlFor="inv-scope-id">Scope entity ID (optional)</Label>
                <Input
                  id="inv-scope-id"
                  value={initialScopeId}
                  onChange={(e) => setInitialScopeId(e.target.value)}
                  placeholder="Leave blank to add scopes later"
                />
              </div>
              <div className="flex justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setInviteStep("reviewer");
                    setInviteError(null);
                  }}
                >
                  Back
                </Button>
                <Button
                  disabled={sessionMutations.createSession.isPending}
                  onClick={() => void handleCreateSession()}
                >
                  {sessionMutations.createSession.isPending ? "Creating…" : "Create portal link"}
                </Button>
              </div>
            </div>
          ) : null}

          {generatedUrl ? (
            <div className="flex flex-col gap-4">
              <Alert variant="success" title="Portal link created">
                Copy the link and send it to the reviewer.
              </Alert>
              <div className="space-y-1.5">
                <Label htmlFor="generated-portal-link">Portal link</Label>
                <div className="flex gap-2">
                  <Input
                    id="generated-portal-link"
                    readOnly
                    aria-label="Portal access link"
                    value={generatedUrl}
                    className="bg-muted"
                  />
                  <Button variant="outline" onClick={() => void handleCopyUrl()}>
                    {urlCopied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  resetInviteSheet();
                  setInviteOpen(false);
                }}
              >
                Done
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Edit reviewer sheet */}
      <Sheet
        open={editReviewer !== null}
        onOpenChange={(next) => {
          if (!next) {
            setEditReviewer(null);
            setEditError(null);
          }
        }}
      >
        <SheetContent className="flex flex-col gap-5 sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Edit reviewer</SheetTitle>
            <SheetDescription>Update the reviewer's name and type.</SheetDescription>
          </SheetHeader>
          {editError ? <Alert variant="destructive">{editError}</Alert> : null}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-edit-reviewer-type">Type</Label>
              <Select value={editType} onValueChange={(v) => setEditType(v as ReviewerType)}>
                <SelectTrigger id="portal-edit-reviewer-type" aria-label="Reviewer type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVIEWER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {humanizeEnum(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditReviewer(null);
                setEditError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={reviewerMutations.updateReviewer.isPending}
              onClick={() => void handleUpdateReviewer()}
            >
              Save changes
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add reviewer sheet */}
      <Sheet
        open={addReviewerOpen}
        onOpenChange={(next) => {
          if (!next) {
            setAddReviewerOpen(false);
            setAddError(null);
          }
        }}
      >
        <SheetContent className="flex flex-col gap-5 sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Add reviewer</SheetTitle>
            <SheetDescription>
              Register a new external reviewer for this organization.
            </SheetDescription>
          </SheetHeader>
          {addError ? <Alert variant="destructive">{addError}</Alert> : null}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="reviewer@example.org"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-add-reviewer-type">Type</Label>
              <Select value={addType} onValueChange={(v) => setAddType(v as ReviewerType)}>
                <SelectTrigger id="portal-add-reviewer-type" aria-label="Reviewer type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVIEWER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {humanizeEnum(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-org">Organization (optional)</Label>
              <Input
                id="add-org"
                value={addOrgName}
                onChange={(e) => setAddOrgName(e.target.value)}
                placeholder="Funder name or audit firm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setAddReviewerOpen(false);
                setAddError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={reviewerMutations.createReviewer.isPending}
              onClick={() => void handleAddReviewer()}
            >
              Add reviewer
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirmRemoveReviewerId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveReviewerId(null);
        }}
        title={`Remove ${reviewerToRemove?.name ?? "reviewer"}?`}
        description={`${reviewerToRemove?.name ?? "This reviewer"} will lose portal access right away. Their audit log entries will be kept.`}
        confirmLabel="Remove"
        isPending={reviewerMutations.deleteReviewer.isPending}
        onConfirm={() => {
          if (confirmRemoveReviewerId) void handleDeleteReviewer(confirmRemoveReviewerId);
        }}
      />
      {confirmRevokeSessionId !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmRevokeSessionId(null);
          }}
          title="Revoke portal session?"
          description="The reviewer will lose access immediately. This cannot be undone."
          confirmLabel="Revoke"
          isPending={sessionMutations.revokeSession.isPending}
          onConfirm={() => {
            void handleRevoke(confirmRevokeSessionId).then(() => setConfirmRevokeSessionId(null));
          }}
        />
      ) : null}
    </section>
  );
}
