import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TeachAndActEmptyState,
} from "@grantpipe/ui";
import { useSession } from "../../../hooks/use-session";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  type AccountRow,
} from "../../../hooks/use-accounting";
import { ACCOUNT_TYPES, type AccountType } from "@grantpipe/shared";
import { BookOpen, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounting/chart-of-accounts")({
  component: ChartOfAccountsPage,
});

type DialogMode = "create" | "edit" | "view";

interface AccountDialogProps {
  mode: DialogMode;
  account?: AccountRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function AccountDialog({ mode, account, open, onOpenChange, onSuccess }: AccountDialogProps) {
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount(account?.id ?? "");

  const [code, setCode] = useState(account?.code ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType | "">(
    (account?.type as AccountType | undefined) ?? "",
  );
  const [subtype, setSubtype] = useState(account?.subtype ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setCode(account?.code ?? "");
      setName(account?.name ?? "");
      setType((account?.type as AccountType | undefined) ?? "");
      setSubtype(account?.subtype ?? "");
      setFormError(null);
    }
  }, [open, account]);

  const isReadOnly = mode === "view";
  const isPending = createAccount.isPending || updateAccount.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!code.trim()) {
      setFormError("Code is required.");
      return;
    }
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!type) {
      setFormError("Type is required.");
      return;
    }

    try {
      if (mode === "create") {
        await createAccount.mutateAsync({
          code: code.trim(),
          name: name.trim(),
          type,
          ...(subtype.trim() ? { subtype: subtype.trim() } : {}),
        });
      } else if (mode === "edit" && account) {
        await updateAccount.mutateAsync({
          code: code.trim(),
          name: name.trim(),
          type,
          subtype: subtype.trim() || null,
        });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : mode === "create"
            ? "Unable to add account."
            : "Unable to save account.",
      );
    }
  }

  async function handleDeactivate() {
    if (!account) return;
    setFormError(null);
    try {
      await updateAccount.mutateAsync({ isActive: false });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to deactivate account.");
    }
  }

  async function handleActivate() {
    if (!account) return;
    setFormError(null);
    try {
      await updateAccount.mutateAsync({ isActive: true });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to activate account.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? "Add account"
              : mode === "edit"
                ? "Edit account"
                : "Account details"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a new account to the chart of accounts."
              : mode === "edit"
                ? "Update account details. Changing the code affects all existing ledger entries."
                : "Account information."}
          </DialogDescription>
        </DialogHeader>

        <form id="account-form" className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-1">
            <Label htmlFor="account-code">Code</Label>
            <Input
              id="account-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isReadOnly}
              placeholder="e.g. 1000"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isReadOnly}
              placeholder="e.g. Cash and Cash Equivalents"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="account-type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as AccountType)}
              disabled={isReadOnly}
            >
              <SelectTrigger id="account-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="account-subtype">Subtype (optional)</Label>
            <Input
              id="account-subtype"
              value={subtype}
              onChange={(e) => setSubtype(e.target.value)}
              disabled={isReadOnly}
              placeholder="e.g. current_asset"
            />
          </div>

          {formError ? <InlineError>{formError}</InlineError> : null}
        </form>

        <DialogFooter className="flex-wrap gap-2">
          {mode === "edit" && account?.isActive ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDeactivate()}
              disabled={isPending}
              className="mr-auto text-destructive hover:text-destructive"
            >
              Deactivate
            </Button>
          ) : mode === "edit" && account && !account.isActive ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleActivate()}
              disabled={isPending}
              className="mr-auto"
            >
              Activate
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isReadOnly ? "Close" : "Cancel"}
          </Button>
          {!isReadOnly ? (
            <Button type="submit" form="account-form" disabled={isPending}>
              {mode === "create" ? (isPending ? "Adding…" : "Add") : isPending ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChartOfAccountsPage() {
  const { memberRole } = useSession();
  const isAdmin = memberRole === "admin";

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AccountType | "">("");
  const accountsQuery = useAccounts({
    search: search || undefined,
    type: typeFilter || undefined,
    pageSize: 200,
  });

  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);

  const accounts = accountsQuery.data ?? [];
  const hasAccountsFilterChrome = accounts.length > 0 || Boolean(search || typeFilter);

  function openCreate() {
    setDialogMode("create");
    setSelectedAccount(undefined);
    setDialogOpen(true);
  }

  function openAccount(account: AccountRow) {
    setSelectedAccount(account);
    setDialogMode(isAdmin ? "edit" : "view");
    setDialogOpen(true);
  }

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        title="Chart of Accounts"
        actions={
          isAdmin ? (
            <Button onClick={openCreate} size="sm">
              Add account
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      {hasAccountsFilterChrome ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Search accounts"
              placeholder="Search accounts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          <Select
            value={typeFilter || "all"}
            onValueChange={(v) => setTypeFilter(v === "all" ? "" : (v as AccountType))}
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter by account type">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ACCOUNT_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {accountsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : accountsQuery.isError ? (
        <Alert variant="destructive" title="Unable to load accounts.">
          <Button variant="outline" onClick={() => void accountsQuery.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : accounts.length === 0 && !search && !typeFilter ? (
        <TeachAndActEmptyState
          icon={<BookOpen className="size-5" />}
          heading="Chart of accounts"
          primaryAction={
            isAdmin
              ? { label: "Add account", onClick: openCreate }
              : { label: "Go to dashboard", href: "/dashboard" }
          }
        />
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts match your filters.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Subtype</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow
                key={account.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => openAccount(account)}
              >
                <TableCell className="font-mono text-sm">{account.code}</TableCell>
                <TableCell className="font-medium">{account.name}</TableCell>
                <TableCell className="capitalize">{account.type.replaceAll("_", " ")}</TableCell>
                <TableCell className="text-muted-foreground">
                  {account.subtype ? account.subtype.replaceAll("_", " ") : "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={account.isActive ? "default" : "secondary"}>
                    {account.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AccountDialog
        mode={dialogMode}
        account={selectedAccount}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </PageShell>
  );
}
