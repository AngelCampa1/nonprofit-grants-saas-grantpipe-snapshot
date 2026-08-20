import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@grantpipe/ui";
import { useSession } from "../../../hooks/use-session";
import {
  useFiscalPeriods,
  useCreateFiscalPeriod,
  useUpdateFiscalPeriod,
  useCloseFiscalPeriod,
  usePeriodCloseChecklist,
} from "../../../hooks/use-accounting";
import { formatUtcCalendarDate } from "../../../lib/format";

export const Route = createFileRoute("/_authenticated/accounting/periods")({
  component: FiscalPeriodsPage,
});

type FiscalPeriodRow = {
  id: string;
  orgId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
};

// The seeded "Opening Balances" period stores the Unix epoch as its start date —
// a sentinel that lets it cover every historical date before the first real period.
// Rendering the raw epoch as "Jan 1, 1970" reads as a bug, so show a plain label
// instead. This is a display-only fix; the stored epoch boundary is left untouched.
function formatPeriodStartDate(startDate: string): string {
  if (new Date(startDate).getTime() === 0) {
    return "From the start";
  }
  return formatUtcCalendarDate(startDate);
}

function statusBadge(status: string) {
  if (status === "open") {
    return (
      <Badge variant="default" className="capitalize">
        {status}
      </Badge>
    );
  }
  if (status === "closed") {
    return (
      <Badge variant="warning" className="capitalize">
        {status}
      </Badge>
    );
  }
  if (status === "locked") {
    return (
      <Badge variant="destructive" className="capitalize">
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="capitalize">
      {status}
    </Badge>
  );
}

interface CloseDialogProps {
  period: FiscalPeriodRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CloseDialog({ period, open, onOpenChange }: CloseDialogProps) {
  const closeMutation = useCloseFiscalPeriod(period.id);
  const checklistQuery = usePeriodCloseChecklist(period.id);
  const [closeError, setCloseError] = useState<string | null>(null);

  const checklist = checklistQuery.data;

  async function handleClose() {
    setCloseError(null);
    try {
      await closeMutation.mutateAsync();
      onOpenChange(false);
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : "Unable to close fiscal period.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close fiscal period: {period.name}</DialogTitle>
          <DialogDescription>Closed periods do not accept new journal entries.</DialogDescription>
        </DialogHeader>

        {checklistQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : checklist ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Pre-close checklist</h3>
            <ul className="space-y-2 text-sm">
              {checklist.checks.map((check) => (
                <li key={check.id} className="flex items-start justify-between gap-3">
                  <span className={check.passed ? "" : "text-muted-foreground"}>{check.label}</span>
                  <span
                    className={
                      check.passed
                        ? "shrink-0 text-success font-medium"
                        : "shrink-0 text-destructive font-medium"
                    }
                  >
                    {check.passed ? "Pass" : "Fail"}
                  </span>
                </li>
              ))}
            </ul>
            {!checklist.readyToClose ? (
              <p className="text-sm text-destructive">
                Resolve the issues above before closing this period.
              </p>
            ) : null}
          </div>
        ) : null}

        {closeError ? <InlineError>{closeError}</InlineError> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleClose()}
            disabled={
              closeMutation.isPending || (checklist !== undefined && !checklist.readyToClose)
            }
          >
            {closeMutation.isPending ? "Closing…" : "Close period"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditPeriodDialogProps {
  period: FiscalPeriodRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditPeriodDialog({ period, open, onOpenChange }: EditPeriodDialogProps) {
  const updateMutation = useUpdateFiscalPeriod(period.id);
  const [name, setName] = useState(period.name);
  const [startDate, setStartDate] = useState(period.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(period.endDate.slice(0, 10));
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(period.name);
      setStartDate(period.startDate.slice(0, 10));
      setEndDate(period.endDate.slice(0, 10));
      setFormError(null);
    }
  }, [open, period]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!startDate || !endDate) {
      setFormError("Start and end dates are required.");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setFormError("End date must be after start date.");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        startDate: `${startDate}T00:00:00.000Z`,
        endDate: `${endDate}T23:59:59.999Z`,
      });
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to update fiscal period.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit fiscal period</DialogTitle>
          <DialogDescription>Update the name or date range for this period.</DialogDescription>
        </DialogHeader>
        <form id="edit-period-form" className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-1">
            <Label htmlFor="edit-period-name">Name</Label>
            <Input
              id="edit-period-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. FY2026 Q1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit-period-start">Start Date</Label>
              <Input
                id="edit-period-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-period-end">End Date</Label>
              <Input
                id="edit-period-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {formError ? <InlineError>{formError}</InlineError> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="edit-period-form" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface NewPeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NewPeriodDialog({ open, onOpenChange }: NewPeriodDialogProps) {
  const createMutation = useCreateFiscalPeriod();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName("");
      setStartDate("");
      setEndDate("");
      setFormError(null);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!startDate || !endDate) {
      setFormError("Start and end dates are required.");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setFormError("End date must be after start date.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        startDate: `${startDate}T00:00:00.000Z`,
        endDate: `${endDate}T23:59:59.999Z`,
      });
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to add fiscal period.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add fiscal period</DialogTitle>
          <DialogDescription>Define a new accounting period for journal entries.</DialogDescription>
        </DialogHeader>
        <form id="period-form" className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-1">
            <Label htmlFor="period-name">Name</Label>
            <Input
              id="period-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. FY2026 Q1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="period-start">Start Date</Label>
              <Input
                id="period-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-end">End Date</Label>
              <Input
                id="period-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {formError ? <InlineError>{formError}</InlineError> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="period-form" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FiscalPeriodsPage() {
  const { memberRole } = useSession();
  const isAdmin = memberRole === "admin";

  const periodsQuery = useFiscalPeriods();
  const periods = periodsQuery.data ?? [];

  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const [closePeriod, setClosePeriod] = useState<FiscalPeriodRow | null>(null);
  const [editPeriod, setEditPeriod] = useState<FiscalPeriodRow | null>(null);

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        title="Fiscal Periods"
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => setNewPeriodOpen(true)}>
              Add period
            </Button>
          ) : undefined
        }
      />

      {periodsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : periodsQuery.isError ? (
        <p role="alert" className="text-destructive text-sm p-4">
          Unable to load fiscal periods. Please try again.
        </p>
      ) : periods.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fiscal periods yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin ? <TableHead className="w-40" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map((period) => (
              <TableRow key={period.id}>
                <TableCell className="font-medium">{period.name}</TableCell>
                <TableCell>{formatPeriodStartDate(period.startDate)}</TableCell>
                <TableCell>{formatUtcCalendarDate(period.endDate)}</TableCell>
                <TableCell>{statusBadge(period.status)}</TableCell>
                {isAdmin ? (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {period.status === "open" ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setEditPeriod(period)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setClosePeriod(period)}
                          >
                            Close
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NewPeriodDialog open={newPeriodOpen} onOpenChange={setNewPeriodOpen} />

      {editPeriod ? (
        <EditPeriodDialog
          period={editPeriod}
          open={editPeriod !== null}
          onOpenChange={(open) => {
            if (!open) setEditPeriod(null);
          }}
        />
      ) : null}

      {closePeriod ? (
        <CloseDialog
          period={closePeriod}
          open={closePeriod !== null}
          onOpenChange={(open) => {
            if (!open) setClosePeriod(null);
          }}
        />
      ) : null}
    </PageShell>
  );
}
