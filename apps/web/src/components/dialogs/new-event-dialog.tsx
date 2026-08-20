import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@grantpipe/ui";
import { EVENT_TYPES, EVENT_TYPE_LABELS, type EventType } from "@grantpipe/shared";
import type { CreateEventInput } from "@grantpipe/shared";
import { useCreateEvent } from "../../hooks/use-events";
import { centsFromInput } from "../../lib/money";

interface NewEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  name: string;
  type: EventType;
  date: string;
  location: string;
  description: string;
  revenueGoal: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  type: "gala",
  date: "",
  location: "",
  description: "",
  revenueGoal: "",
};

export function NewEventDialog({ open, onOpenChange }: NewEventDialogProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const createEvent = useCreateEvent();

  function reset() {
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

  const isValid = form.name.trim().length > 0;

  async function handleSubmit() {
    setError(null);

    const input: CreateEventInput = {
      name: form.name.trim(),
      type: form.type,
      ...(form.date ? { date: new Date(form.date + "T12:00:00.000Z").toISOString() } : {}),
      ...(form.location.trim() ? { location: form.location.trim() } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.revenueGoal.trim() ? { revenueGoalCents: centsFromInput(form.revenueGoal) } : {}),
    };

    try {
      await createEvent.mutateAsync(input);
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add event.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add event</DialogTitle>
          <DialogDescription>
            Enter a name and type to start. Add attendees, donations, and volunteer hours from the
            event detail page.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive" title="Unable to add event">
            {error}
          </Alert>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="event-name">Event name</Label>
            <Input
              id="event-name"
              placeholder="Event name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="event-type">Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v as EventType }))}
            >
              <SelectTrigger id="event-type" aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="event-date">Date</Label>
            <Input
              id="event-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="event-location">Location</Label>
            <Input
              id="event-location"
              placeholder="Venue or address"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="event-description">Description</Label>
            <Textarea
              id="event-description"
              placeholder="Brief description…"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="event-revenue-goal">Revenue goal ($)</Label>
            <Input
              id="event-revenue-goal"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={form.revenueGoal}
              onChange={(e) => setForm((f) => ({ ...f, revenueGoal: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" className="rounded-full" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            className="rounded-full"
            onClick={() => void handleSubmit()}
            disabled={!isValid || createEvent.isPending}
          >
            {createEvent.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
