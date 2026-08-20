import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  RECURRING_TEMPLATE_FREQUENCIES,
  RECURRING_TEMPLATE_FREQUENCY_LABELS,
  type RecurringTemplateFrequency,
} from "@grantpipe/shared";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  InlineError,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TeachAndActEmptyState,
} from "@grantpipe/ui";
import { useSession } from "../../../hooks/use-session";
import {
  useRecurringTemplates,
  useCreateRecurringTemplate,
  useUpdateRecurringTemplate,
  useDeleteRecurringTemplate,
  useRunRecurringTemplate,
  useAccounts,
  type RecurringTemplateLine,
  type RecurringTemplateRow,
} from "../../../hooks/use-accounting";
import { formatCurrency, formatUtcCalendarDate, todayLocalDateInput } from "../../../lib/format";
import { centsFromInput } from "../../../lib/money";
import { Plus, Repeat, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounting/recurring")({
  component: RecurringTemplatesPage,
});

type Frequency = RecurringTemplateFrequency;

interface TemplateLine {
  id: string;
  accountId: string;
  fundId?: string;
  debitCents: number;
  creditCents: number;
  memo?: string;
}

function emptyLine(): TemplateLine {
  return { id: crypto.randomUUID(), accountId: "", debitCents: 0, creditCents: 0 };
}

function isBalanced(lines: TemplateLine[]): boolean {
  if (lines.length < 2) return false;
  const totalDebits = lines.reduce((s, l) => s + l.debitCents, 0);
  const totalCredits = lines.reduce((s, l) => s + l.creditCents, 0);
  return totalDebits > 0 && totalDebits === totalCredits;
}

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTemplate?: RecurringTemplateRow;
}

