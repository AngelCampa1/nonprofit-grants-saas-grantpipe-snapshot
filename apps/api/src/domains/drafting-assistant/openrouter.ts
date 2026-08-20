import { z } from "zod";
import {
  DRAFTING_ASSISTANT_DRAFT_TYPES,
  DRAFTING_ASSISTANT_MODEL_ID,
  DRAFTING_ASSISTANT_PROMPT_VERSION,
  type DraftingAssistantDraftType,
} from "@grantpipe/shared";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type DraftingAssistantProviderDraft = {
  draftTitle: string;
  draftBody: string;
  sections: Array<{ heading: string; body: string }>;
};

type GenerateDraftWithOpenRouterParams = {
  apiKey: string;
  appUrl: string;
  draftType: DraftingAssistantDraftType;
  userPrompt: string;
  sourceContext: string;
  fetch?: FetchLike;
};

const providerDraftSchema = z.object({
  draftTitle: z.string().min(1),
  draftBody: z.string().min(1),
  sections: z.array(z.object({ heading: z.string().min(1), body: z.string().min(1) })).min(1),
});

const SYSTEM_PROMPT = [
  "You draft grant proposal and report text for GrantPipe.",
  "Return only JSON that matches the schema.",
  "Use only the supplied GrantPipe source context. Do not invent facts, numbers, outcomes, names, dates, testimonials, or funder requirements.",
  "Write an editable draft for a human to review. Never imply the draft is ready to submit.",
  "If source data is missing, say what is missing inside the relevant section instead of filling the gap.",
  `Prompt version: ${DRAFTING_ASSISTANT_PROMPT_VERSION}.`,
].join("\n");

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["draftTitle", "draftBody", "sections"],
  properties: {
    draftTitle: { type: "string" },
    draftBody: { type: "string" },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
        },
      },
    },
  },
};

function parseOpenRouterPayload(payload: unknown): {
  choices?: Array<{ message?: { content?: string } }>;
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("OpenRouter returned an invalid response");
  }
  return payload as { choices?: Array<{ message?: { content?: string } }> };
}

export async function generateDraftWithOpenRouter(
  params: GenerateDraftWithOpenRouterParams,
): Promise<DraftingAssistantProviderDraft> {
  if (!(DRAFTING_ASSISTANT_DRAFT_TYPES as readonly string[]).includes(params.draftType)) {
    throw new Error("Unsupported draft type");
  }

  const fetchImpl = params.fetch ?? fetch;
  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": params.appUrl,
      "X-OpenRouter-Title": "GrantPipe",
    },
    body: JSON.stringify({
      model: DRAFTING_ASSISTANT_MODEL_ID,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Draft type: ${params.draftType}`,
            `User request: ${params.userPrompt}`,
            "GrantPipe source context:",
            params.sourceContext,
          ].join("\n\n"),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "GrantPipeProposalReportDraft",
          strict: true,
          schema: responseSchema,
        },
      },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter drafting failed with status ${response.status}`);
  }

  const payload = parseOpenRouterPayload(await response.json());
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned no draft content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenRouter returned unparseable draft JSON");
  }

  return providerDraftSchema.parse(parsed);
}
