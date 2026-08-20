import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@grantpipe/ui";
import {
  type CreateDonationInput,
  type DonationType,
  type RestrictionType,
  type ClassificationResult,
  DONATION_TYPE_LABELS,
  DONATION_TYPES,
  RESTRICTION_TYPE_LABELS,
  RESTRICTION_TYPES,
} from "@grantpipe/shared";
import { useFunds } from "../../hooks/use-grants";
import { useClassifyRestriction } from "../../hooks/use-classify-restriction";

// Form-level schema: amount as a dollar string, date as a date string
const donationFormSchema = z.object({
  amountDollars: z
    .string()
    .min(1, "Amount is required")
    .refine((v) => {
      const n = parseFloat(v);
      return !isNaN(n) && n > 0;
    }, "Amount must be positive"),
  date: z.string().min(1, "Date is required"),
  type: z.enum(DONATION_TYPES),
  restriction: z.enum(RESTRICTION_TYPES).default("unrestricted"),
  fundId: z.string().optional(),
  goodsServicesValueDollars: z.string().optional(),
  goodsServicesDescription: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  designation: z.string().optional(),
});

type DonationFormValues = z.infer<typeof donationFormSchema>;

interface DonationFormProps {
  onSubmit: (data: CreateDonationInput) => void | Promise<void>;
  defaultValues?: Partial<CreateDonationInput>;
  submitLabel?: string;
  pendingLabel?: string;
}

function centsToDisplayDollars(amountCents: number): string {
  // Always show two decimal places so an edited donation never pre-fills as a
  // malformed "1.5" — money the reviewer sees must read like money.
  return (Math.round(amountCents) / 100).toFixed(2);
}

function dateToInputValue(isoDate: string): string {
  // Extract YYYY-MM-DD from ISO datetime
  return isoDate.slice(0, 10);
}

type AcceptedClassification = NonNullable<CreateDonationInput["acceptedClassification"]>;

type DonationSubmissionValues = DonationFormValues & {
  acceptedClassification?: AcceptedClassification;
};

export function buildDonationSubmission(values: DonationSubmissionValues): CreateDonationInput {
  const amountCents = Math.round(parseFloat(values.amountDollars) * 100);
  const goodsServicesValueDollars = values.goodsServicesValueDollars?.trim() ?? "";
  const goodsServicesValueCents =
    goodsServicesValueDollars.length > 0
      ? Math.round(parseFloat(goodsServicesValueDollars) * 100)
      : 0;
  const goodsServicesDescription = values.goodsServicesDescription?.trim();

  return {
    amountCents,
    date: `${values.date}T00:00:00.000Z`,
    type: values.type,
    restriction: values.restriction,
    currency: "USD",
    ...(values.fundId ? { fundId: values.fundId } : {}),
    ...(goodsServicesValueCents > 0 ? { goodsServicesValueCents } : {}),
    ...(goodsServicesDescription ? { goodsServicesDescription } : {}),
    ...(values.paymentMethod ? { paymentMethod: values.paymentMethod } : {}),
    ...(values.notes ? { notes: values.notes } : {}),
    ...(values.designation ? { designation: values.designation } : {}),
    ...(values.acceptedClassification
      ? { acceptedClassification: values.acceptedClassification }
      : {}),
  };
}

const NO_FUND_SENTINEL = "__none__";

const CONFIDENCE_BADGE_VARIANT: Record<
  ClassificationResult["confidence"],
  "success" | "warning" | "outline"
> = {
  high: "success",
  medium: "warning",
  low: "outline",
};

const CONFIDENCE_LABEL: Record<ClassificationResult["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const NET_ASSET_CLASS_LABEL: Record<ClassificationResult["netAssetClass"], string> = {
  unrestricted: "Unrestricted",
  temporarily_restricted: "Temporarily restricted",
  permanently_restricted: "Permanently restricted",
};

