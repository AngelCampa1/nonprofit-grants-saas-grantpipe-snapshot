import React from "react";
import {
  Alert,
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
} from "@grantpipe/ui";
import { type CreateRestrictionTermInput } from "@grantpipe/shared";
import { useSession } from "../../hooks/use-session";
import { canAccessFeature } from "../../lib/access-control";
import { formatCurrency } from "../../lib/format";
import {
  useCreateRestrictionTerm,
  useRestrictionAlerts,
  useRestrictionTerms,
} from "../../hooks/use-restrictions";
import { RestrictionAlertList } from "./restriction-alert-list";
import { RestrictionBalanceCard } from "./restriction-balance-card";
import { RestrictionTermForm } from "./restriction-term-form";

type RestrictionTermRow = {
  id: string;
  title: string;
  restrictionType: string;
  purposeStatement?: string | null;
  beginningBalanceCents?: number;
  additionsCents?: number;
  releasesCents?: number;
  endingBalanceCents?: number;
};

type RestrictionAlertRow = {
  id: string;
  alertType: string;
  label: string;
  amountCents?: number;
};

function sumTermBalances(terms: RestrictionTermRow[]) {
  return terms.reduce((total, term) => total + (term.beginningBalanceCents ?? 0), 0);
}

export function RestrictionLifecyclePanel(props: {
  fundId?: string;
  grantId?: string;
  title?: string;
  highlightTermId?: string;
}) {
  const { memberRole, memberPermissions } = useSession();
  const permissionFeature = props.grantId ? "grants" : "funds";
  const canEdit = canAccessFeature(memberRole, memberPermissions, permissionFeature, "edit");
  const [termOpen, setTermOpen] = React.useState(false);
  const [termError, setTermError] = React.useState<string | null>(null);
  const termsQuery = useRestrictionTerms(
    {
      page: 1,
      pageSize: 50,
      ...(props.fundId ? { fundId: props.fundId } : {}),
      ...(props.grantId ? { grantId: props.grantId } : {}),
    },
    { enabled: true },
  );
  const alertsQuery = useRestrictionAlerts(
    {
      ...(props.fundId ? { fundId: props.fundId } : {}),
      ...(props.grantId ? { grantId: props.grantId } : {}),
    },
    { enabled: true },
  );
  const createTerm = useCreateRestrictionTerm();

  const terms = ((termsQuery.data as { data?: RestrictionTermRow[] } | undefined)?.data ??
    []) as RestrictionTermRow[];
  const alerts = ((alertsQuery.data as { data?: RestrictionAlertRow[] } | undefined)?.data ??
    []) as RestrictionAlertRow[];
  const beginningBalanceCents = sumTermBalances(terms);
  const additionsCents = terms.reduce((total, term) => total + (term.additionsCents ?? 0), 0);
  const releasesCents = terms.reduce((total, term) => total + (term.releasesCents ?? 0), 0);
  const endingBalanceCents = terms.reduce(
    (total, term) => total + (term.endingBalanceCents ?? term.beginningBalanceCents ?? 0),
    0,
  );

  async function handleCreateTerm(data: CreateRestrictionTermInput) {
    try {
      await createTerm.mutateAsync({
        ...data,
        ...(props.fundId ? { fundId: props.fundId } : {}),
        ...(props.grantId ? { grantId: props.grantId } : {}),
      });
      setTermError(null);
      setTermOpen(false);
    } catch (error) {
      setTermError(error instanceof Error ? error.message : "Unable to save restriction term.");
    }
  }

  return (
    <section className="space-y-4" aria-label={props.title ?? "Restriction lifecycle"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {props.title ?? "Restriction lifecycle"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Track donor or board restriction terms, balances, releases, and evidence.
          </p>
        </div>
        {canEdit ? (
          <Dialog open={termOpen} onOpenChange={setTermOpen}>
            <DialogTrigger asChild>
              <Button type="button">Add restriction term</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add restriction term</DialogTitle>
                <DialogDescription>
                  Define the purpose, time limit, and opening restricted balance.
                </DialogDescription>
              </DialogHeader>
              {termOpen ? (
                <>
                  <RestrictionTermForm
                    defaultFundId={props.fundId}
                    defaultGrantId={props.grantId}
                    onSubmit={handleCreateTerm}
                  />
                  {termError ? (
                    <Alert variant="destructive" title="Unable to save restriction term.">
                      {termError}
                    </Alert>
                  ) : null}
                </>
              ) : null}
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {termsQuery.isError ? (
        <Alert variant="destructive" title="Unable to load restriction terms." />
      ) : null}
      <RestrictionBalanceCard
        beginningBalanceCents={beginningBalanceCents}
        additionsCents={additionsCents}
        releasesCents={releasesCents}
        endingBalanceCents={endingBalanceCents}
      />
      <RestrictionAlertList alerts={alerts} />
      <div className="grid gap-3 lg:grid-cols-2">
        {terms.map((term) => (
          <Card
            key={term.id}
            data-testid={`restriction-term-${term.id}`}
            data-highlighted={term.id === props.highlightTermId ? "true" : undefined}
            className={term.id === props.highlightTermId ? "ring-2 ring-primary" : undefined}
          >
            <CardHeader>
              <CardTitle className="text-base">{term.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="capitalize text-muted-foreground">
                {term.restrictionType.replaceAll("_", " ")}
              </p>
              <p>{term.purposeStatement ?? "No purpose statement recorded."}</p>
              <p className="font-medium">
                Opening balance {formatCurrency(term.beginningBalanceCents ?? 0)}
              </p>
            </CardContent>
          </Card>
        ))}
        {!termsQuery.isPending && terms.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No restriction terms recorded yet.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
