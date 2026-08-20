import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Alert, Button } from "@grantpipe/ui";
import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { z } from "zod";

import { AuthLayout } from "../components/shell/auth-layout";
import { useSession } from "../hooks/use-session";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";

const MessageSchema = z.object({ message: z.string().optional() });

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

async function readResponseOrThrow(response: Response) {
  let payload: unknown;

  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    if (typeof payload === "object" && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (typeof record.message === "string" && record.message.trim().length > 0) {
        throw new Error(record.message);
      }
      if (typeof record.error === "string" && record.error.trim().length > 0) {
        throw new Error(record.error);
      }
    }

    throw new Error("Unable to accept invite. Please try again.");
  }
}

export function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const { user, isLoading } = useSession();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  useEffect(() => {
    async function validateToken() {
      try {
        const res = await api.api.auth.invites[":token"].$get({ param: { token } });
        setTokenValid(res.ok);
        if (!res.ok) {
          const body = MessageSchema.parse(await res.json());
          setError(body.message ?? "This invite link is invalid.");
        }
      } catch {
        setTokenValid(false);
        setError("Unable to verify this invite link.");
      }
    }
    void validateToken();
  }, [token]);

  async function handleAccept() {
    setError(null);
    setIsAccepting(true);

    try {
      const response = await api.api.auth.invites[":token"].accept.$post({
        param: { token },
      });
      await readResponseOrThrow(response);
      captureEvent("invite_accepted");
      await queryClient.invalidateQueries({ queryKey: ["auth-session-context"] });
      await queryClient.invalidateQueries({ queryKey: ["org-profile"] });
      setAccepted(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "An unexpected error occurred. Please try again.",
      );
    } finally {
      setIsAccepting(false);
    }
  }

  if (tokenValid === null) {
    return (
      <AuthLayout title="Verifying invite…" subtitle="We are checking your link.">
        <div className="h-6" aria-busy />
      </AuthLayout>
    );
  }

  if (!tokenValid) {
    return (
      <AuthLayout title="Invalid invite" subtitle={error ?? "This invite link is no longer valid."}>
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="You've been invited"
      subtitle="Accept this invite to join your team on GrantPipe."
    >
      <div className="space-y-4">
        {accepted && (
          <Alert variant="success" title="Invite accepted">
            <div className="space-y-3">
              <p>Welcome to GrantPipe!</p>
              <Button asChild className="w-full">
                <Link to="/">Continue to dashboard</Link>
              </Button>
            </div>
          </Alert>
        )}

        {error !== null && (
          <Alert variant="destructive" title="Couldn't accept">
            {error}
          </Alert>
        )}

        {!isLoading && !accepted ? (
          user ? (
            <Button type="button" onClick={handleAccept} disabled={isAccepting} className="w-full">
              {isAccepting ? "Accepting…" : "Accept invite"}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Create an account or sign in to accept this invite.
              </p>
              <Button asChild className="w-full">
                <Link to="/signup" search={{ invite: token }}>
                  Sign up
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login" search={{ invite: token }}>
                  Sign in
                </Link>
              </Button>
            </div>
          )
        ) : null}
      </div>
    </AuthLayout>
  );
}
