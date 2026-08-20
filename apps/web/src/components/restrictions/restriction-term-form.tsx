import { useState, type FormEvent } from "react";
import {
  RESTRICTION_LIFECYCLE_TYPE_LABELS,
  RESTRICTION_LIFECYCLE_TYPES,
  type CreateRestrictionTermInput,
  type RestrictionLifecycleType,
} from "@grantpipe/shared";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@grantpipe/ui";

function parseRestrictionType(value: string): RestrictionLifecycleType {
  const match = RESTRICTION_LIFECYCLE_TYPES.find((type) => type === value);
  if (!match) {
    throw new Error(`Unsupported restriction type: ${value}`);
  }
  return match;
}

function toIsoDateTime(value: FormDataEntryValue | null) {
  const text = String(value || "");
  return text ? new Date(`${text}T00:00:00.000Z`).toISOString() : undefined;
}

export function RestrictionTermForm(props: {
  defaultFundId?: string;
  defaultGrantId?: string;
  onSubmit: (data: CreateRestrictionTermInput) => void;
}) {
  const [restrictionType, setRestrictionType] = useState<string>("purpose");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fundId =
      props.defaultFundId ?? (props.defaultGrantId ? "" : String(form.get("fundId")).trim());
    const purposeStatement = String(form.get("purposeStatement")).trim();
    props.onSubmit({
      fundId: fundId.length > 0 ? fundId : undefined,
      grantId: props.defaultGrantId,
      title: String(form.get("title")),
      source: "donor",
      restrictionType: parseRestrictionType(restrictionType),
      purposeStatement: purposeStatement.length > 0 ? purposeStatement : undefined,
      endDate: toIsoDateTime(form.get("endDate")),
      beginningBalanceCents: Math.round(Number(form.get("beginningDollars")) * 100),
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      {!props.defaultFundId && !props.defaultGrantId ? (
        <div className="space-y-1">
          <Label htmlFor="restriction-fund-id">Fund ID</Label>
          <Input id="restriction-fund-id" name="fundId" required />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="restriction-title">Title</Label>
        <Input id="restriction-title" name="title" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="restriction-type">Type</Label>
        <Select value={restrictionType} onValueChange={setRestrictionType}>
          <SelectTrigger id="restriction-type" className="w-full" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESTRICTION_LIFECYCLE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {RESTRICTION_LIFECYCLE_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="restriction-purpose">Purpose</Label>
        <Textarea id="restriction-purpose" name="purposeStatement" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="restriction-end">End date</Label>
          <Input id="restriction-end" name="endDate" type="date" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="restriction-beginning">Opening balance ($)</Label>
          <Input
            id="restriction-beginning"
            name="beginningDollars"
            min="0"
            step="0.01"
            type="number"
          />
        </div>
      </div>
      <Button type="submit">Save term</Button>
    </form>
  );
}
