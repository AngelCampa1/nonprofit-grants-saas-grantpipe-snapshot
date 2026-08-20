import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Alert, Button, Input, Label } from "@grantpipe/ui";
import React, { useState } from "react";

import { AuthLayout } from "../components/shell/auth-layout";
import { authClient } from "../lib/auth-client";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: ResetPasswordPage,
});

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!token) {
    return (
      <AuthLayout
        title="Link expired"
        subtitle="This reset link is invalid or has expired."
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Button asChild variant="outline" className="w-full">
          <Link to="/forgot-password">Request a new reset link</Link>
        </Button>
      </AuthLayout>
    );
  }

  // token is guaranteed non-undefined here — the early-return guard above handles the missing case
  const safeToken = token;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authClient.resetPassword({
        newPassword,
        token: safeToken,
      });

      if (result.error) {
        setError(result.error.message ?? "An unexpected error occurred. Please try again.");
      } else {
        captureEvent("password_reset_completed");
        await navigate({ to: "/login", search: { reset: "true" }, replace: true });
      }
    } catch (err) {
      captureAppException(
        err,
        {
          tags: { source: "auth", feature: "reset-password" },
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
      title="Set a new password"
      subtitle="Choose a strong password for your account."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error !== null && (
          <Alert variant="destructive" title="Reset failed">
            {error}
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Setting password…" : "Set password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
