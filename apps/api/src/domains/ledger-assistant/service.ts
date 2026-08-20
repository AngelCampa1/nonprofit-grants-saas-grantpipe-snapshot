import type { Database } from "@grantpipe/db";
import { funds, restrictionBalances, restrictionTerms } from "@grantpipe/db";
import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import {
  canUseAskYourLedger,
  normalizePlanTier,
  type LedgerAssistantAnswer,
  type ParsedLedgerAssistantAskInput,
  type ReportBuilderEntity,
} from "@grantpipe/shared";
import { getBudgetSentinel } from "../grants/sentinel.service";
import { assertAiUsageWithinCap, recordAiUsage } from "../../lib/ai-usage";
import { badRequest } from "../../lib/app-error";

type AskLedgerParams = {
  orgId: string;
  entityId?: string;
  planTier: string;
  input: ParsedLedgerAssistantAskInput;
  allowedEntities: readonly ReportBuilderEntity[];
  now?: Date;
};

type RestrictedFundBalanceRow = {
  termId: string;
  fundId: string | null;
  fundName: string | null;
  endingBalanceCents: number;
  periodEnd: Date;
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function questionIncludes(question: string, terms: readonly string[]): boolean {
  const normalized = question.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function assertEntityAllowed(
  allowedEntities: readonly ReportBuilderEntity[],
  required: readonly ReportBuilderEntity[],
) {
  const missing = required.find((entity) => !allowedEntities.includes(entity));
  if (missing) {
    throw badRequest(`You do not have access to ${missing} data for this question.`);
  }
}

function safeguards(mode: LedgerAssistantAnswer["mode"]): string[] {
  return [
    "Numbers are calculated from posted GrantPipe records only.",
    "Each answer includes source links so a human can verify the result.",
    mode === "ai_assisted"
      ? "AI can only phrase the grounded result; it cannot create numbers or sources."
      : "No AI-generated numbers were used.",
  ];
}

function followUps(): string[] {
  return [
    "Which grants are over budget?",
    "Show restricted funds with balances.",
    "Open the report builder for a custom view.",
  ];
}

async function getRestrictedFundBalances(
  db: Database,
  orgId: string,
): Promise<Array<{ fundId: string; fundName: string; balanceCents: number }>> {
  const balanceRows: RestrictedFundBalanceRow[] = await db
    .select({
      termId: restrictionBalances.restrictionTermId,
      fundId: restrictionBalances.fundId,
      fundName: funds.name,
      endingBalanceCents: restrictionBalances.endingBalanceCents,
      periodEnd: restrictionBalances.periodEnd,
    })
    .from(restrictionBalances)
    .innerJoin(
      restrictionTerms,
      and(
        eq(restrictionTerms.id, restrictionBalances.restrictionTermId),
        eq(restrictionTerms.orgId, orgId),
        isNull(restrictionTerms.deletedAt),
      ),
    )
    .leftJoin(
      funds,
      and(
        eq(funds.id, restrictionBalances.fundId),
        eq(funds.orgId, orgId),
        isNull(funds.deletedAt),
      ),
    )
    .where(
      and(
        eq(restrictionBalances.orgId, orgId),
        isNull(restrictionBalances.deletedAt),
        isNotNull(restrictionBalances.fundId),
        gt(restrictionBalances.endingBalanceCents, 0),
      ),
    )
    .orderBy(desc(restrictionBalances.periodEnd), desc(restrictionBalances.endingBalanceCents));

  const latestByTerm = new Map<string, RestrictedFundBalanceRow>();
  for (const row of balanceRows) {
    if (!latestByTerm.has(row.termId)) {
      latestByTerm.set(row.termId, row);
    }
  }

  const byFund = new Map<string, { fundId: string; fundName: string; balanceCents: number }>();
  for (const row of latestByTerm.values()) {
    if (!row.fundId) continue;
    const existing = byFund.get(row.fundId);
    const nextBalance = (existing?.balanceCents ?? 0) + row.endingBalanceCents;
    byFund.set(row.fundId, {
      fundId: row.fundId,
      fundName: row.fundName ?? "Fund",
      balanceCents: nextBalance,
    });
  }

  return [...byFund.values()].sort((a, b) => b.balanceCents - a.balanceCents).slice(0, 5);
}

export async function askLedger(
  db: Database,
  params: AskLedgerParams,
): Promise<LedgerAssistantAnswer> {
  const now = new Date();

  if (!canUseAskYourLedger(params.planTier)) {
    throw badRequest("Ask-Your-Ledger is included on Growth plans and up.");
  }

  await assertAiUsageWithinCap(db, {
    orgId: params.orgId,
    feature: "ask_your_ledger",
    planTier: normalizePlanTier(params.planTier),
    now,
  });

  const question = params.input.question;
  const mode = params.input.mode;

  let result: LedgerAssistantAnswer;

  if (questionIncludes(question, ["over budget", "overspend", "over spend", "budget risk"])) {
    assertEntityAllowed(params.allowedEntities, ["grants"]);
    const sentinel = await getBudgetSentinel(db, {
      orgId: params.orgId,
      entityId: params.entityId,
      now: params.now ?? new Date(),
      kinds: ["overspend"],
      limit: 5,
    });
    const overspend = sentinel.items.filter((item) => item.kind === "overspend");
    if (overspend.length === 0) {
      result = {
        answer: "No active grant budget lines are over budget or projected to overspend.",
        mode,
        confidence: "high",
        safeguards: safeguards(mode),
        citations: [
          {
            type: "report_row",
            label: "Budget sentinel",
            href: "/grants/budget-sentinel",
            value: "0 at-risk budget lines",
          },
        ],
        suggestedFollowUps: followUps(),
      };
    } else {
      const totalExposure = overspend.reduce((sum, item) => sum + Math.max(0, item.overByCents), 0);
      result = {
        answer: `${overspend.length} grant budget ${
          overspend.length === 1 ? "line is" : "lines are"
        } over budget or projected to overspend. Current overage exposure is ${formatCurrency(
          totalExposure,
        )}.`,
        mode,
        confidence: "high",
        safeguards: safeguards(mode),
        citations: overspend.slice(0, 3).map((item) => ({
          type: "grant",
          label: `${item.grantName} - ${item.category}`,
          href: `/grants/${item.grantId}/budget`,
          value: `${formatCurrency(item.projectedCents)} projected against ${formatCurrency(
            item.approvedAmountCents,
          )}`,
        })),
        suggestedFollowUps: followUps(),
      };
    }
  } else if (
    questionIncludes(question, [
      "restricted fund",
      "fund balance",
      "restricted balance",
      "funds with balances",
      "money left",
      "funds still have money left",
    ])
  ) {
    assertEntityAllowed(params.allowedEntities, ["funds"]);
    const rows = await getRestrictedFundBalances(db, params.orgId);
    if (rows.length === 0) {
      result = {
        answer: "No restricted fund balances are currently above zero in the ledger snapshot.",
        mode,
        confidence: "high",
        safeguards: safeguards(mode),
        citations: [
          {
            type: "report_row",
            label: "Fund balance snapshot",
            href: "/reports/builder",
            value: "0 fund rows",
          },
        ],
        suggestedFollowUps: followUps(),
      };
    } else {
      const total = rows.reduce((sum, row) => sum + row.balanceCents, 0);
      result = {
        answer: `${rows.length} restricted ${
          rows.length === 1 ? "fund has" : "funds have"
        } positive balances in the current snapshot, totaling ${formatCurrency(total)}.`,
        mode,
        confidence: "high",
        safeguards: safeguards(mode),
        citations: rows.slice(0, 3).map((row) => ({
          type: "fund",
          label: row.fundName,
          href: `/funds/${row.fundId}`,
          value: formatCurrency(row.balanceCents),
        })),
        suggestedFollowUps: followUps(),
      };
    }
  } else {
    result = {
      answer:
        "I could not answer that from the grounded question set yet. Use the report builder for a custom view, or ask about grant overspend or restricted fund balances.",
      mode,
      confidence: "low",
      safeguards: safeguards(mode),
      citations: [
        {
          type: "report_row",
          label: "Report builder",
          href: "/reports/builder",
          value: "Use saved reports for unsupported questions",
        },
      ],
      suggestedFollowUps: followUps(),
    };
  }

  await recordAiUsage(db, { orgId: params.orgId, feature: "ask_your_ledger", now });

  return result;
}
