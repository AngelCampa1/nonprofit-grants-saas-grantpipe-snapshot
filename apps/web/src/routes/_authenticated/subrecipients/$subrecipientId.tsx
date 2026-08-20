import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Alert,
  Badge,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  TeachAndActEmptyState,
  Textarea,
} from "@grantpipe/ui";
import { ClipboardCheck, FileArchive, Pencil, ShieldAlert } from "lucide-react";
import {
  getEffectivePlanTier,
  getPlanEntitlementLabelList,
  getPlanLabelsWithEntitlement,
  hasSubrecipientMonitoring,
  SUBRECIPIENT_FINDING_STATUSES,
  SUBRECIPIENT_MONITORING_LOG_TYPES,
  SUBRECIPIENT_STATUSES,
  type RiskChecklistInput,
  type SubrecipientFindingStatus,
  type SubrecipientMonitoringLogType,
  type SubrecipientStatus,
  type UpdateSubrecipientInput,
} from "@grantpipe/shared";
import { RetryButton } from "../../../components/retry-button";
import { useOrgBilling } from "../../../hooks/use-org-settings";
import {
  useSubawardMonitoringMutations,
  useSubrecipient,
  useSubrecipientMutations,
  useSubrecipientRecordMutations,
} from "../../../hooks/use-subrecipients";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import { downloadViaOrgFetch } from "../../../lib/download";
import {
  formatCurrency,
  formatNumber,
  formatUtcCalendarDate,
  humanizeEnum,
} from "../../../lib/format";

export const Route = createFileRoute("/_authenticated/subrecipients/$subrecipientId")({
  validateSearch: (search: Record<string, unknown>) => ({
    grantId: typeof search.grantId === "string" ? search.grantId : undefined,
  }),
  component: SubrecipientDetailPage,
});

const riskChecklistLabels: Record<keyof RiskChecklistInput, string> = {
  priorFindings: "Prior findings or unresolved monitoring issues",
  newPartner: "New partner or limited prior history",
  complexRequirements: "Complex award terms or reporting requirements",
  highDollarAward: "High-dollar award for this organization",
  weakControls: "Weak or unknown financial controls",
};

const defaultChecklist: RiskChecklistInput = {
  priorFindings: "unknown",
  newPartner: "unknown",
  complexRequirements: "unknown",
  highDollarAward: "unknown",
  weakControls: "unknown",
};

const SUBRECIPIENT_MONITORING_PLAN_LABELS = getPlanLabelsWithEntitlement(
  "hasSubrecipientMonitoring",
);
const SUBRECIPIENT_MONITORING_MIN_PLAN_LABEL = SUBRECIPIENT_MONITORING_PLAN_LABELS[0] ?? "paid";
const SUBRECIPIENT_MONITORING_PLAN_LIST = getPlanEntitlementLabelList("hasSubrecipientMonitoring");

function suggestRiskRating(checklist: RiskChecklistInput): "low" | "medium" | "high" {
  const answers = Object.values(checklist);
  const yesCount = answers.filter((answer) => answer === "yes").length;
  const unknownCount = answers.filter((answer) => answer === "unknown").length;
  if (yesCount >= 2 || (yesCount >= 1 && unknownCount >= 2)) return "high";
  if (yesCount === 1 || unknownCount >= 2) return "medium";
  return "low";
}

