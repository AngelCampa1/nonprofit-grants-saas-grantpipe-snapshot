import { formatCurrencyCents } from "@grantpipe/shared";

type RestrictionBalanceCardProps = {
  beginningBalanceCents: number;
  additionsCents: number;
  releasesCents: number;
  endingBalanceCents: number;
};

// Compliance software shows exact amounts. The shared formatter keeps cents when
// a balance has a remainder, so a $1,234.56 restriction never reads as $1,235.
function dollars(cents: number) {
  return formatCurrencyCents(cents);
}

export function RestrictionBalanceCard(props: RestrictionBalanceCardProps) {
  const isAtRisk = props.endingBalanceCents < 0;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Restricted balance</h3>
        <span
          className={
            isAtRisk ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {isAtRisk ? "At risk" : "Current"}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Beginning</dt>
          <dd className="font-medium">{dollars(props.beginningBalanceCents)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Additions</dt>
          <dd className="font-medium">{dollars(props.additionsCents)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Releases</dt>
          <dd className="font-medium">{dollars(props.releasesCents)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ending</dt>
          <dd className="font-medium">{dollars(props.endingBalanceCents)}</dd>
        </div>
      </dl>
    </section>
  );
}
