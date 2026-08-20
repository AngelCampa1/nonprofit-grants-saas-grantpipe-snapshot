import { describe, it, expect } from "vitest";
import { leadSignupAcceptedResponseSchema, leadSignupSchema, leadUnsubscribeSchema } from "./leads";

describe("leadSignupAcceptedResponseSchema", () => {
  it("accepts only the generic public response", () => {
    expect(leadSignupAcceptedResponseSchema.parse({ ok: true })).toEqual({ ok: true });
    expect(
      leadSignupAcceptedResponseSchema.safeParse({
        ok: true,
        alreadySubscribed: true,
      }).success,
    ).toBe(false);
    expect(
      leadSignupAcceptedResponseSchema.safeParse({
        ok: true,
        deliveryState: "sent",
      }).success,
    ).toBe(false);
  });
});

describe("leadSignupSchema", () => {
  it("normalizes email by lowercasing and trimming whitespace", () => {
    const result = leadSignupSchema.safeParse({ email: "  User@EXAMPLE.COM  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("treats mixed-case and lowercase email as the same normalized value", () => {
    const a = leadSignupSchema.safeParse({ email: "User@EXAMPLE.COM" });
    const b = leadSignupSchema.safeParse({ email: "user@example.com" });
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    if (a.success && b.success) {
      expect(a.data.email).toBe(b.data.email);
    }
  });

  it("accepts a valid email with all optional fields omitted", () => {
    const result = leadSignupSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = leadSignupSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid email address");
    }
  });

  it("rejects a missing email", () => {
    const result = leadSignupSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts all optional fields when valid", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      firstName: "Alice",
      magnetSlug: "grant-compliance-checklist",
      sourcePage: "/resources/grant-checklist",
      resendDelivery: true,
      utm: {
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "spring-2026",
        referredBy: "partner-abc",
      },
    });
    expect(result.success).toBe(true);
  });

  it("defaults resendDelivery to false when omitted", () => {
    const result = leadSignupSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resendDelivery).toBe(false);
    }
  });

  it("rejects non-boolean resendDelivery values", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      resendDelivery: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from firstName", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      firstName: "  Alice  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Alice");
    }
  });

  it("accepts a canonical magnetSlug", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      magnetSlug: "grant-compliance-checklist",
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from sourcePage", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      sourcePage: "  /landing  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourcePage).toBe("/landing");
    }
  });

  it("rejects firstName exceeding 200 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      firstName: "A".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("accepts firstName at exactly 200 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      firstName: "A".repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-canonical magnetSlug", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      magnetSlug: "checklist",
    });
    expect(result.success).toBe(false);
  });

  it("rejects sourcePage exceeding 500 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      sourcePage: "/".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts sourcePage at exactly 500 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      sourcePage: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("accepts utm as undefined", () => {
    const result = leadSignupSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.utm).toBeUndefined();
    }
  });

  it("accepts utm with all nested fields omitted", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      utm: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects utm.utmSource exceeding 200 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      utm: { utmSource: "s".repeat(201) },
    });
    expect(result.success).toBe(false);
  });

  it("rejects utm.utmMedium exceeding 200 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      utm: { utmMedium: "m".repeat(201) },
    });
    expect(result.success).toBe(false);
  });

  it("rejects utm.utmCampaign exceeding 200 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      utm: { utmCampaign: "c".repeat(201) },
    });
    expect(result.success).toBe(false);
  });

  it("rejects utm.referredBy exceeding 200 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      utm: { referredBy: "r".repeat(201) },
    });
    expect(result.success).toBe(false);
  });

  it("trims utm string fields", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      utm: { utmSource: "  google  " },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.utm?.utmSource).toBe("google");
    }
  });
});

describe("leadUnsubscribeSchema", () => {
  it("accepts a valid token", () => {
    const result = leadUnsubscribeSchema.safeParse({ token: "abc123" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty token", () => {
    const result = leadUnsubscribeSchema.safeParse({ token: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Token is required");
    }
  });

  it("rejects a missing token field", () => {
    const result = leadUnsubscribeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a UUID-style token", () => {
    const result = leadUnsubscribeSchema.safeParse({
      token: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects token exceeding 1024 characters", () => {
    const result = leadUnsubscribeSchema.safeParse({ token: "a".repeat(1025) });
    expect(result.success).toBe(false);
  });

  it("accepts token at exactly 1024 characters", () => {
    const result = leadUnsubscribeSchema.safeParse({ token: "a".repeat(1024) });
    expect(result.success).toBe(true);
  });
});

describe("leadSignupSchema honeypot and turnstile fields", () => {
  it("accepts companyWebsite when present and within limit", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      companyWebsite: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyWebsite).toBe("https://example.com");
    }
  });

  it("accepts companyWebsite when absent (optional)", () => {
    const result = leadSignupSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyWebsite).toBeUndefined();
    }
  });

  it("rejects companyWebsite exceeding 200 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      companyWebsite: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("accepts companyWebsite at exactly 200 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      companyWebsite: "a".repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it("accepts turnstileToken when present and within limit", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      turnstileToken: "token-abc-xyz",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.turnstileToken).toBe("token-abc-xyz");
    }
  });

  it("accepts turnstileToken when absent (optional)", () => {
    const result = leadSignupSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.turnstileToken).toBeUndefined();
    }
  });

  it("rejects turnstileToken exceeding 2048 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      turnstileToken: "t".repeat(2049),
    });
    expect(result.success).toBe(false);
  });

  it("accepts turnstileToken at exactly 2048 characters", () => {
    const result = leadSignupSchema.safeParse({
      email: "user@example.com",
      turnstileToken: "t".repeat(2048),
    });
    expect(result.success).toBe(true);
  });
});

describe("leadSignupSchema email length cap", () => {
  it("rejects email exceeding 320 characters", () => {
    // 315 local + "@b.com" (6) = 321 chars
    const local = "a".repeat(315);
    const result = leadSignupSchema.safeParse({ email: `${local}@b.com` });
    expect(result.success).toBe(false);
  });

  it("accepts email at exactly 320 characters", () => {
    // 314 local + "@b.com" (6) = 320 chars
    const local = "a".repeat(314);
    const result = leadSignupSchema.safeParse({ email: `${local}@b.com` });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email.length).toBe(320);
    }
  });
});
