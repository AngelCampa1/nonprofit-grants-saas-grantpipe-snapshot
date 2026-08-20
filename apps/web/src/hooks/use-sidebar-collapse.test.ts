import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useSidebarCollapse } from "./use-sidebar-collapse";

const STORAGE_KEY = "gp-sidebar-collapsed";

describe("useSidebarCollapse", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts uncollapsed by default when localStorage is empty", () => {
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(false);
  });

  it("reads initial state true from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(true);
  });

  it("reads initial state false from localStorage when set to false", () => {
    localStorage.setItem(STORAGE_KEY, "false");
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(false);
  });

  it("toggle() flips the state from false to true", () => {
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(false);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("toggle() flips the state from true to false", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(true);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(false);
  });

  it("toggle() persists true to localStorage", () => {
    const { result } = renderHook(() => useSidebarCollapse());
    act(() => {
      result.current.toggle();
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("toggle() persists false to localStorage when toggling back", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useSidebarCollapse());
    act(() => {
      result.current.toggle();
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("toggle() handles localStorage write errors gracefully", () => {
    // Spy on the localStorage object directly (not Storage.prototype)
    const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const { result } = renderHook(() => useSidebarCollapse());
    // Should not throw and state should still update
    expect(() => {
      act(() => {
        result.current.toggle();
      });
    }).not.toThrow();
    expect(result.current.collapsed).toBe(true);
    setItemSpy.mockRestore();
  });

  it("starts uncollapsed when localStorage.getItem throws", () => {
    // Spy on the localStorage object directly (not Storage.prototype)
    const getItemSpy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(false);
    getItemSpy.mockRestore();
  });
});
