import type { QueryClient } from "@tanstack/react-query";
import type { OnboardingGoal } from "@grantpipe/shared";
import { api } from "./api-client";
import { captureAppException } from "./sentry";

export type CachedSessionContext = {
  onboardingCompleted: boolean;
  onboardingGoal?: OnboardingGoal | null;
  orgSubscription: ({ onboardingCompleted: boolean } & Record<string, unknown>) | null;
} & Record<string, unknown>;

export function markOnboardingComplete(
  context: CachedSessionContext | undefined,
  goal: OnboardingGoal | null,
): CachedSessionContext | undefined {
  if (!context) return context;

  return {
    ...context,
    onboardingCompleted: true,
    onboardingGoal: goal,
    orgSubscription: context.orgSubscription
      ? { ...context.orgSubscription, onboardingCompleted: true }
      : context.orgSubscription,
  };
}

type OnboardingCompletionSource = "sample-data" | "import" | "manual-donor";

type SessionQueryClient = Pick<QueryClient, "setQueriesData" | "invalidateQueries">;

export async function completeOnboardingActivation(
  queryClient: SessionQueryClient,
  source: OnboardingCompletionSource,
  goal: OnboardingGoal | null,
): Promise<void> {
  try {
    const res = await api.api.onboarding.complete.$post();
    if (!res.ok) {
      throw await buildOnboardingCompletionError(res);
    }

    queryClient.setQueriesData<CachedSessionContext>(
      { queryKey: ["auth-session-context"] },
      (ctx) => markOnboardingComplete(ctx, goal),
    );
    void queryClient.invalidateQueries({ queryKey: ["auth-session-context"] });
  } catch (error) {
    captureAppException(
      error,
      {
        tags: {
          source: "onboarding-completion",
          activation_source: source,
        },
      },
      { includeExpected: true, sanitize: true },
    );
    throw error;
  }
}

async function buildOnboardingCompletionError(response: Response): Promise<Error> {
  let message = "Setup did not finish. Refresh and try again.";
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      message = body.error;
    }
  } catch {
    // Keep the safe fallback message.
  }

  return Object.assign(new Error(message), { status: response.status });
}
