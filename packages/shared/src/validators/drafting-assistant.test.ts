import { describe, expect, it } from "vitest";
import {
  DRAFTING_ASSISTANT_MODEL_ID,
  draftingAssistantGenerateSchema,
  draftingAssistantResponseSchema,
} from "./drafting-assistant";

describe("drafting assistant validators", () => {
  it("accepts bounded grant proposal draft requests", () => {
    const parsed = draftingAssistantGenerateSchema.parse({
      grantId: "123e4567-e89b-12d3-a456-426614174000",
      draftType: "proposal_narrative",
      userPrompt: "Draft a short needs statement from the grounded grant record.",
    });

    expect(parsed).toEqual({
      grantId: "123e4567-e89b-12d3-a456-426614174000",
      draftType: "proposal_narrative",
      userPrompt: "Draft a short needs statement from the grounded grant record.",
    });
  });

  it("rejects vague or oversized draft prompts before they reach AI", () => {
    expect(() =>
      draftingAssistantGenerateSchema.parse({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "final_report",
        userPrompt: "Write",
      }),
    ).toThrow("Add a little more context");

    expect(() =>
      draftingAssistantGenerateSchema.parse({
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "final_report",
        userPrompt: "x".repeat(1_501),
      }),
    ).toThrow("Use a shorter prompt");
  });

  it("requires editable draft safeguards, citations, and model metadata in responses", () => {
    const response = draftingAssistantResponseSchema.parse({
      draftTitle: "Draft youth services report",
      draftType: "interim_report",
      draftBody: "This is a draft for human review.",
      sections: [
        {
          heading: "Progress",
          body: "The program reached 42 youth.",
        },
      ],
      citations: [
        {
          type: "grant",
          label: "Youth Services Grant",
          href: "/grants/grant-1",
          value: "Active grant",
        },
      ],
      safeguards: ["Editable draft only. A human must review, edit, and submit outside GrantPipe."],
      modelId: DRAFTING_ASSISTANT_MODEL_ID,
      promptVersion: "proposal-report-drafting-v1",
      generatedAt: "2026-06-18T12:00:00.000Z",
    });

    expect(response.safeguards[0]).toContain("human must review");
    expect(response.modelId).toBe("minimax/minimax-m2.7");
  });
});
