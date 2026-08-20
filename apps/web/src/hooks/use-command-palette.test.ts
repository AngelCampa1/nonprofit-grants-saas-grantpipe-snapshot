import { act, renderHook, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCommandPalette } from "./use-command-palette";

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

import { captureEvent } from "../lib/analytics";

describe("useCommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure cleanup by unmounting hooks between tests
  });

  it("starts with open = false", () => {
    const { result } = renderHook(() => useCommandPalette());
    expect(result.current.open).toBe(false);
  });

  it("toggle flips open from false to true", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.open).toBe(true);
  });

  it("toggle flips open from true back to false", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      result.current.toggle();
    });
    act(() => {
      result.current.toggle();
    });
    expect(result.current.open).toBe(false);
  });

  it("setOpen can set to true directly", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      result.current.setOpen(true);
    });
    expect(result.current.open).toBe(true);
  });

  it("setOpen can set to false directly", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      result.current.setOpen(true);
    });
    act(() => {
      result.current.setOpen(false);
    });
    expect(result.current.open).toBe(false);
  });

  it("Ctrl+K toggles open to true", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(result.current.open).toBe(true);
    expect(captureEvent).toHaveBeenCalledWith("command_palette_opened", {
      source: "keyboard_ctrl_k",
    });
  });

  it("Cmd+K (metaKey) toggles open to true", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(result.current.open).toBe(true);
    expect(captureEvent).toHaveBeenCalledWith("command_palette_opened", {
      source: "keyboard_meta_k",
    });
  });

  it("Ctrl+K toggles open twice results in false without tracking the close as an open", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(result.current.open).toBe(false);
    expect(vi.mocked(captureEvent).mock.calls).toEqual([
      [
        "command_palette_opened",
        {
          source: "keyboard_ctrl_k",
        },
      ],
    ]);
  });

  it("other key combinations do not toggle open", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      fireEvent.keyDown(window, { key: "k" });
    });
    expect(result.current.open).toBe(false);
    act(() => {
      fireEvent.keyDown(window, { key: "j", ctrlKey: true });
    });
    expect(result.current.open).toBe(false);
  });

  it("removes the event listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useCommandPalette());
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
