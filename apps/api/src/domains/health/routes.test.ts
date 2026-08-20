import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { healthRoutes } from "./routes";

describe("GET /health", () => {
  const app = new Hono().route("/health", healthRoutes);

  it("returns 200 with status ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
