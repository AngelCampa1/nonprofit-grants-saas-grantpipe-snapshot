import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MessageSquare, X } from "lucide-react";
import { ANALYTICS_EVENTS, FOUNDER_BOOKING_URLS } from "@grantpipe/shared";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grantpipe/ui";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { getTextLengthBucket } from "../lib/analytics-buckets";
import { throwIfNotOk } from "../lib/http-response";
import { useSession } from "../hooks/use-session";

type FeedbackCategory = "bug" | "idea" | "question" | "other";

const MAX_MESSAGE_LENGTH = 5000;

type FeedbackPayload = {
  message: string;
  category: FeedbackCategory;
  reporterEmail: string;
  pageUrl: string;
  userAgent: string;
};

export function FeedbackWidget() {
  const { user } = useSession();
  const sessionEmail = user?.email ?? "";

  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("other");
  const [email, setEmail] = useState(sessionEmail);
  const [validationError, setValidationError] = useState<string | null>(null);

  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: FeedbackPayload) => {
      const res = await api.api.feedback.$post({ json: payload });
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      captureEvent(ANALYTICS_EVENTS.feedbackSubmitted, {
        surface: "floating_widget",
        category: variables.category,
        message_length_bucket: getTextLengthBucket(variables.message.length),
        has_reply_email: variables.reporterEmail.trim().length > 0,
      });
      setSubmittedEmail(email);
      setSubmitted(true);
      setMessage("");
      setCategory("other");
      setValidationError(null);
    },
  });

  function resetForm() {
    setMessage("");
    setCategory("other");
    setEmail(sessionEmail);
    setValidationError(null);
    setSubmitted(false);
    setSubmittedEmail("");
    mutation.reset();
  }

  function handleOpen() {
    resetForm();
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      (previouslyFocusedElementRef.current ?? openButtonRef.current)?.focus();
      previouslyFocusedElementRef.current = null;
      return;
    }

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      const focusableElements = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0]!;
      const lastElement = focusableElements[focusableElements.length - 1]!;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  // sessionEmail is picked up at open time: handleOpen -> resetForm reads the
  // latest closure value and calls setEmail(sessionEmail). No render-phase or
  // effect-driven sync is required (and avoids the React 18+ warnings about
  // setState in render or cascading setState inside an effect body).

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.reset();
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      setValidationError("Message is required");
      return;
    }
    if (email.trim().length === 0) {
      setValidationError("Email is required");
      return;
    }
    setValidationError(null);
    mutation.mutate({
      message: trimmed,
      category,
      reporterEmail: email.trim(),
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
    });
  }

  const mutationErrorMessage = mutation.isError
    ? mutation.error instanceof Error
      ? mutation.error.message
      : "Something went wrong. Please try again."
    : null;

  return (
    <>
      <Button
        type="button"
        ref={openButtonRef}
        onClick={handleOpen}
        aria-label="Feedback"
        title="Feedback"
        className="fixed bottom-4 right-4 z-40 hidden size-11 items-center justify-center rounded-full border border-border bg-primary p-0 text-primary-foreground shadow-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:flex"
      >
        <MessageSquare className="size-4" aria-hidden />
      </Button>

      {open ? (
        <div
          data-testid="feedback-backdrop"
          className="fixed inset-0 z-50 flex items-end justify-end bg-foreground/45 p-4 sm:items-center sm:justify-center"
          onClick={handleClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
            ref={dialogRef}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  id="feedback-dialog-title"
                  className="font-heading text-lg font-semibold text-foreground"
                >
                  Send feedback
                </p>
                <p className="text-sm text-muted-foreground">
                  {submitted
                    ? "Feedback received"
                    : "Ask a question or tell us what is not working. We read every message."}
                </p>
              </div>
              <Button
                ref={closeButtonRef}
                type="button"
                variant="outline"
                size="icon"
                onClick={handleClose}
                aria-label="Close feedback"
                className="border border-border bg-card shadow-sm hover:bg-muted"
              >
                <X className="size-4" />
              </Button>
            </div>

            {submitted ? (
              <div className="mt-4 flex flex-col gap-4">
                <p className="text-sm text-foreground">
                  Thanks. We will reply to {submittedEmail}.
                </p>
                <p className="text-sm text-muted-foreground">
                  Or{" "}
                  <a
                    href={FOUNDER_BOOKING_URLS.quickCall}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    book a 15-min call
                  </a>
                </p>
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" onClick={handleClose}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
                <div className="flex flex-col gap-1 text-sm text-foreground">
                  <label className="font-medium">Category</label>
                  <Select
                    value={category}
                    onValueChange={(val) => setCategory(val as FeedbackCategory)}
                  >
                    <SelectTrigger aria-label="Feedback category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">Bug</SelectItem>
                      <SelectItem value="idea">Idea</SelectItem>
                      <SelectItem value="question">Question or help request</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1 text-sm text-foreground">
                  <label htmlFor="feedback-message" className="font-medium">
                    Message
                  </label>
                  <textarea
                    id="feedback-message"
                    aria-describedby="feedback-message-counter"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={MAX_MESSAGE_LENGTH}
                    rows={5}
                    required
                    className="rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                  <span id="feedback-message-counter" className="text-xs text-muted-foreground">
                    {message.length} / {MAX_MESSAGE_LENGTH}
                  </span>
                </div>

                <div className="flex flex-col gap-1 text-sm text-foreground">
                  <label htmlFor="feedback-email" className="font-medium">
                    Email
                  </label>
                  <Input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {validationError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {validationError}
                  </p>
                ) : null}

                {mutationErrorMessage ? (
                  <p role="alert" className="text-sm text-destructive">
                    {mutationErrorMessage}
                  </p>
                ) : null}

                <div className="mt-1 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Sending…" : "Send feedback"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
