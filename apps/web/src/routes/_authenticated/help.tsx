import { Link, createFileRoute } from "@tanstack/react-router";
import { marketingKnowledge } from "@grantpipe/shared/knowledge";
import { FOUNDER_BOOKING_URLS } from "@grantpipe/shared";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grantpipe/ui";
import type { HelpCategory } from "../../lib/help-content";
import {
  HELP_CATEGORIES,
  canUseHelpArticle,
  getQuickHelpTasks,
  searchHelpArticles,
} from "../../lib/help-content";
import { useGuideProgress, useGuideProgressMutation } from "../../hooks/use-guide-progress";
import { useSession } from "../../hooks/use-session";
import { captureEvent } from "../../lib/analytics";
import { getCountBucket, getTextLengthBucket } from "../../lib/analytics-buckets";
import { VideoDialog } from "../../components/video-dialog";

export const Route = createFileRoute("/_authenticated/help")({
  component: HelpPage,
});

export function HelpPage() {
  const { memberRole } = useSession();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | "All">("All");
  const progressQuery = useGuideProgress();
  const progressMutation = useGuideProgressMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    captureEvent("help_opened", { source: "nav" });
  }, []);

  const runGuideAction = (run: (handlers: { onError: (error: unknown) => void }) => void) => {
    setActionError(null);
    run({
      onError: (error) =>
        setActionError(error instanceof Error ? error.message : "Unable to complete this action."),
    });
  };
  const progressByKey = useMemo(
    () => new Map((progressQuery.data ?? []).map((row) => [row.guideKey, row.status])),
    [progressQuery.data],
  );
  const articles = searchHelpArticles(query, category).filter((article) =>
    canUseHelpArticle(article, memberRole),
  );
  const visibleTaskLinks = getQuickHelpTasks(memberRole);

  function getVisibleArticleCount(nextQuery: string, nextCategory: HelpCategory | "All") {
    return searchHelpArticles(nextQuery, nextCategory).filter((article) =>
      canUseHelpArticle(article, memberRole),
    ).length;
  }

  function trackHelpSearch(
    nextQuery: string,
    nextCategory: HelpCategory | "All",
    trigger: "query" | "category",
  ) {
    const resultCount = getVisibleArticleCount(nextQuery, nextCategory);
    captureEvent("help_searched", {
      trigger,
      query_length_bucket: getTextLengthBucket(nextQuery.trim().length),
      category: nextCategory,
      result_count_bucket: getCountBucket(resultCount),
      has_results: resultCount > 0,
    });
  }

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader variant="workbench" kicker="Help center" title="Help" />

      {actionError ? (
        <Alert variant="destructive" title="Unable to complete the action">
          <p>{actionError}</p>
        </Alert>
      ) : null}

      <section
        className="min-w-0 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5"
        aria-labelledby="product-tour-title"
      >
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-2xl space-y-2">
            <Badge variant="outline">5-minute tour</Badge>
            <h2 id="product-tour-title" className="text-lg font-semibold text-foreground">
              See the full GrantPipe workflow first
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              See how one grant moves from start to close. It covers funds, reports, documents, and
              the activity log.
            </p>
          </div>
          <VideoDialog
            slug="one-workspace-overview"
            triggerLabel="Watch product tour"
            className="min-h-11 w-full sm:w-auto"
          />
        </div>
      </section>

      <section
        className="min-w-0 rounded-2xl border border-border bg-card p-4"
        aria-labelledby="learn-videos-heading"
      >
        <h2 id="learn-videos-heading" className="text-base font-semibold text-foreground">
          Watch a quick how-to
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <VideoDialog slug="getting-started" />
          <VideoDialog slug="add-grant-allocate" />
        </div>
      </section>

      <section
        className="min-w-0 rounded-2xl border border-border bg-card p-4"
        aria-labelledby="help-tasks"
      >
        <h2 id="help-tasks" className="text-base font-semibold text-foreground">
          What are you trying to do?
        </h2>
        <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTaskLinks.map((task) => (
            <Button key={`${task.to}-${task.label}`} asChild variant="outline">
              <Link
                to={task.to}
                hash={task.hash}
                onClick={() =>
                  captureEvent("help_task_clicked", {
                    task_target: task.to,
                    has_hash: Boolean(task.hash),
                  })
                }
              >
                {task.label}
              </Link>
            </Button>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Input
          aria-label="Search help"
          placeholder="Search help, like PDF, import, or grant"
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            trackHelpSearch(nextQuery, category, "query");
          }}
        />
        <Select
          value={category}
          onValueChange={(val) => {
            const nextCategory = val as HelpCategory | "All";
            setCategory(nextCategory);
            trackHelpSearch(query, nextCategory, "category");
          }}
        >
          <SelectTrigger aria-label="Help category">
            <SelectValue placeholder="All guides" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All guides</SelectItem>
            {HELP_CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section
        className="min-w-0 rounded-2xl border border-border bg-muted/30 p-4"
        aria-label="Ask for help"
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Still stuck?</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Use the Feedback button and choose Question. It includes the page you are on. That
              helps support find where you got stuck.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
              <a href={`mailto:${marketingKnowledge.contact.supportEmail}`}>Email support</a>
            </Button>
            <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
              <a href={FOUNDER_BOOKING_URLS.quickCall} target="_blank" rel="noopener noreferrer">
                Book a 15-min call
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-3">
        {articles.map((article) => {
          const status = progressByKey.get(article.key) ?? "not_started";
          return (
            <div
              key={article.key}
              id={article.key}
              className="min-w-0 space-y-4 rounded-2xl border border-border/60 bg-card p-4 sm:p-5"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <Badge variant="outline">{article.category}</Badge>
                  <h2 className="text-base font-semibold text-foreground">{article.title}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{article.summary}</p>
                </div>
                <Badge variant={status === "completed" ? "success" : "outline"}>
                  {status === "completed" ? "Done" : "Guide"}
                </Badge>
              </div>
              <ol className="space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                {article.steps.map((step) => (
                  <li key={step} className="list-decimal">
                    {step}
                  </li>
                ))}
              </ol>
              <div className="flex min-w-0 flex-wrap gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="min-h-11 min-w-0 max-w-full whitespace-normal text-left leading-5"
                >
                  <Link
                    to={article.cta.to}
                    hash={article.cta.hash}
                    onClick={() =>
                      captureEvent("help_article_cta_clicked", {
                        article_key: article.key,
                        article_category: article.category,
                        cta_type: "internal",
                        cta_target: article.cta.to,
                        has_hash: Boolean(article.cta.hash),
                      })
                    }
                  >
                    {article.cta.label}
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11 flex-none"
                  disabled={
                    progressMutation.isPending &&
                    progressMutation.variables?.guideKey === article.key
                  }
                  onClick={() =>
                    runGuideAction((handlers) =>
                      progressMutation.mutate(
                        {
                          guideKey: article.key,
                          data: { status: "completed", lastStep: "help-center" },
                        },
                        {
                          ...handlers,
                          onSuccess: () => {
                            captureEvent("help_guide_completed", {
                              article_key: article.key,
                              article_category: article.category,
                              previous_status: status,
                            });
                          },
                        },
                      ),
                    )
                  }
                >
                  Mark done
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      {articles.length === 0 ? (
        <div className="min-w-0 rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
          <h2 className="text-base font-semibold text-foreground">No guide matches that search.</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a simpler word, like PDF, donor, report, import, or grant.
          </p>
        </div>
      ) : null}
    </div>
  );
}
