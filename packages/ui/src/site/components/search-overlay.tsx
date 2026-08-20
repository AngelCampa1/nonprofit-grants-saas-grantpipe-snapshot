import { useState, useEffect, useCallback, useRef } from "react";
import { sanitizeExcerpt } from "../lib/sanitize";
import { useFocusTrap } from "../lib/focus-trap";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";

interface SearchOverlayLabels {
  searching?: string;
  noResults?: string;
  emptyState?: string;
  errorMessage?: string;
}

const defaultSearchLabels: Required<SearchOverlayLabels> = {
  searching: "",
  noResults: "",
  emptyState: "",
  errorMessage: "Search failed. Please try again.",
};

interface SearchOverlayProps {
  siteName: string;
  placeholder?: string;
  labels?: SearchOverlayLabels;
  /** Maximum number of search results to display. Defaults to 8. */
  maxResults?: number;
  /** Override the pagefind loader — used in tests to inject a mock. */
  _loadPagefind?: () => Promise<PagefindUI | null>;
}

interface PagefindResult {
  url: string;
  meta: { title: string };
  excerpt: string;
}

interface PagefindUI {
  search: (query: string) => Promise<{ results: { data: () => Promise<PagefindResult> }[] }>;
  destroy?: () => void;
}

function getSearchQueryLengthBucket(query: string): string {
  const length = query.trim().length;
  if (length <= 0) return "0";
  if (length <= 10) return "1-10";
  if (length <= 30) return "11-30";
  return "30+";
}

function getSearchResultCountBucket(count: number): string {
  if (count <= 0) return "0";
  if (count <= 3) return "1-3";
  if (count <= 8) return "4-8";
  return "8+";
}

function getSearchResultPath(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return "[invalid]";
  }
}

export async function loadPagefindModule(): Promise<PagefindUI | null> {
  try {
    const pagefindPath = "/pagefind/pagefind.js";
    return (await import(/* @vite-ignore */ pagefindPath)) as PagefindUI;
  } catch {
    // Pagefind not available (dev mode or not yet built)
    return null;
  }
}

