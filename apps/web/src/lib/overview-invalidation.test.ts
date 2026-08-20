import { describe, expect, it, vi } from "vitest";
import { invalidateOverview } from "./overview-invalidation";

describe("invalidateOverview", () => {
  it("invalidates the dashboard overview query key", () => {
    const queryClient = { invalidateQueries: vi.fn() };

    invalidateOverview(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["dashboard-overview"],
    });
  });
});
