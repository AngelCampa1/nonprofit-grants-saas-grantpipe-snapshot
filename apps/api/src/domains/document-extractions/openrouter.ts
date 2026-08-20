import { documentExtractionProviderResponseSchema } from "@grantpipe/shared";
import type { DocumentExtractionProviderResponse } from "@grantpipe/shared";

// Pinned to the stable Gemini Flash Lite id (not the -preview alias) so the
// paid award-intake feature does not break when the preview channel rotates or
// is retired. Matches the stable id already used by grants/budget.routes.ts.
// Verified live: the stable model returns a valid strict-schema extraction with
// the file-parser plugin against a real award letter.
export const AWARD_INTAKE_MODEL_ID = "google/gemini-3.1-flash-lite";
export const AWARD_INTAKE_PROMPT_VERSION = "award-intake-v3";

/**
 * The extraction is only useful if its destination vocabulary matches what the
 * commit pipeline (`service.ts`) consumes. The model must emit canonical
 * destinationEntityType/destinationField pairs, scalar values for grant and
 * funder basics, and a single object value carrying every sub-field for child
 * records (a reporting requirement needs both reportType and dueDate together).
 * Money is integer cents; dates are ISO 8601.
 */
export const AWARD_INTAKE_SYSTEM_PROMPT = [
  "Extract grant award setup facts from the attached award letter, notice of award, or grant agreement.",
  "Return only JSON that matches the schema. Include at least one source snippet for every field.",
  "",
  "Use this exact destination vocabulary. Set destinationEntityType and destinationField to these canonical names so the data maps into GrantPipe records. Do not invent other names.",
  "",
  "Scalar fields (value is a single string, number, or date):",
  "- funder.name: the funding organization name.",
  "- grant.name: the grant or project title.",
  "- grant.amountCents: total award amount, as an integer number of cents.",
  "- grant.startDate: project period start, ISO 8601 date (YYYY-MM-DD).",
  "- grant.endDate: project period end, ISO 8601 date (YYYY-MM-DD).",
  "",
  "Object-record fields (value is a JSON object holding every listed sub-field together in one field entry):",
  "- funder_contact: { name, title, email, phone, notes }.",
  "- reporting_requirement: { reportType, dueDate, notes }. Always include both reportType and dueDate.",
  "- restriction_term: { title, purposeStatement, restrictionType, releaseRule, startDate, endDate, evidenceRequirement }.",
  "- closeout_item: { label, dueDate }.",
  "- budget_line: { category, approvedAmountCents, description, costType }.",
  "- allocation: { fundName, allocatedAmountCents, fundType, description }.",
  "",
  "Rules:",
  "- Always include funder.name and grant.name when the document states them.",
  "- Money fields (amountCents, approvedAmountCents, allocatedAmountCents) MUST be integers in cents. $250,000.00 becomes 25000000.",
  "- Date fields (startDate, endDate, dueDate) MUST be ISO 8601 dates, for example 2026-01-01.",
  "- Put report deadlines under reporting_requirement, not under grant.",
  "- Emit one reporting_requirement entry per required report, each with its own reportType and dueDate.",
  "- When the document itemizes an approved budget, emit one budget_line entry per category (for example Personnel, Supplies, Evaluation, Indirect costs), each with its own approvedAmountCents. Do not collapse the breakdown into a single line or skip it.",
  "- Capture any matching, cost-share, or in-kind requirement as a restriction_term with restrictionType matching and a purposeStatement describing the required match ratio or amount.",
].join("\n");

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ExtractAwardDocumentParams = {
  apiKey: string;
  appUrl: string;
  document: {
    filename: string;
    mimeType: string;
    bodyBase64: string;
  };
  fetch?: FetchLike;
};

type OpenRouterResponse = {
  id?: string;
  usage?: unknown;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export type OpenRouterExtractionResult = {
  providerRequestId: string | null;
  tokenUsage: unknown;
  extraction: DocumentExtractionProviderResponse;
};

const awardExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["documentType", "fields"],
  properties: {
    documentType: {
      type: "string",
      enum: ["award_letter", "notice_of_award", "grant_agreement", "other"],
    },
    fields: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "fieldKey",
          "section",
          "destinationEntityType",
          "destinationField",
          "value",
          "confidence",
          "required",
          "sources",
        ],
        properties: {
          fieldKey: { type: "string" },
          section: {
            type: "string",
            enum: [
              "funder",
              "contacts",
              "grant_basics",
              "budget",
              "reporting",
              "restrictions",
              "special_conditions",
              "matching",
              "closeout",
              "evidence",
            ],
          },
          destinationEntityType: {
            type: "string",
            enum: [
              "funder",
              "funder_contact",
              "grant",
              "fund",
              "allocation",
              "budget_line",
              "reporting_requirement",
              "restriction_term",
              "closeout_item",
              "document",
            ],
          },
          destinationField: { type: "string" },
          value: {},
          normalizedValue: {},
          confidence: { type: "number", minimum: 0, maximum: 1 },
          required: { type: "boolean" },
          sources: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["snippet"],
              properties: {
                pageNumber: { type: "integer", minimum: 1 },
                snippet: { type: "string" },
                boundingBox: { type: "object" },
                sourceOffsetStart: { type: "integer", minimum: 0 },
                sourceOffsetEnd: { type: "integer", minimum: 0 },
              },
            },
          },
        },
      },
    },
    duplicateCandidates: {
      type: "object",
      additionalProperties: false,
      properties: {
        funders: { type: "array", items: { $ref: "#/$defs/duplicateCandidate" } },
        grants: { type: "array", items: { $ref: "#/$defs/duplicateCandidate" } },
      },
    },
  },
  $defs: {
    duplicateCandidate: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "confidence"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
  },
};

function parseOpenRouterResponse(payload: unknown): OpenRouterResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("OpenRouter returned an invalid response");
  }
  return payload as OpenRouterResponse;
}

export async function extractAwardDocumentWithOpenRouter(
  params: ExtractAwardDocumentParams,
): Promise<OpenRouterExtractionResult> {
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
      model: AWARD_INTAKE_MODEL_ID,
      messages: [
        {
          role: "system",
          content: AWARD_INTAKE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract award setup data from ${params.document.filename}.`,
            },
            {
              type: "file",
              file: {
                filename: params.document.filename,
                file_data: `data:${params.document.mimeType};base64,${params.document.bodyBase64}`,
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "GrantPipeAwardDocumentIntake",
          strict: true,
          schema: awardExtractionJsonSchema,
        },
      },
      plugins: [{ id: "file-parser" }, { id: "response-healing" }],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter extraction failed with status ${response.status}`);
  }

  const payload = parseOpenRouterResponse(await response.json());
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned no extraction content");
  }

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(content);
  } catch {
    throw new Error("OpenRouter returned unparseable extraction JSON");
  }

  const extraction = documentExtractionProviderResponseSchema.parse(parsedContent);
  return {
    providerRequestId: payload.id ?? null,
    tokenUsage: payload.usage ?? null,
    extraction,
  };
}
