import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Button, EmptyState, PageShell } from "@grantpipe/ui";
import { Lock } from "lucide-react";
import { AccountingSectionNav } from "../../components/shell/accounting-section-nav";
import { useOrgProfile } from "../../hooks/use-org-settings";
import { useSession } from "../../hooks/use-session";

export const Route = createFileRoute("/_authenticated/accounting")({
  component: AccountingLayout,
});

export function AccountingLayout() {
  const location = useLocation();
  const orgProfileQuery = useOrgProfile();
  const accountingEnabled = orgProfileQuery.data?.accountingEnabled ?? false;
  const { memberRole, memberPermissions } = useSession();

  // The index route (/accounting/) is the enable-accounting landing page and always renders.
  // All other sub-routes require accounting to be enabled.
  const isIndex = location.pathname === "/accounting" || location.pathname === "/accounting/";

  if (!isIndex && !orgProfileQuery.isLoading && !accountingEnabled) {
    return <DisabledAccountingRoute pathname={location.pathname} />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr] lg:gap-8">
      <AccountingSectionNav
        role={memberRole ?? undefined}
        permissions={memberPermissions}
        className="px-4 pt-4 sm:px-6 sm:pt-6 lg:sticky lg:top-6 lg:self-start lg:px-8 lg:pt-8"
      />
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

type DisabledAccountingContext = {
  title: string;
  description: string;
};

const DISABLED_ACCOUNTING_CONTEXTS: Array<{
  pattern: RegExp;
  context: DisabledAccountingContext;
}> = [
  {
    pattern: /\/accounting\/bank(?:\/|$)/,
    context: {
      title: "Banking is not available yet",
      description:
        "Enable accounting before adding bank accounts, reviewing bank activity, or reconciling cash.",
    },
  },
  {
    pattern: /\/accounting\/chart-of-accounts(?:\/|$)/,
    context: {
      title: "Chart of accounts is not available yet",
      description:
        "Enable accounting to seed the nonprofit chart of accounts and manage account structure.",
    },
  },
  {
    pattern: /\/accounting\/journal(?:\/|$)/,
    context: {
      title: "Journal entries are not available yet",
      description:
        "Enable accounting before posting, reviewing, or exporting double-entry journal activity.",
    },
  },
  {
    pattern: /\/accounting\/ledger(?:\/|$)/,
    context: {
      title: "General ledger is not available yet",
      description:
        "Enable accounting before reviewing ledger activity across your chart of accounts.",
    },
  },
  {
    pattern: /\/accounting\/periods(?:\/|$)/,
    context: {
      title: "Fiscal periods are not available yet",
      description:
        "Enable accounting before opening, closing, or reviewing fiscal accounting periods.",
    },
  },
  {
    pattern: /\/accounting\/recurring(?:\/|$)/,
    context: {
      title: "Recurring entries are not available yet",
      description:
        "Enable accounting before scheduling recurring journal entries for repeated activity.",
    },
  },
  {
    pattern: /\/accounting\/trial-balance(?:\/|$)/,
    context: {
      title: "Trial balance is not available yet",
      description: "Enable accounting before reviewing debits, credits, and account balances.",
    },
  },
  {
    pattern: /\/accounting\/reports(?:\/|$)/,
    context: {
      title: "Accounting reports are not available yet",
      description: "Enable accounting before generating financial statements and activity reports.",
    },
  },
  {
    pattern: /\/accounting\/integrations(?:\/|$)/,
    context: {
      title: "Accounting integrations are not available yet",
      description:
        "GrantPipe includes native accounting, but it does not connect to external accounting systems right now.",
    },
  },
];

function getDisabledAccountingContext(pathname: string): DisabledAccountingContext {
  return (
    DISABLED_ACCOUNTING_CONTEXTS.find(({ pattern }) => pattern.test(pathname))?.context ?? {
      title: "Accounting is not available yet",
      description: "Enable accounting before using this accounting workspace area.",
    }
  );
}

function DisabledAccountingRoute({ pathname }: { pathname: string }) {
  const context = getDisabledAccountingContext(pathname);

  return (
    <PageShell>
      <EmptyState
        icon={<Lock className="size-6" />}
        title={context.title}
        description={context.description}
        action={
          <Button asChild>
            <Link to="/accounting">Enable accounting</Link>
          </Button>
        }
        className="mt-6 border border-dashed"
      />
    </PageShell>
  );
}
