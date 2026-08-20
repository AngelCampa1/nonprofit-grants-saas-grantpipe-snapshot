import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCompletePost = vi.fn();
const mockCaptureAppException = vi.fn();

vi.mock("./api-client", () => ({
  api: {
    api: {
      onboarding: {
        complete: {
          $post: () => mockCompletePost(),
        },
      },
    },
  },
}));

vi.mock("./sentry", () => ({
  captureAppException: (...args: unknown[]) => mockCaptureAppException(...args),
}));

import {
  completeOnboardingActivation,
  markOnboardingComplete,
  type CachedSessionContext,
} from "./onboarding-session";

const queryClient = {
  setQueriesData: vi.fn(),
  invalidateQueries: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCompletePost.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("markOnboardingComplete", () => {
  it("marks the session and nested subscription complete", () => {
    const context: CachedSessionContext = {
      onboardingCompleted: false,
      onboardingGoal: null,
      orgSubscription: {
        onboardingCompleted: false,
        planTier: "growth",
      },
      user: { id: "user-1" },
    };

    expect(markOnboardingComplete(context, "grants")).toEqual({
      onboardingCompleted: true,
      onboardingGoal: "grants",
      orgSubscription: {
        onboardingCompleted: true,
        planTier: "growth",
      },
      user: { id: "user-1" },
    });
  });

  it("preserves null subscription state", () => {
    const context: CachedSessionContext = {
      onboardingCompleted: false,
      onboardingGoal: null,
      orgSubscription: null,
    };

    expect(markOnboardingComplete(context, null)).toEqual({
      onboardingCompleted: true,
      onboardingGoal: null,
      orgSubscription: null,
    });
  });

  it("returns undefined for an empty cache slot", () => {
    expect(markOnboardingComplete(undefined, "donors")).toBeUndefined();
  });
});

describe("completeOnboardingActivation", () => {
  it("marks the cached auth context complete after a successful server completion", async () => {
    await completeOnboardingActivation(queryClient, "sample-data", "grants");

    expect(mockCompletePost).toHaveBeenCalledOnce();
    expect(queryClient.setQueriesData).toHaveBeenCalledWith(
      { queryKey: ["auth-session-context"] },
      expect.any(Function),
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["auth-session-context"],
    });
    expect(mockCaptureAppException).not.toHaveBeenCalled();
  });

  it("captures and rejects non-OK completion responses", async () => {
    mockCompletePost.mockResolvedValue(
      Response.json(
        { error: "Finish one setup action before completing onboarding." },
        {
          status: 409,
        },
      ),
    );

    await expect(
      completeOnboardingActivation(queryClient, "manual-donor", null),
    ).rejects.toMatchObject({
      message: "Finish one setup action before completing onboarding.",
      status: 409,
    });
    expect(queryClient.setQueriesData).not.toHaveBeenCalled();
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Finish one setup action before completing onboarding." }),
      {
        tags: {
          source: "onboarding-completion",
          activation_source: "manual-donor",
        },
      },
      { includeExpected: true, sanitize: true },
    );
  });

  it("uses the safe fallback when a non-OK completion response has unreadable JSON", async () => {
    mockCompletePost.mockResolvedValue(
      new Response("not-json", {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      completeOnboardingActivation(queryClient, "sample-data", "compliance"),
    ).rejects.toMatchObject({
      message: "Setup did not finish. Refresh and try again.",
      status: 500,
    });
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Setup did not finish. Refresh and try again." }),
      {
        tags: {
          source: "onboarding-completion",
          activation_source: "sample-data",
        },
      },
      { includeExpected: true, sanitize: true },
    );
  });

  it("captures and rejects thrown completion failures", async () => {
    const error = new Error("network down");
    mockCompletePost.mockRejectedValue(error);

    await expect(completeOnboardingActivation(queryClient, "import", null)).rejects.toThrow(
      "network down",
    );
    expect(mockCaptureAppException).toHaveBeenCalledWith(
      error,
      {
        tags: {
          source: "onboarding-completion",
          activation_source: "import",
        },
      },
      { includeExpected: true, sanitize: true },
    );
  });
});
