import { useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  FilePicker,
  HelpTooltip,
  Input,
  PageHeader,
  PageShell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusPanel,
  SurfaceSection,
  cn,
} from "@grantpipe/ui";
import {
  buildImportTemplateCsv,
  buildResolvedImportMapping,
  getMigrationSourcePlan,
  type ImportEntityType,
  type ImportPresetId,
  IMPORT_PRESET_IDS,
  IMPORT_PRESET_LABELS,
  IMPORT_TEMPLATES,
  type MigrationSourceId,
} from "@grantpipe/shared";
import {
  type ImportCommitResponse,
  type ImportHistoryEntry,
  type ImportRowErrorDetail,
  useImportHistory,
  useImportMutations,
  useMigrationPlan,
  type ImportPreviewRow,
} from "../../hooks/use-imports";
import { useSession } from "../../hooks/use-session";
import { AccessDeniedState } from "../../components/access-denied-state";
import { canAccessImport } from "../../lib/access-control";
import { captureEvent } from "../../lib/analytics";
import { downloadGeneratedCsv } from "../../lib/download";
import { completeOnboardingActivation } from "../../lib/onboarding-session";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

export { buildResolvedImportMapping };

const ENTITY_TYPE_INPUT_ID = "import-entity-type";
const PRESET_INPUT_ID = "import-preset";
const FILENAME_INPUT_ID = "import-filename";
const FILE_INPUT_ID = "import-csv-file";
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const INVALID_PREVIEW_SIGNATURE = "__invalid_import_preview__";
const IMPORT_STEPS = ["Choose source", "Upload CSV", "Preview", "Commit"] as const;
const IMPORT_ENTITY_LABELS: Record<ImportEntityType, string> = {
  contacts: "Contacts",
  donations: "Donations",
  grants: "Grants",
  grant_opportunities: "Grant opportunities",
  funds: "Funds",
  opening_balances: "Opening balances",
  pledges: "Pledge schedules",
};

function getMigrationProgressLabel(status: "completed" | "has_errors" | "not_started") {
  if (status === "completed") return "Done";
  if (status === "has_errors") return "Needs fixes";
  return "Not started";
}

function buildPreviewSignature(params: {
  entityType: ImportEntityType;
  filename: string;
  csvText: string;
  presetId: ImportPresetId | "generic";
}) {
  return `${params.presetId}::${params.entityType}::${params.filename}::${params.csvText.trim()}`;
}

function formatImportHistoryLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getImportErrorDetails(
  source: { summary?: { errorDetails?: ImportRowErrorDetail[] } | null } | null | undefined,
): ImportRowErrorDetail[] {
  return source?.summary?.errorDetails ?? [];
}

function formatImportRowError(error: ImportRowErrorDetail) {
  const rowNumber = error.rowNumber ?? error.rowIndex + 2;
  const fieldPrefix = error.field ? `, ${error.field}` : "";
  return `Line ${rowNumber}${fieldPrefix}: ${error.message}`;
}

function ImportErrorDetailsList({ errors }: { errors: ImportRowErrorDetail[] }) {
  if (errors.length === 0) return null;

  return (
    <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm font-medium text-foreground">Rows needing attention</p>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {errors.slice(0, 5).map((error) => (
          <li
            key={`${error.rowIndex}-${error.field ?? "row"}-${error.message}`}
            className="break-words"
          >
            {formatImportRowError(error)}
          </li>
        ))}
      </ul>
      {errors.length > 5 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing 5 of {errors.length} row issues.
        </p>
      ) : null}
    </div>
  );
}

function isCsvFile(file: File) {
  return file.name.toLowerCase().endsWith(".csv");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getImportFileSizeBucket(bytes: number) {
  if (bytes < 100 * 1024) return "under_100kb";
  if (bytes < 1024 * 1024) return "100kb_to_1mb";
  if (bytes < 5 * 1024 * 1024) return "1mb_to_5mb";
  return "5mb_to_10mb";
}

function countCsvDataRows(text: string) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return Math.max(0, lines.length - 1);
}

