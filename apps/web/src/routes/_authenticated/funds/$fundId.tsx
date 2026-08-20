import React, { useState, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { QuickShareSheet } from "../../../components/portal/QuickShareSheet";
import {
  Alert,
  Badge,
  Breadcrumb,
  InlineError,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@grantpipe/ui";
import { FUND_TYPES, type FundType } from "@grantpipe/shared";
import { z } from "zod";
import { EntityActivitySection } from "../../../components/entity-activity-section";
import { RetryButton } from "../../../components/retry-button";
import { useFund, useFundUpdateMutations } from "../../../hooks/use-grants";
import { useSession } from "../../../hooks/use-session";
import { EntityDocumentsSection } from "../../../components/entity-documents-section";
import { RestrictionLifecyclePanel } from "../../../components/restrictions/restriction-lifecycle-panel";
import { canAccessFeature } from "../../../lib/access-control";
import { formatCurrency, formatFundTypeLabel, formatThresholdLabel } from "../../../lib/format";
import { captureDetailTabViewed } from "../../../lib/record-discovery-analytics";

export const Route = createFileRoute("/_authenticated/funds/$fundId")({
  validateSearch: z.object({
    tab: z.enum(["overview", "restrictions", "activity", "documents"]).optional(),
    highlightExpenseId: z.string().optional(),
    highlightRestrictionTermId: z.string().optional(),
  }),
  component: FundDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-4 sm:p-6 lg:p-8">
      <Alert variant="destructive" title="Unable to load page">
        <p>{error instanceof Error ? error.message : "Unknown error"}</p>
      </Alert>
    </div>
  ),
  pendingComponent: () => (
    <div className="p-8 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-40" />
    </div>
  ),
});

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function FundDetailPage() {
  const { fundId } = Route.useParams();
  const { tab, highlightExpenseId, highlightRestrictionTermId } = Route.useSearch();
  const { memberRole, memberPermissions } = useSession();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "funds", "edit");
  const canDelete = canAccessFeature(memberRole, memberPermissions, "funds", "manage");
  const navigate = useNavigate();
  const fundQuery = useFund(fundId);
  const fundMutations = useFundUpdateMutations(fundId);
  const fund = fundQuery.data as Record<string, unknown> | undefined;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const loadedFundType = (fundQuery.data as Record<string, unknown> | undefined)?.type as
    | FundType
    | undefined;
  // Track only an explicit user override; otherwise mirror the loaded fund type.
  // This avoids locking a stale default when the query resolves after first render.
  const [fundTypeOverride, setFundTypeOverride] = useState<FundType | null>(null);
  const fundTypeDraft: FundType = fundTypeOverride ?? loadedFundType ?? "unrestricted";
  const previousTabRef = useRef("overview");

  if (fundQuery.isLoading && !fund) {
    return (
      <PageShell>
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-8 w-64" />
      </PageShell>
    );
  }

  if (fundQuery.isError && !fund) {
    return (
      <PageShell>
        <Alert variant="destructive" title="Unable to load fund.">
          <RetryButton query={fundQuery} />
        </Alert>
      </PageShell>
    );
  }

  if (!fund) {
    return (
      <PageShell>
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-8 w-64" />
      </PageShell>
    );
  }

  const allocations = (fund.grantAllocations ?? []) as Array<{
    id: string;
    grant?: { name?: string };
    allocatedAmountCents?: number;
  }>;
  const expenses = (fund.expenses ?? []) as Array<{
    id: string;
    description?: string | null;
    amountCents?: number;
  }>;
  const summary = (fund.summary ?? {}) as {
    allocatedTotalCents?: number;
    expenseTotalCents?: number;
    currentBalanceCents?: number;
    thresholdState?: string;
  };

  const fundName = String(fund.name ?? "Fund");
  const fundType = String(fund.type ?? "unrestricted");

  return (
    <PageShell>
      {fundQuery.isError ? (
        <Alert variant="destructive" title="Fund data may be stale.">
          Unable to refresh the fund data. You are seeing the last saved version.
        </Alert>
      ) : null}

      <PageHeader
        variant="workbench"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/funds">Funds</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{fundName}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={fundName}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{formatFundTypeLabel(fundType)}</Badge>
            {summary.thresholdState ? (
              <Badge variant="outline">{formatThresholdLabel(summary.thresholdState)}</Badge>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              Share
            </Button>
          </div>
        }
      />

      <section aria-label="Fund balance summary" className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Allocated</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(summary.allocatedTotalCents)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spent</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(summary.expenseTotalCents)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Balance</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(summary.currentBalanceCents)}
          </CardContent>
        </Card>
      </section>

      <Tabs
        defaultValue={tab ?? "overview"}
        className="flex flex-col gap-6"
        onValueChange={(value) => {
          captureDetailTabViewed("funds", value, previousTabRef.current);
          previousTabRef.current = value;
        }}
      >
        <TabsList variant="record">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="restrictions">Restrictions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* ----- Overview Tab ----- */}
        <TabsContent value="overview" className="space-y-6 pt-4">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Fund details</h2>
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setSaveError(null);
                const form = new FormData(event.currentTarget);
                const nextName = String(form.get("name") ?? "").trim();
                const currentName = String(fund.name ?? "");
                const currentType = String(fund.type ?? "unrestricted");
                try {
                  await fundMutations.updateFund.mutateAsync({
                    ...(nextName && nextName !== currentName ? { name: nextName } : {}),
                    ...(fundTypeDraft !== currentType ? { type: fundTypeDraft } : {}),
                    description: nullableText(String(form.get("description") ?? "")),
                  });
                  setSaveError(null);
                } catch (error) {
                  setSaveError(error instanceof Error ? error.message : "Unable to save fund.");
                }
              }}
            >
              {saveError ? <InlineError className="w-full">{saveError}</InlineError> : null}
              <div className="space-y-1">
                <Label htmlFor="fund-name">Name</Label>
                <Input
                  id="fund-name"
                  name="name"
                  defaultValue={String(fund.name ?? "")}
                  className="max-w-md"
                  required
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="fund-type">Type</Label>
                <Select
                  value={fundTypeDraft}
                  onValueChange={(value) => setFundTypeOverride(value as FundType)}
                  disabled={!canEdit}
                >
                  <SelectTrigger id="fund-type" aria-label="Type" className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUND_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {formatFundTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="fund-description">Description</Label>
                <Textarea
                  id="fund-description"
                  name="description"
                  placeholder="Describe the purpose and restrictions of this fund."
                  defaultValue={String(fund.description ?? "")}
                  rows={3}
                  className="max-w-xl"
                />
              </div>
              {canEdit ? (
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={fundMutations.updateFund.isPending}>
                    Save changes
                  </Button>
                </div>
              ) : null}
              {canDelete ? (
                <div className="flex items-center gap-2">
                  <Dialog
                    open={deleteOpen}
                    onOpenChange={(nextOpen) => {
                      setDeleteOpen(nextOpen);
                      if (!nextOpen) setDeleteError(null);
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline">
                        Delete fund
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete fund?</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete <strong>{fundName}</strong>? This action
                          cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      {deleteError ? (
                        <InlineError className="mt-2">{deleteError}</InlineError>
                      ) : null}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDeleteOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={fundMutations.deleteFund.isPending}
                          onClick={async () => {
                            try {
                              await fundMutations.deleteFund.mutateAsync();
                              void navigate({ to: "/funds" });
                            } catch (error) {
                              setDeleteError(
                                error instanceof Error ? error.message : "Unable to delete fund.",
                              );
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              ) : null}
            </form>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Source allocations</h2>
              <div className="space-y-2">
                {allocations.map((allocation) => (
                  <div key={allocation.id} className="flex items-center justify-between text-sm">
                    <span>{allocation.grant?.name ?? "Grant allocation"}</span>
                    <span>{formatCurrency(allocation.allocatedAmountCents)}</span>
                  </div>
                ))}
                {allocations.length === 0 && (
                  <p className="text-sm text-muted-foreground">No allocations recorded.</p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Expense ledger</h2>
              <div className="space-y-2">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    data-testid={`fund-expense-${expense.id}`}
                    data-highlighted={expense.id === highlightExpenseId ? "true" : undefined}
                    className={`flex items-center justify-between rounded-lg text-sm ${
                      expense.id === highlightExpenseId ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <span>{expense.description ?? "Expense"}</span>
                    <span>{formatCurrency(expense.amountCents)}</span>
                  </div>
                ))}
                {expenses.length === 0 && (
                  <p className="text-sm text-muted-foreground">No expenses posted to this fund.</p>
                )}
              </div>
            </section>
          </div>
        </TabsContent>

        {/* ----- Restrictions Tab ----- */}
        <TabsContent value="restrictions" className="pt-4">
          <RestrictionLifecyclePanel fundId={fundId} highlightTermId={highlightRestrictionTermId} />
        </TabsContent>

        {/* ----- Activity Tab ----- */}
        <TabsContent value="activity" className="pt-4">
          <EntityActivitySection entityType="fund" entityId={fundId} />
        </TabsContent>

        {/* ----- Documents Tab ----- */}
        <TabsContent value="documents" className="pt-4">
          <EntityDocumentsSection entityType="fund" entityId={fundId} />
        </TabsContent>
      </Tabs>

      <QuickShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        scopeType="fund"
        scopeId={fundId}
        entityName={(fund?.name as string | undefined) ?? "Fund"}
      />
    </PageShell>
  );
}