function TemplateFormDialog({ open, onOpenChange, editTemplate }: TemplateFormDialogProps) {
  const isEditing = !!editTemplate;
  const createMutation = useCreateRecurringTemplate();
  const updateMutation = useUpdateRecurringTemplate(editTemplate?.id ?? "");
  const accountsQuery = useAccounts({ isActive: true, pageSize: 200 });
  const accounts = accountsQuery.data ?? [];

  const [name, setName] = useState(editTemplate?.name ?? "");
  const [description, setDescription] = useState(editTemplate?.description ?? "");
  const [frequency, setFrequency] = useState<Frequency>(editTemplate?.frequency ?? "monthly");
  const [nextRunDate, setNextRunDate] = useState(
    editTemplate
      ? new Date(editTemplate.nextRunDate).toISOString().slice(0, 10)
      : todayLocalDateInput(),
  );
  const [memo, setMemo] = useState(editTemplate?.memo ?? "");
  const [lines, setLines] = useState<TemplateLine[]>(
    editTemplate?.lines
      ? editTemplate.lines.map((l) => ({
          id: crypto.randomUUID(),
          accountId: l.accountId,
          fundId: l.fundId,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
          memo: l.memo,
        }))
      : [emptyLine(), emptyLine()],
  );
  const [formError, setFormError] = useState<string | null>(null);

  const isPending = createMutation.isPending || updateMutation.isPending;

  React.useEffect(() => {
    if (open && !editTemplate) {
      setName("");
      setDescription("");
      setFrequency("monthly");
      setNextRunDate(todayLocalDateInput());
      setMemo("");
      setLines([emptyLine(), emptyLine()]);
      setFormError(null);
    }
  }, [open, editTemplate]);

  function updateLine(index: number, field: keyof TemplateLine, value: string | number) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!nextRunDate) {
      setFormError("Next run date is required.");
      return;
    }
    if (lines.some((l) => !l.accountId)) {
      setFormError("All line items must have an account selected.");
      return;
    }
    if (!isBalanced(lines)) {
      setFormError("Debits must equal credits.");
      return;
    }

    const linePayload: RecurringTemplateLine[] = lines.map((l) => ({
      accountId: l.accountId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      ...(l.fundId ? { fundId: l.fundId } : {}),
      ...(l.memo ? { memo: l.memo } : {}),
    }));

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          frequency,
          nextRunDate: `${nextRunDate}T00:00:00.000Z`,
          memo: memo.trim() || null,
          lines: linePayload,
        });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          frequency,
          nextRunDate: `${nextRunDate}T00:00:00.000Z`,
          ...(memo.trim() ? { memo: memo.trim() } : {}),
          lines: linePayload,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : isEditing
            ? "Unable to save template."
            : "Unable to add template.",
      );
    }
  }

  const totalDebits = lines.reduce((s, l) => s + l.debitCents, 0);
  const totalCredits = lines.reduce((s, l) => s + l.creditCents, 0);
  const balanced = isBalanced(lines);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit recurring template" : "Add recurring template"}
          </DialogTitle>
          <DialogDescription>
            Define a journal entry template that runs on a schedule.
          </DialogDescription>
        </DialogHeader>

        <form id="template-form" className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tmpl-name">Name</Label>
              <Input
                id="tmpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Monthly Depreciation"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmpl-frequency">Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger id="tmpl-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRING_TEMPLATE_FREQUENCIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {RECURRING_TEMPLATE_FREQUENCY_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tmpl-next-run">Next Run Date</Label>
              <Input
                id="tmpl-next-run"
                type="date"
                value={nextRunDate}
                onChange={(e) => setNextRunDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tmpl-memo">Memo (added to each entry)</Label>
              <Input
                id="tmpl-memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Optional memo"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tmpl-description">Description (internal)</Label>
            <Input
              id="tmpl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Journal Lines</Label>
              <span
                className={`text-xs font-medium ${balanced ? "text-success" : "text-destructive"}`}
              >
                {balanced
                  ? "Balanced"
                  : `Debits ${formatCurrency(totalDebits)} / Credits ${formatCurrency(totalCredits)}`}
              </span>
            </div>

            <div className="rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">Debit ($)</th>
                    <th className="px-3 py-2 text-right font-medium">Credit ($)</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.id} className="border-b border-border/30">
                      <td className="px-3 py-2">
                        <Select
                          value={line.accountId}
                          onValueChange={(v) => updateLine(index, "accountId", v)}
                        >
                          <SelectTrigger aria-label={`Account for line ${index + 1}`}>
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.code}: {acc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.debitCents > 0 ? (line.debitCents / 100).toFixed(2) : ""}
                          onChange={(e) => {
                            updateLine(index, "debitCents", centsFromInput(e.target.value));
                          }}
                          placeholder="0.00"
                          className="text-right"
                          aria-label={`Debit for line ${index + 1}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.creditCents > 0 ? (line.creditCents / 100).toFixed(2) : ""}
                          onChange={(e) => {
                            updateLine(index, "creditCents", centsFromInput(e.target.value));
                          }}
                          placeholder="0.00"
                          className="text-right"
                          aria-label={`Credit for line ${index + 1}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {lines.length > 2 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(index)}
                            aria-label={`Remove line ${index + 1}`}
                          >
                            <Trash2 className="size-4 text-muted-foreground" />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="mr-2 size-4" />
              Add Line
            </Button>
          </div>

          {formError ? <InlineError>{formError}</InlineError> : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="template-form" disabled={isPending || !balanced}>
            {isPending ? (isEditing ? "Saving…" : "Adding…") : isEditing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecurringTemplatesPage() {
  const { memberRole } = useSession();
  const isAdmin = memberRole === "admin";

  const templatesQuery = useRecurringTemplates();
  const deleteMutation = useDeleteRecurringTemplate();
  const runMutation = useRunRecurringTemplate();

  const templates = templatesQuery.data ?? [];

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<RecurringTemplateRow | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<RecurringTemplateRow | null>(null);
  const [runSuccess, setRunSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [runningTemplateId, setRunningTemplateId] = useState<string | null>(null);

  async function handleDelete(templateId: string) {
    setActionError(null);
    // Close the dialog immediately so a fast second click can't re-fire the delete.
    setTemplateToDelete(null);
    try {
      await deleteMutation.mutateAsync(templateId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to delete template.");
    }
  }

  async function handleRun(templateId: string) {
    setActionError(null);
    setRunSuccess(null);
    setRunningTemplateId(templateId);
    try {
      const result = await runMutation.mutateAsync(templateId);
      setRunSuccess(`Journal entry created: #${String(result.journalEntryId).slice(-8)}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to run template.");
    } finally {
      setRunningTemplateId(null);
    }
  }

  function frequencyLabel(freq: string) {
    const labels: Partial<Record<string, string>> = RECURRING_TEMPLATE_FREQUENCY_LABELS;
    return labels[freq] ?? freq;
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        title="Recurring Templates"
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => setNewDialogOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add template
            </Button>
          ) : undefined
        }
      />

      {actionError ? (
        <Alert variant="destructive" title="Action failed">
          {actionError}
        </Alert>
      ) : null}

      {runSuccess ? (
        <Alert title="Template ran successfully." variant="default">
          {runSuccess}
        </Alert>
      ) : null}

      {templatesQuery.isError ? (
        <Alert variant="destructive" title="Unable to load templates.">
          <Button variant="outline" onClick={() => void templatesQuery.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : templatesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <TeachAndActEmptyState
          icon={<Repeat />}
          heading="Post repeat entries on schedule"
          description="Set up a template. GrantPipe posts the entry on schedule."
          primaryAction={
            isAdmin ? { label: "Add template", onClick: () => setNewDialogOpen(true) } : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Next Run</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin ? <TableHead className="w-48" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{template.name}</p>
                    {template.description ? (
                      <p className="max-w-xs whitespace-normal break-words text-xs text-muted-foreground">
                        {template.description}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{frequencyLabel(template.frequency)}</TableCell>
                <TableCell>
                  {formatUtcCalendarDate(
                    typeof template.nextRunDate === "string"
                      ? template.nextRunDate
                      : String(template.nextRunDate),
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={template.isActive ? "default" : "secondary"}
                    className={template.isActive ? "bg-success hover:bg-success/90" : ""}
                  >
                    {template.isActive ? "Scheduled" : "Paused"}
                  </Badge>
                </TableCell>
                {isAdmin ? (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRun(template.id)}
                        disabled={runningTemplateId === template.id}
                      >
                        Run Now
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditTemplate(template)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setTemplateToDelete(template)}
                        disabled={
                          deleteMutation.isPending && deleteMutation.variables === template.id
                        }
                        className="text-destructive hover:text-destructive"
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <TemplateFormDialog open={newDialogOpen} onOpenChange={setNewDialogOpen} />

      {editTemplate ? (
        <TemplateFormDialog
          open={editTemplate !== null}
          onOpenChange={(open) => {
            if (!open) setEditTemplate(null);
          }}
          editTemplate={editTemplate}
        />
      ) : null}

      <Dialog
        open={templateToDelete !== null}
        onOpenChange={(open) => !open && setTemplateToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recurring template?</DialogTitle>
            <DialogDescription>
              Delete {templateToDelete?.name}? GrantPipe will stop posting scheduled entries from
              this template. Your existing journal entries stay as they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTemplateToDelete(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => templateToDelete && void handleDelete(templateToDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
