import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Alert, Button, Input, Label } from "@grantpipe/ui";
import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";

import { AuthLayout } from "../components/shell/auth-layout";
import { signIn } from "../lib/auth-client";
import {
  appendPendingEventMarker,
  captureEvent,
  storePendingAnalyticsEvents,
} from "../lib/analytics";
import { captureAppException } from "../lib/sentry";
import { buildInvitePath } from "../lib/invite-links";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    reset: z.string().optional(),
    invite: z.string().optional(),
  }),
  component: LoginPage,
});

export function LoginPage() {
  const queryClient = useQueryClient();
  const { reset, invite } = Route.useSearch();
  const inviteCallback = buildInvitePath(invite);
  const callbackURL = inviteCallback ?? "/app/dashboard";
  const signupSearch = invite ? { invite } : undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn.email({
        email,
        password,
        callbackURL,
      });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed. Please try again.");
      } else {
        captureEvent("login_completed", { method: "email" });
        // Better Auth performs the browser navigation via callbackURL.
        // Drop the cached session so the new session loads on the next page.
        await queryClient.invalidateQueries({ queryKey: ["auth-session-context"] });
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      captureAppException(err instanceof Error ? err : new Error("Login submission failed"), {
        tags: { source: "login", feature: "email-login" },
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEmailBlur() {
    if (email.trim().length > 0 && !email.includes("@")) {
      setEmailError("Enter a valid email address.");
    } else {
      setEmailError(null);
    }
  }

  function handlePasswordBlur() {
    if (password.length > 0 && password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
    } else {
      setPasswordError(null);
    }
  }

  async function handleGoogleSignIn() {
    // Persisted in localStorage so it survives the Google OAuth redirect and
    // fires exactly once on the first authenticated load (see analytics.ts). The
    // marker on the callback URL scopes the drain to this genuine OAuth return,
    // so a shared-localStorage event cannot fire on an unrelated tab's load.
    storePendingAnalyticsEvents({ event: "login_completed", properties: { method: "google" } });
    await signIn.social({ provider: "google", callbackURL: appendPendingEventMarker(callbackURL) });
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to your workspace."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            to="/signup"
            search={signupSearch}
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {reset === "true" ? (
        <Alert title="Password updated">
          Your password has been updated. Sign in with your new password.
        </Alert>
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error !== null && (
          <Alert variant="destructive" title="Sign in failed">
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
            onBlur={handleEmailBlur}
            placeholder="you@example.com"
            aria-invalid={emailError !== null ? true : undefined}
            aria-describedby={emailError ? "email-blur-error" : undefined}
          />
          {emailError && (
            <p id="email-blur-error" role="alert" className="text-xs text-destructive leading-5">
              {emailError}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-sm text-muted-foreground hover:text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={handlePasswordBlur}
              aria-invalid={passwordError !== null ? true : undefined}
              aria-describedby={passwordError ? "password-blur-error" : undefined}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-full p-0.5"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Eye aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>
          {passwordError && (
            <p id="password-blur-error" role="alert" className="text-xs text-destructive leading-5">
              {passwordError}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wider">
            <span className="bg-background px-3 text-muted-foreground">or</span>
          </div>
        </div>

        <Button type="button" variant="outline" onClick={handleGoogleSignIn} className="w-full">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-2 h-4 w-4" fill="none">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>
      </form>
    </AuthLayout>
  );
}
