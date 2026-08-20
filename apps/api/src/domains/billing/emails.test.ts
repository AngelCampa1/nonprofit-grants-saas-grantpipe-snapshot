import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findOrgAdminEmail, sendTrialEndingEmail } from "./emails";
import { orgMembers, type Database } from "@grantpipe/db";

describe("findOrgAdminEmail", () => {
  function buildDb(rows: Array<{ email: string | null }>) {
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    return {
      select: vi.fn().mockReturnValue(chain),
    } as unknown as Database;
  }

  it("returns the admin email when one exists", async () => {
    const db = buildDb([{ email: "admin@example.org" }]);
    const result = await findOrgAdminEmail(db, "org-1");
    expect(result).toBe("admin@example.org");
  });

  it("uses user id as the stable tie-break for admins with the same join time", async () => {
    const orderBy = vi.fn().mockReturnThis();
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy,
        limit: vi.fn().mockResolvedValue([{ userId: "admin-a", email: "a@example.org" }]),
      }),
    } as unknown as Database;

    await findOrgAdminEmail(db, "org-tied-admins");

    expect(orderBy).toHaveBeenCalledWith(orgMembers.joinedAt, orgMembers.userId);
  });

  it("returns null when no admin is found", async () => {
    const db = buildDb([]);
    const result = await findOrgAdminEmail(db, "org-none");
    expect(result).toBeNull();
  });

  it("returns null when the admin row has a null email", async () => {
    const db = buildDb([{ email: null }]);
    const result = await findOrgAdminEmail(db, "org-null");
    expect(result).toBeNull();
  });

  it("returns null when the admin row has an empty email", async () => {
    const db = buildDb([{ email: "" }]);
    const result = await findOrgAdminEmail(db, "org-empty");
    expect(result).toBeNull();
  });
});

describe("sendTrialEndingEmail", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts correctly-shaped payload to Resend and returns ok:true", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    const result = await sendTrialEndingEmail({
      resendApiKey: "re_test",
      org: { id: "org-1", name: "Acme Nonprofit" },
      toEmail: "admin@example.org",
      appUrl: "https://app.grantpipe.com",
      marketingUrl: "https://preview.grantpipe.com",
    });
    expect(result).toEqual({ ok: true });
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const reqInit = init as { headers: Record<string, string>; body: string };
    expect(reqInit.headers.Authorization).toBe("Bearer re_test");
    expect(reqInit.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(reqInit.body) as {
      to: string[];
      subject: string;
      html: string;
      text: string;
      from: string;
    };
    expect(body.to).toEqual(["admin@example.org"]);
    expect(body.subject).toBe("Your GrantPipe trial ends in 3 days");
    expect(body.html).toContain('alt="GrantPipe logo"');
    expect(body.html).toContain("https://preview.grantpipe.com/logo-email.png");
    expect(body.html).toContain("data-email-brand");
    expect(body.html).toContain('data-cta="true"');
    expect(body.html).toContain("Acme Nonprofit");
    expect(body.html).toContain("https://app.grantpipe.com/app/settings/billing");
    expect(body.html).toContain("Angel Campa");
    expect(body.html).not.toContain("The GrantPipe team");
    expect(body.html).toMatch(/choose a plan or add billing\s+details/);
    expect(body.html).not.toContain("friendly heads-up");
    expect(body.html).not.toContain("without interruption");
    expect(body.html).not.toContain("card on file will be charged");
    expect(body.text).toContain("Acme Nonprofit");
    expect(body.text).toContain("https://app.grantpipe.com/app/settings/billing");
    expect(body.text).toContain("choose a plan or add billing details");
    expect(body.text).toContain("Angel Campa");
    expect(body.text).not.toContain("The GrantPipe team");
    expect(body.text).not.toContain("logo");
    expect(body.text).not.toContain("https://preview.grantpipe.com/logo-email.png");
    expect(body.text).not.toContain("friendly heads-up");
    expect(body.text).not.toContain("without interruption");
    expect(body.text).not.toContain("card on file will be charged");
    expect(body.from).toBe("GrantPipe <angel.campa@grantpipe.com>");
  });

  it("escapes HTML-unsafe characters in the org name", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("{}"),
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    await sendTrialEndingEmail({
      resendApiKey: "re_test",
      org: { id: "org-x", name: "<script>alert('x')</script>&co \"quoted\"" },
      toEmail: "admin@example.org",
      appUrl: "https://app.grantpipe.com",
    });
    const body = JSON.parse((fn.mock.calls[0]![1] as { body: string }).body) as { html: string };
    expect(body.html).not.toContain("<script>alert");
    expect(body.html).toContain("&lt;script&gt;");
    expect(body.html).toContain("&amp;co");
    expect(body.html).toContain("&quot;quoted&quot;");
    expect(body.html).toContain("&#39;x&#39;");
  });

  it("returns ok:false with error string when Resend returns non-2xx", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve("invalid recipient"),
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    const result = await sendTrialEndingEmail({
      resendApiKey: "re_test",
      org: { id: "org-1", name: "Acme" },
      toEmail: "bad@",
      appUrl: "https://app.grantpipe.com",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("resend_status_422");
    expect(result.error).toContain("invalid recipient");
  });

  it("tolerates a text() failure on the error response", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("boom")),
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    const result = await sendTrialEndingEmail({
      resendApiKey: "re_test",
      org: { id: "org-1", name: "Acme" },
      toEmail: "admin@example.org",
      appUrl: "https://app.grantpipe.com",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("resend_status_500");
  });
});
