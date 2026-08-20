import { describe, expect, it, vi } from "vitest";
import {
  AWARD_INTAKE_PROMPT_VERSION,
  AWARD_INTAKE_SYSTEM_PROMPT,
  extractAwardDocumentWithOpenRouter,
} from "./openrouter";

describe("AWARD_INTAKE_SYSTEM_PROMPT", () => {
  it("instructs the model to extract every budget line in a budget breakdown", () => {
    // Live probes showed the model silently dropping an itemized approved-budget
    // table because the prompt only listed budget_line as an available
    // destination without telling the model to emit one entry per category.
    expect(AWARD_INTAKE_SYSTEM_PROMPT).toMatch(/one budget_line entry per/i);
  });

  it("instructs the model to capture matching / cost-share requirements", () => {
    expect(AWARD_INTAKE_SYSTEM_PROMPT).toMatch(/match/i);
  });

  it("is pinned to the v3 prompt version", () => {
    expect(AWARD_INTAKE_PROMPT_VERSION).toBe("award-intake-v3");
  });
});

const validContent = JSON.stringify({
  documentType: "award_letter",
  fields: [
    {
      fieldKey: "grant.name",
      section: "grant_basics",
      destinationEntityType: "grant",
      destinationField: "name",
      value: "Youth STEM Award",
      confidence: 0.88,
      required: true,
      sources: [{ pageNumber: 1, snippet: "Youth STEM Award" }],
    },
  ],
});

describe("extractAwardDocumentWithOpenRouter", () => {
  it("requests strict JSON schema output with document plugins", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "req-1",
          usage: { prompt_tokens: 10, completion_tokens: 20 },
          choices: [{ message: { content: validContent } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await extractAwardDocumentWithOpenRouter({
      apiKey: "key",
      appUrl: "https://grantpipe.com",
      document: {
        filename: "award.pdf",
        mimeType: "application/pdf",
        bodyBase64: "JVBERi0x",
      },
      fetch: fetchMock,
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model: string;
      response_format: { type: string; json_schema: { strict: boolean } };
      plugins: Array<{ id: string }>;
    };
    expect(request.model).toBe("google/gemini-3.1-flash-lite");
    expect(request.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
    expect(request.plugins.map((plugin) => plugin.id)).toEqual(["file-parser", "response-healing"]);
    expect(result.providerRequestId).toBe("req-1");
    expect(result.extraction.fields[0]?.fieldKey).toBe("grant.name");
  });

  it("instructs the model to use the canonical destination vocabulary and integer cents", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: validContent } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await extractAwardDocumentWithOpenRouter({
      apiKey: "key",
      appUrl: "https://grantpipe.com",
      document: { filename: "award.pdf", mimeType: "application/pdf", bodyBase64: "JVBERi0x" },
      fetch: fetchMock,
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: unknown }>;
      response_format: {
        json_schema: {
          schema: {
            properties: {
              fields: {
                items: { properties: { destinationEntityType: { enum?: string[] } } };
              };
            };
          };
        };
      };
    };

    const promptText = request.messages
      .map((message) =>
        typeof message.content === "string" ? message.content : JSON.stringify(message.content),
      )
      .join("\n");

    // Canonical scalar grant + funder fields the commit pipeline requires.
    expect(promptText).toContain("amountCents");
    expect(promptText).toContain("startDate");
    expect(promptText).toContain("endDate");
    expect(promptText).toContain("funder");
    // Money values must be integer cents.
    expect(promptText.toLowerCase()).toContain("cents");
    // Child records carry every sub-field in one object value.
    expect(promptText).toContain("reporting_requirement");
    expect(promptText).toContain("reportType");

    // The schema constrains the destination entity type to the known enum.
    const entityEnum =
      request.response_format.json_schema.schema.properties.fields.items.properties
        .destinationEntityType.enum;
    expect(entityEnum).toContain("grant");
    expect(entityEnum).toContain("funder");
    expect(entityEnum).toContain("reporting_requirement");
  });

  it("throws sanitized errors for invalid provider JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "{bad" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      extractAwardDocumentWithOpenRouter({
        apiKey: "key",
        appUrl: "https://grantpipe.com",
        document: {
          filename: "award.pdf",
          mimeType: "application/pdf",
          bodyBase64: "JVBERi0x",
        },
        fetch: fetchMock,
      }),
    ).rejects.toThrow("OpenRouter returned unparseable extraction JSON");
  });

  it("throws when the provider request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));

    await expect(
      extractAwardDocumentWithOpenRouter({
        apiKey: "key",
        appUrl: "https://grantpipe.com",
        document: {
          filename: "award.pdf",
          mimeType: "application/pdf",
          bodyBase64: "JVBERi0x",
        },
        fetch: fetchMock,
      }),
    ).rejects.toThrow("OpenRouter extraction failed with status 429");
  });

  it("rejects invalid provider envelopes and missing content", async () => {
    const params = {
      apiKey: "key",
      appUrl: "https://grantpipe.com",
      document: {
        filename: "award.pdf",
        mimeType: "application/pdf",
        bodyBase64: "JVBERi0x",
      },
    };
    const invalidEnvelopeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(null), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const missingContentFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: {} }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      extractAwardDocumentWithOpenRouter({ ...params, fetch: invalidEnvelopeFetch }),
    ).rejects.toThrow("OpenRouter returned an invalid response");
    await expect(
      extractAwardDocumentWithOpenRouter({ ...params, fetch: missingContentFetch }),
    ).rejects.toThrow("OpenRouter returned no extraction content");
  });

  it("defaults optional provider metadata to null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: validContent } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await extractAwardDocumentWithOpenRouter({
      apiKey: "key",
      appUrl: "https://grantpipe.com",
      document: {
        filename: "award.pdf",
        mimeType: "application/pdf",
        bodyBase64: "JVBERi0x",
      },
      fetch: fetchMock,
    });

    expect(result.providerRequestId).toBeNull();
    expect(result.tokenUsage).toBeNull();
  });

  it("uses global fetch when no fetch override is provided", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: validContent } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;

    try {
      await expect(
        extractAwardDocumentWithOpenRouter({
          apiKey: "key",
          appUrl: "https://grantpipe.com",
          document: {
            filename: "award.pdf",
            mimeType: "application/pdf",
            bodyBase64: "JVBERi0x",
          },
        }),
      ).resolves.toMatchObject({ providerRequestId: null });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
