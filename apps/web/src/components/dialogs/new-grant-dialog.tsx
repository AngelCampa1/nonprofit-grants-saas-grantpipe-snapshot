import { lazy, Suspense, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  HelpTooltip,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@grantpipe/ui";
import { createGrantSchema, type CreateGrantInput, type GrantStatus } from "@grantpipe/shared";
import { GRANT_STAGE_DETAILS, getGrantStageInfo } from "../../lib/grant-stages";
import { useCreateGrant, useFunders } from "../../hooks/use-grants";
import { AwardIntakeEntry } from "../document-extractions/award-intake-entry";

// Loaded lazily so the create-funder form stays out of the initial app entry
// chunk and only ships when someone opens it from the grant form.
const NewFunderInlineDialog = lazy(() =>
  import("./new-funder-inline-dialog").then((m) => ({ default: m.NewFunderInlineDialog })),
);

interface NewGrantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  name: string;
  funderId: string;
  status: GrantStatus;
  amountDollars: string;
  startDate: string;
  endDate: string;
  applicationDeadline: string;
  description: string;
  notes: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  funderId: "",
  status: "discovery",
  amountDollars: "",
  startDate: "",
  endDate: "",
  applicationDeadline: "",
  description: "",
  notes: "",
};

const DOLLAR_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function NewGrantDialog({ open, onOpenChange }: NewGrantDialogProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [funderDialogOpen, setFunderDialogOpen] = useState(false);
  const createGrant = useCreateGrant();
  const fundersQuery = useFunders({ page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" });
  const funders: Array<{ id: string; name: string }> = fundersQuery.data?.data ?? [];
  const hasNoFunders = !fundersQuery.isLoading && funders.length === 0;
  const selectedStage = getGrantStageInfo(form.status);

  function handleAddFunder() {
    setFunderDialogOpen(true);
  }

  function handleFunderCreated(funder: { id: string; name: string }) {
    // Keep the grant the user is filling out: select the new funder and stay
    // on this form. The funders query refetches and the option appears.
    setForm((f) => ({ ...f, funderId: funder.id }));
    setError(null);
  }

  function reset() {
    setStep(1);
    setForm(DEFAULT_FORM);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  }

  function handleCancel() {
    handleOpenChange(false);
  }

  function isStep1Valid(): boolean {
    return form.name.trim().length > 0 && form.funderId.length > 0;
  }

  function getAmountError(): string | null {
    const amountDollars = form.amountDollars.trim();
    if (amountDollars.length === 0) return null;
    const parsedAmount = Number(amountDollars);
    if (
      !DOLLAR_AMOUNT_PATTERN.test(amountDollars) ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      return "Enter a valid grant amount.";
    }
    return null;
  }

  function getAmountCents(): number | undefined {
    const amountDollars = form.amountDollars.trim();
    if (amountDollars.length === 0) return undefined;
    return Math.round(Number(amountDollars) * 100);
  }

  function handleNext() {
    if (!isStep1Valid()) {
      // Keep the primary action clickable and, instead of a silent disabled
      // button, name exactly what is still missing so no one gets stuck.
      const needsName = form.name.trim().length === 0;
      const needsFunder = form.funderId.length === 0;
      setError(
        needsName && needsFunder
          ? "Add a grant name and pick a funder to continue."
          : needsName
            ? "Add a grant name to continue."
            : "Pick a funder to continue.",
      );
      return;
    }
    // The amount field lives on step 1, so validate it before advancing and
    // keep the user here (with the error) when it is invalid.
    const amountError = getAmountError();
    if (amountError) {
      setError(amountError);
      return;
    }
    setError(null);
    setStep(2);
  }

  function handleBack() {
    setError(null);
    setStep(1);
  }

  async function handleSubmit() {
    setError(null);

    // The amount is validated on step 1 before advancing, so it is valid here.
    const amountCents = getAmountCents();

    const input: CreateGrantInput = {
      name: form.name.trim(),
      funderId: form.funderId,
      status: form.status || undefined,
      amountCents,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      applicationDeadline: form.applicationDeadline || undefined,
      description: form.description.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };

    const parsed = createGrantSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Unable to add grant.");
      return;
    }

    try {
      await createGrant.mutateAsync(parsed.data);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add grant.");
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add grant</DialogTitle>
            <DialogDescription>
              Set up a new grant record and connect it to the right funder.
            </DialogDescription>
          </DialogHeader>

          {/* Step progress */}
          <div className="flex gap-1 mb-5">
            {([1, 2] as const).map((s) => (
              <div
                key={s}
                data-testid={`step-bar-${s}`}
                className={cn(
                  "h-0.5 flex-1 rounded-full transition-colors",
                  step >= s ? "bg-primary" : "bg-border",
                )}
              />
            ))}
          </div>

          {error ? (
            <Alert variant="destructive" title="Unable to add grant">
              {error}
            </Alert>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              {/* Create from an award letter with AI, or fill in the form below. */}
              <AwardIntakeEntry compact />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>or enter details by hand</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              {/* Grant name */}
              <div className="space-y-1">
                <Label htmlFor="grant-name">Grant name</Label>
                <Input
                  id="grant-name"
                  placeholder="e.g. NSF STEM Education Award 2026"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* Funder */}
              <div className="space-y-1">
                <Label htmlFor="grant-funder-select">Funder</Label>
                {hasNoFunders ? (
                  <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-3">
                    <p className="text-sm font-medium text-foreground">No funders yet</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Add a funder first, then come back to create this grant by hand. Or use{" "}
                      <span className="font-medium text-foreground">
                        Create from award document
                      </span>{" "}
                      above to pull the funder in automatically.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 rounded-full"
                      onClick={handleAddFunder}
                    >
                      Add a funder
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Select
                      value={form.funderId}
                      onValueChange={(v) => setForm((f) => ({ ...f, funderId: v }))}
                    >
                      <SelectTrigger id="grant-funder-select" aria-label="grant-funder-select">
                        <SelectValue placeholder="Select funder" />
                      </SelectTrigger>
                      <SelectContent>
                        {funders.map((funder) => (
                          <SelectItem key={funder.id} value={funder.id}>
                            {funder.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={handleAddFunder}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      Add a new funder
                    </button>
                  </div>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <Label htmlFor="grant-amount">Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    $
                  </span>
                  <Input
                    id="grant-amount"
                    className="pl-6"
                    type="text"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amountDollars}
                    onChange={(e) => setForm((f) => ({ ...f, amountDollars: e.target.value }))}
                  />
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="grant-status">Status</Label>
                  <HelpTooltip label="How do grant statuses work?">
                    Pick the stage this grant is in. A description appears below.
                  </HelpTooltip>
                </div>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as GrantStatus }))}
                >
                  <SelectTrigger id="grant-status" aria-label="grant-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRANT_STAGE_DETAILS.map((stage) => (
                      <SelectItem key={stage.status} value={stage.status}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm leading-5 text-muted-foreground">{selectedStage.meaning}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Start Date */}
              <div className="space-y-1">
                <Label htmlFor="grant-start-date">Start Date</Label>
                <Input
                  id="grant-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>

              {/* End Date */}
              <div className="space-y-1">
                <Label htmlFor="grant-end-date">End Date</Label>
                <Input
                  id="grant-end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>

              {/* Application Deadline */}
              <div className="space-y-1">
                <Label htmlFor="grant-app-deadline">Application Deadline</Label>
                <Input
                  id="grant-app-deadline"
                  type="date"
                  value={form.applicationDeadline}
                  onChange={(e) => setForm((f) => ({ ...f, applicationDeadline: e.target.value }))}
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Label htmlFor="grant-description">Description</Label>
                <Textarea
                  id="grant-description"
                  placeholder="Brief description of this grant…"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label htmlFor="grant-notes">Notes</Label>
                <Textarea
                  id="grant-notes"
                  placeholder="Internal notes…"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 justify-end">
            {step === 1 ? (
              <>
                <Button variant="outline" className="rounded-full" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button className="rounded-full" onClick={handleNext}>
                  Next
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="rounded-full" onClick={handleBack}>
                  Back
                </Button>
                <Button
                  className="rounded-full"
                  onClick={() => void handleSubmit()}
                  disabled={createGrant.isPending}
                >
                  {createGrant.isPending ? "Adding…" : "Add"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {funderDialogOpen ? (
        <Suspense fallback={null}>
          <NewFunderInlineDialog
            open={funderDialogOpen}
            onOpenChange={setFunderDialogOpen}
            onCreated={handleFunderCreated}
          />
        </Suspense>
      ) : null}
    </>
  );
}
