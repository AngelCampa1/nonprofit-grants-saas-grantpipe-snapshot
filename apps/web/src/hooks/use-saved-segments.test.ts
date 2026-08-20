import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSavedSegments } from "./use-saved-segments";

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: vi.fn(),
}));

import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";

const STORAGE_KEY = "gp-test-segments";
const mockCaptureEvent = vi.mocked(captureEvent);
const mockCaptureAppException = vi.mocked(captureAppException);

describe("useSavedSegments", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns an empty segments array when localStorage has no entry", () => {
    const { result } = renderHook(() => useSavedSegments<{ search: string }>(STORAGE_KEY));
    expect(result.current.segments).toEqual([]);
  });

  it("saves a segment with a generated UUID and persists it to localStorage", () => {
    const { result } = renderHook(() => useSavedSegments<{ search: string }>(STORAGE_KEY));

    act(() => {
      result.current.saveSegment("Major donors", { search: "john" });
    });

    expect(result.current.segments).toHaveLength(1);
    expect(result.current.segments[0]!.name).toBe("Major donors");
    expect(result.current.segments[0]!.filters).toEqual({ search: "john" });
    expect(typeof result.current.segments[0]!.id).toBe("string");
    expect(result.current.segments[0]!.id.length).toBeGreaterThan(0);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown[];
    expect(stored).toHaveLength(1);
  });

  it("keeps the saved segment in memory and reports storage write failures", () => {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === STORAGE_KEY) {
        throw new Error("storage denied for Major donors");
      }
      return originalSetItem(key, value);
    });

    try {
      const { result } = renderHook(() => useSavedSegments<{ search: string }>(STORAGE_KEY));

      act(() => {
        result.current.saveSegment("Major donors", { search: "angel@example.com" });
      });

      expect(result.current.segments).toHaveLength(1);
      expect(mockCaptureAppException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { feature: "saved_segments", operation: "persist" },
        }),
        { includeExpected: true, sanitize: true },
      );
      const calls = JSON.stringify(mockCaptureAppException.mock.calls);
      expect(calls).not.toContain("Major donors");
      expect(calls).not.toContain("angel@example.com");
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("deleteSegment removes the correct segment by ID", () => {
    const { result } = renderHook(() => useSavedSegments<{ search: string }>(STORAGE_KEY));

    act(() => {
      result.current.saveSegment("Segment A", { search: "a" });
      result.current.saveSegment("Segment B", { search: "b" });
    });

    expect(result.current.segments).toHaveLength(2);
    const idToDelete = result.current.segments[0]!.id;

    act(() => {
      result.current.deleteSegment(idToDelete);
    });

    expect(result.current.segments).toHaveLength(1);
    expect(result.current.segments[0]!.name).toBe("Segment B");
  });

  it("deleteSegment with an unknown ID is a no-op", () => {
    const { result } = renderHook(() => useSavedSegments<{ search: string }>(STORAGE_KEY));

    act(() => {
      result.current.saveSegment("Segment A", { search: "a" });
    });

    act(() => {
      result.current.deleteSegment("nonexistent-id");
    });

    expect(result.current.segments).toHaveLength(1);
  });

  it("applySegment returns the filters for a matching ID", () => {
    const { result } = renderHook(() =>
      useSavedSegments<{ search: string; status: string }>(STORAGE_KEY),
    );

    act(() => {
      result.current.saveSegment("Active grants", { search: "stem", status: "active" });
    });

    const id = result.current.segments[0]!.id;
    const filters = result.current.applySegment(id);

    expect(filters).toEqual({ search: "stem", status: "active" });
  });

  it("applySegment returns undefined for an unknown ID", () => {
    const { result } = renderHook(() => useSavedSegments<{ search: string }>(STORAGE_KEY));

    const filters = result.current.applySegment("nonexistent-id");
    expect(filters).toBeUndefined();
  });

  it("loads previously persisted segments from localStorage on mount", () => {
    const existing = [{ id: "seg-1", name: "Saved earlier", filters: { search: "grants" } }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    const { result } = renderHook(() => useSavedSegments<{ search: string }>(STORAGE_KEY));

    expect(result.current.segments).toHaveLength(1);
    expect(result.current.segments[0]!.name).toBe("Saved earlier");
  });

  it("handles corrupt localStorage JSON gracefully and returns empty segments", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json{{");

    const { result } = renderHook(() => useSavedSegments<{ search: string }>(STORAGE_KEY));

    expect(result.current.segments).toEqual([]);
  });

  it("handles non-array localStorage JSON gracefully and returns empty segments", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ notAnArray: true }));

    const { result } = renderHook(() => useSavedSegments<{ search: string }>(STORAGE_KEY));

    expect(result.current.segments).toEqual([]);
  });

  it("isolates segments by storage key — different keys do not share state", () => {
    const { result: resultA } = renderHook(() =>
      useSavedSegments<{ search: string }>("gp-grants-test"),
    );
    const { result: resultB } = renderHook(() =>
      useSavedSegments<{ search: string }>("gp-funds-test"),
    );

    act(() => {
      resultA.current.saveSegment("Grant seg", { search: "grant" });
    });

    expect(resultA.current.segments).toHaveLength(1);
    expect(resultB.current.segments).toHaveLength(0);
  });

  it("accumulates multiple segments across successive saves", () => {
    const { result } = renderHook(() => useSavedSegments<{ search: string }>(STORAGE_KEY));

    act(() => {
      result.current.saveSegment("First", { search: "a" });
    });
    act(() => {
      result.current.saveSegment("Second", { search: "b" });
    });
    act(() => {
      result.current.saveSegment("Third", { search: "c" });
    });

    expect(result.current.segments).toHaveLength(3);
  });

  it("tracks saved view creation with privacy-safe filter metadata", () => {
    const { result } = renderHook(() =>
      useSavedSegments<{ search: string; status: string; empty: string; tags: string[] }>(
        STORAGE_KEY,
        { recordType: "grants" },
      ),
    );

    act(() => {
      result.current.saveSegment("Major donors", {
        search: "angel@example.com",
        status: "active",
        empty: "",
        tags: [],
      });
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("saved_view_created", {
      filter_count: 2,
      filter_keys: ["search", "status"],
      has_search: true,
      record_type: "grants",
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("Major donors");
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("angel@example.com");
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain(
      result.current.segments[0]!.id,
    );
  });

  it("tracks saved view application without segment names, IDs, or raw filter values", () => {
    const { result } = renderHook(() =>
      useSavedSegments<{ query: string; type: string }>(STORAGE_KEY, { recordType: "funds" }),
    );

    act(() => {
      result.current.saveSegment("Restricted funds", {
        query: "private foundation",
        type: "temporarily_restricted",
      });
    });
    mockCaptureEvent.mockClear();

    const id = result.current.segments[0]!.id;

    act(() => {
      result.current.applySegment(id);
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("saved_view_applied", {
      filter_count: 2,
      filter_keys: ["query", "type"],
      has_search: true,
      record_type: "funds",
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("Restricted funds");
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("private foundation");
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain(id);
  });

  it("tracks creation without a record type and treats primitive filter payloads as empty", () => {
    const { result } = renderHook(() => useSavedSegments<string>(STORAGE_KEY));

    act(() => {
      result.current.saveSegment("Legacy payload", "not-an-object");
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("saved_view_created", {
      filter_count: 0,
      filter_keys: [],
      has_search: false,
    });
  });

  it("counts non-empty boolean and numeric filter values as active", () => {
    const { result } = renderHook(() =>
      useSavedSegments<{ includeInactive: boolean; minimumAmountCents: number }>(STORAGE_KEY, {
        recordType: "donors",
      }),
    );

    act(() => {
      result.current.saveSegment("Donor filters", {
        includeInactive: false,
        minimumAmountCents: 0,
      });
    });

    expect(mockCaptureEvent).toHaveBeenCalledWith("saved_view_created", {
      filter_count: 2,
      filter_keys: ["includeInactive", "minimumAmountCents"],
      has_search: false,
      record_type: "donors",
    });
  });
});
