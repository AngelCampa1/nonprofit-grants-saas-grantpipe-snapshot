import React, { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3Icon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageShell,
  StatusPanel,
} from "@grantpipe/ui";
import { useCalendarMonth } from "../../../hooks/use-overview";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { deadlinesTabs } from "../../../config/page-tabs";

export const Route = createFileRoute("/_authenticated/deadlines/calendar")({
  component: CalendarPage,
});

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getTodayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const match = MONTH_KEY_RE.exec(monthKey);
  if (!match) {
    throw new Error(`Invalid monthKey format: "${monthKey}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`Invalid monthKey values: "${monthKey}"`);
  }
  return { year, month };
}

function shiftMonth(monthKey: string, amount: number) {
  const { year, month } = parseMonthKey(monthKey);
  const next = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function buildMonthDays(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length: daysInMonth }, (_value, index) => {
    const day = index + 1;
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const date = new Date(Date.UTC(year, month - 1, day));

    return {
      dateKey,
      label: String(day),
      ariaLabel: new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
    };
  });
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type CalendarItemView = {
  id: string;
  title: string;
  date: string;
  status: string;
  kind: string;
  grantId?: string;
  grantName?: string;
};

function buildCalendarCells(monthKey: string) {
  const monthDays = buildMonthDays(monthKey);
  const firstDay = monthDays[0];

  if (!firstDay) {
    return [];
  }

  const [yearText, monthText, dayText] = firstDay.dateKey.split("-") as [string, string, string];
  const yearNum = Number(yearText);
  const monthNum = Number(monthText);
  const dayNum = Number(dayText);
  if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum) || !Number.isFinite(dayNum)) {
    return [];
  }
  const firstWeekday = new Date(Date.UTC(yearNum, monthNum - 1, dayNum)).getUTCDay();

  return [
    ...Array.from({ length: firstWeekday }, (_value, index) => ({
      kind: "placeholder" as const,
      key: `placeholder-${monthKey}-${index}`,
    })),
    ...monthDays.map((day) => ({
      kind: "day" as const,
      day,
    })),
  ];
}

function formatSelectedDayLabel(dateKey: string) {
  const [yearText, monthText, dayText] = dateKey.split("-") as [string, string, string];
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatCalendarStatusLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatCalendarKindLabel(value: string) {
  return formatCalendarStatusLabel(value);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function getCalendarItemTone(item: CalendarItemView) {
  if (item.status === "overdue") {
    return {
      day: "border-destructive/35 bg-destructive/10 text-foreground hover:border-destructive/45 hover:bg-destructive/15",
      badge: "destructive" as const,
      agenda: "border-destructive/25 bg-destructive/10",
      label: "Overdue",
    };
  }

  if (item.status === "completed" || item.status === "submitted") {
    return {
      day: "border-success/35 bg-success/10 text-foreground hover:border-success/45 hover:bg-success/15",
      badge: "success" as const,
      agenda: "border-success/25 bg-success/10",
      label: "Complete",
    };
  }

  return {
    day: "border-warning/35 bg-warning/10 text-foreground hover:border-warning/45 hover:bg-warning/15",
    badge: "warning" as const,
    agenda: "border-warning/25 bg-warning/10",
    label: "Upcoming",
  };
}

function getDayTone(items: CalendarItemView[]) {
  const firstUrgentItem =
    items.find((item) => item.status === "overdue") ??
    items.find((item) => item.status !== "completed" && item.status !== "submitted") ??
    items[0];

  return firstUrgentItem ? getCalendarItemTone(firstUrgentItem).day : "";
}

function getCalendarMonthStats(items: CalendarItemView[]) {
  const deadlineDayCount = new Set(items.map((item) => item.date.slice(0, 10))).size;
  const overdueCount = items.filter((item) => item.status === "overdue").length;

  return {
    deadlineCount: items.length,
    deadlineDayCount,
    overdueCount,
  };
}

function formatCalendarDayAriaLabel(dayLabel: string, items: Array<{ title: string }>) {
  if (items.length === 0) {
    return dayLabel;
  }

  const visibleTitles = items
    .slice(0, 2)
    .map((item) => item.title)
    .join(", ");
  const remainingCount = items.length - 2;
  const remainingLabel = remainingCount > 0 ? `, plus ${remainingCount} more` : "";

  return `${dayLabel}, ${items.length} deadline${
    items.length === 1 ? "" : "s"
  } due: ${visibleTitles}${remainingLabel}`;
}

export function CalendarPage() {
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const calendarQuery = useCalendarMonth(month);
  const currentMonth = getCurrentMonthKey();
  const todayDateKey = getTodayDateKey();
  const items = useMemo<CalendarItemView[]>(
    () => calendarQuery.data?.items ?? [],
    [calendarQuery.data],
  );
  const hasLoadedCalendarItems = calendarQuery.data !== undefined && !calendarQuery.isLoading;

  const groupedItems = useMemo(
    () =>
      items.reduce<Record<string, typeof items>>((groups, item) => {
        const dateKey = item.date.slice(0, 10);
        groups[dateKey] ??= [];
        groups[dateKey]!.push(item);
        return groups;
      }, {}),
    [items],
  );

  const monthDays = useMemo(() => buildMonthDays(month), [month]);
  const calendarCells = useMemo(() => buildCalendarCells(month), [month]);
  const monthStats = useMemo(() => getCalendarMonthStats(items), [items]);

  useEffect(() => {
    if (!hasLoadedCalendarItems) {
      setSelectedDate(null);
      return;
    }

    const firstDayWithItems = monthDays.find(
      (day) => (groupedItems[day.dateKey]?.length ?? 0) > 0,
    )?.dateKey;
    const monthIsCurrent = todayDateKey.startsWith(month);
    setSelectedDate((current) => {
      if (current && current.startsWith(month) && (groupedItems[current]?.length ?? 0) > 0) {
        return current;
      }

      return firstDayWithItems ?? (monthIsCurrent ? todayDateKey : monthDays[0]?.dateKey) ?? null;
    });
  }, [groupedItems, hasLoadedCalendarItems, month, monthDays, todayDateKey]);

  const selectedItems = selectedDate ? (groupedItems[selectedDate] ?? []) : [];
  const selectedDayLabel = selectedDate ? formatSelectedDayLabel(selectedDate) : null;
  const summaryPrimaryValue = calendarQuery.isLoading
    ? "Loading deadlines…"
    : calendarQuery.isError
      ? "Calendar unavailable"
      : String(monthStats.deadlineCount);
  const summarySecondaryValue = calendarQuery.isLoading
    ? formatMonthLabel(month)
    : calendarQuery.isError
      ? "Refresh to retry"
      : String(monthStats.deadlineDayCount);
  const summaryRiskValue = calendarQuery.isLoading
    ? "Checking risk…"
    : calendarQuery.isError
      ? "Risk unknown"
      : monthStats.overdueCount > 0
        ? String(monthStats.overdueCount)
        : "None";
  const selectedDayEmptyTitle =
    items.length === 0
      ? `No deadlines scheduled for ${formatMonthLabel(month)}.`
      : `No deadlines for ${selectedDayLabel ?? "this day"}.`;

  return (
    <PageShell>
      <PageHeader variant="workbench" kicker="Reporting & Compliance" title="Calendar" />
      <AppPageTabs groupId="deadlines" items={deadlinesTabs} />
      <div
        data-testid="calendar-month-controls"
        className="grid w-full grid-cols-3 items-center gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end"
      >
        <Button
          type="button"
          variant="outline"
          aria-label="Previous month"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => setMonth((current) => shiftMonth(current, -1))}
        >
          <ChevronLeftIcon aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Previous</span>
        </Button>
        <span className="min-w-0 text-center text-sm font-medium text-muted-foreground sm:min-w-40">
          {formatMonthLabel(month)}
        </span>
        <Button
          type="button"
          variant="outline"
          aria-label="Next month"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => setMonth((current) => shiftMonth(current, 1))}
        >
          <span className="sr-only sm:not-sr-only">Next</span>
          <ChevronRightIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant={month === currentMonth ? "secondary" : "outline"}
          size="sm"
          className="col-span-3 w-full sm:col-span-1 sm:w-auto"
          onClick={() => setMonth(currentMonth)}
        >
          Today
        </Button>
      </div>
      <div data-testid="calendar-summary-stats" className="grid grid-cols-3 gap-3">
        <Card className="min-w-0 rounded-2xl border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Scheduled deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summaryPrimaryValue}</p>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-2xl border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Deadline days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summarySecondaryValue}</p>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-2xl border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summaryRiskValue}</p>
          </CardContent>
        </Card>
      </div>

      {calendarQuery.isLoading ? (
        <StatusPanel variant="loading" title="Loading calendar…">
          Loading deadlines for this month.
        </StatusPanel>
      ) : calendarQuery.isError ? (
        <StatusPanel variant="error" title="Unable to load calendar data.">
          Refresh the page or try again in a moment.
        </StatusPanel>
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(20rem,0.95fr)] xl:items-start">
          <Card className="min-w-0 rounded-2xl border-border bg-card shadow-sm">
            <CardHeader className="flex min-w-0 flex-col gap-3 space-y-0 px-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDaysIcon className="size-4 text-primary" aria-hidden="true" />
                  Month grid
                </CardTitle>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Application, reporting, and closeout dates grouped by day.
                </p>
              </div>
              <Badge variant="outline">{formatMonthLabel(month)}</Badge>
            </CardHeader>
            <CardContent className="min-w-0 space-y-4 px-3 sm:px-6">
              {items.length === 0 ? (
                <StatusPanel variant="empty" title="No deadlines scheduled this month">
                  This month is currently clear.
                </StatusPanel>
              ) : null}
              <div className="hidden grid-cols-7 gap-2 border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-caps text-muted-foreground md:grid">
                {weekdayLabels.map((label) => (
                  <div key={label} className="px-1">
                    {label}
                  </div>
                ))}
              </div>
              <div
                data-testid="calendar-day-grid"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7"
              >
                {calendarCells.map((cell) => {
                  if (cell.kind === "placeholder") {
                    return (
                      <div
                        key={cell.key}
                        aria-hidden="true"
                        className="hidden min-h-24 rounded-2xl border border-transparent md:block"
                      />
                    );
                  }

                  const { day } = cell;
                  const dayItems = groupedItems[day.dateKey] ?? [];
                  const isSelected = day.dateKey === selectedDate;
                  const isToday = day.dateKey === todayDateKey;
                  const hasDeadlines = dayItems.length > 0;
                  const visibleItems = dayItems.slice(0, 1);
                  const overflowCount = Math.max(dayItems.length - visibleItems.length, 0);
                  const dayAriaLabel = formatCalendarDayAriaLabel(day.ariaLabel, dayItems);
                  const dayState = isSelected
                    ? "selected"
                    : isToday
                      ? "today"
                      : hasDeadlines
                        ? "deadline"
                        : "clear";
                  const dayClassName = [
                    "min-h-24 h-auto w-full min-w-0 flex-col items-stretch justify-start gap-0 overflow-hidden whitespace-normal rounded-2xl border px-1.5 py-2.5 text-left transition hover:shadow-sm lg:px-2.5",
                    "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/30 hover:bg-primary/10"
                      : isToday
                        ? "border-primary/40 bg-primary/5 text-foreground font-medium"
                        : hasDeadlines
                          ? getDayTone(dayItems)
                          : "border-border/80 bg-background text-muted-foreground hover:border-border hover:bg-muted/60",
                  ].join(" ");

                  return (
                    <Button
                      key={day.dateKey}
                      type="button"
                      variant="ghost"
                      aria-label={dayAriaLabel}
                      aria-current={isToday ? "date" : undefined}
                      data-has-deadlines={hasDeadlines ? "true" : "false"}
                      data-calendar-day-state={dayState}
                      onClick={() => setSelectedDate(day.dateKey)}
                      className={dayClassName}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-1">
                        <span className="flex shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                          {day.label}
                          {isToday ? (
                            <span
                              className="inline-block size-1.5 rounded-full bg-primary"
                              aria-label="Today"
                            />
                          ) : null}
                        </span>
                        {hasDeadlines ? (
                          <span className="shrink-0 rounded-full bg-background/80 px-1 py-0.5 text-[10px] font-semibold text-foreground shadow-sm lg:px-1.5 lg:text-[11px]">
                            {dayItems.length} due
                          </span>
                        ) : null}
                      </div>
                      {hasDeadlines ? (
                        <div className="mt-3 min-h-9 min-w-0 space-y-1 overflow-hidden">
                          {visibleItems.map((item) => (
                            <div key={item.id} className="min-w-0">
                              <p
                                className="line-clamp-2 break-words text-xs font-semibold leading-4 text-foreground"
                                title={item.title}
                              >
                                {item.title}
                              </p>
                              <p className="truncate text-[11px] leading-4 text-muted-foreground">
                                {formatCalendarKindLabel(item.kind)}
                              </p>
                            </div>
                          ))}
                          {overflowCount > 0 ? (
                            <span className="inline-flex rounded-full bg-background/80 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              +{overflowCount}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="mt-7 block h-4" aria-hidden="true" />
                      )}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card
            role="complementary"
            aria-label="Selected day agenda"
            className="min-w-0 rounded-2xl border-border bg-card shadow-sm xl:sticky xl:top-6"
          >
            {selectedItems.length === 0 ? (
              <CardHeader className="min-w-0 space-y-1 px-3 py-3 sm:px-6">
                <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-muted-foreground">
                  <Clock3Icon className="size-4 text-primary" aria-hidden="true" />
                  <span className="text-foreground">{selectedDayLabel}</span>
                  <span>{selectedDayEmptyTitle}</span>
                </CardTitle>
              </CardHeader>
            ) : (
              <>
                <CardHeader className="min-w-0 space-y-2 px-3 sm:px-6">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock3Icon className="size-4 text-primary" aria-hidden="true" />
                    Selected day
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    See what is due on the selected day.
                  </p>
                </CardHeader>
                <CardContent className="min-w-0 space-y-3 px-3 sm:px-6">
                  <div className="rounded-2xl border border-border bg-muted/45 p-3">
                    <p className="text-sm font-semibold text-foreground">{selectedDayLabel}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedItems.length} deadline{selectedItems.length === 1 ? "" : "s"} queued
                    </p>
                  </div>
                  {selectedItems.map((item) => {
                    const tone = getCalendarItemTone(item);

                    return (
                      <article
                        key={item.id}
                        className={["rounded-2xl border p-4", tone.agenda].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium leading-5 text-foreground">{item.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatCalendarKindLabel(item.kind)} - {formatShortDate(item.date)}
                            </p>
                          </div>
                          <Badge variant={tone.badge}>
                            {formatCalendarStatusLabel(item.status)}
                          </Badge>
                        </div>
                        {item.grantName ? (
                          item.grantId ? (
                            <Link
                              to="/grants/$grantId"
                              params={{ grantId: item.grantId }}
                              aria-label={`Open grant ${item.grantName}`}
                              className="mt-3 block truncate text-sm font-medium text-primary hover:underline underline-offset-4"
                              title={item.grantName}
                            >
                              {item.grantName}
                            </Link>
                          ) : (
                            <p
                              className="mt-3 truncate text-sm text-muted-foreground"
                              title={item.grantName}
                            >
                              {item.grantName}
                            </p>
                          )
                        ) : null}
                        {item.status === "completed" || item.status === "submitted" ? (
                          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-success">
                            <CheckCircle2Icon className="size-3.5" aria-hidden="true" />
                            {tone.label}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </CardContent>
              </>
            )}
          </Card>
        </div>
      )}
    </PageShell>
  );
}