function getRowCountBucket(count: number) {
  if (count <= 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 100) return "11-100";
  if (count <= 1000) return "101-1000";
  return "1000+";
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function ImportPage() {
  const { memberRole, memberPermissions } = useSession();

  if (!canAccessImport(memberRole, memberPermissions)) {
    return (
      <AccessDeniedState
        title="Import requires edit access."
        description="Ask an admin or editor for import access."
      />
    );
  }

  return <ImportPageContent />;
}

function ImportPageContent() {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState<ImportEntityType>("contacts");
  const [presetId, setPresetId] = useState<ImportPresetId | "generic">("generic");
  const [filename, setFilename] = useState("import.csv");
  const [csvText, setCsvText] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [manualMapping, setManualMapping] = useState<Record<string, string>>({});
  const [previewValidationError, setPreviewValidationError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [templateDownloadError, setTemplateDownloadError] = useState<string | null>(null);
  const [commitSummary, setCommitSummary] = useState<ImportCommitResponse | null>(null);
  const [activePreviewSignature, setActivePreviewSignature] = useState<string | null>(null);
  const historyQuery = useImportHistory();
  const migrationPlanQuery = useMigrationPlan(presetId as MigrationSourceId);
  const { previewImport, commitImport } = useImportMutations();
  const fallbackMigrationPlan = getMigrationSourcePlan(presetId);
  const migrationPlan = migrationPlanQuery.data ?? {
    ...fallbackMigrationPlan,
    progress: fallbackMigrationPlan.recommendedOrder.map((step) => ({
      entityType: step.entityType,
      status: "not_started" as const,
      latestImportAt: null,
      insertedRows: 0,
      failedRows: 0,
    })),
    nextEntityType: fallbackMigrationPlan.recommendedOrder[0]?.entityType ?? null,
  };
  const progressByEntity = new Map(migrationPlan.progress.map((item) => [item.entityType, item]));
  const nextStep = migrationPlan.recommendedOrder.find(
    (step) => step.entityType === migrationPlan.nextEntityType,
  );
  const normalizedCsvText = csvText.trim();
  const currentPreviewSignature = buildPreviewSignature({
    entityType,
    filename,
    csvText,
    presetId,
  });
  const hasActivePreview = activePreviewSignature === currentPreviewSignature;
  const previewMatchesCurrentInput =
    activePreviewSignature === null ? normalizedCsvText.length === 0 : hasActivePreview;

  const preview =
    commitSummary ||
    !previewMatchesCurrentInput ||
    previewImport.data?.entityType !== entityType ||
    previewImport.data?.filename !== filename
      ? null
      : previewImport.data;
  const currentStepIndex = commitSummary ? 3 : preview ? 2 : selectedFile ? 1 : 0;
  const previewIsLoading = previewImport.isPending;
  const previewError =
    previewValidationError ??
    (previewImport.error != null
      ? previewImport.error instanceof Error
        ? previewImport.error.message
        : "Preview failed. Please try again."
      : null);
  const commitError =
    commitImport.error != null
      ? commitImport.error instanceof Error
        ? commitImport.error.message
        : "Import failed. Please try again."
      : null;
  const commitRowErrors = getImportErrorDetails(commitSummary?.history);
  const currentTemplate = IMPORT_TEMPLATES[entityType];
  const previewAutoMapping = preview
    ? buildResolvedImportMapping(preview.headers, {}, entityType, presetId)
    : {};
  const templateSemanticFields = Object.keys(
    buildResolvedImportMapping(currentTemplate.headers, {}, entityType, presetId),
  );
  const previewMappingFields = Array.from(
    new Set([...templateSemanticFields, ...Object.keys(previewAutoMapping)]),
  );
  const previewEffectiveMapping = { ...previewAutoMapping, ...manualMapping };
  const fileReadTokenRef = useRef(0);

  function clearTransientImportState() {
    if (commitSummary) {
      setCommitSummary(null);
    }
    if (activePreviewSignature) {
      setActivePreviewSignature(null);
    }
    setManualMapping({});
    setCompletionError(null);
    setTemplateDownloadError(null);
    if (previewImport.error) {
      previewImport.reset();
    }
    if (commitImport.error) {
      commitImport.reset();
    }
  }

  function resetUploadedFileState() {
    fileReadTokenRef.current += 1;
    setActivePreviewSignature(INVALID_PREVIEW_SIGNATURE);
    setCsvText("");
    setSelectedFile(null);
    setFilename("import.csv");
    setFileInputKey((key) => key + 1);
  }

  async function handleFileChange(file: File | undefined) {
    const readToken = fileReadTokenRef.current + 1;
    fileReadTokenRef.current = readToken;
    clearTransientImportState();
    setPreviewValidationError(null);
    setActivePreviewSignature(INVALID_PREVIEW_SIGNATURE);
    setSelectedFile(null);
    setCsvText("");

    if (!file) {
      setFilename("import.csv");
      return;
    }

    setFilename(file.name);

    if (!isCsvFile(file)) {
      setPreviewValidationError("Upload a CSV file before previewing.");
      return;
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setPreviewValidationError("This file is larger than 10 MB.");
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      if (fileReadTokenRef.current === readToken) {
        setPreviewValidationError("Unable to read this CSV file.");
      }
      return;
    }

    if (fileReadTokenRef.current !== readToken) {
      return;
    }

    if (text.trim().length === 0) {
      setPreviewValidationError("Upload a CSV file with at least one header row.");
      return;
    }

    setSelectedFile({ name: file.name, size: file.size });
    setCsvText(text);
    captureEvent("import_file_selected", {
      entity_type: entityType,
      preset_id: presetId,
      size_bucket: getImportFileSizeBucket(file.size),
    });
  }

  function handleTemplateDownload() {
    setTemplateDownloadError(null);
    try {
      const csv = buildImportTemplateCsv(entityType);
      downloadGeneratedCsv(csv, currentTemplate.filename, {
        feature: "import",
        operation: "template_export_csv",
      });
      captureEvent("import_template_downloaded", {
        entity_type: entityType,
        preset_id: presetId,
      });
    } catch {
      setTemplateDownloadError("Template download failed. Please try again.");
    }
  }

  function handlePreview() {
    setPreviewValidationError(null);
    setCommitSummary(null);
    setActivePreviewSignature(currentPreviewSignature);
    // Preset is a client-only mapping hint applied at commit time; the API preview step
    // is preset-agnostic and only validates CSV shape and row count.
    const totalRows = countCsvDataRows(csvText);
    captureEvent("import_preview_started", {
      entity_type: entityType,
      preset_id: presetId,
      total_rows_bucket: getRowCountBucket(totalRows),
    });
    previewImport.mutate({ entityType, filename, csvText });
  }

  async function handleCommit() {
    if (!preview) return;

    let committedInsertedRows = 0;
    const resolvedMapping = {
      ...buildResolvedImportMapping(preview.headers, {}, entityType, presetId),
      ...manualMapping,
    };
    try {
      const result = await commitImport.mutateAsync({
        entityType,
        filename,
        mapping: resolvedMapping,
        rows: preview.rows,
      });
      committedInsertedRows = result.insertedRows;
      if (result.insertedRows > 0) {
        await completeOnboardingActivation(queryClient, "import", null);
      }
      setCommitSummary(result);
      setActivePreviewSignature(null);
      setCompletionError(null);
    } catch {
      setCommitSummary(null);
      if (committedInsertedRows > 0) {
        setCompletionError("Import saved, but setup did not finish. Refresh and try again.");
      }
    }
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker="Setup"
        title="Import"
        help="Preview saves nothing. GrantPipe writes records after Commit import."
      />

      <section
        className="rounded-2xl border border-border bg-card p-4"
        aria-label="Import workflow"
      >
        <ol className="grid gap-2 text-sm sm:grid-cols-4">
          {IMPORT_STEPS.map((step, index) => {
            const isCurrent = index === currentStepIndex;
            const isComplete = index < currentStepIndex;
            return (
              <li
                key={step}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 font-medium transition-colors",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isComplete
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {index + 1} {step}
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>CSV is just a spreadsheet file format.</span>
          <HelpTooltip label="What is a CSV file?">
            A CSV is plain spreadsheet text. Most tools can export one.
          </HelpTooltip>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
          <div className="rounded-2xl border border-border/70 bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3">
                {migrationPlan.label}
              </Badge>
              {migrationPlanQuery.isFetching ? (
                <span className="text-xs text-muted-foreground">Refreshing plan</span>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{migrationPlan.summary}</p>
            <p className="mt-4 text-sm font-medium text-foreground">
              Next: {nextStep?.label ?? "Review migration history"}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {migrationPlan.sourceNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {migrationPlan.recommendedOrder.map((step, index) => {
              const progress = progressByEntity.get(step.entityType);
              const isSelected = entityType === step.entityType;
              return (
                <article
                  key={step.entityType}
                  className={cn(
                    "rounded-2xl border p-3 transition-colors",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/70 bg-background text-foreground",
                  )}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    Step {index + 1}
                  </span>
                  <span className="mt-1 block text-sm font-medium">{step.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {step.description}
                  </span>
                  <span className="mt-3 flex flex-wrap gap-2">
                    <Badge variant={progress?.status === "completed" ? "default" : "outline"}>
                      {getMigrationProgressLabel(progress?.status ?? "not_started")}
                    </Badge>
                    {step.status === "needs_mapping" ? (
                      <Badge variant="secondary">Use template</Badge>
                    ) : null}
                  </span>
                  <Button
                    variant={isSelected ? "default" : "outline"}
                    className="mt-3 rounded-full"
                    onClick={() => {
                      clearTransientImportState();
                      resetUploadedFileState();
                      setPreviewValidationError(null);
                      setEntityType(step.entityType);
                    }}
                  >
                    {isSelected ? "Selected" : `Choose ${IMPORT_ENTITY_LABELS[step.entityType]}`}
                  </Button>
                </article>
              );
            })}
          </div>
        </div>
        <Link
          to="/help"
          className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Open import guide
        </Link>
      </section>

      <SurfaceSection title="Source file" description="Pick data to move. Upload a matching CSV.">
        <div className="mt-4 grid gap-3 xl:grid-cols-[220px_220px_auto_auto] xl:items-end">
          <div className="grid gap-1.5">
            <label htmlFor={ENTITY_TYPE_INPUT_ID} className="text-sm font-medium text-foreground">
              Entity type
            </label>
            <Select
              value={entityType}
              onValueChange={(value) => {
                clearTransientImportState();
                resetUploadedFileState();
                setPreviewValidationError(null);
                setEntityType(value as ImportEntityType);
              }}
            >
              <SelectTrigger id={ENTITY_TYPE_INPUT_ID} aria-label="Entity type">
                <SelectValue placeholder="Entity type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(IMPORT_ENTITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={PRESET_INPUT_ID} className="text-sm font-medium text-foreground">
              Coming from
            </label>
            <Select
              value={presetId}
              onValueChange={(value) => {
                clearTransientImportState();
                resetUploadedFileState();
                setPreviewValidationError(null);
                setPresetId(value as ImportPresetId | "generic");
              }}
            >
              <SelectTrigger id={PRESET_INPUT_ID} aria-label="Coming from">
                <SelectValue placeholder="Coming from" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generic">Generic CSV</SelectItem>
                {IMPORT_PRESET_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {IMPORT_PRESET_LABELS[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleTemplateDownload}>
            Download {IMPORT_ENTITY_LABELS[entityType].toLowerCase()} template
          </Button>
          <Button
            onClick={handlePreview}
            disabled={normalizedCsvText.length === 0 || previewImport.isPending}
          >
            {previewImport.isPending ? "Previewing…" : "Preview import"}
          </Button>
        </div>
        {templateDownloadError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {templateDownloadError}
          </p>
        ) : null}
        {presetId !== "generic" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Tip: export from {IMPORT_PRESET_LABELS[presetId as ImportPresetId]} as CSV, then upload
            the exported file.
          </p>
        )}
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <label htmlFor={FILE_INPUT_ID} className="text-sm font-medium text-foreground">
              CSV file
            </label>
            <HelpTooltip label="Which file should I upload?">
              Upload a CSV from your old spreadsheet or CRM. Use the template first if you are
              unsure.
            </HelpTooltip>
          </div>
          <FilePicker
            key={fileInputKey}
            id={FILE_INPUT_ID}
            accept=".csv,text/csv"
            className="mt-2"
            onFileChange={(file) => {
              void handleFileChange(file ?? undefined);
            }}
          />
          <label htmlFor={FILENAME_INPUT_ID} className="sr-only">
            File name
          </label>
          <Input
            id={FILENAME_INPUT_ID}
            className="hidden"
            value={filename}
            onChange={(event) => {
              clearTransientImportState();
              setFilename(event.target.value);
            }}
          />
          <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>Required template columns: {currentTemplate.requiredHeaders.join(", ")}.</span>
            <HelpTooltip label="Why are columns required?">
              They tell GrantPipe what each cell means. Then GrantPipe can save it.
            </HelpTooltip>
          </div>
          {selectedFile ? (
            <p className="mt-2 text-sm font-medium text-foreground">
              {selectedFile.name} ({formatFileSize(selectedFile.size)})
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No CSV file selected.</p>
          )}
        </div>
      </SurfaceSection>

      <SurfaceSection
        title="Preview"
        description="Check mapped rows before you commit."
        actions={
          <Button
            disabled={!preview || previewImport.isPending || commitImport.isPending}
            onClick={() => void handleCommit()}
          >
            {commitImport.isPending ? "Committing…" : "Commit import"}
          </Button>
        }
      >
        {commitSummary ? (
          <StatusPanel role="status" variant="success" className="mt-4">
            Import finished: {commitSummary.insertedRows} inserted, {commitSummary.duplicateRows}{" "}
            duplicates, {commitSummary.failedRows} failed.
            <ImportErrorDetailsList errors={commitRowErrors} />
          </StatusPanel>
        ) : null}
        {previewError ? (
          <StatusPanel role="alert" variant="error" title="Preview failed" className="mt-4">
            {previewError}
          </StatusPanel>
        ) : null}
        {commitError ? (
          <StatusPanel role="alert" variant="error" title="Import failed" className="mt-4">
            {commitError}
          </StatusPanel>
        ) : null}
        {completionError ? (
          <StatusPanel role="alert" variant="error" title="Setup did not finish" className="mt-4">
            {completionError}
          </StatusPanel>
        ) : null}
        {previewIsLoading && (
          <StatusPanel variant="loading" className="mt-4 px-4 py-10 text-center">
            Generating preview…
          </StatusPanel>
        )}
        {!preview && !previewIsLoading && !commitSummary && (
          <StatusPanel variant="empty" className="mt-4 px-4 py-10 text-center">
            Upload a CSV file above. Then choose Preview import. GrantPipe will show the rows before
            Commit import.
          </StatusPanel>
        )}
        {preview && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="rounded-full px-3">
                {preview.totalRows} rows detected
              </Badge>
              <span className="text-sm text-muted-foreground">{preview.filename}</span>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background p-4">
              <h3 className="text-sm font-medium text-foreground">Field mapping</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {previewMappingFields.map((field) => (
                  <label key={field} className="space-y-1 text-sm">
                    <span className="block font-medium text-foreground">{field}</span>
                    <Select
                      value={previewEffectiveMapping[field] ?? ""}
                      onValueChange={(value) => {
                        setManualMapping((current) => ({ ...current, [field]: value }));
                      }}
                    >
                      <SelectTrigger aria-label={`Map ${field}`}>
                        <SelectValue placeholder="CSV column" />
                      </SelectTrigger>
                      <SelectContent>
                        {preview.headers.map((candidate) => (
                          <SelectItem key={`${field}-${candidate}`} value={candidate}>
                            {candidate}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                ))}
              </div>
            </div>
            {preview.reconciliation ? (
              <div className="rounded-2xl border border-border/70 bg-background p-4">
                <h3 className="text-sm font-medium text-foreground">
                  Opening balance reconciliation
                </h3>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <span>Debits {formatCents(preview.reconciliation.debitTotalCents)}</span>
                  <span>Credits {formatCents(preview.reconciliation.creditTotalCents)}</span>
                  <span>{preview.reconciliation.balanced ? "Balanced" : "Not balanced"}</span>
                  <span>
                    Fiscal period {preview.reconciliation.fiscalPeriod.status ?? "missing"}
                  </span>
                </div>
                <ImportErrorDetailsList errors={preview.reconciliation.errors} />
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="bg-muted">
                    {preview.headers.map((header: string) => (
                      <th
                        key={header}
                        className="border-b border-border px-3 py-2 font-medium text-muted-foreground"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((row: ImportPreviewRow, index: number) => (
                    <tr key={`${index}-${Object.values(row).join("-")}`}>
                      {preview.headers.map((header: string) => (
                        <td
                          key={`${index}-${header}`}
                          className="border-b border-border px-3 py-2 text-muted-foreground"
                        >
                          {row[header]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SurfaceSection>

      <SurfaceSection
        title="Import history"
        description="See past imports. Check insert, duplicate, and failed counts."
        contentClassName="space-y-3"
      >
        {historyQuery.isLoading ? (
          <div
            className="grid grid-cols-1 gap-3 md:grid-cols-2"
            data-testid="import-history-skeleton"
          >
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : historyQuery.isError ? (
          <StatusPanel
            variant="error"
            title="Unable to load import history."
            className="px-4 py-10 text-center"
          >
            Refresh the page or try again in a moment.
          </StatusPanel>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="import-history-grid">
            {(historyQuery.data?.data ?? []).map((entry: ImportHistoryEntry) => (
              <article
                key={entry.id}
                data-testid="import-history-entry"
                className="rounded-2xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-foreground">{entry.filename}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatImportHistoryLabel(entry.entityType)} |{" "}
                      {formatImportHistoryLabel(entry.status)}
                    </p>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: "UTC",
                    }).format(new Date(entry.createdAt))}
                  </p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Inserted {entry.insertedRows}, duplicates {entry.duplicateRows}, failed{" "}
                  {entry.failedRows}
                </p>
                <ImportErrorDetailsList errors={getImportErrorDetails(entry)} />
              </article>
            ))}
          </div>
        )}
        {!historyQuery.isLoading &&
          !historyQuery.isError &&
          (historyQuery.data?.data ?? []).length === 0 && (
            <StatusPanel variant="empty" className="px-4 py-10 text-center">
              No imports yet. Import one file to see what came in, what matched, and what needs
              fixing.
            </StatusPanel>
          )}
      </SurfaceSection>
    </PageShell>
  );
}
