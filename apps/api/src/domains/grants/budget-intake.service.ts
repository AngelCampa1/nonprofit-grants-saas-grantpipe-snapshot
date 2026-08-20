import { AppError } from "../../lib/app-error";

type FetchLike = typeof fetch;

type ExtractedBudgetRow = {
  category: string;
  description?: string;
  approvedAmountCents: number;
  allowable: boolean;
  costType: "direct" | "indirect";
  periodLabel?: string;
  notes?: string;
  confidence?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseExtractedRows(value: unknown): ExtractedBudgetRow[] {
  if (!isRecord(value) || !Array.isArray(value.rows) || value.rows.length === 0) {
    throw new AppError(502, "Budget extraction returned invalid rows");
  }

  return value.rows.map((row) => {
    if (!isRecord(row)) {
      throw new AppError(502, "Budget extraction returned invalid rows");
    }
    const category = typeof row.category === "string" ? row.category.trim() : "";
    const approvedAmountCents = row.approvedAmountCents;
    const allowable = row.allowable;
    const costType = row.costType;
    const confidence = row.confidence;
    if (
      category.length === 0 ||
      typeof approvedAmountCents !== "number" ||
      !Number.isInteger(approvedAmountCents) ||
      approvedAmountCents < 0 ||
      typeof allowable !== "boolean" ||
      (costType !== "direct" && costType !== "indirect") ||
      (confidence !== undefined &&
        (typeof confidence !== "number" || confidence < 0 || confidence > 1))
    ) {
      throw new AppError(502, "Budget extraction returned invalid rows");
    }

    return {
      category,
      ...(typeof row.description === "string" && row.description.trim()
        ? { description: row.description.trim() }
        : {}),
      approvedAmountCents,
      allowable,
      costType,
      ...(typeof row.periodLabel === "string" && row.periodLabel.trim()
        ? { periodLabel: row.periodLabel.trim() }
        : {}),
      ...(typeof row.notes === "string" && row.notes.trim() ? { notes: row.notes.trim() } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
    };
  });
}

export async function extractBudgetRowsWithOpenRouter(params: {
  apiKey: string;
  model: string;
  documentText: string;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        {
          role: "system",
          content:
            "Extract funder-approved grant budget rows. Return only JSON matching the schema.",
        },
        {
          role: "user",
          content: params.documentText,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "grant_budget_rows",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              rows: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    category: { type: "string" },
                    description: { type: "string" },
                    approvedAmountCents: { type: "integer", minimum: 0 },
                    allowable: { type: "boolean" },
                    costType: { type: "string", enum: ["direct", "indirect"] },
                    periodLabel: { type: "string" },
                    notes: { type: "string" },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                  },
                  required: ["category", "approvedAmountCents", "allowable", "costType"],
                },
              },
            },
            required: ["rows"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new AppError(502, "Budget extraction failed");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new AppError(502, "Budget extraction returned no content");
  }

  try {
    return parseExtractedRows(JSON.parse(content) as unknown);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "Budget extraction returned invalid rows");
  }
}
