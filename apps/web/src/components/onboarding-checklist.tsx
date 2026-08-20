import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Alert, Button, Card, CardContent } from "@grantpipe/ui";
import {
  FOUNDER_BOOKING_URLS,
  type GuideKey,
  type GuideProgressRow,
  type OnboardingGoal,
} from "@grantpipe/shared";
import type { AppRole } from "../config/nav";
import { useGuideProgress, useGuideProgressMutation } from "../hooks/use-guide-progress";
import { useDashboardOverview, type DashboardOverview } from "../hooks/use-overview";
import { checklistOrderForGoal } from "../lib/onboarding-goal";

type ChecklistItem = {
  guideKey: GuideKey;
  title: string;
  description: string;
  to: string;
  roles: AppRole[];
};

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    guideKey: "first_setup",
    title: "Confirm organization settings",
    description:
      "Check your org name, timezone, and fiscal year. Reports depend on these settings.",
    to: "/settings",
    roles: ["admin"],
  },
  {
    guideKey: "import_contacts",
    title: "Move your first records",
    description: "Upload a CSV for donors, funds, or balances. Preview it first.",
    to: "/import",
    roles: ["admin", "editor"],
  },
  {
    guideKey: "create_grant",
    title: "Add one grant",
    description: "Add a grant. Track its deadlines, funds, and reports in one place.",
    to: "/grants",
    roles: ["admin", "editor"],
  },
  {
    guideKey: "generate_report",
    title: "Find reports",
    description: "See where PDFs and exports appear after you run them.",
    to: "/reports",
    roles: ["admin", "editor", "viewer", "auditor"],
  },
  {
    guideKey: "open_pdf_report",
    title: "Open a downloaded report",
    description: "Find where your PDF goes after download. Open it from your computer.",
    to: "/help",
    roles: ["admin", "editor", "viewer", "auditor"],
  },
];

function getProgressMap(progress: GuideProgressRow[] | undefined) {
  return new Map((progress ?? []).map((row) => [row.guideKey, row]));
}

/**
 * Real-data signals that auto-complete the data-backed checklist steps. A step
 * stays manual unless it has a rule here, so the educational steps (find/open a
 * report, confirm settings) still require an explicit "Mark done".
 */
export type ChecklistDataSignals = {
  hasContacts: boolean;
  hasGrants: boolean;
};

const NO_CHECKLIST_SIGNALS: ChecklistDataSignals = { hasContacts: false, hasGrants: false };

const DERIVED_RULES: Partial<Record<GuideKey, (signals: ChecklistDataSignals) => boolean>> = {
  import_contacts: (signals) => signals.hasContacts,
  create_grant: (signals) => signals.hasGrants,
};

/**
 * Derives the data-backed completion signals from the dashboard overview both
 * onboarding surfaces already load. Reused by the floating overlay so the inline
 * checklist and the overlay always agree on which steps are done.
 */
export function deriveChecklistSignals(
  overview: DashboardOverview | undefined,
): ChecklistDataSignals {
  if (!overview) {
    return NO_CHECKLIST_SIGNALS;
  }
  const hasContacts =
    overview.donorMetrics.newDonorCount > 0 ||
    (overview.pipelineSummary?.donors ?? []).some((donor) => donor.count > 0);
  const hasGrants =
    (overview.atRiskGrants ?? []).length > 0 ||
    (overview.upcomingDeadlines ?? []).length > 0 ||
    (overview.pipelineSummary?.grants ?? []).some((grant) => grant.count > 0);
  return { hasContacts, hasGrants };
}

function isChecklistItemComplete(
  item: ChecklistItem,
  progressByKey: Map<GuideKey, GuideProgressRow>,
  signals: ChecklistDataSignals,
): boolean {
  const status = progressByKey.get(item.guideKey)?.status;
  if (status === "completed" || status === "dismissed") {
    return true;
  }
  const rule = DERIVED_RULES[item.guideKey];
  return rule ? rule(signals) : false;
}

/**
 * Returns the checklist items still open (not completed, dismissed, or already
 * satisfied by real data) for the given role. Shared with the floating
 * onboarding overlay so the two onboarding surfaces never compete for the same
 * screen space at the same time.
 */
export function getOpenChecklistItems(
  progress: GuideProgressRow[] | undefined,
  role: AppRole | null | undefined,
  signals: ChecklistDataSignals = NO_CHECKLIST_SIGNALS,
): ChecklistItem[] {
  const progressByKey = getProgressMap(progress);
  return CHECKLIST_ITEMS.filter((item) => role && item.roles.includes(role)).filter(
    (item) => !isChecklistItemComplete(item, progressByKey, signals),
  );
}

const HANDOFF_DISMISSED_KEY = "gp:onboarding-handoff-dismissed";

