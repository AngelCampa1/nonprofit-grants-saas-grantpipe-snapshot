import { useState, type FormEvent } from "react";
import type { CreateRestrictionReleaseInput } from "@grantpipe/shared";
import { Button, Input, Label, Textarea } from "@grantpipe/ui";

const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function isValidCalendarDate(value: string): boolean {
  if (!RELEASE_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function RestrictionReleaseForm(props: {
  availableBalanceCents: number;
  onSubmit: (data: CreateRestrictionReleaseInput) => void;
}) {
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountDollars = String(form.get("amountDollars") ?? "").trim();
    const amount = Number(amountDollars);
    const amountCents = Math.round(amount * 100);
    const releaseDate = String(form.get("date") ?? "").trim();
    const reason = String(form.get("reason") ?? "").trim();
    const nextAmountError =
      amountDollars.length === 0 ||
      !RELEASE_AMOUNT_PATTERN.test(amountDollars) ||
      !Number.isFinite(amount) ||
      amountCents <= 0
        ? "Enter a release amount greater than zero."
        : amountCents > props.availableBalanceCents
          ? "Amount exceeds available restricted balance."
          : null;
    const nextDateError =
      releaseDate.length === 0 || !isValidCalendarDate(releaseDate)
        ? "Enter a valid release date."
        : null;
    const nextReasonError = reason.length === 0 ? "Reason is required." : null;

    setAmountError(nextAmountError);
    setDateError(nextDateError);
    setReasonError(nextReasonError);

    if (nextAmountError || nextDateError || nextReasonError) {
      return;
    }

    props.onSubmit({
      amountCents,
      date: new Date(releaseDate).toISOString(),
      reason,
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="release-amount">Amount</Label>
          <Input
            id="release-amount"
            name="amountDollars"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            type="text"
            required
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? "release-amount-error" : undefined}
          />
          {amountError ? (
            <p id="release-amount-error" className="text-xs text-destructive">
              {amountError}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="release-date">Date</Label>
          <Input
            id="release-date"
            name="date"
            type="date"
            required
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? "release-date-error" : undefined}
          />
          {dateError ? (
            <p id="release-date-error" className="text-xs text-destructive">
              {dateError}
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="release-reason">Reason</Label>
        <Textarea
          id="release-reason"
          name="reason"
          required
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? "release-reason-error" : undefined}
        />
        {reasonError ? (
          <p id="release-reason-error" className="text-xs text-destructive">
            {reasonError}
          </p>
        ) : null}
      </div>
      <Button type="submit">Record release</Button>
    </form>
  );
}
