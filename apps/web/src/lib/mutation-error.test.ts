import { describe, it, expect, vi } from "vitest";

const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError },
}));

import { onMutationError } from "./mutation-error";

describe("onMutationError", () => {
  it("calls toast.error with the error message when given an Error", () => {
    onMutationError(new Error("something broke"));
    expect(mockToastError).toHaveBeenCalledWith("something broke");
  });

  it("calls toast.error with fallback message when given a non-Error", () => {
    onMutationError("raw string");
    expect(mockToastError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });

  it("calls toast.error with fallback message when given null", () => {
    onMutationError(null);
    expect(mockToastError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });

  it("calls toast.error with fallback message when given undefined", () => {
    onMutationError(undefined);
    expect(mockToastError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });

  it("calls toast.error with fallback message when given an object", () => {
    onMutationError({ code: 500 });
    expect(mockToastError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });
});
