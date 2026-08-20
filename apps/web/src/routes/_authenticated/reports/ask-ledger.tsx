import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert, Badge, Button, PageHeader, Textarea } from "@grantpipe/ui";
import { Bot, ExternalLink, ShieldCheck } from "lucide-react";
import {
  ANALYTICS_EVENTS,
  canUseAskYourLedger,
  type LedgerAssistantAnswer,
} from "@grantpipe/shared";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { reportsTabs } from "../../../config/page-tabs";
import { useAskLedger } from "../../../hooks/use-ask-ledger";
import { useSession } from "../../../hooks/use-session";
import { canAccessFeature } from "../../../lib/access-control";
import { captureEvent } from "../../../lib/analytics";

export const Route = createFileRoute("/_authenticated/reports/ask-ledger")({
  component: AskLedgerPage,
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

const EXAMPLE_QUESTIONS = [
  "Which grants are over budget?",
  "Show restricted fund balances.",
  "Which funds still have money left?",
] as const;

export function AskLedgerPage() {
  const [question, setQuestion] = useState<string>(EXAMPLE_QUESTIONS[0]);
  const [answer, setAnswer] = useState<LedgerAssistantAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const askLedger = useAskLedger();
  const { memberRole, memberPermissions, effectivePlanTier } = useSession();
  const hasLedgerPermissions =
    canAccessFeature(memberRole, memberPermissions, "reports", "view") &&
    canAccessFeature(memberRole, memberPermissions, "accounting", "view");
  const hasLedgerPlan = canUseAskYourLedger(effectivePlanTier);
  const trimmedQuestion = question.trim();
  const canAsk = hasLedgerPermissions && trimmedQuestion.length >= 8 && !askLedger.isPending;
  const promptShownRef = useRef(false);

  useEffect(() => {
    if (hasLedgerPermissions && !hasLedgerPlan && !promptShownRef.current) {
      promptShownRef.current = true;
      captureEvent(ANALYTICS_EVENTS.upgradePromptShown, {
        surface: "ask_ledger_gate",
        plan_tier_used: effectivePlanTier,
        required_plan_tier: "growth",
      });
    }
  }, [effectivePlanTier, hasLedgerPermissions, hasLedgerPlan]);

  async function submitQuestion(nextQuestion = trimmedQuestion) {
    /* v8 ignore next 2 -- both guards are unreachable via rendered UI: buttons only render when hasLedgerPermissions is true, and the main submit button is disabled when question < 8 chars while example chips always supply strings >= 8 chars */
    if (!hasLedgerPermissions) return;
    if (nextQuestion.trim().length < 8) return;
    try {
      setError(null);
      const result = await askLedger.mutateAsync({
        question: nextQuestion,
        mode: "deterministic",
      });
      setAnswer(result);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const header = (
    <PageHeader
      variant="workbench"
      kicker="Reporting & Compliance"
      title="Ask Ledger"
      description="Ask grounded questions about grants, funds, and posted records. Every answer links back to source data."
    />
  );

  if (!hasLedgerPermissions) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {header}
        <AppPageTabs groupId="reports" items={reportsTabs} />
        <Alert variant="destructive" title="Access required">
          Ask Ledger requires report and accounting access.
        </Alert>
      </div>
    );
  }

  function handleUpgradeClick() {
    captureEvent(ANALYTICS_EVENTS.upgradeClicked, {
      surface: "ask_ledger_gate",
      target_plan_tier: "growth",
    });
  }

  if (!hasLedgerPlan) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {header}
        <AppPageTabs groupId="reports" items={reportsTabs} />
        <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-base font-semibold">Ask Ledger needs Growth</h2>
            <p className="text-sm text-muted-foreground">
              Ask Ledger is included on Growth plans and up.
            </p>
          </div>
          <Button asChild>
            <Link to="/settings" hash="billing" onClick={handleUpgradeClick}>
              See Growth
            </Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {header}
      <AppPageTabs groupId="reports" items={reportsTabs} />

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-4">
            <label className="text-sm font-medium" htmlFor="ledger-question">
              Question
            </label>
            <Textarea
              id="ledger-question"
              value={question}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setQuestion(event.target.value)
              }
              placeholder="Ask about grant overspend or restricted fund balances."
              rows={4}
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUESTIONS.map((example) => (
                <Button
                  key={example}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuestion(example);
                    void submitQuestion(example);
                  }}
                >
                  {example}
                </Button>
              ))}
            </div>
            <Button type="button" onClick={() => void submitQuestion()} disabled={!canAsk}>
              <Bot className="size-4" aria-hidden="true" />
              Ask Ledger
            </Button>
          </div>
          <aside className="space-y-3 rounded-lg border border-border bg-background/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              Grounding rules
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Answers come from saved GrantPipe records, not guesses.</li>
              <li>Every number needs a source link.</li>
              <li>Other questions open the report builder.</li>
            </ul>
          </aside>
        </div>
      </section>

      {error ? (
        <Alert variant="destructive" title="Unable to ask the ledger.">
          {error}
        </Alert>
      ) : null}
      <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Answer</h2>
            <p className="text-sm text-muted-foreground">
              Check the links before you use the answer.
            </p>
          </div>
          {answer ? <Badge variant="outline">{answer.confidence} confidence</Badge> : null}
        </header>
        {askLedger.isPending ? (
          <p className="text-sm text-muted-foreground">Checking ledger records…</p>
        ) : null}
        {!answer && !askLedger.isPending ? (
          <p className="text-sm text-muted-foreground">
            Ask a question to see a grounded answer with citations.
          </p>
        ) : null}
        {answer ? (
          <div className="space-y-5">
            <Alert title="Grounded answer">{answer.answer}</Alert>
            {answer.suggestedFollowUps.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Suggested questions</h3>
                <div className="flex flex-wrap gap-2">
                  {answer.suggestedFollowUps.map((followUp) => (
                    <Button
                      key={followUp}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setQuestion(followUp);
                        void submitQuestion(followUp);
                      }}
                    >
                      {followUp}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Sources</h3>
              <div className="grid gap-2">
                {answer.citations.map((citation, index) => (
                  <a
                    key={`${citation.href}-${index}`}
                    href={citation.href}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm hover:border-primary"
                  >
                    <span>
                      <span className="block font-medium">{citation.label}</span>
                      {citation.value ? (
                        <span className="text-muted-foreground">{citation.value}</span>
                      ) : null}
                    </span>
                    <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Safeguards</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {answer.safeguards.map((safeguard) => (
                  <li key={safeguard}>{safeguard}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
