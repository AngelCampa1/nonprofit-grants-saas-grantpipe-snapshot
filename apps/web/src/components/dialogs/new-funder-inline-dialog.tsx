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
} from "@grantpipe/ui";
import { createFunderSchema, FUNDER_TYPES, type CreateFunderInput } from "@grantpipe/shared";
import { useCreateFunder } from "../../hooks/use-grants";
import { formatFunderTypeLabel } from "../../lib/format";

export interface NewFunderInlineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (funder: { id: string; name: string }) => void;
}

const DEFAULT_FUNDER_TYPE: CreateFunderInput["type"] = "foundation";

/**
 * A focused create-funder dialog nested inside the new-grant flow. A brand-new
 * org with no funders (or anyone who just realized the funder is missing) can
 * add one here without leaving the grant form, so the half-filled grant (name,
 * amount, status) is never thrown away.
 *
 * Loaded lazily by new-grant-dialog so its code stays out of the initial app
 * entry chunk and only ships when someone actually opens it.
 */
export function NewFunderInlineDialog({
  open,
  onOpenChange,
  onCreated,
}: NewFunderInlineDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CreateFunderInput["type"]>(DEFAULT_FUNDER_TYPE);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createFunder = useCreateFunder();

  function reset() {
    setName("");
    setType(DEFAULT_FUNDER_TYPE);
    setWebsite("");
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit() {
    setError(null);
    const trimmedWebsite = website.trim();
    const parsed = createFunderSchema.safeParse({
      name: name.trim(),
      type,
      ...(trimmedWebsite ? { website: trimmedWebsite } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Unable to add funder.");
      return;
    }

    try {
      const created = await createFunder.mutateAsync(parsed.data);
      onCreated({ id: created.id, name: created.name });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add funder.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a funder</DialogTitle>
          <DialogDescription>
            Add a new funder. We pick it for this grant for you.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive" title="Unable to add funder">
            {error}
          </Alert>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="inline-funder-name">Funder name</Label>
            <Input
              id="inline-funder-name"
              placeholder="e.g. Ford Foundation"
              value={name}
              onChange={(e) => {
                setError(null);
                setName(e.target.value);
              }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="inline-funder-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CreateFunderInput["type"])}>
              <SelectTrigger id="inline-funder-type" aria-label="Funder type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUNDER_TYPES.map((funderType) => (
                  <SelectItem key={funderType} value={funderType}>
                    {formatFunderTypeLabel(funderType)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="inline-funder-website">Website</Label>
            <Input
              id="inline-funder-website"
              type="url"
              placeholder="https://example.org"
              value={website}
              onChange={(e) => {
                setError(null);
                setWebsite(e.target.value);
              }}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 justify-end">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="rounded-full"
            onClick={() => void handleSubmit()}
            disabled={createFunder.isPending || name.trim().length === 0}
          >
            {createFunder.isPending ? "Adding funder…" : "Add funder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
