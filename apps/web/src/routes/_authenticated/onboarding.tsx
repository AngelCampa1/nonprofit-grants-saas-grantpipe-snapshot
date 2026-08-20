import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label } from "@grantpipe/ui";
import React, { useEffect, useState } from "react";
import { z } from "zod";
import { ANALYTICS_EVENTS, isSelfServePlan } from "@grantpipe/shared";
import type { OnboardingGoal } from "@grantpipe/shared";
import { api } from "../../lib/api-client";

const MessageSchema = z.object({ message: z.string().optional() });
import { captureEvent } from "../../lib/analytics";
import { ORG_TIMEZONES, type OrgTimezone } from "../../lib/timezones";
import { GoalStep } from "../../components/onboarding/goal-step";
import { ahaRouteForGoal } from "../../lib/onboarding-goal";
import { markAhaBannerPending } from "../../lib/aha-banner";
import { useSeedSampleData } from "../../hooks/use-sample-data";
import { useSession } from "../../hooks/use-session";
import { completeOnboardingActivation } from "../../lib/onboarding-session";
import { clearPendingPlan, readPendingPlan } from "../signup";
import { captureAppException } from "../../lib/sentry";

export const Route = createFileRoute("/_authenticated/onboarding")({
  validateSearch: z.object({}),
  component: OnboardingPage,
});

// New orgs start on a calendar fiscal year (January). Users change this later in
// Settings — the onboarding screen no longer asks, to keep the novice path short.
const DEFAULT_FISCAL_YEAR_START_MONTH = 1;
const DEFAULT_TIMEZONE: OrgTimezone = "America/New_York";

/**
 * Reads the browser's time zone and matches it to a supported org time zone.
 * Falls back to Eastern when the browser value is missing or unsupported, so
 * the user never has to pick from a list during onboarding.
 */
function detectTimezone(): { timezone: OrgTimezone; detected: boolean } {
  let raw: string;
  try {
    raw = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    raw = "";
  }
  const match = (ORG_TIMEZONES as readonly string[]).includes(raw);
  return { timezone: match ? (raw as OrgTimezone) : DEFAULT_TIMEZONE, detected: match };
}

const TOTAL_STEPS = 3;
const ONBOARDING_STEPS = {
  welcome: { step_number: 1, step_name: "welcome" },
  orgSetup: { step_number: 2, step_name: "org_setup" },
  getData: { step_number: 3, step_name: "get_data" },
} as const;

type OnboardingStepNumber = 1 | 2 | 3;

const ONBOARDING_STEP_BY_NUMBER = {
  1: ONBOARDING_STEPS.welcome,
  2: ONBOARDING_STEPS.orgSetup,
  3: ONBOARDING_STEPS.getData,
} satisfies Record<OnboardingStepNumber, (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS]>;

function captureOnboardingBackClicked(
  fromStepNumber: OnboardingStepNumber,
  toStepNumber: OnboardingStepNumber,
) {
  const fromStep = ONBOARDING_STEP_BY_NUMBER[fromStepNumber];
  const toStep = ONBOARDING_STEP_BY_NUMBER[toStepNumber];

  captureEvent(ANALYTICS_EVENTS.onboardingBackClicked, {
    step_number: fromStep.step_number,
    step_name: fromStep.step_name,
    to_step_number: toStep.step_number,
    to_step_name: toStep.step_name,
  });
}

function captureOnboardingStepFailed(
  step: (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS],
  failureType: "api_error" | "request_error",
) {
  captureEvent(ANALYTICS_EVENTS.onboardingStepFailed, {
    ...step,
    failure_type: failureType,
  });
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="mb-8 space-y-2">
      <p className="text-base font-medium text-muted-foreground">
        Step {step} of {TOTAL_STEPS}
      </p>
      <div className="flex gap-1.5">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors motion-reduce:transition-none ${
              i < step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Free for 1 month. No credit card.</p>
    </div>
  );
}

