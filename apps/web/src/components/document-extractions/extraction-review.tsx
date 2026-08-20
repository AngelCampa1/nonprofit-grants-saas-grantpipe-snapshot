import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grantpipe/ui";
import {
  useCommitDocumentExtraction,
  useDocumentExtraction,
  useRecordDocumentExtractionAction,
  type DocumentExtractionField,
} from "../../hooks/use-document-extractions";

function displayValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function confidenceLabel(field: DocumentExtractionField) {
  if (!fieldHasValue(field)) return "Not extracted";
  return `${field.confidence}% confidence`;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  amountCents: "Award amount",
  startDate: "Start date",
  endDate: "End date",
};

function humanizeKey(key: string) {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function fieldLabel(field: DocumentExtractionField) {
  return FIELD_LABELS[field.destinationField] ?? humanizeKey(field.destinationField);
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatAmountCents(value: number) {
  return currencyFormatter.format(value / 100);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether the model actually extracted a value for this field. A null/blank
 * value must never be paired with a confidence percentage — that would imply
 * the model is sure about something it never pulled from the document.
 */
function fieldHasValue(field: DocumentExtractionField) {
  const value = field.normalizedValueJson ?? field.valueJson;
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

function FieldValue({ field }: { field: DocumentExtractionField }) {
  const value = field.normalizedValueJson ?? field.valueJson;

  if (field.destinationField === "amountCents" && typeof value === "number") {
    return <p className="text-sm text-muted-foreground">{formatAmountCents(value)}</p>;
  }

  // Object fields are shown — and edited — through the labeled sub-field
  // inputs in the review controls below, so a separate read-only key/value
  // list here would just repeat the same data twice.
  if (isPlainObject(value)) {
    return null;
  }

  // A field the model left empty must read as empty, not as a blank line that
  // looks like a rendering bug. Say so plainly so the reviewer knows to fill it.
  if (!fieldHasValue(field)) {
    return <p className="text-sm text-muted-foreground">Not extracted from the document</p>;
  }

  return <p className="text-sm text-muted-foreground">{displayValue(value)}</p>;
}

function extractedFieldValue(
  fields: DocumentExtractionField[],
  entityType: string,
  fieldName: string,
) {
  const field = fields.find(
    (candidate) =>
      candidate.destinationEntityType === entityType &&
      candidate.destinationField === fieldName &&
      ["accepted", "edited", "mapped_existing"].includes(candidate.status),
  );
  // The model emits normalized values for amounts but leaves dates/strings
  // un-normalized, so fall back to the raw value to avoid silently dropping
  // accepted fields from the committed grant.
  return field?.normalizedValueJson ?? field?.valueJson;
}

const REVIEWED_FIELD_STATUSES = ["accepted", "edited", "rejected", "deferred", "mapped_existing"];

function isReviewedFieldStatus(status: string) {
  return REVIEWED_FIELD_STATUSES.includes(status);
}

function isBlockingCommitField(field: DocumentExtractionField) {
  return (field.required || field.confidence < 70) && !isReviewedFieldStatus(field.status);
}

function commitErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unable to commit award setup.";
  }
  switch (error.message) {
    case "review_incomplete":
      return "Some fields still need a quick review. Check each highlighted field, then accept or fix it before you save.";
    case "missing_approved_funder_name":
      return "The funder name is missing. Accept or fix the funder name field, then save again.";
    case "grant_funder_mismatch":
      return "This grant belongs to a different funder. Pick a grant that matches the funder you chose.";
    default:
      return error.message;
  }
}

function displayDateInputValue(value: unknown) {
  if (typeof value !== "string") return "";
  const iso = parseOptionalDateTime(value);
  return iso ? iso.slice(0, 10) : "";
}

// Reviewers think in dollars, never integer cents. The wire format stays cents,
// so every editable money affordance shows a dollar amount and converts on save.
function formatCentsAsDollarsInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed * 100);
}

function parseOptionalDateTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // ISO date-only strings (the date picker emits these) are anchored to UTC
  // midnight so they never drift a day across the reviewer's timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // Strings that carry an explicit time or timezone (e.g. a full ISO timestamp)
  // already denote a precise instant — preserve it.
  if (/[T ]\d{2}:\d{2}/.test(trimmed)) {
    return parsed.toISOString();
  }
  // Natural-language dates the model emits (e.g. "July 1, 2026") parse at local
  // midnight; re-anchor to UTC midnight using the calendar date the parser
  // resolved so the award period is never lost or shifted a day.
  const anchored = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  return anchored.toISOString();
}

