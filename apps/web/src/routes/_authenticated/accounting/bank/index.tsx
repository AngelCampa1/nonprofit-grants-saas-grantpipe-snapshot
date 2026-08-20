import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  InlineError,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageHeader,
  PageShell,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TeachAndActEmptyState,
} from "@grantpipe/ui";
import { useSession } from "../../../../hooks/use-session";
import { canAccessFeature } from "../../../../lib/access-control";
import {
  useBankAccounts,
  useCreateBankAccount,
  useDeleteBankAccount,
} from "../../../../hooks/use-accounting";
import { formatUtcCalendarDate } from "../../../../lib/format";
import { ChevronRight, Landmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounting/bank/")({
  component: BankAccountsPage,
});

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
  const createMutation = useCreateBankAccount();
  const [name, setName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName("");
      setAccountNumber("");
      setFormError(null);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Account name is required.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        ...(accountNumber.trim() ? { accountNumber: accountNumber.trim() } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to add bank account.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add bank account</DialogTitle>
          <DialogDescription>
            Add a bank account. Then upload a statement to match and reconcile it.
          </DialogDescription>
        </DialogHeader>
        <form id="add-account-form" className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-1">
            <Label htmlFor="ba-name">Account Name</Label>
            <Input
              id="ba-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Checking - Chase"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ba-number">Account Number (last 4 digits, optional)</Label>
            <Input
              id="ba-number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="1234"
              maxLength={4}
            />
          </div>
          {formError ? <InlineError>{formError}</InlineError> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-account-form" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding…" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BankAccountsPage() {
  const { memberRole, memberPermissions } = useSession();
  const canManageAccounting = canAccessFeature(
    memberRole,
    memberPermissions,
    "accounting",
    "manage",
  );

  const bankAccountsQuery = useBankAccounts();
  const deleteAccountMutation = useDeleteBankAccount();
  const accounts = bankAccountsQuery.data ?? [];

  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<(typeof accounts)[number] | null>(null);

  async function handleDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteAccountMutation.mutateAsync(id);
      setAccountToDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Unable to delete bank account.");
    }
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        title="Bank Accounts"
        actions={
          canManageAccounting ? (
            <Button size="sm" onClick={() => setAddAccountOpen(true)}>
              <Landmark className="mr-2 size-4" />
              Add account
            </Button>
          ) : undefined
        }
      />

      {deleteError ? (
        <Alert variant="destructive" title="Unable to delete account.">
          {deleteError}
        </Alert>
      ) : null}

      {bankAccountsQuery.isError ? (
        <Alert variant="destructive" title="Unable to load bank accounts.">
          <Button variant="outline" onClick={() => void bankAccountsQuery.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : bankAccountsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <TeachAndActEmptyState
          icon={<Landmark />}
          heading="See money move in and out"
          description="Add a bank account. Then upload a statement to match transactions fast."
          primaryAction={
            canManageAccounting
              ? { label: "Add account", onClick: () => setAddAccountOpen(true) }
              : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Account Number</TableHead>
              <TableHead>GL Account</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium">
                  <Link
                    to="/accounting/bank/$bankAccountId"
                    params={{ bankAccountId: account.id }}
                    className="text-primary hover:underline"
                  >
                    {account.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono">
                  {account.accountNumber ? (
                    <Badge variant="outline">•••• {account.accountNumber}</Badge>
                  ) : (
                    <span className="text-muted-foreground">N/A</span>
                  )}
                </TableCell>
                <TableCell>
                  {account.glAccountId ? (
                    <Badge variant="secondary">Linked</Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not linked</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatUtcCalendarDate(account.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        to="/accounting/bank/$bankAccountId"
                        params={{ bankAccountId: account.id }}
                      >
                        View
                        <ChevronRight className="ml-1 size-4" />
                      </Link>
                    </Button>
                    {canManageAccounting ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAccountToDelete(account)}
                        disabled={
                          deleteAccountMutation.isPending &&
                          deleteAccountMutation.variables === account.id
                        }
                        className="text-destructive hover:text-destructive"
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AddAccountDialog open={addAccountOpen} onOpenChange={setAddAccountOpen} />
      <Dialog
        open={accountToDelete !== null}
        onOpenChange={(open) => !open && setAccountToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete bank account?</DialogTitle>
            <DialogDescription>
              Delete {accountToDelete?.name}? This removes the account from accounting setup.
              Existing imported transactions may prevent deletion.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAccountToDelete(null)}
              disabled={deleteAccountMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => accountToDelete && void handleDelete(accountToDelete.id)}
              disabled={deleteAccountMutation.isPending}
            >
              {deleteAccountMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
