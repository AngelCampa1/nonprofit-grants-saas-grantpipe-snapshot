import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  PageShell,
  StatusPanel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@grantpipe/ui";
import { MailIcon, SendIcon } from "lucide-react";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { useContacts, useSendDonorMailMerge } from "../../../hooks/use-donors";
import { donorTabs } from "../../../config/page-tabs";

export const Route = createFileRoute("/_authenticated/donors/email")({
  component: DonorEmailPage,
});

const PAGE_SIZE = 100;
const TOKEN_LABELS = ["{{firstName}}", "{{fullName}}", "{{organizationName}}", "{{email}}"];

type ContactRow = {
  id: string;
  type: string;
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
  email?: string | null;
  emailOptOut?: boolean | null;
  pipelineStage?: string | null;
};

function displayName(contact: ContactRow): string {
  const individualName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return (
    contact.organizationName?.trim() || individualName || contact.email?.trim() || "Unnamed donor"
  );
}

export function DonorEmailPage() {
  const contactsQuery = useContacts({
    page: 1,
    pageSize: PAGE_SIZE,
    sortBy: "name",
    sortOrder: "asc",
  });
  const sendMutation = useSendDonorMailMerge();
  const contacts = useMemo(
    () => (contactsQuery.data?.data ?? []) as ContactRow[],
    [contactsQuery.data?.data],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("A note for {{firstName}}");
  const [body, setBody] = useState("Hi {{firstName}},\n\nThank you for staying close to our work.");
  const [error, setError] = useState<string | null>(null);
  const pendingAttemptRef = useRef<{ fingerprint: string; attemptId: string } | null>(null);

  const sendReadyCount = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          selectedIds.includes(contact.id) && contact.email?.trim() && !contact.emailOptOut,
      ).length,
    [contacts, selectedIds],
  );

  function toggleContact(contactId: string) {
    setSelectedIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  }

  async function handleSend() {
    setError(null);
    if (selectedIds.length === 0) {
      setError("Choose at least one donor.");
      return;
    }
    try {
      const fingerprint = JSON.stringify({ contactIds: selectedIds, subject, body });
      const attempt =
        pendingAttemptRef.current?.fingerprint === fingerprint
          ? pendingAttemptRef.current
          : { fingerprint, attemptId: crypto.randomUUID() };
      pendingAttemptRef.current = attempt;
      const result = await sendMutation.mutateAsync({
        attemptId: attempt.attemptId,
        contactIds: selectedIds,
        subject,
        body,
      });
      if (result.failed === 0) pendingAttemptRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send donor email.");
    }
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker="Fundraising"
        title="Donor Email"
        description="Send a batch email to selected donors and log each sent message."
      />

      <AppPageTabs groupId="donors" items={donorTabs} />

      <div className="grid gap-4 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <Card>
          <CardHeader>
            <CardTitle>Recipients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contactsQuery.isLoading ? (
              <StatusPanel variant="loading" title="Loading donors…">
                Finding donors you can email.
              </StatusPanel>
            ) : contactsQuery.isError ? (
              <StatusPanel variant="error" title="Unable to load donors.">
                Refresh the page and try again.
              </StatusPanel>
            ) : contacts.length === 0 ? (
              <StatusPanel variant="empty" title="No donors yet">
                Add donors before sending email.
              </StatusPanel>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Send</TableHead>
                    <TableHead>Donor</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => {
                    const selected = selectedIds.includes(contact.id);
                    const emailLabel = contact.emailOptOut
                      ? "Opted out"
                      : contact.email?.trim() || "No email";
                    return (
                      <TableRow key={contact.id}>
                        <TableCell>
                          <input
                            aria-label={`Select ${displayName(contact)}`}
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleContact(contact.id)}
                            className="h-4 w-4 rounded border-border"
                          />
                        </TableCell>
                        <TableCell
                          className="max-w-[140px] truncate font-medium"
                          title={displayName(contact)}
                        >
                          {displayName(contact)}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate" title={emailLabel}>
                          {emailLabel}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="secondary">{contact.pipelineStage ?? "prospect"}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            {sendMutation.data ? (
              <Alert>
                Sent {sendMutation.data.sent}; skipped {sendMutation.data.skipped}; failed{" "}
                {sendMutation.data.failed}.
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="donor-email-subject">Subject</Label>
              <Input
                id="donor-email-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="donor-email-body">Message</Label>
              <Textarea
                id="donor-email-body"
                rows={10}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {TOKEN_LABELS.map((token) => (
                <Badge key={token} variant="outline">
                  {token}
                </Badge>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {selectedIds.length} selected · {sendReadyCount} can receive email.
                </p>
              </div>
              <Button
                type="button"
                className="rounded-full"
                disabled={sendMutation.isPending}
                onClick={() => void handleSend()}
              >
                {sendMutation.isPending ? (
                  "Sending…"
                ) : (
                  <>
                    <SendIcon className="mr-2 h-4 w-4" />
                    Send Email
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <MailIcon className="mt-0.5 h-4 w-4" />
              <span>Each sent email is saved on the donor communication timeline.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
