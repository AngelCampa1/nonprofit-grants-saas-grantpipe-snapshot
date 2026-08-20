type EvidenceItem = {
  id: string;
  label: string;
  linked: boolean;
};

export function RestrictionEvidenceChecklist(props: { items: EvidenceItem[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Evidence checklist</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {props.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3">
            <span>{item.label}</span>
            <span className={item.linked ? "text-success" : "text-warning"}>
              {item.linked ? "Linked" : "Missing"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
