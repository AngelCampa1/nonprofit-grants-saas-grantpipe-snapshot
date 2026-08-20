import { describe, expect, it, vi } from "vitest";
import { extractBudgetRowsWithOpenRouter } from "./budget-intake.service";

describe("grant budget intake service", () => {
  it("extracts structured candidate rows with OpenRouter and Gemini", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                rows: [
                  {
                    category: "Personnel",
                    approvedAmountCents: 100000,
                    allowable: true,
                    costType: "direct",
                    confidence: 0.9,
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    await expect(
      extractBudgetRowsWithOpenRouter({
        apiKey: "key",
        model: "google/gemini-3.1-flash-lite",
        documentText: "Personnel $1,000 direct allowable",
        fetchImpl,
      }),
    ).resolves.toEqual([
      {
        category: "Personnel",
        approvedAmountCents: 100000,
        allowable: true,
        costType: "direct",
        confidence: 0.9,
      },
    ]);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer key",
        }),
      }),
    );
  });

  it("fails closed when OpenRouter returns malformed rows", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ rows: [{ category: "" }] }) } }],
      }),
    });

    await expect(
      extractBudgetRowsWithOpenRouter({
        apiKey: "key",
        model: "google/gemini-3.1-flash-lite",
        documentText: "bad",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("fails closed when OpenRouter returns non-JSON content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "not json" } }],
      }),
    });

    await expect(
      extractBudgetRowsWithOpenRouter({
        apiKey: "key",
        model: "google/gemini-3.1-flash-lite",
        documentText: "bad",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("trims optional row fields and omits blank optional fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                rows: [
                  {
                    category: " Travel ",
                    description: "  Mileage reimbursement  ",
                    approvedAmountCents: 25000,
                    allowable: true,
                    costType: "direct",
                    periodLabel: "  Q2  ",
                    notes: "   ",
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    await expect(
      extractBudgetRowsWithOpenRouter({
        apiKey: "key",
        model: "google/gemini-3.1-flash-lite",
        documentText: "Travel $250",
        fetchImpl,
      }),
    ).resolves.toEqual([
      {
        category: "Travel",
        description: "Mileage reimbursement",
        approvedAmountCents: 25000,
        allowable: true,
        costType: "direct",
        periodLabel: "Q2",
      },
    ]);
  });

  it("keeps trimmed optional notes on extracted rows", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                rows: [
                  {
                    category: "Indirect",
                    approvedAmountCents: 5000,
                    allowable: true,
                    costType: "indirect",
                    notes: "  Uses negotiated rate  ",
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    await expect(
      extractBudgetRowsWithOpenRouter({
        apiKey: "key",
        model: "google/gemini-3.1-flash-lite",
        documentText: "Indirect $50",
        fetchImpl,
      }),
    ).resolves.toEqual([
      {
        category: "Indirect",
        approvedAmountCents: 5000,
        allowable: true,
        costType: "indirect",
        notes: "Uses negotiated rate",
      },
    ]);
  });

  it("fails closed when OpenRouter responds unsuccessfully or without content", async () => {
    await expect(
      extractBudgetRowsWithOpenRouter({
        apiKey: "key",
        model: "google/gemini-3.1-flash-lite",
        documentText: "bad",
        fetchImpl: vi.fn().mockResolvedValue({ ok: false }),
      }),
    ).rejects.toMatchObject({ status: 502 });

    await expect(
      extractBudgetRowsWithOpenRouter({
        apiKey: "key",
        model: "google/gemini-3.1-flash-lite",
        documentText: "bad",
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ choices: [{ message: {} }] }),
        }),
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("fails closed when extracted rows are empty or not objects", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({ rows: [] }) } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({ rows: ["bad"] }) } }],
        }),
      });

    await expect(
      extractBudgetRowsWithOpenRouter({
        apiKey: "key",
        model: "google/gemini-3.1-flash-lite",
        documentText: "bad",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 502 });

    await expect(
      extractBudgetRowsWithOpenRouter({
        apiKey: "key",
        model: "google/gemini-3.1-flash-lite",
        documentText: "bad",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("fails closed when confidence is outside the accepted range", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                rows: [
                  {
                    category: "Personnel",
                    approvedAmountCents: 100000,
                    allowable: true,
                    costType: "direct",
                    confidence: 2,
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    await expect(
      extractBudgetRowsWithOpenRouter({
        apiKey: "key",
        model: "google/gemini-3.1-flash-lite",
        documentText: "bad",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("fails closed when required row fields have invalid types", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rows: [
                    {
                      category: 123,
                      approvedAmountCents: 100,
                      allowable: true,
                      costType: "direct",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rows: [
                    {
                      category: "Personnel",
                      approvedAmountCents: 100.5,
                      allowable: true,
                      costType: "direct",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rows: [
                    {
                      category: "Personnel",
                      approvedAmountCents: 100,
                      allowable: "yes",
                      costType: "direct",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      });

    for (let index = 0; index < 3; index += 1) {
      await expect(
        extractBudgetRowsWithOpenRouter({
          apiKey: "key",
          model: "google/gemini-3.1-flash-lite",
          documentText: "bad",
          fetchImpl,
        }),
      ).rejects.toMatchObject({ status: 502 });
    }
  });

  it("uses global fetch when no fetch implementation is provided", async () => {
    const originalFetch = globalThis.fetch;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                rows: [
                  {
                    category: "Personnel",
                    approvedAmountCents: 100,
                    allowable: true,
                    costType: "direct",
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    globalThis.fetch = fetchImpl as never;

    try {
      await expect(
        extractBudgetRowsWithOpenRouter({
          apiKey: "key",
          model: "google/gemini-3.1-flash-lite",
          documentText: "Personnel $1",
        }),
      ).resolves.toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
