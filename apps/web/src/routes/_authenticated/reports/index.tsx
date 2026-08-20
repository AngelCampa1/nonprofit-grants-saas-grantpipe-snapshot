import React, { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
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
import { BarChart3, Bot, FilePenLine, TableProperties } from "lucide-react";
import { RetryButton } from "../../../components/retry-button";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { reportsTabs } from "../../../config/page-tabs";
import {
  useAcknowledgmentTemplate,
  useGenerateAcknowledgmentLetter,
  useGenerateAuditReport,
  useGenerateBoardReport,
  useGenerateDonorYearEndStatementRun,
  useGenerateGrantComplianceReport,
  useGenerateIrs990Report,
  useGenerateSefaReport,
  useReportArtifacts,
  useReportGrantOptions,
  useSefaTripwire,
  useUpdateAcknowledgmentTemplate,
} from "../../../hooks/use-reports";
import { useOrgBilling } from "../../../hooks/use-org-settings";
import { useSession } from "../../../hooks/use-session";
import { useActivationAha } from "../../../hooks/use-activation-aha";
import { canAccessFeature } from "../../../lib/access-control";
import { captureEvent } from "../../../lib/analytics";
import { getTextLengthBucket } from "../../../lib/analytics-buckets";
import {
  getEffectivePlanTier,
  getPlanEntitlementLabelList,
  getPlanLabelsWithEntitlement,
  canUseAskYourLedger,
  canUseProposalReportDrafting,
  hasComplianceReportPack,
  hasRestrictionEvidencePackage,
  isPlanTierAtLeast,
  type AcknowledgmentTemplateInput,
  type BoardPacketSection,
  type GeneratedReportArtifact,
} from "@grantpipe/shared";
import { useGenerateRestrictedRollforward } from "../../../hooks/use-restrictions";
import { formatCurrency } from "../../../lib/format";

export const Route = createFileRoute("/_authenticated/reports/")({
  component: ReportsPage,
});

const REPORTS_ERROR_TITLE = "Unable to load reports.";
const REPORT_ACTION_BUTTON_CLASS =
  "h-auto min-h-9 w-full !whitespace-normal break-words py-2 text-center leading-snug";
const ACKNOWLEDGMENT_TEMPLATE_FIELDS = ["intro", "body", "closing"] as const;
const COMPLIANCE_REPORT_PACK_PLAN_LABELS = getPlanLabelsWithEntitlement("hasComplianceReportPack");
const COMPLIANCE_REPORT_PACK_MIN_PLAN_LABEL = COMPLIANCE_REPORT_PACK_PLAN_LABELS[0] ?? "paid";
const RESTRICTION_EVIDENCE_PACKAGE_PLAN_LIST = getPlanEntitlementLabelList(
  "hasRestrictionEvidencePackage",
);
const BOARD_PACKET_SECTION_OPTIONS: Array<{ value: BoardPacketSection; label: string }> = [
  { value: "executive_snapshot", label: "Executive snapshot" },
  { value: "fundraising", label: "Fundraising" },
  { value: "grant_pipeline", label: "Grant pipeline" },
  { value: "fund_balances", label: "Fund balances" },
  { value: "compliance_deadlines", label: "Compliance deadlines" },
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function getReportFilterAnalytics(search: string) {
  const queryLength = search.trim().length;

  return {
    filter_count: queryLength > 0 ? 1 : 0,
    filter_keys: queryLength > 0 ? ["search"] : [],
    has_search: queryLength > 0,
    query_length_bucket: getTextLengthBucket(queryLength),
  };
}

function formatReportMetadataLabel(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "irs_990" || normalizedValue === "irs 990") {
    return "IRS 990";
  }

  return normalizedValue
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type ReportNavigate = ReturnType<typeof useNavigate>;

function handleGeneratedReportMutation(
  mutation: Promise<{ id: string }>,
  setMutationError: (message: string | null) => void,
  navigate: ReportNavigate,
) {
  return void mutation
    .then(async (artifact) => {
      setMutationError(null);
      await navigate({
        to: "/reports/$reportId",
        params: { reportId: artifact.id },
      });
    })
    .catch((error: unknown) => {
      setMutationError(getErrorMessage(error));
      return undefined;
    });
}

export function ReportsPage() {
  const navigate = useNavigate();
  const { memberRole, memberPermissions, orgId } = useSession();
  useActivationAha(orgId);
  const currentYear = new Date().getFullYear();
  const defaultFiscalYear = `FY${currentYear}`;
  const defaultPeriodStart = `${currentYear}-01-01`;
  const defaultPeriodEnd = `${currentYear}-12-31`;
  const [reportSearch, setReportSearch] = useState("");
  const [reportPage, setReportPage] = useState(1);
  const reportPageSize = 25;
  const [grantId, setGrantId] = useState("");
  const [donationId, setDonationId] = useState("");
  const [auditFiscalYear, setAuditFiscalYear] = useState(defaultFiscalYear);
  const [sefaFiscalYear, setSefaFiscalYear] = useState(defaultFiscalYear);
  const [irsFiscalYear, setIrsFiscalYear] = useState(defaultFiscalYear);
  const [statementYear, setStatementYear] = useState(String(currentYear));
  const [boardFiscalYear, setBoardFiscalYear] = useState(defaultFiscalYear);
  const [boardMeetingDate, setBoardMeetingDate] = useState("");
  const [boardCadence, setBoardCadence] = useState<"one_time" | "monthly" | "quarterly">(
    "one_time",
  );
  const [boardSections, setBoardSections] = useState<BoardPacketSection[]>([
    ...BOARD_PACKET_SECTION_OPTIONS.map((option) => option.value),
  ]);
  const [rollforwardPeriodStart, setRollforwardPeriodStart] = useState(defaultPeriodStart);
  const [rollforwardPeriodEnd, setRollforwardPeriodEnd] = useState(defaultPeriodEnd);
  const [includeEvidencePackage, setIncludeEvidencePackage] = useState(false);
  const [grantMutationError, setGrantMutationError] = useState<string | null>(null);
  const [auditMutationError, setAuditMutationError] = useState<string | null>(null);
  const [sefaMutationError, setSefaMutationError] = useState<string | null>(null);
  const [irsMutationError, setIrsMutationError] = useState<string | null>(null);
  const [statementMutationError, setStatementMutationError] = useState<string | null>(null);
  const [boardMutationError, setBoardMutationError] = useState<string | null>(null);
  const [rollforwardMutationError, setRollforwardMutationError] = useState<string | null>(null);
  const [acknowledgmentMutationError, setAcknowledgmentMutationError] = useState<string | null>(
    null,
  );
  const [templateMutationError, setTemplateMutationError] = useState<string | null>(null);
  const [templateSuccessMessage, setTemplateSuccessMessage] = useState<string | null>(null);
  const grantOptionsQuery = useReportGrantOptions();
  const reportsQuery = useReportArtifacts({
    page: reportPage,
    pageSize: reportPageSize,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const normalizedGrantId = grantId.trim();
  const normalizedDonationId = donationId.trim();
  const normalizedAuditFiscalYear = auditFiscalYear.trim();
  const normalizedSefaFiscalYear = sefaFiscalYear.trim();
  const normalizedIrsFiscalYear = irsFiscalYear.trim();
  const normalizedStatementYear = statementYear.trim();
  const normalizedBoardFiscalYear = boardFiscalYear.trim();
  const generateGrantCompliance = useGenerateGrantComplianceReport(normalizedGrantId);
  const generateAudit = useGenerateAuditReport(normalizedAuditFiscalYear);
  const generateSefa = useGenerateSefaReport();
  const generateIrs990 = useGenerateIrs990Report();
  const generateBoard = useGenerateBoardReport();
  const generateYearEndStatements = useGenerateDonorYearEndStatementRun();
  const generateRestrictedRollforward = useGenerateRestrictedRollforward();
  const generateAcknowledgment = useGenerateAcknowledgmentLetter(normalizedDonationId);
  const templateQuery = useAcknowledgmentTemplate();
  const templateMutation = useUpdateAcknowledgmentTemplate();
  const [templateDraft, setTemplateDraft] = useState<
    Partial<{
      intro: string;
      body: string;
      closing: string;
    }>
  >({});

  const grantOptions = grantOptionsQuery.data ?? [];
  const allReports = ((reportsQuery.data as { data: GeneratedReportArtifact[] } | undefined)
    ?.data ?? []) as GeneratedReportArtifact[];
  const reportsTotal =
    (reportsQuery.data as { total?: number } | undefined)?.total ?? allReports.length;
  const reportsTotalPages = Math.max(1, Math.ceil(reportsTotal / reportPageSize));
  const reportSearchTrimmed = reportSearch.trim().toLowerCase();
  const reports =
    reportSearchTrimmed.length > 0
      ? allReports.filter((r) => r.title.toLowerCase().includes(reportSearchTrimmed))
      : allReports;
  const hasReportFilter = reportSearchTrimmed.length > 0;
  // In the true-empty state (no generated reports and no active filter) the
  // list chrome — the "open any report" subtext, the page filter, and the
  // "find your PDF" helper — has nothing to act on and contradicts the
  // "create your first report" empty state. Show it only once there is a list
  // to work with (reports exist) or a filter the user can clear.
  const hasReportListChrome = allReports.length > 0 || hasReportFilter;
  const template = templateQuery.data as AcknowledgmentTemplateInput | undefined;
  const templateForm = {
    intro: templateDraft.intro ?? template?.intro ?? "",
    body: templateDraft.body ?? template?.body ?? "",
    closing: templateDraft.closing ?? template?.closing ?? "",
  };
  const isDirty =
    template !== undefined &&
    ((templateDraft.intro !== undefined && templateDraft.intro !== template.intro) ||
      (templateDraft.body !== undefined && templateDraft.body !== template.body) ||
      (templateDraft.closing !== undefined && templateDraft.closing !== template.closing));

  const canManageAcknowledgmentTemplate = canAccessFeature(
    memberRole,
    memberPermissions,
    "compliance",
    "manage",
  );

  React.useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const templateEditorDisabled =
    !canManageAcknowledgmentTemplate ||
    templateQuery.isPending ||
    templateQuery.isError ||
    !template ||
    templateMutation.isPending;
  const reportsError =
    reportsQuery.error instanceof Error
      ? reportsQuery.error.message
      : "An unexpected error occurred.";
  const grantsError =
    grantOptionsQuery.error instanceof Error
      ? grantOptionsQuery.error.message
      : "An unexpected error occurred.";
  const templateError =
    templateQuery.error instanceof Error
      ? templateQuery.error.message
      : "An unexpected error occurred.";
  const grantComplianceError =
    grantMutationError ??
    (generateGrantCompliance.isError ? getErrorMessage(generateGrantCompliance.error) : null);
  const auditError =
    auditMutationError ?? (generateAudit.isError ? getErrorMessage(generateAudit.error) : null);
  const sefaError =
    sefaMutationError ?? (generateSefa.isError ? getErrorMessage(generateSefa.error) : null);
  const irsError =
    irsMutationError ?? (generateIrs990.isError ? getErrorMessage(generateIrs990.error) : null);
  const statementError =
    statementMutationError ??
    (generateYearEndStatements.isError ? getErrorMessage(generateYearEndStatements.error) : null);
  const boardError =
    boardMutationError ?? (generateBoard.isError ? getErrorMessage(generateBoard.error) : null);
  const rollforwardError =
    rollforwardMutationError ??
    (generateRestrictedRollforward.isError
      ? getErrorMessage(generateRestrictedRollforward.error)
      : null);
  const acknowledgmentError =
    acknowledgmentMutationError ??
    (generateAcknowledgment.isError ? getErrorMessage(generateAcknowledgment.error) : null);
  const templateErrorMessage = templateMutationError;
  const grantSelected = normalizedGrantId.length > 0;
  const donationSelected = normalizedDonationId.length > 0;
  const statementYearNumber = Number(normalizedStatementYear);
  const statementReady =
    Number.isInteger(statementYearNumber) &&
    statementYearNumber >= 2000 &&
    statementYearNumber <= 2100;
  const boardPacketReady = normalizedBoardFiscalYear.length > 0 && boardSections.length > 0;
  const billingQuery = useOrgBilling();
  const planTier = billingQuery.data
    ? getEffectivePlanTier({
        planTier: billingQuery.data.planTier,
        subscriptionStatus: billingQuery.data.status,
        trialEndsAt: billingQuery.data.trialEndsAt,
      })
    : null;
  const complianceReportPackEnabled = planTier !== null && hasComplianceReportPack(planTier);
  const sefaEnabled = planTier !== null && isPlanTierAtLeast(planTier, "audit_ready");
  const sefaTripwireQuery = useSefaTripwire(normalizedSefaFiscalYear, sefaEnabled);
  const sefaTripwire = sefaTripwireQuery.data;
  const evidencePackageEnabled = planTier !== null && hasRestrictionEvidencePackage(planTier);
  const canAskLedger =
    planTier !== null &&
    canUseAskYourLedger(planTier) &&
    canAccessFeature(memberRole, memberPermissions, "reports", "view") &&
    canAccessFeature(memberRole, memberPermissions, "accounting", "view");
  const canDraftProposalReport =
    planTier !== null &&
    canUseProposalReportDrafting(planTier) &&
    canAccessFeature(memberRole, memberPermissions, "reports", "view") &&
    canAccessFeature(memberRole, memberPermissions, "grants", "edit");
  const showGrantComplianceHint = complianceReportPackEnabled && !grantSelected;
  const showAcknowledgmentHint = !donationSelected;
  const showTemplateSaveHint =
    canManageAcknowledgmentTemplate && !templateEditorDisabled && !isDirty;

  function handleTemplateFieldChange(field: "intro" | "body" | "closing", value: string) {
    setTemplateMutationError(null);
    setTemplateSuccessMessage(null);
    setTemplateDraft((current) => ({ ...current, [field]: value }));
  }

  function handleReportSearchChange(value: string) {
    setReportSearch(value);
    captureEvent("report_list_filtered", getReportFilterAnalytics(value));
  }

  function clearReportSearch() {
    setReportSearch("");
    captureEvent("report_list_filtered", getReportFilterAnalytics(""));
  }

  function setBoardSectionChecked(section: BoardPacketSection, checked: boolean) {
    setBoardSections((current) => {
      if (checked) {
        return current.includes(section) ? current : [...current, section];
      }

      return current.filter((value) => value !== section);
    });
    setBoardMutationError(null);
  }

  async function handleTemplateSave() {
    const fieldsUpdated = ACKNOWLEDGMENT_TEMPLATE_FIELDS.filter(
      (field) => templateDraft[field] !== undefined && templateDraft[field] !== template?.[field],
    );

    try {
      await templateMutation.mutateAsync(templateForm);
      captureEvent("acknowledgment_template_updated", {
        field_count: fieldsUpdated.length,
        fields_updated: fieldsUpdated,
      });
      setTemplateMutationError(null);
      setTemplateSuccessMessage("Acknowledgment template saved for future receipts.");
      setTemplateDraft({});
    } catch (error: unknown) {
      setTemplateSuccessMessage(null);
      setTemplateMutationError(getErrorMessage(error));
    }
  }

  const reportsIsError = reportsQuery.isError === true;
  const reportsIsLoading = reportsQuery.isPending === true;
  const showReportsList = !reportsIsError || allReports.length > 0;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader variant="workbench" kicker="Reporting & Compliance" title="Reports" />
      <AppPageTabs groupId="reports" items={reportsTabs} />
      <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold text-foreground">Need a custom report?</h2>
          <p className="text-sm text-muted-foreground">
            Build saved donor, grant, fund, and gift reports without exporting to a spreadsheet.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto" variant="outline">
          <Link to="/reports/builder">
            <TableProperties className="size-4" aria-hidden="true" />
            Open report builder
          </Link>
        </Button>
      </section>
      {canAskLedger ? (
        <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold text-foreground">Want a quick ledger answer?</h2>
            <p className="text-sm text-muted-foreground">
              Ask one question. Open the records behind the answer.
            </p>
          </div>
          <Button asChild className="w-full sm:w-auto" variant="outline">
            <Link to="/reports/ask-ledger">
              <Bot className="size-4" aria-hidden="true" />
              Ask Ledger
            </Link>
          </Button>
        </section>
      ) : null}
      {canDraftProposalReport ? (
        <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Need a proposal or report draft?
            </h2>
            <p className="text-sm text-muted-foreground">
              Start with one grant record. Review sources before using the draft.
            </p>
          </div>
          <Button asChild className="w-full sm:w-auto" variant="outline">
            <Link to="/reports/drafts">
              <FilePenLine className="size-4" aria-hidden="true" />
              Draft from grant
            </Link>
          </Button>
        </section>
      ) : null}
      {!complianceReportPackEnabled ? (
        <Alert variant="info" title="Plan upgrade required">
          <div className="space-y-3">
            <p>
              Upgrade to {COMPLIANCE_REPORT_PACK_MIN_PLAN_LABEL} to open the compliance report pack.
            </p>
            <Button asChild>
              <Link to="/settings" hash="billing">
                Open billing settings
              </Link>
            </Button>
          </div>
        </Alert>
      ) : null}

      <div
        className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]"
        data-report-generation
      >
        <div className="min-w-0 space-y-6">
          <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card/95 p-4 shadow-sm sm:p-6">
            <header className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold text-foreground">Grant compliance</h2>
              <p className="text-sm text-muted-foreground">
                Pick a grant to generate the compliance packet.
              </p>
            </header>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="grant-id">Grant</Label>
              <Select
                value={grantId}
                onValueChange={(val) => {
                  setGrantId(val);
                  setGrantMutationError(null);
                  generateGrantCompliance.reset();
                }}
              >
                <SelectTrigger id="grant-id" aria-label="Grant">
                  <SelectValue placeholder="Select a grant" />
                </SelectTrigger>
                <SelectContent>
                  {grantOptions.map((grant) => {
                    // Same-named grants (e.g. annual renewals) are common. Show the
                    // funder and grant period year so the right packet is picked.
                    const periodYear = grant.startDate?.slice(0, 4);
                    const disambiguator = [grant.funderName, periodYear]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <SelectItem key={grant.id} value={grant.id}>
                        <span className="flex flex-col">
                          <span>{grant.name}</span>
                          {disambiguator ? (
                            <span className="text-xs text-muted-foreground">{disambiguator}</span>
                          ) : null}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {grantOptionsQuery.isError ? (
              <Alert variant="destructive" title="Unable to load grants.">
                {grantsError}
              </Alert>
            ) : null}
            <Button
              className="w-full sm:w-auto"
              onClick={() =>
                handleGeneratedReportMutation(
                  generateGrantCompliance.mutateAsync({
                    title: "Quarterly Compliance Report",
                  }),
                  setGrantMutationError,
                  navigate,
                )
              }
              type="button"
              aria-describedby={showGrantComplianceHint ? "grant-compliance-hint" : undefined}
              disabled={
                !complianceReportPackEnabled || !grantSelected || generateGrantCompliance.isPending
              }
            >
              Generate grant compliance report
            </Button>
            {showGrantComplianceHint ? (
              <p className="text-xs text-muted-foreground" id="grant-compliance-hint">
                Choose a grant above to generate this report.
              </p>
            ) : null}
            {grantComplianceError ? (
              <Alert variant="destructive" title="Unable to generate grant compliance report.">
                {grantComplianceError}
              </Alert>
            ) : null}
          </section>

          <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card/95 p-4 shadow-sm sm:p-6">
            <header className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold text-foreground">Financial exports</h2>
              <p className="text-sm text-muted-foreground">
                Export financial data your accountant, board, and IRS filings require.
              </p>
            </header>
            <div
              className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] items-start gap-4"
              data-testid="financial-export-grid"
            >
              <div className="min-w-0 space-y-4 rounded-lg border border-border bg-background/60 p-4">
                <div className="min-w-0 space-y-1">
                  <h3 className="font-medium text-foreground">Audit package</h3>
                  <p className="text-sm text-muted-foreground">
                    Package the current fiscal year for audit review.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="audit-fiscal-year">Audit fiscal year</Label>
                    <Input
                      id="audit-fiscal-year"
                      value={auditFiscalYear}
                      onChange={(event) => {
                        setAuditFiscalYear(event.target.value);
                        setAuditMutationError(null);
                      }}
                    />
                  </div>
                  <Button
                    className={REPORT_ACTION_BUTTON_CLASS}
                    onClick={() =>
                      handleGeneratedReportMutation(
                        generateAudit.mutateAsync({ title: "FY audit export" }),
                        setAuditMutationError,
                        navigate,
                      )
                    }
                    type="button"
                    variant="outline"
                    disabled={
                      !complianceReportPackEnabled ||
                      normalizedAuditFiscalYear.length === 0 ||
                      generateAudit.isPending
                    }
                  >
                    Generate audit export
                  </Button>
                  {auditError ? (
                    <Alert variant="destructive" title="Unable to generate audit export.">
                      {auditError}
                    </Alert>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 space-y-4 rounded-lg border border-border bg-background/60 p-4">
                <div className="min-w-0 space-y-1">
                  <h3 className="font-medium text-foreground">SEFA builder</h3>
                  <p className="text-sm text-muted-foreground">
                    Track federal award spend against the $1M single-audit threshold.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="sefa-fiscal-year">SEFA fiscal year</Label>
                    <Input
                      id="sefa-fiscal-year"
                      value={sefaFiscalYear}
                      onChange={(event) => {
                        setSefaFiscalYear(event.target.value);
                        setSefaMutationError(null);
                      }}
                    />
                  </div>
                  {sefaEnabled ? (
                    <div className="rounded-md border border-border bg-card p-3 text-sm">
                      {sefaTripwireQuery.isPending ? (
                        <p className="text-muted-foreground">Loading SEFA tripwire…</p>
                      ) : sefaTripwireQuery.isError ? (
                        <p className="text-destructive">Unable to load SEFA tripwire.</p>
                      ) : sefaTripwire ? (
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            {formatCurrency(sefaTripwire.totalFederalExpendituresCents)} expended
                          </p>
                          <p className="text-muted-foreground">
                            Status: {sefaTripwire.state.replaceAll("_", " ")}
                            {" | "}
                            {formatCurrency(sefaTripwire.remainingToThresholdCents)} to threshold
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No SEFA data loaded.</p>
                      )}
                    </div>
                  ) : (
                    <Alert variant="info" title="Audit-Ready required">
                      SEFA builder is available on Audit-Ready and above.
                    </Alert>
                  )}
                  <Button
                    className={REPORT_ACTION_BUTTON_CLASS}
                    onClick={() =>
                      handleGeneratedReportMutation(
                        generateSefa.mutateAsync({
                          fiscalYear: normalizedSefaFiscalYear,
                          title: `${normalizedSefaFiscalYear} SEFA Draft`,
                        }),
                        setSefaMutationError,
                        navigate,
                      )
                    }
                    type="button"
                    variant="outline"
                    disabled={
                      !sefaEnabled ||
                      normalizedSefaFiscalYear.length === 0 ||
                      generateSefa.isPending
                    }
                  >
                    Generate SEFA draft
                  </Button>
                  {sefaError ? (
                    <Alert variant="destructive" title="Unable to generate SEFA draft.">
                      {sefaError}
                    </Alert>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 space-y-4 rounded-lg border border-border bg-background/60 p-4">
                <div className="min-w-0 space-y-1">
                  <h3 className="font-medium text-foreground">IRS 990 prep</h3>
                  <p className="text-sm text-muted-foreground">
                    Prepare organization-level data for Form 990 review.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="irs-fiscal-year">IRS 990 fiscal year</Label>
                    <Input
                      id="irs-fiscal-year"
                      value={irsFiscalYear}
                      onChange={(event) => {
                        setIrsFiscalYear(event.target.value);
                        setIrsMutationError(null);
                      }}
                    />
                  </div>
                  <Button
                    className={REPORT_ACTION_BUTTON_CLASS}
                    onClick={() =>
                      handleGeneratedReportMutation(
                        generateIrs990.mutateAsync({
                          fiscalYear: normalizedIrsFiscalYear,
                          title: `${normalizedIrsFiscalYear} IRS 990 Prep Export`,
                        }),
                        setIrsMutationError,
                        navigate,
                      )
                    }
                    type="button"
                    variant="outline"
                    disabled={normalizedIrsFiscalYear.length === 0 || generateIrs990.isPending}
                  >
                    Generate IRS 990 prep export
                  </Button>
                  {irsError ? (
                    <Alert variant="destructive" title="Unable to generate IRS 990 prep export.">
                      {irsError}
                    </Alert>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 space-y-4 rounded-lg border border-border bg-background/60 p-4">
                <div className="min-w-0 space-y-1">
                  <h3 className="font-medium text-foreground">Board packet composer</h3>
                  <p className="text-sm text-muted-foreground">
                    Pick what the board needs. Add gifts, grants, funds, and due dates.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="board-fiscal-year">Board fiscal year</Label>
                      <Input
                        id="board-fiscal-year"
                        value={boardFiscalYear}
                        onChange={(event) => {
                          setBoardFiscalYear(event.target.value);
                          setBoardMutationError(null);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="board-meeting-date">Board meeting date</Label>
                      <Input
                        id="board-meeting-date"
                        type="date"
                        value={boardMeetingDate}
                        onChange={(event) => {
                          setBoardMeetingDate(event.target.value);
                          setBoardMutationError(null);
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="board-cadence">Board cadence</Label>
                    <Select
                      value={boardCadence}
                      onValueChange={(value) => {
                        setBoardCadence(value as typeof boardCadence);
                        setBoardMutationError(null);
                      }}
                    >
                      <SelectTrigger id="board-cadence" aria-label="Board cadence">
                        <SelectValue placeholder="Choose cadence" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_time">One-time</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Packet sections</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {BOARD_PACKET_SECTION_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          htmlFor={`board-section-${option.value}`}
                          className="flex cursor-pointer items-start gap-2 text-sm"
                        >
                          <Checkbox
                            id={`board-section-${option.value}`}
                            aria-label={option.label}
                            className="mt-0.5"
                            checked={boardSections.includes(option.value)}
                            onCheckedChange={(checked) =>
                              setBoardSectionChecked(option.value, checked === true)
                            }
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                    {boardSections.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Choose one section before you make the packet.
                      </p>
                    ) : null}
                  </div>
                  <Button
                    className={REPORT_ACTION_BUTTON_CLASS}
                    onClick={() =>
                      handleGeneratedReportMutation(
                        generateBoard.mutateAsync({
                          fiscalYear: normalizedBoardFiscalYear,
                          title: `${normalizedBoardFiscalYear} Board Packet`,
                          ...(boardMeetingDate ? { meetingDate: boardMeetingDate } : {}),
                          cadence: boardCadence,
                          sections: boardSections,
                        }),
                        setBoardMutationError,
                        navigate,
                      )
                    }
                    type="button"
                    variant="outline"
                    disabled={
                      !complianceReportPackEnabled || !boardPacketReady || generateBoard.isPending
                    }
                  >
                    Generate board report
                  </Button>
                  {boardError ? (
                    <Alert variant="destructive" title="Unable to generate board report.">
                      {boardError}
                    </Alert>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card/95 p-4 shadow-sm sm:p-6">
            <header className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold text-foreground">Year-end statements</h2>
              <p className="text-sm text-muted-foreground">
                Make one giving statement for each donor in a calendar year.
              </p>
            </header>
            <div className="space-y-2">
              <Label htmlFor="statement-year">Statement year</Label>
              <Input
                id="statement-year"
                type="number"
                min="2000"
                max="2100"
                value={statementYear}
                onChange={(event) => {
                  setStatementYear(event.target.value);
                  setStatementMutationError(null);
                }}
              />
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={() =>
                handleGeneratedReportMutation(
                  generateYearEndStatements.mutateAsync({
                    year: statementYearNumber,
                    deliveryMode: "download",
                    minimumAmountCents: 0,
                    title: `${statementYearNumber} Year-End Giving Statements`,
                  }),
                  setStatementMutationError,
                  navigate,
                )
              }
              type="button"
              variant="outline"
              disabled={
                !complianceReportPackEnabled ||
                !statementReady ||
                generateYearEndStatements.isPending
              }
            >
              Generate year-end statements
            </Button>
            {!statementReady ? (
              <p className="text-xs text-muted-foreground">Enter a year from 2000 to 2100.</p>
            ) : null}
            {statementError ? (
              <Alert variant="destructive" title="Unable to generate year-end statements.">
                {statementError}
              </Alert>
            ) : null}
          </section>

          <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card/95 p-4 shadow-sm sm:p-6">
            <header className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold text-foreground">Restricted rollforward</h2>
              <p className="text-sm text-muted-foreground">
                Generate period balances for restricted terms, additions, and releases.
              </p>
            </header>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rollforward-start">Period start</Label>
                <Input
                  id="rollforward-start"
                  type="date"
                  value={rollforwardPeriodStart}
                  onChange={(event) => {
                    setRollforwardPeriodStart(event.target.value);
                    setRollforwardMutationError(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rollforward-end">Period end</Label>
                <Input
                  id="rollforward-end"
                  type="date"
                  value={rollforwardPeriodEnd}
                  onChange={(event) => {
                    setRollforwardPeriodEnd(event.target.value);
                    setRollforwardMutationError(null);
                  }}
                />
              </div>
            </div>
            <label
              htmlFor="include-evidence-package"
              className="flex cursor-pointer items-start gap-2 text-sm"
            >
              <Checkbox
                id="include-evidence-package"
                aria-label="Include evidence package"
                className="mt-0.5"
                checked={includeEvidencePackage}
                disabled={!evidencePackageEnabled}
                onCheckedChange={(checked) => setIncludeEvidencePackage(checked === true)}
              />
              <span>
                Include evidence package
                {!evidencePackageEnabled ? (
                  <span className="block text-muted-foreground">
                    Requires {RESTRICTION_EVIDENCE_PACKAGE_PLAN_LIST} for evidence package output.
                  </span>
                ) : null}
              </span>
            </label>
            <Button
              className="w-full sm:w-auto"
              onClick={() =>
                handleGeneratedReportMutation(
                  generateRestrictedRollforward
                    .mutateAsync({
                      periodStart: new Date(
                        `${rollforwardPeriodStart}T00:00:00.000Z`,
                      ).toISOString(),
                      periodEnd: new Date(`${rollforwardPeriodEnd}T23:59:59.999Z`).toISOString(),
                      includeEvidencePackage,
                      title: "Restricted rollforward",
                    })
                    .then((result) => result.report),
                  setRollforwardMutationError,
                  navigate,
                )
              }
              type="button"
              variant="outline"
              disabled={
                rollforwardPeriodStart.length === 0 ||
                rollforwardPeriodEnd.length === 0 ||
                generateRestrictedRollforward.isPending
              }
            >
              Generate restricted rollforward
            </Button>
            {rollforwardError ? (
              <Alert variant="destructive" title="Unable to generate restricted rollforward.">
                {rollforwardError}
              </Alert>
            ) : null}
          </section>

          <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card/95 p-4 shadow-sm sm:p-6">
            <header className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold text-foreground">Donation acknowledgments</h2>
              <p className="text-sm text-muted-foreground">
                Generate donor receipts and acknowledgment letters from this page.
              </p>
            </header>
            <div className="space-y-2">
              <Label htmlFor="donation-id">Donation reference</Label>
              <Input
                id="donation-id"
                value={donationId}
                onChange={(event) => {
                  setDonationId(event.target.value);
                  setAcknowledgmentMutationError(null);
                  generateAcknowledgment.reset();
                }}
                placeholder="Paste the donation reference"
              />
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={() =>
                handleGeneratedReportMutation(
                  generateAcknowledgment.mutateAsync({
                    title: "Donation Receipt",
                  }),
                  setAcknowledgmentMutationError,
                  navigate,
                )
              }
              type="button"
              variant="outline"
              aria-describedby={showAcknowledgmentHint ? "acknowledgment-hint" : undefined}
              disabled={!donationSelected || generateAcknowledgment.isPending}
            >
              Generate acknowledgment letter
            </Button>
            {showAcknowledgmentHint ? (
              <p className="text-xs text-muted-foreground" id="acknowledgment-hint">
                Enter a donation reference above to generate the letter.
              </p>
            ) : null}
            {acknowledgmentError ? (
              <Alert variant="destructive" title="Unable to generate acknowledgment letter.">
                {acknowledgmentError}
              </Alert>
            ) : null}
          </section>
        </div>

        <section className="min-w-0 space-y-3 self-start rounded-2xl border border-border bg-card/95 p-4 shadow-sm sm:p-6">
          <header className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold text-foreground">Acknowledgment template</h2>
            <p className="text-sm text-muted-foreground">
              Edit the receipt text here. All new letters will use it.
            </p>
          </header>
          {templateQuery.isError ? (
            <Alert variant="destructive" title="Unable to load template.">
              <div className="space-y-3">
                <p>{templateError}</p>
                <RetryButton query={templateQuery} />
              </div>
            </Alert>
          ) : null}
          {!canManageAcknowledgmentTemplate ? (
            <Alert title="Admins manage the acknowledgment template.">
              You can review the current donor receipt copy here, but only admins can update it.
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="ack-intro">Acknowledgment intro</Label>
            <Textarea
              id="ack-intro"
              value={templateForm.intro}
              onChange={(event) => handleTemplateFieldChange("intro", event.target.value)}
              disabled={templateEditorDisabled}
            />
            <p className="text-xs text-muted-foreground text-right">
              {templateForm.intro.length} characters
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ack-body">Acknowledgment body</Label>
            <Textarea
              id="ack-body"
              value={templateForm.body}
              onChange={(event) => handleTemplateFieldChange("body", event.target.value)}
              disabled={templateEditorDisabled}
            />
            <p className="text-xs text-muted-foreground text-right">
              {templateForm.body.length} characters
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ack-closing">Acknowledgment closing</Label>
            <Textarea
              id="ack-closing"
              value={templateForm.closing}
              onChange={(event) => handleTemplateFieldChange("closing", event.target.value)}
              disabled={templateEditorDisabled}
            />
            <p className="text-xs text-muted-foreground text-right">
              {templateForm.closing.length} characters
            </p>
          </div>
          {canManageAcknowledgmentTemplate ? (
            <Button
              className="w-full"
              onClick={() => void handleTemplateSave()}
              type="button"
              aria-describedby={showTemplateSaveHint ? "template-save-hint" : undefined}
              disabled={templateEditorDisabled || !isDirty}
            >
              Save acknowledgment template
            </Button>
          ) : null}
          {showTemplateSaveHint ? (
            <p className="text-xs text-muted-foreground" id="template-save-hint">
              Change the template above to save it.
            </p>
          ) : null}
          {templateSuccessMessage ? (
            <Alert variant="success">{templateSuccessMessage}</Alert>
          ) : null}
          {templateErrorMessage ? (
            <Alert variant="destructive" title="Unable to save acknowledgment template.">
              {templateErrorMessage}
            </Alert>
          ) : null}
        </section>
      </div>

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Recently generated</h2>
          {hasReportListChrome ? (
            <p className="text-sm text-muted-foreground">
              Open any report to preview or download it.
            </p>
          ) : null}
        </header>
        {hasReportListChrome ? (
          <Input
            placeholder="Filter current page…"
            value={reportSearch}
            onChange={(event) => handleReportSearchChange(event.target.value)}
            className="max-w-sm"
            aria-label="Filter current page"
          />
        ) : null}
        {hasReportListChrome ? (
          <Alert title="Need help with PDFs?">
            Can't find a downloaded report? Open Help and search for PDF. The guide shows where
            downloads go and how to open them.
          </Alert>
        ) : null}
        {reportsIsError ? (
          <Alert variant="destructive" title={REPORTS_ERROR_TITLE}>
            {reportsError}
          </Alert>
        ) : null}
        {showReportsList ? (
          <div className="grid grid-cols-1 gap-3" data-testid="reports-artifact-list">
            {reportsIsLoading ? (
              <>
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </>
            ) : reports.length === 0 ? (
              hasReportFilter ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No reports match these filters.{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0 font-medium text-primary underline-offset-4"
                    onClick={clearReportSearch}
                  >
                    Clear filters
                  </Button>
                </p>
              ) : (
                <TeachAndActEmptyState
                  icon={<BarChart3 className="size-5" />}
                  heading="Your reports live here"
                  description="Build reports for funders and audits. Save them here to open later."
                  primaryAction={{
                    label: "Generate your first report",
                    onClick: () => {
                      document
                        .querySelector<HTMLElement>("[data-report-generation]")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    },
                  }}
                  helpLink={{ label: "How reports work", href: "/help" }}
                />
              )
            ) : (
              reports.map((r) => (
                <Link
                  key={r.id}
                  to="/reports/$reportId"
                  params={{ reportId: r.id }}
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  data-testid="report-artifact-card"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium group-hover:text-primary" title={r.title}>
                      {r.title}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground font-mono">
                      {formatReportMetadataLabel(r.type)} ·{" "}
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(r.createdAt))}
                    </div>
                  </div>
                  <Badge variant="outline">{formatReportMetadataLabel(r.status)}</Badge>
                </Link>
              ))
            )}
          </div>
        ) : null}
        {!reportsIsError && reportsTotal > reportPageSize ? (
          <div className="flex items-center justify-between pt-4" data-testid="reports-pagination">
            <span className="text-sm text-muted-foreground">
              Page {reportPage} of {reportsTotalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={reportPage <= 1}
                onClick={() => setReportPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={reportPage >= reportsTotalPages}
                onClick={() => setReportPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