function StepWelcome({
  goal,
  onGoalSelect,
  onNext,
}: {
  goal: OnboardingGoal | null;
  onGoalSelect: (g: OnboardingGoal) => void;
  onNext: () => void;
}) {
  function handleNext() {
    captureEvent(ANALYTICS_EVENTS.onboardingStepCompleted, ONBOARDING_STEPS.welcome);
    captureEvent(ANALYTICS_EVENTS.onboardingStepViewed, ONBOARDING_STEPS.orgSetup);
    onNext();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold text-primary">Welcome to GrantPipe</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          What do you want to do first? Pick one. You can do the rest later.
        </p>
      </div>

      <GoalStep selected={goal} onSelect={onGoalSelect} />

      <Button onClick={handleNext} disabled={goal === null} className="h-12 w-full text-lg">
        Continue
      </Button>
    </div>
  );
}

function StepOrgSetup({
  goal,
  onNext,
  onBack,
}: {
  goal: OnboardingGoal | null;
  onNext: () => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState("");
  const [detected] = useState(detectTimezone);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Record once whether we matched the browser time zone to a supported value.
  // Privacy-safe: we send only the boolean, never the raw zone string.
  useEffect(() => {
    captureEvent(ANALYTICS_EVENTS.onboardingTimezoneAutodetected, { detected: detected.detected });
  }, [detected.detected]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const pendingPlan = readPendingPlan();
      const pendingSelfServePlan =
        pendingPlan?.planTier && isSelfServePlan(pendingPlan.planTier)
          ? {
              planTier: pendingPlan.planTier,
              billingCycle: pendingPlan.billingCycle,
            }
          : null;
      const res = await api.api.onboarding.$patch({
        json: {
          orgName,
          fiscalYearStartMonth: DEFAULT_FISCAL_YEAR_START_MONTH,
          timezone: detected.timezone,
          onboardingGoal: goal ?? undefined,
          ...(pendingSelfServePlan !== null
            ? {
                planTier: pendingSelfServePlan.planTier,
                billingCycle: pendingSelfServePlan.billingCycle,
              }
            : {}),
        },
      });

      if (!res.ok) {
        const body = MessageSchema.parse(await res.json());
        setError(body.message ?? "Setup failed. Please try again.");
        captureOnboardingStepFailed(ONBOARDING_STEPS.orgSetup, "api_error");
        captureAppException(
          new Error(`Onboarding setup failed with status ${res.status}`),
          {
            tags: {
              feature: "onboarding",
              operation: "org_setup",
              failure_type: "api_error",
              status: String(res.status),
            },
          },
          { includeExpected: true, sanitize: true },
        );
        return;
      }

      if (pendingPlan !== null) {
        clearPendingPlan();
      }
      void queryClient.invalidateQueries({ queryKey: ["org-profile"] });
      captureEvent(ANALYTICS_EVENTS.onboardingStepCompleted, ONBOARDING_STEPS.orgSetup);
      captureEvent(ANALYTICS_EVENTS.onboardingStepViewed, ONBOARDING_STEPS.getData);
      onNext();
    } catch (error) {
      setError("An unexpected error occurred. Please try again.");
      captureOnboardingStepFailed(ONBOARDING_STEPS.orgSetup, "request_error");
      captureAppException(
        error,
        {
          tags: {
            feature: "onboarding",
            operation: "org_setup",
            failure_type: "request_error",
          },
        },
        { sanitize: true },
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <h1 className="font-heading text-3xl font-bold text-primary">
        Tell us about your organization
      </h1>

      {error !== null && (
        <div
          role="alert"
          className="rounded-2xl bg-destructive/10 px-4 py-3 text-lg text-destructive"
        >
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="orgName" className="text-lg">
          Organization name
        </Label>
        <Input
          id="orgName"
          name="orgName"
          type="text"
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Acme Nonprofit Inc."
          aria-describedby="orgName-help"
          className="h-12 text-lg"
        />
        <p id="orgName-help" className="text-base leading-relaxed text-muted-foreground">
          This is the name we put on your reports. You can change it later.
        </p>
      </div>

      <p className="text-base leading-relaxed text-muted-foreground">
        We set your fiscal year and time zone for you. You can change them in Settings.
      </p>

      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" onClick={onBack} className="px-3 text-lg">
          ← Back
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || orgName.trim().length === 0}
          className="h-12 flex-1 text-lg"
        >
          {isSubmitting ? "Saving…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}

function StepGetData({
  goal,
  onBack,
  navigate,
}: {
  goal: OnboardingGoal | null;
  onBack: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const queryClient = useQueryClient();
  const { orgId } = useSession();
  const seedSampleData = useSeedSampleData();
  const [seedError, setSeedError] = useState<string | null>(null);

  async function finishOnboarding() {
    try {
      await completeOnboardingActivation(queryClient, "sample-data", goal);
      captureEvent(ANALYTICS_EVENTS.onboardingFirstActionSelected, {
        first_action: "sample_data",
      });
      return true;
    } catch {
      captureOnboardingStepFailed(ONBOARDING_STEPS.getData, "api_error");
      setSeedError("Something went wrong finishing setup. Please try again.");
      return false;
    }
  }

  async function handleSampleData() {
    setSeedError(null);
    try {
      await seedSampleData.mutateAsync();
      captureEvent(ANALYTICS_EVENTS.onboardingSampleDataChosen, { goal });
      if (!(await finishOnboarding())) return;
      // Arm the post-onboarding "aha" banner so the destination page can point at
      // the freshly seeded examples for this org and goal.
      if (orgId && goal) markAhaBannerPending(orgId, goal);
      await navigate({ to: ahaRouteForGoal(goal) });
    } catch {
      captureOnboardingStepFailed(ONBOARDING_STEPS.getData, "request_error");
      setSeedError("Something went wrong loading sample data. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold text-primary">See how it works</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          We fill your workspace with example records so you can look around. Clear them anytime and
          add your own.
        </p>
      </div>

      {seedError !== null && (
        <div
          role="alert"
          className="rounded-2xl bg-destructive/10 px-4 py-3 text-lg text-destructive"
        >
          {seedError}
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <p className="text-base leading-relaxed text-foreground">
          See what is due, what is left, and what needs proof. We fill it in with example grants,
          funds, and donors.
        </p>
        <Button
          type="button"
          onClick={() => void handleSampleData()}
          disabled={seedSampleData.isPending}
          className="h-12 w-full text-lg"
        >
          {seedSampleData.isPending ? "Loading examples…" : "Show me around"}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" onClick={onBack} className="px-3 text-lg">
          ← Back
        </Button>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<OnboardingStepNumber>(1);
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);

  useEffect(() => {
    captureEvent(ANALYTICS_EVENTS.onboardingStepViewed, ONBOARDING_STEPS.welcome);
  }, []);

  useEffect(() => {
    function handleBeforeUnload() {
      captureEvent(ANALYTICS_EVENTS.onboardingAbandoned, ONBOARDING_STEP_BY_NUMBER[step]);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [step]);

  function handleGoalSelect(g: OnboardingGoal) {
    setGoal(g);
    captureEvent(ANALYTICS_EVENTS.onboardingGoalSelected, { goal: g });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <ProgressBar step={step} />

        {step === 1 && (
          <StepWelcome goal={goal} onGoalSelect={handleGoalSelect} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <StepOrgSetup
            goal={goal}
            onNext={() => setStep(3)}
            onBack={() => {
              captureOnboardingBackClicked(2, 1);
              setStep(1);
            }}
          />
        )}
        {step === 3 && (
          <StepGetData
            goal={goal}
            onBack={() => {
              captureOnboardingBackClicked(3, 2);
              setStep(2);
            }}
            navigate={navigate}
          />
        )}
      </div>
    </div>
  );
}
