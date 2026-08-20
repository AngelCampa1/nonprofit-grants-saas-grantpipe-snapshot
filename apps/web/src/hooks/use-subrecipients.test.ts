import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockListGet: vi.fn(),
  mockListPost: vi.fn(),
  mockDetailGet: vi.fn(),
  mockDetailPatch: vi.fn(),
  mockDetailDelete: vi.fn(),
  mockDetailSubawardPost: vi.fn(),
  mockSubawardsGet: vi.fn(),
  mockSubawardPatch: vi.fn(),
  mockRiskAssessmentPost: vi.fn(),
  mockGenerateTasksPost: vi.fn(),
  mockMonitoringLogPost: vi.fn(),
  mockSubawardFindingPost: vi.fn(),
  mockEvidenceBundlePost: vi.fn(),
  mockTaskPatch: vi.fn(),
  mockFindingPatch: vi.fn(),
  mockCorrectiveActionPost: vi.fn(),
  mockCorrectiveActionPatch: vi.fn(),
  mockCaptureEvent: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      subrecipients: {
        $get: hoisted.mockListGet,
        $post: hoisted.mockListPost,
        ":subrecipientId": {
          $get: hoisted.mockDetailGet,
          $patch: hoisted.mockDetailPatch,
          $delete: hoisted.mockDetailDelete,
          subawards: {
            $post: hoisted.mockDetailSubawardPost,
          },
        },
        subawards: {
          $get: hoisted.mockSubawardsGet,
          ":subawardId": {
            $patch: hoisted.mockSubawardPatch,
            "risk-assessments": {
              $post: hoisted.mockRiskAssessmentPost,
            },
            "monitoring-tasks": {
              generate: {
                $post: hoisted.mockGenerateTasksPost,
              },
            },
            "monitoring-logs": {
              $post: hoisted.mockMonitoringLogPost,
            },
            findings: {
              $post: hoisted.mockSubawardFindingPost,
            },
            "evidence-bundle": {
              $post: hoisted.mockEvidenceBundlePost,
            },
          },
        },
        "monitoring-tasks": {
          ":taskId": {
            $patch: hoisted.mockTaskPatch,
          },
        },
        findings: {
          ":findingId": {
            $patch: hoisted.mockFindingPatch,
            "corrective-actions": {
              $post: hoisted.mockCorrectiveActionPost,
            },
          },
        },
        "corrective-actions": {
          ":actionId": {
            $patch: hoisted.mockCorrectiveActionPatch,
          },
        },
      },
    },
  },
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => hoisted.mockCaptureEvent(...args),
}));

vi.mock("../lib/mutation-error", () => ({
  onMutationError: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: hoisted.mockInvalidateQueries,
  })),
}));

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  useSubawardMonitoringMutations,
  useSubawards,
  useSubrecipient,
  useSubrecipientMutations,
  useSubrecipientRecordMutations,
  useSubrecipients,
} from "./use-subrecipients";

type QueryConfig = {
  queryFn: () => Promise<unknown>;
  enabled?: boolean;
};

type MutationConfig<TInput> = {
  mutationFn: (input: TInput) => Promise<unknown>;
  onSuccess: (data: unknown, variables: TInput) => void;
};

function captureQuery(): QueryConfig {
  return vi.mocked(useQuery).mock.calls.at(-1)?.[0] as unknown as QueryConfig;
}

function captureMutationAt<TInput>(index: number): MutationConfig<TInput> {
  return vi.mocked(useMutation).mock.calls[index]?.[0] as unknown as MutationConfig<TInput>;
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: vi.fn().mockResolvedValue(body) };
}

function noContentResponse() {
  return { ok: true, status: 204, json: vi.fn() };
}

