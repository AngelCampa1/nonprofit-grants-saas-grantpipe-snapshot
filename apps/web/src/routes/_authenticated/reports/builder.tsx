import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Alert,
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
} from "@grantpipe/ui";
import type { ReportBuilderEntity, ReportBuilderPreview } from "@grantpipe/shared";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { reportsTabs } from "../../../config/page-tabs";
import {
  REPORT_BUILDER_COLUMNS,
  REPORT_BUILDER_ENTITIES,
  type ReportBuilderFieldOption,
} from "@grantpipe/shared";
import {
  useCreateReportDefinition,
  useReportBuilderMetadata,
  useReportBuilderPreview,
  useReportDefinitions,
  useRunReportDefinition,
} from "../../../hooks/use-report-builder";

export const Route = createFileRoute("/_authenticated/reports/builder")({
  component: ReportBuilderPage,
});

function defaultColumnsForEntity(entity: ReportBuilderEntity) {
  return [...REPORT_BUILDER_COLUMNS[entity]].slice(0, 2);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function ReportBuilderPage() {
  const [entity, setEntity] = useState<ReportBuilderEntity>("grants");
  const [name, setName] = useState("Grant report");
  const [columns, setColumns] = useState<string[]>(defaultColumnsForEntity("grants"));
  const [customFieldIds, setCustomFieldIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<ReportBuilderPreview | null>(null);
  const [savedDefinitionId, setSavedDefinitionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const metadataQuery = useReportBuilderMetadata();
  const definitionsQuery = useReportDefinitions({ entity }, { enabled: metadataQuery.isSuccess });
  const previewMutation = useReportBuilderPreview();
  const createMutation = useCreateReportDefinition();
  const runMutation = useRunReportDefinition();

  const metadata = metadataQuery.data;
  const entityMetadata = metadata?.entities[entity];
  const entityColumns = entityMetadata?.columns ?? [];
  const entityCustomFields = entityMetadata?.customFields ?? [];
  const savedDefinitions = definitionsQuery.data ?? [];
  const canPreview = columns.length > 0 && name.trim().length > 0;

  function resetEntity(nextEntity: ReportBuilderEntity) {
    setEntity(nextEntity);
    setName(`${metadata?.entities[nextEntity]?.label.slice(0, -1) || "Report"} report`);
    setColumns(defaultColumnsForEntity(nextEntity));
    setCustomFieldIds([]);
    setPreview(null);
    setSavedDefinitionId(null);
    setMessage(null);
    setError(null);
  }

  function setColumnChecked(column: string, checked: boolean) {
    setColumns((current) =>
      checked
        ? Array.from(new Set([...current, column]))
        : current.filter((value) => value !== column),
    );
    setSavedDefinitionId(null);
  }

  function setCustomFieldChecked(fieldId: string, checked: boolean) {
    setCustomFieldIds((current) =>
      checked
        ? Array.from(new Set([...current, fieldId]))
        : current.filter((value) => value !== fieldId),
    );
    setSavedDefinitionId(null);
  }

  async function handlePreview() {
    try {
      setError(null);
      const result = await previewMutation.mutateAsync({
        entity,
        columns,
        customFieldIds,
        limit: 25,
      });
      setPreview(result);
      setMessage("Preview refreshed.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleSave() {
    try {
      setError(null);
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        entity,
        columns,
        customFieldIds,
      });
      setSavedDefinitionId(result.id);
      setMessage("Report saved.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleExport() {
    try {
      setError(null);
      let definitionId = savedDefinitionId;
      if (!definitionId) {
        const result = await createMutation.mutateAsync({
          name: name.trim(),
          entity,
          columns,
          customFieldIds,
        });
        definitionId = result.id;
        setSavedDefinitionId(result.id);
      }
      await runMutation.mutateAsync({ definitionId, title: name.trim() });
      setMessage("CSV export is in the report library.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variant="workbench"
        kicker="Reporting & Compliance"
        title="Report Builder"
        description="Pick fields. Check rows. Save custom donor, grant, fund, and gift reports."
      />
      <AppPageTabs groupId="reports" items={reportsTabs} />

      {metadataQuery.isPlanGated ? (
        <Alert variant="info" title="Enterprise plan required">
          <div className="space-y-3">
            <p>The Report Builder is on the Enterprise plan.</p>
            <Button asChild>
              <Link to="/settings" hash="billing">
                Open billing settings
              </Link>
            </Button>
          </div>
        </Alert>
      ) : (
        <>
          {metadataQuery.isError ? (
            <Alert variant="destructive" title="Unable to load report builder.">
              {getErrorMessage(metadataQuery.error)}
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive" title="Unable to update report.">
              {error}
            </Alert>
          ) : null}
          {message ? <Alert variant="success">{message}</Alert> : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <section className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="report-name">Report name</Label>
                  <Input
                    id="report-name"
                    aria-label="Report name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setSavedDefinitionId(null);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="report-entity">Base records</Label>
                  <Select
                    value={entity}
                    onValueChange={(value) => resetEntity(value as ReportBuilderEntity)}
                  >
                    <SelectTrigger id="report-entity" aria-label="Base records">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_BUILDER_ENTITIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {metadata?.entities[option]?.label ?? option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <FieldChooser
                  title="Columns"
                  fields={entityColumns}
                  selected={columns}
                  onCheckedChange={setColumnChecked}
                />
                <FieldChooser
                  title="Custom fields"
                  fields={entityCustomFields.map((field) => ({ id: field.id, label: field.name }))}
                  selected={customFieldIds}
                  onCheckedChange={setCustomFieldChecked}
                  emptyText="No custom fields for this record type yet."
                />
              </div>

              {columns.length === 0 ? (
                <p className="text-sm text-muted-foreground">Choose at least one column.</p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={handlePreview}
                  disabled={!canPreview || previewMutation.isPending}
                >
                  Preview report
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSave}
                  disabled={!canPreview || createMutation.isPending}
                >
                  Save report
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExport}
                  disabled={!canPreview || runMutation.isPending}
                >
                  Export CSV
                </Button>
              </div>
            </section>

            <aside className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
              <h2 className="text-base font-semibold">Saved reports</h2>
              {definitionsQuery.isPending ? <Skeleton className="h-20 rounded-lg" /> : null}
              {!definitionsQuery.isPending && savedDefinitions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Saved reports for {entityMetadata?.label.toLowerCase() ?? "this record type"} will
                  show here.
                </p>
              ) : null}
              {savedDefinitions.map((definition) => (
                <button
                  key={definition.id}
                  type="button"
                  className="w-full rounded-full border border-border px-4 py-3 text-left hover:border-primary"
                  onClick={() => {
                    setName(definition.name);
                    setColumns(definition.columns);
                    setCustomFieldIds(definition.customFieldIds);
                    setSavedDefinitionId(definition.id);
                    setMessage("Saved report loaded.");
                  }}
                >
                  <span className="block font-medium">{definition.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {definition.columns.length} column
                    {definition.columns.length === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </aside>
          </div>

          <section className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold">Preview</h2>
            {!preview ? (
              <p className="text-sm text-muted-foreground">
                Preview a report before saving or exporting.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {preview.columns.map((column) => (
                        <th key={column.id} className="px-3 py-2 font-medium">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, index) => (
                      <tr key={index} className="border-b border-border/60">
                        {preview.columns.map((column) => (
                          <td key={column.id} className="px-3 py-2">
                            {String(row[column.id] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function FieldChooser(props: {
  title: string;
  fields: ReportBuilderFieldOption[];
  selected: string[];
  onCheckedChange: (fieldId: string, checked: boolean) => void;
  emptyText?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{props.title}</legend>
      {props.fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">{props.emptyText ?? "No fields available."}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {props.fields.map((field) => (
            <label
              key={field.id}
              htmlFor={`field-${field.id}`}
              className="flex items-start gap-2 text-sm"
            >
              <Checkbox
                id={`field-${field.id}`}
                aria-label={field.label}
                checked={props.selected.includes(field.id)}
                onCheckedChange={(checked) => props.onCheckedChange(field.id, checked === true)}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
