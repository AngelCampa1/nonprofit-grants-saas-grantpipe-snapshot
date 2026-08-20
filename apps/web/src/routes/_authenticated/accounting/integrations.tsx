import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageShell, TeachAndActEmptyState } from "@grantpipe/ui";
import { Cable } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounting/integrations")({
  component: AccountingIntegrationsPage,
});

export function AccountingIntegrationsPage() {
  return (
    <PageShell>
      <PageHeader variant="workbench" title="Accounting Integrations" />
      <TeachAndActEmptyState
        icon={<Cable className="size-5" />}
        heading="QuickBooks Online is not currently available"
        description="GrantPipe includes native accounting, but it does not connect to QuickBooks Online right now."
      />
    </PageShell>
  );
}