describe("use-subrecipients hooks", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear();
    vi.mocked(useMutation).mockClear();
    hoisted.mockInvalidateQueries.mockClear();
    hoisted.mockCaptureEvent.mockClear();
    for (const mock of [
      hoisted.mockListGet,
      hoisted.mockListPost,
      hoisted.mockDetailGet,
      hoisted.mockDetailPatch,
      hoisted.mockDetailDelete,
      hoisted.mockDetailSubawardPost,
      hoisted.mockSubawardsGet,
      hoisted.mockSubawardPatch,
      hoisted.mockRiskAssessmentPost,
      hoisted.mockGenerateTasksPost,
      hoisted.mockMonitoringLogPost,
      hoisted.mockSubawardFindingPost,
      hoisted.mockEvidenceBundlePost,
      hoisted.mockTaskPatch,
      hoisted.mockFindingPatch,
      hoisted.mockCorrectiveActionPost,
      hoisted.mockCorrectiveActionPatch,
    ]) {
      mock.mockReset();
      mock.mockResolvedValue(okResponse({ id: "ok" }));
    }
  });

  it("requests the portfolio with every filter applied", async () => {
    hoisted.mockListGet.mockResolvedValueOnce(
      okResponse({
        data: [{ id: "sub-1" }],
        total: 1,
        summary: { subrecipients: 1, overdueTasks: 2, openFindings: 3, highRisk: 1 },
      }),
    );

    const result = useSubrecipients({
      page: 2,
      pageSize: 25,
      status: "active",
      riskRating: "high",
      ownerId: "owner-1",
      grantId: "grant-1",
      search: "acme",
      overdueTasks: true,
      openFindings: true,
    });
    expect(result).toBeUndefined(); // useQuery is mocked to return undefined

    await captureQuery().queryFn();

    expect(hoisted.mockListGet).toHaveBeenCalledWith({
      query: {
        page: "2",
        pageSize: "25",
        status: "active",
        riskRating: "high",
        ownerId: "owner-1",
        grantId: "grant-1",
        search: "acme",
        overdueTasks: "true",
        openFindings: "true",
      },
    });
  });

  it("omits optional filters and respects disabled queries", async () => {
    useSubrecipients({ page: 1, pageSize: 10 }, { enabled: false });

    const config = captureQuery();
    expect(config.enabled).toBe(false);
    await config.queryFn();

    expect(hoisted.mockListGet).toHaveBeenCalledWith({
      query: { page: "1", pageSize: "10" },
    });
  });

  it("serializes false boolean filters as 'false'", async () => {
    useSubrecipients({ page: 1, pageSize: 10, overdueTasks: false, openFindings: false });

    await captureQuery().queryFn();

    expect(hoisted.mockListGet).toHaveBeenCalledWith({
      query: { page: "1", pageSize: "10", overdueTasks: "false", openFindings: "false" },
    });
  });

  it("loads a subrecipient detail and gates by id and options", async () => {
    useSubrecipient("sub-1");
    const enabledConfig = captureQuery();
    expect(enabledConfig.enabled).toBe(true);
    await enabledConfig.queryFn();
    expect(hoisted.mockDetailGet).toHaveBeenCalledWith({ param: { subrecipientId: "sub-1" } });

    useSubrecipient("   ");
    expect(captureQuery().enabled).toBe(false);

    useSubrecipient("sub-1", { enabled: false });
    expect(captureQuery().enabled).toBe(false);
  });

  it("loads subawards by grant, by subrecipient, and stays disabled with neither", async () => {
    useSubawards({ grantId: "grant-1" });
    let config = captureQuery();
    expect(config.enabled).toBe(true);
    await config.queryFn();
    expect(hoisted.mockSubawardsGet).toHaveBeenCalledWith({ query: { grantId: "grant-1" } });

    useSubawards({ subrecipientId: "sub-1" });
    config = captureQuery();
    expect(config.enabled).toBe(true);
    await config.queryFn();
    expect(hoisted.mockSubawardsGet).toHaveBeenLastCalledWith({
      query: { subrecipientId: "sub-1" },
    });

    useSubawards({});
    expect(captureQuery().enabled).toBe(false);

    useSubawards({ grantId: "grant-1" }, { enabled: false });
    expect(captureQuery().enabled).toBe(false);
  });

  it("creates a subrecipient and invalidates portfolio queries", async () => {
    useSubrecipientMutations("sub-1");

    const create = captureMutationAt<{ name: string }>(0);
    await create.mutationFn({ name: "Acme" });
    expect(hoisted.mockListPost).toHaveBeenCalledWith({ json: { name: "Acme" } });

    create.onSuccess(undefined, { name: "Acme" });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subrecipient_created");
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["subrecipients"] });
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["subawards"] });
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["subrecipient", "sub-1"],
    });
  });

  it("updates, deletes, and adds subawards for a known subrecipient", async () => {
    useSubrecipientMutations("sub-1");

    const update = captureMutationAt<{ status: string }>(1);
    await update.mutationFn({ status: "watchlist" });
    expect(hoisted.mockDetailPatch).toHaveBeenCalledWith({
      param: { subrecipientId: "sub-1" },
      json: { status: "watchlist" },
    });
    update.onSuccess(undefined, { status: "watchlist" });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subrecipient_updated", {
      status: "watchlist",
    });

    const remove = captureMutationAt<void>(2);
    hoisted.mockDetailDelete.mockResolvedValueOnce(noContentResponse());
    await remove.mutationFn(undefined);
    expect(hoisted.mockDetailDelete).toHaveBeenCalledWith({ param: { subrecipientId: "sub-1" } });
    remove.onSuccess(undefined, undefined);
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subrecipient_deleted");

    const addSubaward = captureMutationAt<{ title: string }>(3);
    await addSubaward.mutationFn({ title: "Subaward A" });
    expect(hoisted.mockDetailSubawardPost).toHaveBeenCalledWith({
      param: { subrecipientId: "sub-1" },
      json: { title: "Subaward A" },
    });
    addSubaward.onSuccess(undefined, { title: "Subaward A" });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subaward_created");
  });

  it("throws and skips subrecipient-scoped mutations when id is missing", async () => {
    useSubrecipientMutations();

    const update = captureMutationAt<{ status: string }>(1);
    await expect(update.mutationFn({ status: "active" })).rejects.toThrow(
      "Subrecipient id is required.",
    );

    const remove = captureMutationAt<void>(2);
    await expect(remove.mutationFn(undefined)).rejects.toThrow("Subrecipient id is required.");

    const addSubaward = captureMutationAt<{ title: string }>(3);
    await expect(addSubaward.mutationFn({ title: "x" })).rejects.toThrow(
      "Subrecipient id is required.",
    );

    // invalidate() should not target a specific subrecipient when id is absent.
    captureMutationAt<{ name: string }>(0).onSuccess(undefined, { name: "Acme" });
    expect(hoisted.mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["subrecipient", undefined],
    });
  });

  it("runs every subaward monitoring mutation", async () => {
    useSubawardMonitoringMutations("award-1");

    const updateSubaward = captureMutationAt<{ status: string }>(0);
    await updateSubaward.mutationFn({ status: "active" });
    expect(hoisted.mockSubawardPatch).toHaveBeenCalledWith({
      param: { subawardId: "award-1" },
      json: { status: "active" },
    });
    updateSubaward.onSuccess(undefined, { status: "active" });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subaward_updated", {
      status: "active",
    });
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["subrecipient"] });

    const riskAssessment = captureMutationAt<{
      finalRiskRating?: string;
      suggestedRiskRating: string;
    }>(1);
    await riskAssessment.mutationFn({ suggestedRiskRating: "medium", finalRiskRating: "high" });
    expect(hoisted.mockRiskAssessmentPost).toHaveBeenCalledWith({
      param: { subawardId: "award-1" },
      json: { suggestedRiskRating: "medium", finalRiskRating: "high" },
    });
    riskAssessment.onSuccess(undefined, { suggestedRiskRating: "medium", finalRiskRating: "high" });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subaward_risk_assessment_created", {
      risk_rating: "high",
    });

    riskAssessment.onSuccess(undefined, { suggestedRiskRating: "medium" });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subaward_risk_assessment_created", {
      risk_rating: "medium",
    });

    const generateTasks = captureMutationAt<{ riskRating?: string }>(2);
    await generateTasks.mutationFn({ riskRating: "high" });
    expect(hoisted.mockGenerateTasksPost).toHaveBeenCalledWith({
      param: { subawardId: "award-1" },
      json: { riskRating: "high" },
    });
    generateTasks.onSuccess(undefined, { riskRating: "high" });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subaward_monitoring_tasks_generated", {
      risk_rating: "high",
    });

    const monitoringLog = captureMutationAt<{ logType: string; title: string }>(3);
    await monitoringLog.mutationFn({ logType: "site_visit", title: "Call" });
    expect(hoisted.mockMonitoringLogPost).toHaveBeenCalledWith({
      param: { subawardId: "award-1" },
      json: { logType: "site_visit", title: "Call" },
    });
    monitoringLog.onSuccess(undefined, { logType: "site_visit", title: "Call" });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subaward_monitoring_log_created", {
      log_type: "site_visit",
    });

    const finding = captureMutationAt<{ severity: string; title: string }>(4);
    await finding.mutationFn({ severity: "high", title: "Finding" });
    expect(hoisted.mockSubawardFindingPost).toHaveBeenCalledWith({
      param: { subawardId: "award-1" },
      json: { severity: "high", title: "Finding" },
    });
    finding.onSuccess(undefined, { severity: "high", title: "Finding" });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subaward_finding_created", {
      severity: "high",
    });

    const evidenceBundle = captureMutationAt<void>(5);
    await evidenceBundle.mutationFn(undefined);
    expect(hoisted.mockEvidenceBundlePost).toHaveBeenCalledWith({
      param: { subawardId: "award-1" },
    });
    evidenceBundle.onSuccess(undefined, undefined);
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("subaward_evidence_bundle_created");
  });

  it("runs every subrecipient record mutation", async () => {
    useSubrecipientRecordMutations();

    const updateTask = captureMutationAt<{ taskId: string; data: { status: string } }>(0);
    await updateTask.mutationFn({ taskId: "task-1", data: { status: "complete" } });
    expect(hoisted.mockTaskPatch).toHaveBeenCalledWith({
      param: { taskId: "task-1" },
      json: { status: "complete" },
    });
    updateTask.onSuccess(undefined, { taskId: "task-1", data: { status: "complete" } });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("monitoring_task_updated", {
      status: "complete",
    });
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["subawards"] });

    const updateFinding = captureMutationAt<{ findingId: string; data: { status: string } }>(1);
    await updateFinding.mutationFn({
      findingId: "finding-1",
      data: { status: "open" },
    });
    expect(hoisted.mockFindingPatch).toHaveBeenCalledWith({
      param: { findingId: "finding-1" },
      json: { status: "open" },
    });
    updateFinding.onSuccess(undefined, { findingId: "finding-1", data: { status: "open" } });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("finding_updated", {
      status: "open",
    });

    const createCorrectiveAction = captureMutationAt<{
      findingId: string;
      data: { title: string };
    }>(2);
    await createCorrectiveAction.mutationFn({
      findingId: "finding-1",
      data: { title: "Remediate" },
    });
    expect(hoisted.mockCorrectiveActionPost).toHaveBeenCalledWith({
      param: { findingId: "finding-1" },
      json: { title: "Remediate" },
    });
    createCorrectiveAction.onSuccess(undefined, {
      findingId: "finding-1",
      data: { title: "Remediate" },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("corrective_action_created");

    const updateCorrectiveAction = captureMutationAt<{
      actionId: string;
      data: { status: string };
    }>(3);
    await updateCorrectiveAction.mutationFn({
      actionId: "action-1",
      data: { status: "closed" },
    });
    expect(hoisted.mockCorrectiveActionPatch).toHaveBeenCalledWith({
      param: { actionId: "action-1" },
      json: { status: "closed" },
    });
    updateCorrectiveAction.onSuccess(undefined, {
      actionId: "action-1",
      data: { status: "closed" },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("corrective_action_updated", {
      status: "closed",
    });
  });
});
