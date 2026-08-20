import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@grantpipe/ui";
import {
  REVIEWER_TYPES,
  EXTERNAL_REVIEW_SCOPE_TYPES,
  PORTAL_SESSION_DEFAULT_TTL_MS,
  PORTAL_SESSION_TTL_OPTIONS,
  type ReviewerType,
} from "@grantpipe/shared";

type ExternalReviewScopeType = (typeof EXTERNAL_REVIEW_SCOPE_TYPES)[number];
import {
  useQuickShare,
  useReviewers,
  useReviewerMutations,
} from "../../hooks/use-external-reviewers";
import { useSession } from "../../hooks/use-session";
import { humanizeEnum } from "../../lib/format";
import { captureAppException } from "../../lib/sentry";

type Reviewer = {
  id: string;
  email: string;
  name: string;
  reviewerType: string;
};

type ReviewerListData = { items?: Reviewer[]; data?: Reviewer[] } | Reviewer[];

function extractReviewers(data: ReviewerListData | undefined): Reviewer[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if ("items" in data && Array.isArray(data.items)) return data.items;
  return data.data ?? [];
}

export type QuickShareSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The entity type being shared */
  scopeType: ExternalReviewScopeType;
  /** The entity ID being shared */
  scopeId: string;
  /** Entity name for display purposes */
  entityName: string;
};

type Step = "reviewer" | "details" | "confirm";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function QuickShareSheet({
  open,
  onOpenChange,
  scopeType,
  scopeId,
  entityName,
}: QuickShareSheetProps) {
  const { memberRole } = useSession();
  const canQuickShare = memberRole === "admin";
  const reviewersQuery = useReviewers(undefined, { enabled: open && canQuickShare });
  const reviewerMutations = useReviewerMutations();
  const { quickShare } = useQuickShare();

  const [step, setStep] = useState<Step>("reviewer");
  const [reviewerId, setReviewerId] = useState("");
  const [newReviewerMode, setNewReviewerMode] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ReviewerType>("auditor");
  const [purpose, setPurpose] = useState("");
  const [ttlMs, setTtlMs] = useState(PORTAL_SESSION_DEFAULT_TTL_MS);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewers = extractReviewers(reviewersQuery.data as ReviewerListData | undefined);

  if (!canQuickShare) {
    return null;
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("reviewer");
      setReviewerId("");
      setNewReviewerMode(false);
      setNewEmail("");
      setNewName("");
      setNewType("auditor");
      setPurpose("");
      setTtlMs(PORTAL_SESSION_DEFAULT_TTL_MS);
      setPortalUrl(null);
      setCopied(false);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleCreateReviewerAndProceed() {
    if (!newEmail.trim() || !newName.trim()) {
      setError("Email and name are required.");
      return;
    }
    setError(null);
    try {
      const reviewer = await reviewerMutations.createReviewer.mutateAsync({
        email: newEmail.trim(),
        name: newName.trim(),
        reviewerType: newType,
      });
      const id = (reviewer as { id: string }).id;
      setReviewerId(id);
      setStep("details");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleSubmit() {
    if (!purpose.trim()) {
      setError("Purpose is required.");
      return;
    }
    setError(null);
    try {
      const result = await quickShare.mutateAsync({
        reviewerId,
        purpose: purpose.trim(),
        ttlMs,
        scopeType,
        scopeId,
      });
      const data = result as { portalUrl?: string };
      setPortalUrl(data.portalUrl ?? null);
      setStep("confirm");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleCopy() {
    if (!portalUrl) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
    } catch (err) {
      setError(getErrorMessage(err));
      captureAppException(
        new Error("Quick share link copy failed"),
        {
          tags: { feature: "portal", operation: "copy_quick_share_link" },
        },
        { sanitize: true },
      );
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="flex flex-col gap-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Share with reviewer</SheetTitle>
          <SheetDescription>
            Grant read-only portal access to <strong>{entityName}</strong>.
          </SheetDescription>
        </SheetHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {(["reviewer", "details", "confirm"] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              {i > 0 ? <span>›</span> : null}
              <span
                className={step === s ? "font-semibold text-foreground" : "text-muted-foreground"}
              >
                {i + 1}. {s === "reviewer" ? "Reviewer" : s === "details" ? "Details" : "Done"}
              </span>
            </span>
          ))}
        </div>

        <Separator />

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {/* Step 1: Select or create reviewer */}
        {step === "reviewer" ? (
          <div className="flex flex-col gap-4">
            {!newReviewerMode ? (
              <>
                <div className="space-y-1.5">
                  <Label>Select reviewer</Label>
                  {reviewersQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading reviewers…</p>
                  ) : reviewers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No reviewers yet.{" "}
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-sm"
                        onClick={() => setNewReviewerMode(true)}
                      >
                        Add one
                      </Button>
                      .
                    </p>
                  ) : (
                    <Select value={reviewerId} onValueChange={setReviewerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reviewer…" />
                      </SelectTrigger>
                      <SelectContent>
                        {reviewers.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name} ({r.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-left text-sm"
                  onClick={() => {
                    setNewReviewerMode(true);
                    setError(null);
                  }}
                >
                  New reviewer
                </Button>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    disabled={!reviewerId}
                    onClick={() => {
                      setError(null);
                      setStep("details");
                    }}
                  >
                    Next
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="qs-email">Email</Label>
                    <Input
                      id="qs-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="reviewer@example.org"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="qs-name">Name</Label>
                    <Input
                      id="qs-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={newType} onValueChange={(v) => setNewType(v as ReviewerType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REVIEWER_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {humanizeEnum(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-between gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewReviewerMode(false);
                      setError(null);
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    disabled={reviewerMutations.createReviewer.isPending}
                    onClick={() => void handleCreateReviewerAndProceed()}
                  >
                    Create & continue
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Step 2: Purpose + duration */}
        {step === "details" ? (
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qs-purpose">Purpose</Label>
              <Textarea
                id="qs-purpose"
                placeholder="e.g. Year-end compliance review for federal grant"
                rows={3}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Access duration</Label>
              <Select value={String(ttlMs)} onValueChange={(v) => setTtlMs(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PORTAL_SESSION_TTL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("reviewer");
                  setError(null);
                }}
              >
                Back
              </Button>
              <Button disabled={quickShare.isPending} onClick={() => void handleSubmit()}>
                {quickShare.isPending ? "Creating…" : "Create access link"}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Step 3: Confirmation */}
        {step === "confirm" ? (
          <div className="flex flex-col gap-4">
            <Alert variant="success" title="Portal access created">
              <p className="text-sm text-muted-foreground">
                Copy the link below and send it to the reviewer. It expires in{" "}
                {PORTAL_SESSION_TTL_OPTIONS.find((o) => o.value === ttlMs)?.label ?? "30 days"}.
              </p>
            </Alert>

            <div className="space-y-1.5">
              <Label>Portal link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={portalUrl ?? ""}
                  aria-label="Portal access link"
                  className="bg-muted"
                />
                <Button variant="outline" onClick={() => void handleCopy()}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent-foreground">
              Copy the link and send it to the reviewer. No email is sent automatically.
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Badge variant="secondary" className="bg-primary/15 text-primary">
                Verified access
              </Badge>
              <span className="text-xs text-muted-foreground">
                Scoped to {humanizeEnum(scopeType)}: {entityName}
              </span>
            </div>

            <Button variant="outline" onClick={() => handleClose(false)}>
              Done
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