export function SubrecipientDetailPage() {
  const { subrecipientId } = Route.useParams();
  const { grantId: linkedGrantId } = Route.useSearch();
  const billingQuery = useOrgBilling();
  const { memberRole, memberPermissions } = useSession();
  const canUseMonitoring = hasSubrecipientMonitoring(
    billingQuery.data
      ? getEffectivePlanTier({
          planTier: billingQuery.data.planTier,
          subscriptionStatus: billingQuery.data.status,
          trialEndsAt: billingQuery.data.trialEndsAt,
        })
      : null,
  );
  const canEditCompliance = canAccessFeature(memberRole, memberPermissions, "compliance", "edit");
  const canEditMonitoring = canUseMonitoring && canEditCompliance;
  const detailQuery = useSubrecipient(subrecipientId, { enabled: canUseMonitoring });
  const subrecipientMutations = useSubrecipientMutations(subrecipientId);
  const recordMutations = useSubrecipientRecordMutations();
  const detail = detailQuery.data;
  const [selectedSubawardId, setSelectedSubawardId] = useState("");
  const selectedSubaward =
    detail?.subawards.find((subaward) => subaward.id === selectedSubawardId) ??
    detail?.subawards[0];
  const subawardMutations = useSubawardMonitoringMutations(selectedSubaward?.id ?? "");
  const [checklist, setChecklist] = useState<RiskChecklistInput>(defaultChecklist);
  const [overrideReason, setOverrideReason] = useState("");
  const [manualRisk, setManualRisk] = useState<"low" | "medium" | "high">("medium");
  const [findingTitle, setFindingTitle] = useState("");
  const [findingStatusDrafts, setFindingStatusDrafts] = useState<
    Record<string, SubrecipientFindingStatus>
  >({});
  const [actionTitleDrafts, setActionTitleDrafts] = useState<Record<string, string>>({});
  const [actionDueDrafts, setActionDueDrafts] = useState<Record<string, string>>({});
  const [logType, setLogType] = useState<SubrecipientMonitoringLogType>("desk_review");
  const [logTitle, setLogTitle] = useState("");
  const [logDate, setLogDate] = useState("");
  const [logSummary, setLogSummary] = useState("");
  const [subawardOpen, setSubawardOpen] = useState(false);
  const [subawardError, setSubawardError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUei, setEditUei] = useState("");
  const [editStatus, setEditStatus] = useState<SubrecipientStatus>("active");
  const [editNotes, setEditNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [bundleMessage, setBundleMessage] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [documentDownloadError, setDocumentDownloadError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const suggestedRisk = useMemo(() => suggestRiskRating(checklist), [checklist]);
  const overrideRequired = manualRisk !== suggestedRisk;

  const summary = useMemo(() => {
    const tasks = detail?.monitoringTasks ?? [];
    const findings = detail?.findings ?? [];
    return {
      openTasks: tasks.filter((task) => task.status !== "completed" && task.status !== "waived")
        .length,
      overdueTasks: tasks.filter(
        (task) =>
          task.status !== "completed" &&
          task.status !== "waived" &&
          new Date(task.dueDate).getTime() < now,
      ).length,
      openFindings: findings.filter(
        (finding) => finding.status === "open" || finding.status === "in_review",
      ).length,
    };
  }, [detail, now]);

  async function handleDocumentDownload(documentId: string, filename: string) {
    setDocumentDownloadError(null);
    setDownloadingDocumentId(documentId);
    try {
      await downloadViaOrgFetch(`/api/documents/${documentId}/download`, filename);
    } catch (error) {
      setDocumentDownloadError(error instanceof Error ? error.message : "Unable to download file.");
    } finally {
      setDownloadingDocumentId(null);
    }
  }

  function runMonitoringAction(action: () => Promise<unknown>) {
    setActionError(null);
    return action().catch((error) => {
      setActionError(error instanceof Error ? error.message : "Unable to complete this action.");
    });
  }

  function openEditDialog() {
    if (!detail) return;
    setEditError(null);
    setEditName(detail.subrecipient.name);
    setEditUei(detail.subrecipient.uei ?? "");
    setEditStatus(
      SUBRECIPIENT_STATUSES.includes(detail.subrecipient.status as SubrecipientStatus)
        ? (detail.subrecipient.status as SubrecipientStatus)
        : "active",
    );
    setEditNotes(detail.subrecipient.notes ?? "");
    setEditOpen(true);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError("Name is required.");
      return;
    }
    const trimmedUei = editUei.trim();
    const trimmedNotes = editNotes.trim();
    const payload: UpdateSubrecipientInput = {
      name: trimmedName,
      status: editStatus,
      ...(trimmedUei ? { uei: trimmedUei } : {}),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    };
    try {
      await subrecipientMutations.updateSubrecipient.mutateAsync(payload);
      setEditOpen(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Unable to save subrecipient.");
    }
  }

  if (!canUseMonitoring) {
    return (
      <TeachAndActEmptyState
        icon={<ShieldAlert />}
        heading={`Subrecipient monitoring requires ${SUBRECIPIENT_MONITORING_MIN_PLAN_LABEL}.`}
        description={`You need ${SUBRECIPIENT_MONITORING_PLAN_LIST}. They open profiles, evidence, findings, and corrective actions.`}
        primaryAction={{ label: "See plans", href: "/settings#billing" }}
      />
    );
  }

  if (detailQuery.isError) {
    return (
      <Alert variant="destructive" title="Unable to load subrecipient">
        <p>{detailQuery.error instanceof Error ? detailQuery.error.message : "Try again."}</p>
        <RetryButton query={detailQuery} />
      </Alert>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6" data-testid="subrecipient-detail-loading">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        variant="workbench"
        kicker="Subrecipient"
        title={detail.subrecipient.name}
        description={
          detail.subrecipient.notes ?? "Profile, subawards, evidence, and corrective actions."
        }
        actions={
          <>
            {canEditCompliance ? (
              <Button variant="outline" onClick={openEditDialog}>
                <Pencil className="mr-2 size-4" />
                Edit subrecipient
              </Button>
            ) : null}
            {selectedSubaward ? (
              <Button
                onClick={() => {
                  setBundleMessage(null);
                  void subawardMutations.createEvidenceBundle
                    .mutateAsync()
                    .then((bundle) =>
                      setBundleMessage(
                        `Evidence bundle ${bundle.bundle.title} is ready with ${bundle.items.length} item${bundle.items.length === 1 ? "" : "s"}.`,
                      ),
                    )
                    .catch((error: unknown) =>
                      setActionError(
                        error instanceof Error
                          ? error.message
                          : "Unable to export the evidence bundle.",
                      ),
                    );
                }}
                disabled={!canEditMonitoring || subawardMutations.createEvidenceBundle.isPending}
              >
                <FileArchive className="mr-2 size-4" />
                Export evidence
              </Button>
            ) : null}
          </>
        }
      />

      <Dialog
        open={editOpen}
        onOpenChange={(nextOpen) => {
          setEditOpen(nextOpen);
          if (!nextOpen) setEditError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit subrecipient</DialogTitle>
            <DialogDescription>
              Update the subrecipient name, UEI, status, and notes.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onChange={() => setEditError(null)}
            onSubmit={handleEditSubmit}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-subrecipient-name">Name</Label>
              <Input
                id="edit-subrecipient-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subrecipient-uei">UEI</Label>
              <Input
                id="edit-subrecipient-uei"
                value={editUei}
                onChange={(event) => setEditUei(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subrecipient-status">Status</Label>
              <Select
                value={editStatus}
                onValueChange={(value) => setEditStatus(value as SubrecipientStatus)}
              >
                <SelectTrigger id="edit-subrecipient-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBRECIPIENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {humanizeEnum(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subrecipient-notes">Notes</Label>
              <Textarea
                id="edit-subrecipient-notes"
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
              />
            </div>
            {editError ? (
              <p role="alert" className="text-sm text-destructive">
                {editError}
              </p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={subrecipientMutations.updateSubrecipient.isPending}
            >
              Save changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {canUseMonitoring && !canEditCompliance ? (
        <Alert title="Read-only access">
          <p>Viewers and auditors can read this workspace. They cannot change it.</p>
        </Alert>
      ) : null}

      {bundleMessage ? <Alert title={bundleMessage} /> : null}

      {actionError ? (
        <Alert variant="destructive" title="Unable to complete the action">
          <p>{actionError}</p>
        </Alert>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Subawards" value={detail.subawards.length} />
        <Metric label="Open tasks" value={summary.openTasks} />
        <Metric label="Overdue tasks" value={summary.overdueTasks} />
        <Metric label="Open findings" value={summary.openFindings} />
      </section>

      {detail.subawards.length === 0 ? (
        <TeachAndActEmptyState
          icon={<ClipboardCheck />}
          heading="No subawards linked yet."
          description="Add a subaward to start risk assessment and monitoring."
          primaryAction={{ label: "Back to portfolio", href: "/subrecipients" }}
        />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 rounded-2xl border bg-background p-4">
          <div>
            <h2 className="text-base font-semibold">Linked subawards</h2>
            <p className="text-sm text-muted-foreground">
              Each subaward has its own risk, tasks, findings, and evidence.
            </p>
          </div>
          {canEditMonitoring ? (
            <Dialog
              open={subawardOpen}
              onOpenChange={(nextOpen) => {
                setSubawardOpen(nextOpen);
                if (nextOpen) setSubawardError(null);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline">Add subaward</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add subaward</DialogTitle>
                  <DialogDescription>
                    {linkedGrantId
                      ? "Link this subrecipient to the grant you came from."
                      : "Enter a grant ID to link this subrecipient."}
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onChange={() => setSubawardError(null)}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const submittedGrantId = String(form.get("grantId") ?? "").trim();
                    const title = String(form.get("title") ?? "").trim();
                    const amount = Number(String(form.get("amount") ?? "").trim());
                    const startDate = String(form.get("startDate") ?? "").trim();
                    const endDate = String(form.get("endDate") ?? "").trim();
                    if (
                      !submittedGrantId ||
                      !title ||
                      !startDate ||
                      !endDate ||
                      !Number.isFinite(amount) ||
                      amount <= 0
                    ) {
                      setSubawardError("Grant, title, positive amount, and dates are required.");
                      return;
                    }
                    try {
                      await subrecipientMutations.createSubaward.mutateAsync({
                        grantId: submittedGrantId,
                        title,
                        amountCents: Math.round(amount * 100),
                        startDate: `${startDate}T12:00:00.000Z`,
                        endDate: `${endDate}T12:00:00.000Z`,
                        status: "active",
                      });
                      setSubawardOpen(false);
                    } catch (error) {
                      setSubawardError(
                        error instanceof Error ? error.message : "Unable to save subaward.",
                      );
                    }
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="subaward-grant">{linkedGrantId ? "Grant" : "Grant ID"}</Label>
                    <Input
                      id="subaward-grant"
                      name="grantId"
                      defaultValue={linkedGrantId ?? ""}
                      readOnly={Boolean(linkedGrantId)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subaward-title">Title</Label>
                    <Input id="subaward-title" name="title" />
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="subaward-amount">Amount</Label>
                      <Input id="subaward-amount" name="amount" inputMode="decimal" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subaward-start">Start</Label>
                      <Input id="subaward-start" name="startDate" type="date" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subaward-end">End</Label>
                      <Input id="subaward-end" name="endDate" type="date" />
                    </div>
                  </div>
                  {subawardError ? (
                    <p role="alert" className="text-sm text-destructive">
                      {subawardError}
                    </p>
                  ) : null}
                  <Button
                    className="w-full"
                    disabled={subrecipientMutations.createSubaward.isPending}
                  >
                    Save subaward
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
          {detail.subawards.map((subaward) => (
            <div key={subaward.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{subaward.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatCurrency(subaward.amountCents)} -{" "}
                    {formatUtcCalendarDate(subaward.startDate)} to{" "}
                    {formatUtcCalendarDate(subaward.endDate)}
                  </div>
                </div>
                <Badge variant={subaward.riskRating === "high" ? "destructive" : "outline"}>
                  {subaward.riskRating ? humanizeEnum(subaward.riskRating) : "Not assessed"}
                </Badge>
              </div>
              <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                <span>{subaward.openTaskCount ?? 0} open tasks</span>
                <span>{subaward.overdueTaskCount ?? 0} overdue</span>
                <span>{subaward.openFindingCount ?? 0} open findings</span>
              </div>
              <Button
                className="mt-3"
                size="sm"
                variant={selectedSubaward?.id === subaward.id ? "default" : "outline"}
                onClick={() => setSelectedSubawardId(subaward.id)}
              >
                {selectedSubaward?.id === subaward.id ? "Selected" : "Select for actions"}
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border bg-background p-4">
          <div>
            <h2 className="text-base font-semibold">Risk assessment</h2>
            <p className="text-sm text-muted-foreground">
              You can override the suggested risk. Document the reason when you do.
            </p>
          </div>
          <div className="grid gap-3">
            {Object.entries(riskChecklistLabels).map(([key, label]) => (
              <div key={key} className="grid gap-2">
                <Label htmlFor={`risk-${key}`}>{label}</Label>
                <Select
                  value={checklist[key as keyof RiskChecklistInput]}
                  onValueChange={(value) =>
                    setChecklist((current) => ({
                      ...current,
                      [key]: value as RiskChecklistInput[keyof RiskChecklistInput],
                    }))
                  }
                >
                  <SelectTrigger id={`risk-${key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              Suggested risk: <span className="font-medium">{suggestedRisk}</span>
            </div>
            <Label htmlFor="final-risk">Final risk</Label>
            <Select
              value={manualRisk}
              onValueChange={(value) => setManualRisk(value as typeof manualRisk)}
            >
              <SelectTrigger id="final-risk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Label htmlFor="override-reason">Override reason</Label>
            <Textarea
              id="override-reason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="Required when your final risk differs from the suggestion."
            />
            <Button
              disabled={
                !canEditMonitoring ||
                !selectedSubaward ||
                (overrideRequired && overrideReason.trim().length === 0)
              }
              onClick={() =>
                selectedSubaward &&
                void runMonitoringAction(() =>
                  subawardMutations.createRiskAssessment.mutateAsync({
                    checklist,
                    suggestedRiskRating: suggestedRisk,
                    finalRiskRating: manualRisk,
                    ...(overrideRequired ? { overrideReason } : {}),
                  }),
                )
              }
            >
              Save risk assessment
            </Button>
            {selectedSubaward ? (
              <Button
                variant="outline"
                disabled={!canEditMonitoring}
                onClick={() =>
                  void runMonitoringAction(() =>
                    subawardMutations.generateTasks.mutateAsync({
                      riskRating:
                        selectedSubaward.riskRating === "low" ||
                        selectedSubaward.riskRating === "medium" ||
                        selectedSubaward.riskRating === "high"
                          ? selectedSubaward.riskRating
                          : manualRisk,
                    }),
                  )
                }
              >
                Generate monitoring tasks
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Risk history">
          {detail.riskAssessments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No risk assessments recorded.</p>
          ) : (
            detail.riskAssessments.map((assessment) => (
              <div key={assessment.id} className="border-b py-3 text-sm last:border-0">
                <div className="font-medium">
                  {humanizeEnum(assessment.finalRiskRating)} risk -{" "}
                  {formatUtcCalendarDate(assessment.assessedAt)}
                </div>
                <div className="text-muted-foreground">
                  Suggested {assessment.suggestedRiskRating}
                  {assessment.overrideReason ? ` - ${assessment.overrideReason}` : ""}
                </div>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Monitoring board">
          {detail.monitoringTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No monitoring tasks recorded.</p>
          ) : (
            detail.monitoringTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start justify-between gap-3 border-b py-3 last:border-0"
              >
                <div>
                  <div className="font-medium">{task.title}</div>
                  <div className="text-sm text-muted-foreground">
                    Due {formatUtcCalendarDate(task.dueDate)} - {humanizeEnum(task.status)}
                  </div>
                </div>
                {task.status !== "completed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canEditMonitoring}
                    onClick={() =>
                      void runMonitoringAction(() =>
                        recordMutations.updateTask.mutateAsync({
                          taskId: task.id,
                          data: { status: "completed", completedAt: new Date().toISOString() },
                        }),
                      )
                    }
                  >
                    Complete monitoring task
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Monitoring logs">
          <div className="mb-4 grid gap-2 rounded-lg border bg-muted/20 p-3">
            <Label htmlFor="log-type">Activity type</Label>
            <Select
              value={logType}
              onValueChange={(value) => setLogType(value as SubrecipientMonitoringLogType)}
            >
              <SelectTrigger id="log-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBRECIPIENT_MONITORING_LOG_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {humanizeEnum(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Activity title"
              placeholder="Activity title"
              value={logTitle}
              onChange={(event) => setLogTitle(event.target.value)}
            />
            <Input
              aria-label="Activity date"
              type="date"
              value={logDate}
              onChange={(event) => setLogDate(event.target.value)}
            />
            <Textarea
              aria-label="Activity summary"
              placeholder="Activity summary"
              value={logSummary}
              onChange={(event) => setLogSummary(event.target.value)}
            />
            <Button
              disabled={
                !canEditMonitoring ||
                !selectedSubaward ||
                logTitle.trim().length === 0 ||
                logDate.length === 0 ||
                logSummary.trim().length === 0
              }
              onClick={() => {
                if (!selectedSubaward) return;
                void runMonitoringAction(() =>
                  subawardMutations.createMonitoringLog
                    .mutateAsync({
                      logType,
                      title: logTitle.trim(),
                      occurredAt: `${logDate}T12:00:00.000Z`,
                      summary: logSummary.trim(),
                    })
                    .then((result) => {
                      setLogTitle("");
                      setLogDate("");
                      setLogSummary("");
                      return result;
                    }),
                );
              }}
            >
              Log activity
            </Button>
          </div>
          {detail.monitoringLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No monitoring logs recorded.</p>
          ) : (
            detail.monitoringLogs.map((log) => (
              <div key={log.id} className="border-b py-3 last:border-0">
                <div className="font-medium">{log.title}</div>
                <div className="text-sm text-muted-foreground">
                  {humanizeEnum(log.logType)} - {formatUtcCalendarDate(log.occurredAt)}
                </div>
                <p className="mt-1 text-sm">{log.summary}</p>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Findings and corrective actions">
          <div className="mb-4 grid gap-2">
            <Label htmlFor="finding-title">New finding</Label>
            <div className="flex gap-2">
              <Input
                id="finding-title"
                value={findingTitle}
                onChange={(event) => setFindingTitle(event.target.value)}
                placeholder="Finding title"
              />
              <Button
                disabled={
                  !canEditMonitoring || !selectedSubaward || findingTitle.trim().length === 0
                }
                onClick={() => {
                  if (!selectedSubaward) return;
                  void runMonitoringAction(() =>
                    subawardMutations.createFinding.mutateAsync({
                      title: findingTitle.trim(),
                      severity: "medium",
                      description: "Finding created from monitoring board.",
                    }),
                  );
                  setFindingTitle("");
                }}
              >
                Add
              </Button>
            </div>
          </div>
          {detail.findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No findings recorded.</p>
          ) : (
            detail.findings.map((finding) => {
              const statusDraft: SubrecipientFindingStatus =
                findingStatusDrafts[finding.id] ?? (finding.status as SubrecipientFindingStatus);
              const actionTitleDraft = actionTitleDrafts[finding.id] ?? "";
              const actionDueDraft = actionDueDrafts[finding.id] ?? "";
              return (
                <div
                  key={finding.id}
                  data-testid={`finding-row-${finding.id}`}
                  className="border-b py-3 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-muted-foreground" />
                    <span className="font-medium">{finding.title}</span>
                    <Badge variant="outline">{humanizeEnum(finding.status)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{finding.description}</p>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`finding-status-${finding.id}`} className="text-xs">
                        Status
                      </Label>
                      <Select
                        value={statusDraft}
                        onValueChange={(value) =>
                          setFindingStatusDrafts((current) => ({
                            ...current,
                            [finding.id]: value as SubrecipientFindingStatus,
                          }))
                        }
                      >
                        <SelectTrigger id={`finding-status-${finding.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUBRECIPIENT_FINDING_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {humanizeEnum(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canEditMonitoring || statusDraft === finding.status}
                      onClick={() =>
                        void runMonitoringAction(() =>
                          recordMutations.updateFinding.mutateAsync({
                            findingId: finding.id,
                            data: { status: statusDraft },
                          }),
                        )
                      }
                    >
                      Update finding
                    </Button>
                  </div>
                  {detail.correctiveActions
                    .filter((action) => action.findingId === finding.id)
                    .map((action) => (
                      <div
                        key={action.id}
                        className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-2 text-sm"
                      >
                        <span>
                          {action.title} - {humanizeEnum(action.status)} - due{" "}
                          {formatUtcCalendarDate(action.dueDate)}
                        </span>
                        {action.status !== "completed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canEditMonitoring}
                            onClick={() =>
                              void runMonitoringAction(() =>
                                recordMutations.updateCorrectiveAction.mutateAsync({
                                  actionId: action.id,
                                  data: { status: "completed" },
                                }),
                              )
                            }
                          >
                            Complete action
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <Input
                      aria-label="Corrective action title"
                      className="max-w-[12rem]"
                      placeholder="Corrective action title"
                      value={actionTitleDraft}
                      onChange={(event) =>
                        setActionTitleDrafts((current) => ({
                          ...current,
                          [finding.id]: event.target.value,
                        }))
                      }
                    />
                    <Input
                      aria-label="Corrective action due date"
                      type="date"
                      value={actionDueDraft}
                      onChange={(event) =>
                        setActionDueDrafts((current) => ({
                          ...current,
                          [finding.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      size="sm"
                      disabled={
                        !canEditMonitoring ||
                        actionTitleDraft.trim().length === 0 ||
                        actionDueDraft.length === 0
                      }
                      onClick={() => {
                        void runMonitoringAction(() =>
                          recordMutations.createCorrectiveAction
                            .mutateAsync({
                              findingId: finding.id,
                              data: {
                                findingId: finding.id,
                                title: actionTitleDraft.trim(),
                                dueDate: `${actionDueDraft}T12:00:00.000Z`,
                                status: "open",
                              },
                            })
                            .then((result) => {
                              setActionTitleDrafts((current) => ({ ...current, [finding.id]: "" }));
                              setActionDueDrafts((current) => ({ ...current, [finding.id]: "" }));
                              return result;
                            }),
                        );
                      }}
                    >
                      Add corrective action
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </Panel>
      </section>

      <Panel title="Documents">
        {documentDownloadError ? (
          <Alert variant="destructive" title="Unable to download document" className="mb-3">
            <p>{documentDownloadError}</p>
          </Alert>
        ) : null}
        {detail.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents attached.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {detail.documents.map((document) => (
              <div
                key={document.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium" title={document.filename}>
                    {document.filename}
                  </div>
                  <div className="text-muted-foreground">{humanizeEnum(document.entityType)}</div>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto shrink-0 px-0"
                  disabled={downloadingDocumentId === document.id}
                  onClick={() => void handleDocumentDownload(document.id, document.filename)}
                >
                  {downloadingDocumentId === document.id ? "Downloading…" : "Download"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="text-2xl font-semibold">{formatNumber(value)}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}
