import { eq, and, isNull } from "drizzle-orm";
import { contacts } from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import { notFound } from "../../lib/app-error";

export async function assertContactInOrg(
  db: Database | TransactionDatabase,
  orgId: string,
  contactId: string,
): Promise<void> {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)),
    columns: { id: true },
  });

  if (!contact) throw notFound("Contact not found");
}