// Re-cast an edited sub-field string back to the shape the model originally
// emitted, so saving an object field never silently changes a number into a
// string (or vice versa) for the values the reviewer left untouched.
function coerceToOriginalType(original: unknown, edited: string): unknown {
  if (typeof original === "number") {
    const parsed = Number(edited);
    return edited.trim() !== "" && Number.isFinite(parsed) ? parsed : edited;
  }
  if (typeof original === "boolean") {
    const lowered = edited.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
    return edited;
  }
  return edited;
}

function ObjectFieldEditor({
  field,
  value,
  disabled,
  onSave,
}: {
  field: DocumentExtractionField;
  value: Record<string, unknown>;
  disabled: boolean;
  onSave: (nextValue: Record<string, unknown>) => void;
}) {
  const [edited, setEdited] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, displayValue(entry)])),
  );

  return (
    <div className="space-y-2">
      {Object.keys(value).map((key) => (
        <div key={key} className="grid gap-1">
          <label
            htmlFor={`${field.id}-${key}`}
            className="text-xs font-medium text-muted-foreground"
          >
            {humanizeKey(key)}
          </label>
          <Input
            id={`${field.id}-${key}`}
            value={edited[key] ?? ""}
            onChange={(event) => setEdited((prev) => ({ ...prev, [key]: event.target.value }))}
            aria-label={`Edit ${humanizeKey(key)} (${field.fieldKey})`}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() =>
          onSave(
            Object.fromEntries(
              Object.entries(value).map(([key, original]) => [
                key,
                coerceToOriginalType(original, edited[key] ?? ""),
              ]),
            ),
          )
        }
      >
        Save edit
      </Button>
    </div>
  );
}

function FieldReviewControls({
  field,
  onAction,
  disabled,
}: {
  field: DocumentExtractionField;
  onAction: (payload: {
    fieldId: string;
    action: "accept" | "edit" | "reject" | "defer" | "map_existing";
    nextValue?: unknown;
    mappedEntityType?: string;
    mappedEntityId?: string;
  }) => void;
  disabled: boolean;
}) {
  const rawValue = field.normalizedValueJson ?? field.valueJson;
  const isAmountField = field.destinationField === "amountCents";
  const [editedValue, setEditedValue] = useState(
    isAmountField && typeof rawValue === "number"
      ? formatCentsAsDollarsInput(rawValue)
      : displayValue(rawValue),
  );
  const [mappedEntityType, setMappedEntityType] = useState(field.destinationEntityType);
  const [mappedEntityId, setMappedEntityId] = useState("");

  const amountEditDisabled = isAmountField && parseDollarsToCents(editedValue) === undefined;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["accept", "reject", "defer"] as const).map((action) => (
          <Button
            key={action}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onAction({ fieldId: field.id, action })}
          >
            {action}
          </Button>
        ))}
      </div>
      {isPlainObject(rawValue) ? (
        <ObjectFieldEditor
          field={field}
          value={rawValue}
          disabled={disabled}
          onSave={(nextValue) => onAction({ fieldId: field.id, action: "edit", nextValue })}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          {isAmountField ? (
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-sm text-muted-foreground">
                $
              </span>
              <Input
                className="flex-1"
                value={editedValue}
                inputMode="decimal"
                onChange={(event) => setEditedValue(event.target.value)}
                aria-label="Edit award amount in dollars"
              />
            </div>
          ) : (
            <Input
              value={editedValue}
              onChange={(event) => setEditedValue(event.target.value)}
              aria-label={`Edit ${field.fieldKey}`}
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              disabled || (isAmountField ? amountEditDisabled : editedValue.trim().length === 0)
            }
            onClick={() =>
              onAction({
                fieldId: field.id,
                action: "edit",
                nextValue: isAmountField ? parseDollarsToCents(editedValue) : editedValue.trim(),
              })
            }
          >
            Save edit
          </Button>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1fr)_auto]">
        <Select value={mappedEntityType} onValueChange={(value) => setMappedEntityType(value)}>
          <SelectTrigger className="w-full" aria-label={`Mapped entity type for ${field.fieldKey}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["funder", "grant", "fund"].map((entityType) => (
              <SelectItem key={entityType} value={entityType}>
                {entityType}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={mappedEntityId}
          onChange={(event) => setMappedEntityId(event.target.value)}
          placeholder="Existing record ID"
          aria-label={`Mapped entity ID for ${field.fieldKey}`}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || mappedEntityId.trim().length === 0}
          onClick={() =>
            onAction({
              fieldId: field.id,
              action: "map_existing",
              mappedEntityType,
              mappedEntityId: mappedEntityId.trim(),
            })
          }
        >
          Map
        </Button>
      </div>
    </div>
  );
}

type DuplicateDecision = "undecided" | "create_new" | "map_existing";

export function ExtractionReview({ extractionId }: { extractionId: string }) {
  const navigate = useNavigate();
  const extractionQuery = useDocumentExtraction(extractionId);
  const actionMutation = useRecordDocumentExtractionAction(extractionId);
  const commitMutation = useCommitDocumentExtraction(extractionId);
  const [grantName, setGrantName] = useState("");
  const [grantAmountDollars, setGrantAmountDollars] = useState("");
  const [grantStartDate, setGrantStartDate] = useState("");
  const [grantEndDate, setGrantEndDate] = useState("");
  const [funderDecision, setFunderDecision] = useState<DuplicateDecision>("undecided");
  const [grantDecision, setGrantDecision] = useState<DuplicateDecision>("undecided");
  const [funderExistingId, setFunderExistingId] = useState("");
  const [grantExistingId, setGrantExistingId] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);

  const fields = useMemo(() => extractionQuery.data?.fields ?? [], [extractionQuery.data?.fields]);
  const grouped = useMemo(() => {
    return fields.reduce<Record<string, DocumentExtractionField[]>>((acc, field) => {
      acc[field.section] = [...(acc[field.section] ?? []), field];
      return acc;
    }, {});
  }, [fields]);

  const extractedGrantName =
    fields.find(
      (field) => field.destinationEntityType === "grant" && field.destinationField === "name",
    )?.normalizedValueJson ??
    fields.find(
      (field) => field.destinationEntityType === "grant" && field.destinationField === "name",
    )?.valueJson;
  const resolvedGrantName = grantName.trim() || displayValue(extractedGrantName);
  const extractedAmountCents = extractedFieldValue(fields, "grant", "amountCents");
  const extractedStartDate = extractedFieldValue(fields, "grant", "startDate");
  const extractedEndDate = extractedFieldValue(fields, "grant", "endDate");
  const resolvedAmountCents =
    parseDollarsToCents(grantAmountDollars) ??
    (typeof extractedAmountCents === "number" ? extractedAmountCents : undefined);
  const resolvedStartDate =
    parseOptionalDateTime(grantStartDate) ??
    (typeof extractedStartDate === "string"
      ? parseOptionalDateTime(extractedStartDate)
      : undefined);
  const resolvedEndDate =
    parseOptionalDateTime(grantEndDate) ??
    (typeof extractedEndDate === "string" ? parseOptionalDateTime(extractedEndDate) : undefined);
  const unreviewedBlockingCount = fields.filter(isBlockingCommitField).length;
  const canCommit =
    resolvedGrantName.trim().length > 0 &&
    funderDecision !== "undecided" &&
    grantDecision !== "undecided" &&
    unreviewedBlockingCount === 0 &&
    (funderDecision !== "map_existing" || funderExistingId.trim().length > 0) &&
    (grantDecision !== "map_existing" || grantExistingId.trim().length > 0);

  if (extractionQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading award intake…</p>;
  }

  if (extractionQuery.isError) {
    return <p className="text-sm text-destructive">Unable to load award intake.</p>;
  }

  const extraction = extractionQuery.data;
  if (!extraction) return null;

  if (
    extraction.status === "pending" ||
    extraction.status === "processing" ||
    extraction.status === "provider_result_pending"
  ) {
    return <p className="text-sm text-muted-foreground">Extracting award document…</p>;
  }

  if (extraction.status === "failed") {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {extraction.failureMessage ?? "Award intake failed."}
      </div>
    );
  }

  if (extraction.status === "committed") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Award intake has been committed.</p>
        {extraction.createdGrantId && (
          <Button
            onClick={() =>
              void navigate({
                to: "/grants/$grantId",
                params: { grantId: extraction.createdGrantId! },
              })
            }
          >
            Open grant
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mutationError ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {mutationError}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <aside className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Document context</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Check the source text before you save any grant records.
          </p>
          <div className="mt-4 space-y-3">
            <Input
              value={grantName}
              placeholder={displayValue(extractedGrantName) || "Grant name"}
              onChange={(event) => setGrantName(event.target.value)}
              aria-label="Grant name"
            />
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-sm text-muted-foreground">
                $
              </span>
              <Input
                className="flex-1"
                value={grantAmountDollars}
                inputMode="decimal"
                placeholder={
                  typeof extractedAmountCents === "number"
                    ? formatCentsAsDollarsInput(extractedAmountCents)
                    : "Award amount"
                }
                onChange={(event) => setGrantAmountDollars(event.target.value)}
                aria-label="Award amount"
              />
            </div>
            <Input
              value={grantStartDate}
              placeholder={displayDateInputValue(extractedStartDate) || "Start date"}
              onChange={(event) => setGrantStartDate(event.target.value)}
              aria-label="Grant start date"
              type="date"
            />
            <Input
              value={grantEndDate}
              placeholder={displayDateInputValue(extractedEndDate) || "End date"}
              onChange={(event) => setGrantEndDate(event.target.value)}
              aria-label="Grant end date"
              type="date"
            />
            <Input
              value={funderExistingId}
              placeholder="Existing funder ID"
              onChange={(event) => setFunderExistingId(event.target.value)}
              aria-label="Existing funder"
              disabled={funderDecision !== "map_existing"}
            />
            <Select
              value={funderDecision}
              onValueChange={(value) => setFunderDecision(value as DuplicateDecision)}
            >
              <SelectTrigger className="w-full" aria-label="Funder duplicate decision">
                <SelectValue placeholder="Choose funder decision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="undecided">Choose funder decision</SelectItem>
                <SelectItem value="create_new">Create new funder</SelectItem>
                <SelectItem value="map_existing">Map existing funder</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={grantExistingId}
              placeholder="Existing grant ID"
              onChange={(event) => setGrantExistingId(event.target.value)}
              aria-label="Existing grant"
              disabled={grantDecision !== "map_existing"}
            />
            <Select
              value={grantDecision}
              onValueChange={(value) => setGrantDecision(value as DuplicateDecision)}
            >
              <SelectTrigger className="w-full" aria-label="Grant duplicate decision">
                <SelectValue placeholder="Choose grant decision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="undecided">Choose grant decision</SelectItem>
                <SelectItem value="create_new">Create new grant</SelectItem>
                <SelectItem value="map_existing">Map existing grant</SelectItem>
              </SelectContent>
            </Select>
            <Button
              disabled={!canCommit || commitMutation.isPending}
              onClick={() => {
                setMutationError(null);
                // Guard the period order on the client so the reviewer sees a
                // plain-language message inline. The shared schema enforces the
                // same rule server-side, but a zValidator rejection only
                // surfaces as a generic "Request failed".
                if (
                  resolvedStartDate &&
                  resolvedEndDate &&
                  new Date(resolvedStartDate) > new Date(resolvedEndDate)
                ) {
                  setMutationError("End date must be on or after the start date.");
                  return;
                }
                commitMutation.mutate(
                  {
                    funderDecision:
                      funderDecision === "map_existing"
                        ? { action: "map_existing", existingId: funderExistingId.trim() }
                        : { action: "create_new" },
                    grantDecision:
                      grantDecision === "map_existing"
                        ? { action: "map_existing", existingId: grantExistingId.trim() }
                        : { action: "create_new" },
                    requiredGrantBasics: {
                      name: resolvedGrantName,
                      ...(resolvedAmountCents ? { amountCents: resolvedAmountCents } : {}),
                      ...(resolvedStartDate ? { startDate: resolvedStartDate } : {}),
                      ...(resolvedEndDate ? { endDate: resolvedEndDate } : {}),
                    },
                  },
                  {
                    onError: (error) => setMutationError(commitErrorMessage(error)),
                  },
                );
              }}
            >
              Commit reviewed setup
            </Button>
            {unreviewedBlockingCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {unreviewedBlockingCount === 1 ? "1 field" : `${unreviewedBlockingCount} fields`}{" "}
                still need a quick review. Accept or fix each highlighted field before you save.
              </p>
            ) : null}
          </div>
        </aside>

        <section className="space-y-4">
          {Object.entries(grouped).map(([section, sectionFields]) => (
            <div key={section} className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-base font-semibold capitalize">{section.replaceAll("_", " ")}</h2>
              <div className="mt-3 space-y-3">
                {sectionFields.map((field) => (
                  <div key={field.id} className="rounded-2xl border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{fieldLabel(field)}</p>
                        <FieldValue field={field} />
                      </div>
                      <span
                        className={
                          !fieldHasValue(field) || field.confidence < 70
                            ? "rounded-lg bg-warning px-2 py-1 text-xs text-warning-foreground"
                            : "rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground"
                        }
                      >
                        {confidenceLabel(field)}
                      </span>
                    </div>
                    {field.sources?.[0] && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {field.sources[0].pageNumber != null
                          ? `Page ${field.sources[0].pageNumber}: ${field.sources[0].snippet}`
                          : field.sources[0].snippet}
                      </p>
                    )}
                    <FieldReviewControls
                      field={field}
                      disabled={actionMutation.isPending}
                      onAction={(payload) => {
                        setMutationError(null);
                        actionMutation.mutate(payload, {
                          onError: (error) =>
                            setMutationError(
                              error instanceof Error
                                ? error.message
                                : "Unable to record review action.",
                            ),
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
