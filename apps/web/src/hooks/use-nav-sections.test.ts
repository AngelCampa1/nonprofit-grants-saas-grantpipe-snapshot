import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useNavSections } from "./use-nav-sections";
import type { NavSection } from "../config/nav";
import { LayoutDashboard, Users } from "lucide-react";

const SECTIONS: NavSection[] = [
  {
    label: "Fundraising",
    collapsible: true,
    items: [{ to: "/donors", label: "Donors", navItemId: "donors", icon: Users }],
  },
  {
    label: "Accounting",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      {
        to: "/accounting",
        label: "Overview",
        navItemId: "accounting-overview",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    // no label — not collapsible even if collapsible=true would be set
    items: [
      { to: "/dashboard", label: "Dashboard", navItemId: "dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Reports",
    items: [{ to: "/reports", label: "Reports", navItemId: "reports", icon: LayoutDashboard }],
  },
];

const STORAGE_KEY_PREFIX = "gp_nav_sections_";

describe("useNavSections", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("expands collapsible sections by default (no localStorage, defaultCollapsed not set)", () => {
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Fundraising")).toBe(false);
  });

  it("collapses sections with defaultCollapsed:true on first load when no localStorage entry exists", () => {
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Accounting")).toBe(true);
  });

  it("toggle() collapses an expanded section", () => {
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Fundraising")).toBe(false);
    act(() => {
      result.current.toggle("Fundraising");
    });
    expect(result.current.isCollapsed("Fundraising")).toBe(true);
  });

  it("toggle() expands a collapsed section", () => {
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Accounting")).toBe(true);
    act(() => {
      result.current.toggle("Accounting");
    });
    expect(result.current.isCollapsed("Accounting")).toBe(false);
  });

  it("persists collapsed state to localStorage using userId-keyed key", () => {
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-abc"));
    act(() => {
      result.current.toggle("Fundraising");
    });
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}user-abc`);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!) as Record<string, boolean>;
    expect(parsed["Fundraising"]).toBe(true);
  });

  it("reads persisted state from localStorage on mount", () => {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}user-1`,
      JSON.stringify({ Fundraising: true, Accounting: false }),
    );
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Fundraising")).toBe(true);
    expect(result.current.isCollapsed("Accounting")).toBe(false);
  });

  it("falls back to defaultCollapsed when localStorage has no entry for that section", () => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}user-1`, JSON.stringify({ Fundraising: true }));
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    // Accounting not in storage — falls back to defaultCollapsed: true
    expect(result.current.isCollapsed("Accounting")).toBe(true);
  });

  it("uses a different localStorage key per userId", () => {
    const { result: r1 } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    const { result: r2 } = renderHook(() => useNavSections(SECTIONS, "user-2"));
    act(() => {
      r1.current.toggle("Fundraising");
    });
    // user-2 should be unaffected
    expect(r2.current.isCollapsed("Fundraising")).toBe(false);
  });

  it("isCollapsed returns false for sections without a label (non-collapsible)", () => {
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    // The unlabeled section cannot be looked up by label; isCollapsed("") or undefined label → false
    expect(result.current.isCollapsed(undefined)).toBe(false);
    expect(result.current.isCollapsed("")).toBe(false);
  });

  it("does not collapse labeled sections that are not marked collapsible", () => {
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Reports")).toBe(false);
  });

  it("handles localStorage.getItem throwing gracefully (falls back to defaults)", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Accounting")).toBe(true); // falls back to defaultCollapsed
    expect(result.current.isCollapsed("Fundraising")).toBe(false); // falls back to not collapsed
    getItemSpy.mockRestore();
  });

  it("handles localStorage.setItem throwing gracefully (state still updates)", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(() => {
      act(() => {
        result.current.toggle("Fundraising");
      });
    }).not.toThrow();
    expect(result.current.isCollapsed("Fundraising")).toBe(true);
    setItemSpy.mockRestore();
  });

  it("handles corrupted localStorage JSON gracefully (falls back to defaults)", () => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}user-1`, "not-valid-json{{{");
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Accounting")).toBe(true); // defaultCollapsed
    expect(result.current.isCollapsed("Fundraising")).toBe(false); // default expanded
  });

  it("works when userId is null (uses a null-keyed fallback)", () => {
    const { result } = renderHook(() => useNavSections(SECTIONS, null));
    expect(result.current.isCollapsed("Accounting")).toBe(true);
    expect(result.current.isCollapsed("Fundraising")).toBe(false);
  });

  it("toggle persists correctly when userId is null", () => {
    const { result } = renderHook(() => useNavSections(SECTIONS, null));
    act(() => {
      result.current.toggle("Fundraising");
    });
    expect(result.current.isCollapsed("Fundraising")).toBe(true);
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}anonymous`);
    expect(stored).not.toBeNull();
  });

  it("handles localStorage value that is a JSON array (falls back to defaults)", () => {
    localStorage.setItem(`gp_nav_sections_user-1`, JSON.stringify([]));
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Accounting")).toBe(true);
    expect(result.current.isCollapsed("Fundraising")).toBe(false);
  });

  it("handles localStorage value that is JSON null (falls back to defaults)", () => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}user-1`, "null");
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Accounting")).toBe(true);
    expect(result.current.isCollapsed("Fundraising")).toBe(false);
  });

  it("ignores non-boolean stored values while preserving valid booleans", () => {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}user-1`,
      JSON.stringify({ Fundraising: "yes", Accounting: false }),
    );
    const { result } = renderHook(() => useNavSections(SECTIONS, "user-1"));
    expect(result.current.isCollapsed("Fundraising")).toBe(false);
    expect(result.current.isCollapsed("Accounting")).toBe(false);
  });
});
