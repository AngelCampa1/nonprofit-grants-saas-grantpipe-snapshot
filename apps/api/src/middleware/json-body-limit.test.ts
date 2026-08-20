import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { jsonBodyLimit } from "./json-body-limit";

describe("jsonBodyLimit", () => {
  it("passes requests without a body", async () => {
    const app = new Hono().post("/", jsonBodyLimit(16), (c) => c.json({ ok: true }));

    const response = await app.request("/", { method: "POST" });

    expect(response.status).toBe(200);
  });

  it("replays an in-limit body for downstream JSON parsing", async () => {
    const app = new Hono().post("/", jsonBodyLimit(32), async (c) => c.json(await c.req.json()));

    const response = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });

    expect(await response.json()).toEqual({ ok: true });
  });

  it("stops reading a chunked body as soon as it exceeds the cap", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 100) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(1_024));
      },
    });
    const app = new Hono().post("/", jsonBodyLimit(2_048), async (c) =>
      c.json({ body: await c.req.text() }),
    );

    const response = await app.request(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Transfer-Encoding": "chunked" },
        body,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
    expect(pulls).toBeLessThan(100);
  });
});
