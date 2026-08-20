import { useState, Fragment } from "react";
import { clsx } from "clsx";
import type { PricedTask } from "../lib/pricebook-data";
import { generatePricebook } from "../lib/pricebook-data";
import { EMAIL_REGEX } from "../lib/email-validation";
import { trackEvent } from "../lib/analytics";
import { captureSiteFetchFailure } from "../lib/sentry-client";

interface TradeOption {
  value: string;
  label: string;
}

interface PricebookBuilderCopy {
  downloadSuccess?: string;
  trialPrompt?: string;
  trialCtaText?: string;
  downloadCtaText?: string;
  downloadLabel?: string;
  loadingText?: string;
  repairsPricedLabel?: string;
}

interface PricebookBuilderProps {
  apiUrl: string;
  productName: string;
  trialUrl: string;
  trades: TradeOption[];
  copy?: PricebookBuilderCopy;
}

type DownloadStatus = "idle" | "loading" | "success" | "error";

const DEFAULT_COPY: Required<PricebookBuilderCopy> = {
  downloadSuccess: "Your pricebook is on the way. Check your inbox.",
  trialPrompt:
    "Ready to use your pricebook from the field? {productName} puts it on your techs' phones.",
  trialCtaText: "Start Your Free Trial →",
  downloadCtaText: "Get Your Pricebook PDF",
  downloadLabel: "Your email — we'll send the PDF",
  loadingText: "Sending…",
  repairsPricedLabel: "{count} repairs priced",
};

function formatPrice(price: number): string {
  return `$${price}`;
}

function groupByCategory(tasks: PricedTask[]): Map<string, PricedTask[]> {
  const groups = new Map<string, PricedTask[]>();
  for (const pt of tasks) {
    const cat = pt.task.category;
    const existing = groups.get(cat);
    if (existing) {
      existing.push(pt);
    } else {
      groups.set(cat, [pt]);
    }
  }
  return groups;
}

function getLaborRateBucket(rate: number): string {
  if (rate < 100) return "under_100";
  if (rate < 150) return "100_149";
  if (rate < 200) return "150_199";
  return "200_plus";
}

function getPartsMarkupBucket(markup: number): string {
  if (markup < 2) return "under_2x";
  if (markup < 3) return "2_2_99x";
  if (markup < 4) return "3_3_99x";
  return "4x_plus";
}

function getAfterHoursMultiplierBucket(multiplier: number): string {
  if (multiplier < 1.5) return "under_1_5x";
  if (multiplier < 2) return "1_5_1_99x";
  return "2x_plus";
}

function buildInputChangedProperties(
  selectedTrade: string,
  selectedLaborRate: number,
  selectedPartsMarkup: number,
  selectedAfterHoursMultiplier: number,
) {
  return {
    trade: selectedTrade,
    labor_rate_bucket: getLaborRateBucket(selectedLaborRate),
    parts_markup_bucket: getPartsMarkupBucket(selectedPartsMarkup),
    after_hours_multiplier_bucket: getAfterHoursMultiplierBucket(selectedAfterHoursMultiplier),
  };
}

