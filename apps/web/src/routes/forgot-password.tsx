import { createFileRoute, Link } from "@tanstack/react-router";
import { Alert, Button, Input, Label } from "@grantpipe/ui";
import React, { useState } from "react";

import { AuthLayout } from "../components/shell/auth-layout";
import { authClient } from "../lib/auth-client";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const redirectOrigin = typeof window !== "undefined" ? window.location.origin : "";
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${redirectOrigin}/app/reset-password`,
      });

      if (result.error) {
        setError(result.error.message ?? "An unexpected error occurred. Please try again.");
      } else {
        setSubmitted(true);
        captureEvent("forgot_password_submitted");
      }
    } catch (err) {
      captureAppException(
        err,
        {
          tags: { source: "auth", feature: "forgot-password" },
        },
        { sanitize: true },
      );
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send reset instructions."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {submitted ? (
        <p className="text-sm text-muted-foreground">
          If an account exists for {email}, we sent reset instructions. Check your inbox.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error !== null && (
            <Alert variant="destructive" title="Request failed">
              {error}
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