export function DonationForm({
  onSubmit,
  defaultValues,
  submitLabel = "Save",
  pendingLabel = "Saving…",
}: DonationFormProps) {
  const fundsQuery = useFunds({ page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" });
  const funds = fundsQuery.data?.data ?? [];
  const classifier = useClassifyRestriction();

  // Tracks whether the user has manually touched the restriction field.
  // When true, auto-prefill from classifier is suppressed.
  const restrictionTouchedRef = useRef(false);

  // The current classifier suggestion (null = none / dismissed)
  const [suggestion, setSuggestion] = useState<ClassificationResult | null>(null);

  // The accepted classification payload to attach to submission
  const [acceptedClassification, setAcceptedClassification] =
    useState<AcceptedClassification | null>(null);

  const form = useForm({
    resolver: standardSchemaResolver(donationFormSchema),
    defaultValues: {
      amountDollars: defaultValues?.amountCents
        ? centsToDisplayDollars(defaultValues.amountCents)
        : "",
      date: defaultValues?.date ? dateToInputValue(defaultValues.date) : "",
      type: (defaultValues?.type ?? "one_time") as DonationType,
      restriction: (defaultValues?.restriction ?? "unrestricted") as RestrictionType,
      fundId: defaultValues?.fundId ?? "",
      goodsServicesValueDollars:
        defaultValues?.goodsServicesValueCents != null
          ? centsToDisplayDollars(defaultValues.goodsServicesValueCents)
          : "",
      goodsServicesDescription: defaultValues?.goodsServicesDescription ?? "",
      paymentMethod: defaultValues?.paymentMethod ?? "",
      notes: defaultValues?.notes ?? "",
      designation: "",
    },
  });

  // Watch the classifier-relevant fields
  const watchedFundId = form.watch("fundId");
  const watchedDesignation = form.watch("designation");
  const watchedRestriction = form.watch("restriction");
  const hasRestrictionConflict =
    suggestion !== null &&
    restrictionTouchedRef.current &&
    watchedRestriction !== suggestion.donationRestriction;

  // Debounced classify call
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id so a slow earlier classify can never overwrite the
  // banner with stale data after a faster later one resolves.
  const requestSeqRef = useRef(0);

  const runClassify = useCallback(
    (fundId: string | undefined, designation: string | undefined) => {
      // The signal inputs changed, so any previously-accepted suggestion is now
      // stale — drop it (and re-enable auto-prefill) before classifying again.
      // This prevents an accepted classification from one fund being written
      // against a different fund the user switches to afterward.
      setAcceptedClassification(null);
      restrictionTouchedRef.current = false;

      const hasInputs = !!(fundId || designation?.trim());
      if (!hasInputs) {
        setSuggestion(null);
        return;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const seq = ++requestSeqRef.current;
      debounceTimerRef.current = setTimeout(() => {
        classifier
          .mutateAsync({
            ...(fundId ? { fundId } : {}),
            ...(designation?.trim() ? { designation: designation.trim() } : {}),
          })
          .then((result) => {
            // Ignore responses that are no longer the latest request.
            if (seq !== requestSeqRef.current) return;
            setSuggestion(result);
            // Pre-fill restriction if the user has not manually touched it
            if (!restrictionTouchedRef.current) {
              form.setValue("restriction", result.donationRestriction, { shouldValidate: false });
            }
          })
          .catch(() => {
            // Silently swallow network errors — classification is advisory
          });
      }, 400);
    },
    // Stable callback: form/classifier are refs-or-stable and intentionally
    // excluded so runClassify identity never changes between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    runClassify(watchedFundId || undefined, watchedDesignation || undefined);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // Re-classify only when the classifier signal inputs change; runClassify is
    // stable so excluding it from deps is deliberate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedFundId, watchedDesignation]);

  function handleApplySuggestion() {
    if (!suggestion) return;
    form.setValue("restriction", suggestion.donationRestriction, { shouldValidate: true });
    restrictionTouchedRef.current = true;
    // Derive a human title for the auto-created restriction term: prefer the
    // donor's designation text, then the linked fund name, then a class label.
    const designationText = form.getValues("designation")?.trim();
    const fundName = funds.find((f) => f.id === form.getValues("fundId"))?.name;
    const title = designationText || fundName || NET_ASSET_CLASS_LABEL[suggestion.netAssetClass];
    setAcceptedClassification({
      restrictionType: suggestion.restrictionType,
      title,
      ...(suggestion.suggestedReleaseRule ? { releaseRule: suggestion.suggestedReleaseRule } : {}),
      ...(suggestion.suggestedStartDate ? { startDate: suggestion.suggestedStartDate } : {}),
      ...(suggestion.suggestedEndDate ? { endDate: suggestion.suggestedEndDate } : {}),
    });
    setSuggestion(null);
  }

  function handleDismissSuggestion() {
    setSuggestion(null);
    setAcceptedClassification(null);
  }

  async function handleFormSubmit(values: DonationFormValues) {
    await onSubmit(
      buildDonationSubmission({
        ...values,
        ...(acceptedClassification ? { acceptedClassification } : {}),
      }),
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => handleFormSubmit(values as DonationFormValues))}
        noValidate
        className="space-y-4"
      >
        {/* Amount */}
        <FormField
          control={form.control}
          name="amountDollars"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount ($)</FormLabel>
              <FormControl>
                <Input {...field} type="number" step="0.01" min="0.01" placeholder="0.00" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Date */}
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input {...field} type="date" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Donation Type */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Donation Type</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange} name={field.name}>
                  <SelectTrigger className="w-full" aria-label="Donation Type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DONATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {DONATION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Designation — donor's written purpose, feeds the auto-classifier */}
        <FormField
          control={form.control}
          name="designation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Donor Designation (optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Donor purpose, e.g. for the youth program"
                  aria-label="Donor Designation"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Restriction */}
        <FormField
          control={form.control}
          name="restriction"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Restriction</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    restrictionTouchedRef.current = true;
                    setAcceptedClassification(null);
                    field.onChange(v);
                  }}
                  name={field.name}
                >
                  <SelectTrigger className="w-full" aria-label="Restriction">
                    <SelectValue placeholder="Select restriction" />
                  </SelectTrigger>
                  <SelectContent>
                    {RESTRICTION_TYPES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {RESTRICTION_TYPE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Classifier suggestion banner */}
        {suggestion && (
          <Alert
            variant={hasRestrictionConflict ? "warning" : "info"}
            title={hasRestrictionConflict ? "Check this restriction" : "Suggested restriction"}
            aria-label="Restriction suggestion"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">
                  {NET_ASSET_CLASS_LABEL[suggestion.netAssetClass]}
                </span>
                <Badge variant={CONFIDENCE_BADGE_VARIANT[suggestion.confidence]}>
                  {CONFIDENCE_LABEL[suggestion.confidence]}
                </Badge>
              </div>
              {hasRestrictionConflict && (
                <p className="text-sm">
                  Saved records point to a {suggestion.donationRestriction} gift, but the form is
                  set to {watchedRestriction}.
                </p>
              )}
              {suggestion.signals[0] && <p className="text-sm">{suggestion.signals[0].detail}</p>}
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full"
                  onClick={handleApplySuggestion}
                  aria-label="Apply suggestion"
                >
                  Apply suggestion
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={handleDismissSuggestion}
                  aria-label="Dismiss suggestion"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* Fund */}
        {funds.length > 0 && (
          <FormField
            control={form.control}
            name="fundId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fund (optional)</FormLabel>
                <FormControl>
                  <Select
                    value={field.value || NO_FUND_SENTINEL}
                    onValueChange={(v) => field.onChange(v === NO_FUND_SENTINEL ? "" : v)}
                    name={field.name}
                  >
                    <SelectTrigger className="w-full" aria-label="Fund">
                      <SelectValue placeholder="Select fund" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_FUND_SENTINEL}>
                        <span className="text-muted-foreground">No fund</span>
                      </SelectItem>
                      {funds.map((fund: { id: string; name: string }) => (
                        <SelectItem key={fund.id} value={fund.id}>
                          {fund.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="goodsServicesValueDollars"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Goods or services value ($)</FormLabel>
              <FormControl>
                <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="goodsServicesDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Goods or services description</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Dinner ticket, meal, or event item" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Payment Method */}
        <FormField
          control={form.control}
          name="paymentMethod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Method</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Check, Credit Card, ACH…" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Additional notes…" rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full rounded-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? pendingLabel : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