export function PricebookBuilder({
  apiUrl,
  productName,
  trialUrl,
  trades,
  copy: copyOverrides,
}: PricebookBuilderProps) {
  const resolvedCopy = { ...DEFAULT_COPY, ...copyOverrides };

  const [trade, setTrade] = useState(trades[0]?.value ?? "");
  const [laborRate, setLaborRate] = useState(120);
  const [partsMarkup, setPartsMarkup] = useState(3.0);
  const [afterHoursMultiplier, setAfterHoursMultiplier] = useState(1.5);
  const [downloadEmail, setDownloadEmail] = useState("");
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  const pricebook = generatePricebook({
    trade,
    laborRate,
    partsMarkup,
    afterHoursMultiplier,
  });

  const grouped = groupByCategory(pricebook.tasks);

  function handleTradeChange(newTrade: string) {
    setTrade(newTrade);
    trackEvent(
      "pricebook_builder_inputs_changed",
      buildInputChangedProperties(newTrade, laborRate, partsMarkup, afterHoursMultiplier),
    );
  }

  function handleLaborRateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setLaborRate(val);
    trackEvent(
      "pricebook_builder_inputs_changed",
      buildInputChangedProperties(trade, val, partsMarkup, afterHoursMultiplier),
    );
  }

  function handlePartsMarkupChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setPartsMarkup(val);
    trackEvent(
      "pricebook_builder_inputs_changed",
      buildInputChangedProperties(trade, laborRate, val, afterHoursMultiplier),
    );
  }

  function handleAfterHoursChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setAfterHoursMultiplier(val);
    trackEvent(
      "pricebook_builder_inputs_changed",
      buildInputChangedProperties(trade, laborRate, partsMarkup, val),
    );
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDownloadEmail(e.target.value);
    if (emailError) {
      setEmailError(null);
    }
  }

  async function handleDownloadSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!EMAIL_REGEX.test(downloadEmail)) {
      setEmailError("Enter a valid email address");
      return;
    }

    setDownloadStatus("loading");

    try {
      const res = await fetch(`${apiUrl}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: downloadEmail,
          sourcePage: "pricebook-builder",
        }),
      });

      if (res.ok) {
        trackEvent("pricebook_pdf_requested", {
          trade,
          email_provided: true,
        });
        setDownloadStatus("success");
      } else {
        captureSiteFetchFailure(null, {
          source: "pricebook-builder",
          status: res.status,
        });
        trackEvent("pricebook_pdf_request_failed", {
          trade,
          failure_type: "api_error",
          status: res.status,
        });
        setDownloadStatus("error");
      }
    } catch (err) {
      captureSiteFetchFailure(err, {
        source: "pricebook-builder",
        status: undefined,
      });
      trackEvent("pricebook_pdf_request_failed", {
        trade,
        failure_type: "network_error",
      });
      setDownloadStatus("error");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--component-gap-lg, 2rem)",
      }}
    >
      {/* Controls */}
      <section
        style={{
          background: "var(--surface-sunken)",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-6, 1.5rem)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--component-gap-md, 1.25rem)",
        }}
      >
        {/* Trade selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <span className="font-medium text-brand-text" style={{ fontSize: "var(--text-caption)" }}>
            Trade
          </span>
          <div style={{ display: "flex", gap: "var(--component-gap-sm, 0.75rem)" }}>
            {trades.map((tradeOption) => (
              <button
                key={tradeOption.value}
                type="button"
                onClick={() => handleTradeChange(tradeOption.value)}
                className={clsx(
                  "px-4 py-2 rounded-full border font-medium transition-colors",
                  trade === tradeOption.value
                    ? "bg-brand-primary text-surface-primary border-brand-primary"
                    : "bg-transparent text-brand-text border-neutral-300 hover:border-brand-primary",
                )}
                style={{ fontSize: "var(--text-body)" }}
              >
                {tradeOption.label}
              </button>
            ))}
          </div>
        </div>

        {/* Labor rate */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label
            htmlFor="labor-rate"
            className="font-medium text-brand-text"
            style={{ fontSize: "var(--text-caption)" }}
          >
            Your billable rate ($/hr)
          </label>
          <input
            id="labor-rate"
            type="number"
            min={50}
            max={250}
            step={5}
            value={laborRate}
            onChange={handleLaborRateChange}
            className="px-4 py-2 rounded-md border border-neutral-300 bg-surface-primary focus:outline-none focus:border-brand-primary"
            style={{ fontSize: "var(--text-body)", maxWidth: "160px" }}
          />
        </div>

        {/* Parts markup */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label
            htmlFor="parts-markup"
            className="font-medium text-brand-text"
            style={{ fontSize: "var(--text-caption)" }}
          >
            Parts markup
          </label>
          <input
            id="parts-markup"
            type="number"
            min={1.5}
            max={5.0}
            step={0.25}
            value={partsMarkup}
            onChange={handlePartsMarkupChange}
            className="px-4 py-2 rounded-md border border-neutral-300 bg-surface-primary focus:outline-none focus:border-brand-primary"
            style={{ fontSize: "var(--text-body)", maxWidth: "160px" }}
          />
        </div>

        {/* After-hours multiplier */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label
            htmlFor="after-hours-multiplier"
            className="font-medium text-brand-text"
            style={{ fontSize: "var(--text-caption)" }}
          >
            After-hours multiplier
          </label>
          <input
            id="after-hours-multiplier"
            type="number"
            min={1.0}
            max={2.5}
            step={0.25}
            value={afterHoursMultiplier}
            onChange={handleAfterHoursChange}
            className="px-4 py-2 rounded-md border border-neutral-300 bg-surface-primary focus:outline-none focus:border-brand-primary"
            style={{ fontSize: "var(--text-body)", maxWidth: "160px" }}
          />
        </div>
      </section>

      {/* Results table */}
      <section>
        <p className="text-brand-muted mb-4" style={{ fontSize: "var(--text-caption)" }}>
          {resolvedCopy.repairsPricedLabel.replace("{count}", String(pricebook.tasks.length))}
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }} aria-label="Pricebook">
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid var(--color-neutral-200)",
                }}
              >
                <th
                  className="text-left font-semibold text-brand-text"
                  style={{
                    fontSize: "var(--text-caption)",
                    padding: "0.5rem 0.75rem 0.5rem 0",
                  }}
                >
                  Repair
                </th>
                <th
                  className="text-right font-semibold text-brand-text"
                  style={{
                    fontSize: "var(--text-caption)",
                    padding: "0.5rem 0.75rem",
                  }}
                >
                  Standard
                </th>
                <th
                  className="text-right font-semibold text-brand-text"
                  style={{
                    fontSize: "var(--text-caption)",
                    padding: "0.5rem 0 0.5rem 0.75rem",
                  }}
                >
                  After-Hours
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([category, tasks]) => (
                <Fragment key={category}>
                  <tr>
                    <td
                      colSpan={3}
                      className="font-semibold text-brand-primary"
                      style={{
                        fontSize: "var(--text-caption)",
                        padding: "1rem 0 0.25rem 0",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {category}
                    </td>
                  </tr>
                  {tasks.map((pt) => (
                    <tr
                      key={pt.task.id}
                      style={{
                        borderBottom: "1px solid var(--color-neutral-100)",
                      }}
                    >
                      <td
                        className="text-brand-text"
                        style={{
                          fontSize: "var(--text-body)",
                          padding: "0.5rem 0.75rem 0.5rem 0",
                        }}
                      >
                        {pt.task.name}
                      </td>
                      <td
                        className="text-right font-mono text-brand-text"
                        style={{
                          fontSize: "var(--text-body)",
                          padding: "0.5rem 0.75rem",
                        }}
                      >
                        {formatPrice(pt.standardPrice)}
                      </td>
                      <td
                        className="text-right font-mono text-brand-muted"
                        style={{
                          fontSize: "var(--text-body)",
                          padding: "0.5rem 0 0.5rem 0.75rem",
                        }}
                      >
                        {formatPrice(pt.afterHoursPrice)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* PDF download gate */}
      <section
        style={{
          background: "var(--surface-sunken)",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-6, 1.5rem)",
        }}
      >
        {downloadStatus === "success" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--component-gap-md, 1.25rem)",
            }}
          >
            <p className="font-semibold text-brand-text" style={{ fontSize: "var(--text-body)" }}>
              {resolvedCopy.downloadSuccess}
            </p>
            <p className="text-brand-muted" style={{ fontSize: "var(--text-body)" }}>
              {resolvedCopy.trialPrompt.replace("{productName}", productName)}
            </p>
            <a href={trialUrl} className="btn-primary inline-flex items-center gap-2 self-start">
              {resolvedCopy.trialCtaText}
            </a>
          </div>
        ) : (
          <form
            onSubmit={handleDownloadSubmit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--component-gap-sm, 0.75rem)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <label
                htmlFor="pricebook-email"
                className="font-medium text-brand-text"
                style={{ fontSize: "var(--text-caption)" }}
              >
                {resolvedCopy.downloadLabel}
              </label>
              <input
                id="pricebook-email"
                type="email"
                required
                autoComplete="email"
                value={downloadEmail}
                onChange={handleEmailChange}
                placeholder="you@company.com"
                disabled={downloadStatus === "loading"}
                className={clsx(
                  "w-full px-4 py-3 rounded-md border",
                  "bg-surface-primary font-mono",
                  "focus:outline-none focus:border-brand-primary",
                  emailError ? "border-error-500" : "border-neutral-300",
                )}
                style={{ fontSize: "var(--text-body)", maxWidth: "400px" }}
              />
              {emailError ? (
                <p
                  className="text-error-500"
                  style={{ fontSize: "var(--text-caption)" }}
                  role="alert"
                >
                  {emailError}
                </p>
              ) : null}
              {downloadStatus === "error" ? (
                <p
                  className="text-error-500"
                  style={{ fontSize: "var(--text-caption)" }}
                  role="alert"
                >
                  Something went wrong. Try again.
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={downloadStatus === "loading"}
              className={clsx(
                "btn-primary",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                downloadStatus === "loading" && "cursor-wait",
              )}
              style={{ alignSelf: "flex-start" }}
            >
              {downloadStatus === "loading"
                ? resolvedCopy.loadingText
                : resolvedCopy.downloadCtaText}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
