type RestrictionAlert = {
  id: string;
  alertType: string;
  label: string;
  amountCents?: number;
};

export function RestrictionAlertList(props: { alerts: RestrictionAlert[] }) {
  if (props.alerts.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No restriction lifecycle alerts.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Restriction alerts</h3>
      <ul className="mt-3 divide-y text-sm">
        {props.alerts.map((alert) => (
          <li key={alert.id} className="flex items-center justify-between gap-3 py-2">
            <span>{alert.label}</span>
            <span className="text-muted-foreground">{alert.alertType.replaceAll("_", " ")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