function readHandoffDismissed(): boolean {
  try {
    return localStorage.getItem(HANDOFF_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeHandoffDismissed(): void {
  try {
    localStorage.setItem(HANDOFF_DISMISSED_KEY, "true");
  } catch {
    // localStorage unavailable — dismiss is in-memory only
  }
}

export function OnboardingChecklist({
  role,
  goal,
}: {
  role: AppRole | null | undefined;
  goal?: OnboardingGoal | null;
}) {
  const progressQuery = useGuideProgress();
  const overviewQuery = useDashboardOverview();
  const mutation = useGuideProgressMutation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [handoffDismissed, setHandoffDismissed] = useState<boolean>(() => readHandoffDismissed());

  const runChecklistAction = (run: (handlers: { onError: (error: unknown) => void }) => void) => {
    setActionError(null);
    run({
      onError: (error) =>
        setActionError(
          error instanceof Error ? error.message : "Unable to update your checklist progress.",
        ),
    });
  };

  const progressByKey = getProgressMap(progressQuery.data);
  const signals = deriveChecklistSignals(overviewQuery.data);
  const visibleItems = CHECKLIST_ITEMS.filter((item) => role && item.roles.includes(role));
  const rawOpenItems = getOpenChecklistItems(progressQuery.data, role, signals);

  // Goal-aware stable sort of open items
  const goalOrder = checklistOrderForGoal(goal);
  const openItems = [...rawOpenItems].sort((a, b) => {
    const ia = goalOrder.indexOf(a.guideKey);
    const ib = goalOrder.indexOf(b.guideKey);
    const safeA = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
    const safeB = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
    return safeA - safeB;
  });

  const totalCount = visibleItems.length;
  const completedCount = visibleItems.filter((item) =>
    isChecklistItemComplete(item, progressByKey, signals),
  ).length;

  // No visible items for this role (null/unknown role) — nothing to show
  if (totalCount === 0) {
    return null;
  }

  const dismissAll = () => {
    runChecklistAction((handlers) => {
      for (const item of openItems) {
        mutation.mutate(
          {
            guideKey: item.guideKey,
            data: { status: "dismissed", lastStep: "checklist" },
          },
          handlers,
        );
      }
    });
  };

  // All items done
  if (openItems.length === 0) {
    if (handoffDismissed) {
      return null;
    }

    return (
      <Card
        data-testid="onboarding-checklist-handoff"
        className="rounded-2xl border border-border bg-card py-0 shadow-sm"
      >
        <CardContent className="p-5">
          <h2 className="text-base font-semibold text-foreground">You&apos;re all set.</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You finished every setup step. Your workspace is ready.
          </p>
          <div className="mt-4">
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => {
                writeHandoffDismissed();
                setHandoffDismissed(true);
              }}
            >
              Got it
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // At least one item completed/dismissed but not all — collapse to banner
  // unless the user has manually expanded it
  const shouldShowBanner = completedCount > 0 && !isExpanded;

  if (shouldShowBanner) {
    return (
      <div
        data-testid="onboarding-checklist-banner"
        className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-sm"
      >
        <span className="text-muted-foreground">
          {completedCount} of {totalCount} steps complete
        </span>
        <Button type="button" variant="link" onClick={() => setIsExpanded(true)}>
          View checklist
        </Button>
      </div>
    );
  }

  const progressWidthPercent = Math.round((completedCount / totalCount) * 100);

  return (
    <Card
      aria-labelledby="onboarding-checklist-title"
      data-testid="onboarding-checklist"
      className="rounded-2xl border border-border bg-card py-0 shadow-sm"
    >
      <CardContent className="space-y-5 p-5">
        {actionError ? (
          <Alert variant="destructive" title="Unable to complete the action">
            <p>{actionError}</p>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 id="onboarding-checklist-title" className="text-base font-semibold text-foreground">
              Start with these steps
            </h2>
            <p className="text-sm text-muted-foreground">
              {completedCount} of {totalCount} steps complete
            </p>
            <div
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={0}
              aria-valuemax={totalCount}
              aria-valuenow={completedCount}
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressWidthPercent.toString()}%` }}
              />
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Five steps to set up your account.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={dismissAll}
              disabled={mutation.isPending}
            >
              Dismiss all
            </Button>
            <Link
              to="/help"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Help center
            </Link>
            <a
              href={FOUNDER_BOOKING_URLS.onboardingCall}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Book a setup call
            </a>
          </div>
        </div>

        <div className="divide-y divide-border rounded-2xl border border-border bg-background/50">
          {openItems.map((item, index) => (
            <article
              key={item.guideKey}
              data-slot="checklist-step"
              className="grid gap-3 p-4 sm:grid-cols-[2.5rem_1fr_auto] sm:items-start"
            >
              <span
                data-slot="checklist-step-index"
                className="font-mono text-xs font-medium text-muted-foreground"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button asChild size="sm" variant="default">
                  <Link to={item.to}>Start</Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mutation.isPending && mutation.variables?.guideKey === item.guideKey}
                  onClick={() =>
                    runChecklistAction((handlers) =>
                      mutation.mutate(
                        {
                          guideKey: item.guideKey,
                          data: { status: "completed", lastStep: "checklist" },
                        },
                        handlers,
                      ),
                    )
                  }
                >
                  Mark done
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={mutation.isPending && mutation.variables?.guideKey === item.guideKey}
                  onClick={() =>
                    runChecklistAction((handlers) =>
                      mutation.mutate(
                        {
                          guideKey: item.guideKey,
                          data: { status: "dismissed", lastStep: "checklist" },
                        },
                        handlers,
                      ),
                    )
                  }
                >
                  Dismiss
                </Button>
              </div>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
