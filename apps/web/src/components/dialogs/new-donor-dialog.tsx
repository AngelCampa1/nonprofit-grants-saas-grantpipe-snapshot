import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Checkbox,
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
  cn,
} from "@grantpipe/ui";
import {
  createContactSchema,
  type CreateContactInput,
  type DonorPipelineStage,
} from "@grantpipe/shared";
import { PipelineStageSelect } from "../donors/pipeline-stage-select";
import { useCreateContact, useContacts } from "../../hooks/use-donors";
import { useSession } from "../../hooks/use-session";
import { completeOnboardingActivation } from "../../lib/onboarding-session";

const NONE_SENTINEL = "__none__";

interface NewDonorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ContactType = "individual" | "organization";

interface FormState {
  type: ContactType;
  firstName: string;
  lastName: string;
  organizationName: string;
  email: string;
  phone: string;
  pipelineStage: DonorPipelineStage;
  address: string;
  notes: string;
  isVolunteer: boolean;
  affiliatedOrgId: string;
}

const DEFAULT_FORM: FormState = {
  type: "individual",
  firstName: "",
  lastName: "",
  organizationName: "",
  email: "",
  phone: "",
  pipelineStage: "prospect",
  address: "",
  notes: "",
  isVolunteer: false,
  affiliatedOrgId: "",
};

export function NewDonorDialog({ open, onOpenChange }: NewDonorDialogProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const createContact = useCreateContact();
  const { onboardingCompleted } = useSession();
  const orgQuery = useContacts({
    type: "organization",
    page: 1,
    pageSize: 100,
    sortBy: "name",
    sortOrder: "asc",
  });
  const orgOptions = orgQuery.data?.data ?? [];

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
    if (form.type === "individual") {
      return form.firstName.trim().length > 0 || form.lastName.trim().length > 0;
    }
    return form.organizationName.trim().length > 0;
  }

  function buildInput(): CreateContactInput {
    return {
      type: form.type,
      ...(form.type === "individual"
        ? {
            firstName: form.firstName.trim() || undefined,
            lastName: form.lastName.trim() || undefined,
          }
        : {
            organizationName: form.organizationName.trim() || undefined,
          }),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      pipelineStage: form.pipelineStage || undefined,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
      isVolunteer: form.isVolunteer,
      affiliatedOrgId: form.affiliatedOrgId || undefined,
    };
  }

  function handleNext() {
    if (!isStep1Valid()) return;
    // Email and phone live on step 1, so validate them here. All step-2 fields
    // are optional, so any schema failure points at a step-1 field — keep the
    // user on step 1 where the offending field (and its error) is visible.
    const parsed = createContactSchema.safeParse(buildInput());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Unable to add donor.");
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

    const input: CreateContactInput = buildInput();

    const parsed = createContactSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Unable to add donor.");
      return;
    }

    let donorCreated = false;
    try {
      await createContact.mutateAsync(parsed.data);
      donorCreated = true;
      if (!onboardingCompleted) {
        await completeOnboardingActivation(queryClient, "manual-donor", null);
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      if (donorCreated && !onboardingCompleted) {
        setError("Donor saved, but setup did not finish. Refresh and try again.");
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to add donor.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add donor</DialogTitle>
          <DialogDescription>Add a new donor to your account.</DialogDescription>
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
          <Alert variant="destructive" title="Unable to add donor">
            {error}
          </Alert>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            {/* Type */}
            <div className="space-y-1">
              <Label htmlFor="donor-type">Contact Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as ContactType }))}
              >
                <SelectTrigger id="donor-type" aria-label="Contact Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="organization">Organization</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Conditional name */}
            {form.type === "individual" ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="donor-first-name">First Name</Label>
                  <Input
                    id="donor-first-name"
                    placeholder="Jane"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="donor-last-name">Last Name</Label>
                  <Input
                    id="donor-last-name"
                    placeholder="Doe"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="donor-org-name">Organization Name</Label>
                <Input
                  id="donor-org-name"
                  placeholder="ACME Foundation"
                  value={form.organizationName}
                  onChange={(e) => setForm((f) => ({ ...f, organizationName: e.target.value }))}
                />
              </div>
            )}

            {/* Email */}
            <div className="space-y-1">
              <Label htmlFor="donor-email">Email</Label>
              <Input
                id="donor-email"
                type="email"
                placeholder="contact@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            {/* Phone */}
            <div className="space-y-1">
              <Label htmlFor="donor-phone">Phone</Label>
              <Input
                id="donor-phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>

            {/* Pipeline Stage */}
            <div className="space-y-1">
              <Label htmlFor="donor-pipeline-stage">Pipeline Stage</Label>
              <PipelineStageSelect
                id="donor-pipeline-stage"
                value={form.pipelineStage}
                onChange={(v) => setForm((f) => ({ ...f, pipelineStage: v as DonorPipelineStage }))}
                name="donor-pipeline-stage"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Address */}
            <div className="space-y-1">
              <Label htmlFor="donor-address">Address</Label>
              <Input
                id="donor-address"
                placeholder="123 Main St, City, ST 00000"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="donor-notes">Notes</Label>
              <Textarea
                id="donor-notes"
                placeholder="Additional notes…"
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {/* Volunteer */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="donor-is-volunteer"
                checked={form.isVolunteer}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, isVolunteer: checked === true }))
                }
              />
              <Label htmlFor="donor-is-volunteer">Volunteer</Label>
            </div>

            {/* Affiliated Organization */}
            <div className="space-y-1">
              <Label htmlFor="donor-affiliated-org">Affiliated Organization</Label>
              <Select
                value={form.affiliatedOrgId || NONE_SENTINEL}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, affiliatedOrgId: v === NONE_SENTINEL ? "" : v }))
                }
              >
                <SelectTrigger id="donor-affiliated-org" aria-label="Affiliated Organization">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>None</SelectItem>
                  {orgOptions.map((org) => {
                    const label =
                      (org.organizationName ??
                        [org.firstName, org.lastName].filter(Boolean).join(" ")) ||
                      org.id;
                    return (
                      <SelectItem key={org.id} value={org.id}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2 justify-end">
          {step === 1 ? (
            <>
              <Button variant="outline" className="rounded-full" onClick={handleCancel}>
                Cancel
              </Button>
              <Button className="rounded-full" onClick={handleNext} disabled={!isStep1Valid()}>
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
                disabled={createContact.isPending}
              >
                {createContact.isPending ? "Adding…" : "Add"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
