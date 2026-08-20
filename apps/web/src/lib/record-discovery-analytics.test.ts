import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./analytics", () => ({
  captureEvent: vi.fn(),
}));

import { captureEvent } from "./analytics";
import {
  captureDetailTabViewed,
  captureDonorExportCompleted,
  captureRecordFilterChanged,
  captureRecordViewChanged,
} from "./record-discovery-analytics";

const mockCaptureEvent = vi.mocked(captureEvent);

describe("record discovery analytics", () => {
  beforeEach(() => {
    mockCaptureEvent.mockClear();
  });

  it("tracks filter changes with keys only, not raw filter values", () => {
    captureRecordFilterChanged("donors", "search", {
      search: "alice@example.com",
      pipelineStage: "donor",
      tagId: "tag-private-id",
      type: "",
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("record_filter_changed", {
      changed_filter_key: "search",
      filter_count: 3,
      filter_keys: ["pipelineStage", "search", "tagId"],
      has_search: true,
      record_type: "donors",
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("alice@example.com");
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("tag-private-id");
  });

  it("tracks view changes with safe view names only", () => {
    captureRecordViewChanged("funds", "cards", "ledger");

    expect(mockCaptureEvent).toHaveBeenCalledWith("record_view_changed", {
      from_view: "ledger",
      record_type: "funds",
      to_view: "cards",
    });
  });

  it("tracks donor exports with filter metadata only", () => {
    captureDonorExportCompleted({
      search: "major donor",
      pipelineStage: "",
      tagId: "tag-private-id",
      type: "individual",
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("donor_export_completed", {
      export_format: "csv",
      filter_count: 3,
      filter_keys: ["search", "tagId", "type"],
      has_search: true,
      record_type: "donors",
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("major donor");
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("tag-private-id");
  });

  it("tracks detail tab navigation for extended record types and skips no-op changes", () => {
    captureDetailTabViewed("funders", "grants", "overview");
    captureDetailTabViewed("payments", "overview", "overview");

    expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
    expect(mockCaptureEvent).toHaveBeenCalledWith("detail_tab_viewed", {
      from_tab: "overview",
      record_type: "funders",
      to_tab: "grants",
    });
  });

  it("tracks filter changes for the extended list-page record types", () => {
    captureRecordFilterChanged("subrecipients", "search", { search: "acme" });

    expect(mockCaptureEvent).toHaveBeenCalledWith("record_filter_changed", {
      changed_filter_key: "search",
      filter_count: 1,
      filter_keys: ["search"],
      has_search: true,
      record_type: "subrecipients",
    });
  });

  it("handles nullish, array, numeric, boolean, and unchanged-view edge cases", () => {
    captureRecordFilterChanged("grants", "threshold", {
      emptyArray: [],
      includeClosed: false,
      minimumScore: 0,
      missing: null,
      threshold: ["80"],
      undefinedValue: undefined,
    });
    captureRecordViewChanged("grants", "portfolio", "portfolio");

    expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
    expect(mockCaptureEvent).toHaveBeenCalledWith("record_filter_changed", {
      changed_filter_key: "threshold",
      filter_count: 3,
      filter_keys: ["includeClosed", "minimumScore", "threshold"],
      has_search: false,
      record_type: "grants",
    });
  });
});