export function SearchOverlay({
  siteName,
  placeholder = "Search...",
  labels: labelsProp,
  maxResults = 8,
  _loadPagefind = loadPagefindModule,
}: SearchOverlayProps) {
  const labels = { ...defaultSearchLabels, ...labelsProp };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PagefindResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pagefindReady, setPagefindReady] = useState(false);
  const [pagefindUnavailable, setPagefindUnavailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pagefindRef = useRef<PagefindUI | null>(null);
  const resultRefsRef = useRef<(HTMLLIElement | null)[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [open]);

  const close = useCallback(
    (trigger?: "escape" | "backdrop" | "keyboard_toggle") => {
      if (trigger) {
        trackEvent("site_search_closed", {
          trigger,
          had_query: query.trim().length > 0,
          had_results: results.length > 0,
          query_length_bucket: getSearchQueryLengthBucket(query),
          result_count_bucket: getSearchResultCountBucket(results.length),
        });
      }

      setOpen(false);
      setQuery("");
      setResults([]);
      setActiveIndex(-1);
      setSearchError(false);
      setLoading(false);
    },
    [query, results.length],
  );

  const openSearch = useCallback((trigger: "button" | "keyboard") => {
    setOpen(true);
    setPagefindUnavailable(false);
    trackEvent("site_search_opened", { trigger });
  }, []);

  const activateResult = useCallback(
    (result: PagefindResult, index: number, activationMethod: "click" | "keyboard") => {
      trackEvent("site_search_result_clicked", {
        query_length_bucket: getSearchQueryLengthBucket(query),
        result_position: index + 1,
        result_path: getSearchResultPath(result.url),
        activation_method: activationMethod,
      });
      window.location.assign(result.url);
      close();
    },
    [close, query],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          close("keyboard_toggle");
        } else {
          setOpen(true);
          setPagefindUnavailable(false);
          trackEvent("site_search_opened", { trigger: "keyboard" });
        }
      }
      if (e.key === "Escape" && open) {
        close("escape");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    async function loadPagefind() {
      if (pagefindRef.current) return;
      try {
        const pf = await _loadPagefind();
        if (pf) {
          pagefindRef.current = pf;
          setPagefindReady(true);
          setPagefindUnavailable(false);
          return;
        }
        captureException(new Error("Pagefind module unavailable"), {
          tags: { source: "site-search", failure_type: "pagefind_load_error" },
        });
        setPagefindUnavailable(true);
        setPagefindReady(false);
      } catch (error) {
        captureException(error, {
          tags: { source: "site-search", failure_type: "pagefind_load_error" },
        });
        setPagefindUnavailable(true);
        setPagefindReady(false);
      }
    }
    loadPagefind();
  }, [open, _loadPagefind]);

  useEffect(() => {
    return () => {
      pagefindRef.current?.destroy?.();
      pagefindRef.current = null;
    };
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    const effectiveMaxResults = Math.max(1, maxResults);

    if (!trimmedQuery) {
      return;
    }

    if (pagefindUnavailable) {
      let cancelled = false;
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setResults([]);
        setSearchError(true);
        setActiveIndex(-1);
        setLoading(false);
        trackEvent("site_search_failed", {
          query_length_bucket: getSearchQueryLengthBucket(query),
          failure_type: "pagefind_load_error",
          max_results: effectiveMaxResults,
        });
      });
      return () => {
        cancelled = true;
      };
    }

    if (!pagefindRef.current) {
      return;
    }

    let cancelled = false;

    async function doSearch() {
      const pf = pagefindRef.current;

      try {
        const search = await pf!.search(query);
        const settled = await Promise.allSettled(
          search.results.slice(0, effectiveMaxResults).map((r) => r.data()),
        );
        const data = settled
          .filter((r): r is PromiseFulfilledResult<PagefindResult> => r.status === "fulfilled")
          .map((r) => r.value);
        const hasRejections = settled.some((r) => r.status === "rejected");
        if (!cancelled) {
          setResults(data);
          setSearchError(hasRejections && data.length === 0);
          setActiveIndex(-1);
          setLoading(false);
          if (hasRejections && data.length === 0) {
            captureException(new Error("Site search result data failed"), {
              tags: { source: "site-search", failure_type: "result_load_error" },
              extra: {
                query_length_bucket: getSearchQueryLengthBucket(query),
                max_results: effectiveMaxResults,
              },
            });
            trackEvent("site_search_failed", {
              query_length_bucket: getSearchQueryLengthBucket(query),
              failure_type: "result_load_error",
              max_results: effectiveMaxResults,
            });
          } else {
            trackEvent("site_search_performed", {
              query_length_bucket: getSearchQueryLengthBucket(query),
              result_count_bucket: getSearchResultCountBucket(data.length),
              had_partial_failure: hasRejections,
              max_results: effectiveMaxResults,
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setResults([]);
          setSearchError(true);
          setLoading(false);
          captureException(error, {
            tags: { source: "site-search", failure_type: "search_error" },
            extra: {
              query_length_bucket: getSearchQueryLengthBucket(query),
              max_results: effectiveMaxResults,
            },
          });
          trackEvent("site_search_failed", {
            query_length_bucket: getSearchQueryLengthBucket(query),
            failure_type: "search_error",
            max_results: effectiveMaxResults,
          });
        }
      }
    }

    const timer = setTimeout(doSearch, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, maxResults, pagefindReady, pagefindUnavailable]);

  const handleResultKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (results.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev < results.length - 1 ? prev + 1 : 0;
          resultRefsRef.current[next]?.focus();
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev > 0 ? prev - 1 : results.length - 1;
          resultRefsRef.current[next]?.focus();
          return next;
        });
      }
    },
    [results],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => openSearch("button")}
        className="p-2 rounded-full text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
        aria-label={`Search ${siteName}`}
        title="Search (Ctrl+K)"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "var(--surface-overlay)",
        }}
        onClick={() => close("backdrop")}
        aria-hidden="true"
      />

      {/* Search panel */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg mx-4 rounded-2xl border overflow-hidden"
        onKeyDown={handleResultKeyDown}
        style={{
          backgroundColor: "var(--surface-primary)",
          borderColor: "var(--color-neutral-200)",
          boxShadow: "var(--shadow-ambient)",
        }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: "var(--color-neutral-200)" }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-neutral-400 shrink-0"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              const nextQuery = e.target.value;
              setQuery(nextQuery);
              if (!nextQuery.trim()) {
                setResults([]);
                setActiveIndex(-1);
                setSearchError(false);
                setLoading(false);
              } else {
                setLoading(true);
                setSearchError(false);
              }
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none"
            style={{
              color: "var(--color-brand-text)",
              fontSize: "var(--text-body)",
            }}
            role="combobox"
            aria-label="Search query"
            aria-expanded={results.length > 0}
            aria-haspopup="listbox"
            aria-controls={results.length > 0 ? "search-results" : undefined}
            aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
          />
          <kbd
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[length:var(--text-caption)] rounded-sm border"
            style={{
              color: "var(--color-neutral-400)",
              borderColor: "var(--color-neutral-200)",
              backgroundColor: "var(--surface-secondary)",
            }}
          >
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && labels.searching && (
            <div
              className="px-4 py-8 text-center text-[length:var(--text-caption)]"
              style={{ color: "var(--color-neutral-400)" }}
            >
              {labels.searching}
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && searchError && (
            <div
              className="px-4 py-8 text-center text-[length:var(--text-caption)]"
              style={{ color: "var(--color-neutral-400)" }}
            >
              {labels.errorMessage}
            </div>
          )}

          {!loading && query.trim() && results.length === 0 && !searchError && (
            <div
              className="px-4 py-8 text-center text-[length:var(--text-caption)]"
              style={{ color: "var(--color-neutral-400)" }}
            >
              {labels.noResults ? `${labels.noResults} ` : ""}&ldquo;{query}
              &rdquo;
            </div>
          )}

          {!loading && results.length > 0 && (
            <ul id="search-results" role="listbox" className="py-2">
              {results.map((result, index) => (
                <li
                  key={result.url}
                  id={`search-result-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={index === activeIndex ? 0 : -1}
                  data-href={result.url}
                  ref={(el) => {
                    resultRefsRef.current[index] = el;
                  }}
                  className={`block px-4 py-3 transition-colors cursor-pointer ${index === activeIndex ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
                  onClick={() => activateResult(result, index, "click")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      activateResult(result, index, "keyboard");
                    }
                  }}
                >
                  <p
                    className="text-[length:var(--text-caption)] font-medium"
                    style={{ color: "var(--color-brand-text)" }}
                  >
                    {result.meta.title}
                  </p>
                  {result.excerpt && (
                    <p
                      className="mt-1 line-clamp-2"
                      style={{
                        color: "var(--color-neutral-500)",
                        fontSize: "var(--text-caption)",
                      }}
                      dangerouslySetInnerHTML={{
                        __html: sanitizeExcerpt(result.excerpt),
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {!loading && !query.trim() && labels.emptyState && (
            <div
              className="px-4 py-8 text-center text-[length:var(--text-caption)]"
              style={{ color: "var(--color-neutral-400)" }}
            >
              {labels.emptyState} {siteName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
