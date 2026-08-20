import { describe, expect, it, vi } from "vitest";
import { generateDraftWithOpenRouter } from "./openrouter";

describe("generateDraftWithOpenRouter", () => {
  it("uses MiniMax M2.7 with strict JSON output and source-grounding instructions", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                draftTitle: "Draft report",
                draftBody: "Draft text.",
                sections: [{ heading: "Progress", body: "Draft text." }],
              }),
            },
          },
        ],
      }),
    );

    const draft = await generateDraftWithOpenRouter({
      apiKey: "key",
      appUrl: "https://app.grantpipe.com",
      draftType: "final_report",
      userPrompt: "Draft a final report.",
      sourceContext: "Grant: Youth Services Grant\nMetric: Youth served",
      fetch: fetchImpl,
    });

    expect(draft.sections).toHaveLength(1);
    const requestInit = fetchImpl.mock.calls[0]?.[1];
    const request = JSON.parse(String(requestInit?.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format: { type: string; json_schema: { strict: boolean } };
    };
    expect(request.model).toBe("minimax/minimax-m2.7");
    expect(request.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
    expect(request.messages[0]?.content).toContain("Do not invent facts");
    expect(request.messages[0]?.content).toContain("Never imply the draft is ready to submit");
    expect(request.messages[1]?.content).toContain("Youth Services Grant");
  });

  it("uses global fetch when no fetch implementation is provided", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                draftTitle: "Draft report",
                draftBody: "Draft text.",
                sections: [{ heading: "Progress", body: "Draft text." }],
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    await generateDraftWithOpenRouter({
      apiKey: "key",
      appUrl: "https://app.grantpipe.com",
      draftType: "interim_report",
      userPrompt: "Draft an interim report.",
      sourceContext: "Grant context",
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("fails closed for unsuccessful, empty, malformed, or schema-invalid responses", async () => {
    await expect(
      generateDraftWithOpenRouter({
        apiKey: "key",
        appUrl: "https://app.grantpipe.com",
        draftType: "bad_type" as never,
        userPrompt: "Draft a proposal.",
        sourceContext: "Grant context",
        fetch: vi.fn(async () => Response.json({})),
      }),
    ).rejects.toThrow("Unsupported draft type");

    await expect(
      generateDraftWithOpenRouter({
        apiKey: "key",
        appUrl: "https://app.grantpipe.com",
        draftType: "proposal_narrative",
        userPrompt: "Draft a proposal.",
        sourceContext: "Grant context",
        fetch: vi.fn(async () => new Response("{}", { status: 429 })),
      }),
    ).rejects.toThrow("OpenRouter drafting failed with status 429");

    await expect(
      generateDraftWithOpenRouter({
        apiKey: "key",
        appUrl: "https://app.grantpipe.com",
        draftType: "proposal_narrative",
        userPrompt: "Draft a proposal.",
        sourceContext: "Grant context",
        fetch: vi.fn(async () => Response.json(null)),
      }),
    ).rejects.toThrow("OpenRouter returned an invalid response");

    await expect(
      generateDraftWithOpenRouter({
        apiKey: "key",
        appUrl: "https://app.grantpipe.com",
        draftType: "proposal_narrative",
        userPrompt: "Draft a proposal.",
        sourceContext: "Grant context",
        fetch: vi.fn(async () => Response.json({ choices: [] })),
      }),
    ).rejects.toThrow("OpenRouter returned no draft content");

    await expect(
      generateDraftWithOpenRouter({
        apiKey: "key",
        appUrl: "https://app.grantpipe.com",
        draftType: "proposal_narrative",
        userPrompt: "Draft a proposal.",
        sourceContext: "Grant context",
        fetch: vi.fn(async () =>
          Response.json({ choices: [{ message: { content: "not-json" } }] }),
        ),
      }),
    ).rejects.toThrow("OpenRouter returned unparseable draft JSON");

    await expect(
      generateDraftWithOpenRouter({
        apiKey: "key",
        appUrl: "https://app.grantpipe.com",
        draftType: "proposal_narrative",
        userPrompt: "Draft a proposal.",
        sourceContext: "Grant context",
        fetch: vi.fn(async () =>
          Response.json({
            choices: [{ message: { content: JSON.stringify({ draftTitle: "Missing body" }) } }],
          }),
        ),
      }),
    ).rejects.toThrow();
  });
});
