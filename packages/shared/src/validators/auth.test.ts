import { describe, it, expect } from "vitest";
import {
  signupSchema,
  loginSchema,
  onboardingSchema,
  createInviteSchema,
  ONBOARDING_GOALS,
  onboardingGoalSchema,
} from "./auth";

describe("signupSchema", () => {
  it("accepts valid name, email, and password", () => {
    const result = signupSchema.safeParse({
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      password: "securepassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = signupSchema.safeParse({
      name: "",
      email: "angel@grantpipe.com",
      password: "securepassword",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Name is required");
    }
  });

  it("rejects invalid email", () => {
    const result = signupSchema.safeParse({
      name: "Angel Campa",
      email: "not-an-email",
      password: "securepassword",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid email address");
    }
  });

  it("rejects a whitespace-only name", () => {
    const result = signupSchema.safeParse({
      name: "   ",
      email: "angel@grantpipe.com",
      password: "securepassword",
    });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace from name and email", () => {
    const result = signupSchema.safeParse({
      name: "  Angel Campa  ",
      email: "  angel@grantpipe.com  ",
      password: "securepassword",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Angel Campa");
      expect(result.data.email).toBe("angel@grantpipe.com");
    }
  });

  it("does not trim the password", () => {
    const result = signupSchema.safeParse({
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      password: "  spaced-pw  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.password).toBe("  spaced-pw  ");
    }
  });

  it("rejects password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Password must be at least 8 characters");
    }
  });

  it("rejects name exceeding 200 characters", () => {
    const result = signupSchema.safeParse({
      name: "A".repeat(201),
      email: "angel@grantpipe.com",
      password: "securepassword",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password exceeding 256 characters", () => {
    const result = signupSchema.safeParse({
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      password: "A".repeat(257),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = signupSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects signup email exceeding 320 characters", () => {
    // 315 local + "@b.com" (6) = 321 chars
    const local = "a".repeat(315);
    const result = signupSchema.safeParse({
      name: "Angel Campa",
      email: `${local}@b.com`,
      password: "securepassword",
    });
    expect(result.success).toBe(false);
  });

  it("accepts signup email at exactly 320 characters", () => {
    // 314 local + "@b.com" (6) = 320 chars
    const local = "a".repeat(314);
    const result = signupSchema.safeParse({
      name: "Angel Campa",
      email: `${local}@b.com`,
      password: "securepassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects signup password exceeding 256 characters", () => {
    const result = signupSchema.safeParse({
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      password: "A".repeat(257),
    });
    expect(result.success).toBe(false);
  });

  it("accepts signup password at exactly 256 characters", () => {
    const result = signupSchema.safeParse({
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      password: "A".repeat(256),
    });
    expect(result.success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("accepts valid email and password", () => {
    const result = loginSchema.safeParse({
      email: "angel@grantpipe.com",
      password: "anypassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects login email exceeding 320 characters", () => {
    // 315 local + "@b.com" (6) = 321 chars
    const local = "a".repeat(315);
    const result = loginSchema.safeParse({
      email: `${local}@b.com`,
      password: "anypassword",
    });
    expect(result.success).toBe(false);
  });

  it("accepts login email at exactly 320 characters", () => {
    // 314 local + "@b.com" (6) = 320 chars
    const local = "a".repeat(314);
    const result = loginSchema.safeParse({
      email: `${local}@b.com`,
      password: "anypassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects login password exceeding 256 characters", () => {
    const result = loginSchema.safeParse({
      email: "angel@grantpipe.com",
      password: "A".repeat(257),
    });
    expect(result.success).toBe(false);
  });

  it("accepts login password at exactly 256 characters", () => {
    const result = loginSchema.safeParse({
      email: "angel@grantpipe.com",
      password: "A".repeat(256),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({
      email: "angel@grantpipe.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "angel@grantpipe.com",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Password is required");
    }
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "anypassword",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid email address");
    }
  });

  it("rejects missing email", () => {
    const result = loginSchema.safeParse({
      password: "anypassword",
    });
    expect(result.success).toBe(false);
  });
});

describe("onboardingSchema", () => {
  it("accepts valid orgName, fiscalYearStartMonth, and timezone", () => {
    const result = onboardingSchema.safeParse({
      orgName: "GrantPipe Foundation",
      fiscalYearStartMonth: 1,
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(true);
  });

  it("accepts fiscalYearStartMonth at boundary values 1 and 12", () => {
    expect(
      onboardingSchema.safeParse({
        orgName: "Org",
        fiscalYearStartMonth: 1,
        timezone: "UTC",
      }).success,
    ).toBe(true);

    expect(
      onboardingSchema.safeParse({
        orgName: "Org",
        fiscalYearStartMonth: 12,
        timezone: "UTC",
      }).success,
    ).toBe(true);
  });

  it("rejects fiscalYearStartMonth > 12", () => {
    const result = onboardingSchema.safeParse({
      orgName: "GrantPipe Foundation",
      fiscalYearStartMonth: 13,
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(false);
  });

  it("rejects fiscalYearStartMonth < 1", () => {
    const result = onboardingSchema.safeParse({
      orgName: "GrantPipe Foundation",
      fiscalYearStartMonth: 0,
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty orgName", () => {
    const result = onboardingSchema.safeParse({
      orgName: "",
      fiscalYearStartMonth: 1,
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Organization name is required");
    }
  });

  it("rejects orgName exceeding 200 characters", () => {
    const result = onboardingSchema.safeParse({
      orgName: "A".repeat(201),
      fiscalYearStartMonth: 1,
      timezone: "UTC",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty timezone", () => {
    const result = onboardingSchema.safeParse({
      orgName: "GrantPipe Foundation",
      fiscalYearStartMonth: 1,
      timezone: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Timezone is required");
    }
  });

  it("rejects non-integer fiscalYearStartMonth", () => {
    const result = onboardingSchema.safeParse({
      orgName: "GrantPipe Foundation",
      fiscalYearStartMonth: 1.5,
      timezone: "UTC",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only orgName", () => {
    const result = onboardingSchema.safeParse({
      orgName: "   ",
      fiscalYearStartMonth: 1,
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only timezone", () => {
    const result = onboardingSchema.safeParse({
      orgName: "GrantPipe Foundation",
      fiscalYearStartMonth: 1,
      timezone: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace from orgName", () => {
    const result = onboardingSchema.safeParse({
      orgName: "  GrantPipe Foundation  ",
      fiscalYearStartMonth: 1,
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orgName).toBe("GrantPipe Foundation");
    }
  });

  it("rejects missing fields", () => {
    const result = onboardingSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("onboarding goal", () => {
  it("defines the three approved goals", () => {
    expect(ONBOARDING_GOALS).toEqual(["donors", "grants", "compliance"]);
  });
  it("accepts a known goal and rejects an unknown one", () => {
    expect(onboardingGoalSchema.parse("grants")).toBe("grants");
    expect(() => onboardingGoalSchema.parse("payroll")).toThrow();
  });
  it("treats onboardingGoal as optional on the onboarding payload", () => {
    const base = { orgName: "Acme", fiscalYearStartMonth: 1, timezone: "UTC" };
    expect(onboardingSchema.parse(base).onboardingGoal).toBeUndefined();
    expect(onboardingSchema.parse({ ...base, onboardingGoal: "compliance" }).onboardingGoal).toBe(
      "compliance",
    );
  });
});

describe("createInviteSchema", () => {
  it("accepts role: admin", () => {
    const result = createInviteSchema.safeParse({ role: "admin" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("admin");
    }
  });

  it("accepts role: editor", () => {
    const result = createInviteSchema.safeParse({ role: "editor" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("editor");
    }
  });

  it("accepts role: viewer", () => {
    const result = createInviteSchema.safeParse({ role: "viewer" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("viewer");
    }
  });

  it("defaults role to viewer when omitted", () => {
    const result = createInviteSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("viewer");
    }
  });

  it("rejects invalid role", () => {
    const result = createInviteSchema.safeParse({ role: "superadmin" });
    expect(result.success).toBe(false);
  });

  it("rejects role: owner", () => {
    const result = createInviteSchema.safeParse({ role: "owner" });
    expect(result.success).toBe(false);
  });

  it("accepts role: auditor", () => {
    const result = createInviteSchema.safeParse({ role: "auditor" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("auditor");
    }
  });

  it("accepts email-specific invites with permission overrides", () => {
    const result = createInviteSchema.safeParse({
      mode: "email",
      email: " teammate@example.org ",
      role: "viewer",
      permissions: {
        donors: "view",
        grants: "edit",
        team: "none",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("email");
      expect(result.data.email).toBe("teammate@example.org");
      expect(result.data.permissions?.grants).toBe("edit");
    }
  });

  it("rejects email invite mode without an email", () => {
    const result = createInviteSchema.safeParse({ mode: "email", role: "viewer" });

    expect(result.success).toBe(false);
  });

  it("accepts shareable invite mode without an email", () => {
    const result = createInviteSchema.safeParse({ mode: "shareable", role: "editor" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("shareable");
      expect(result.data.email).toBeUndefined();
    }
  });
});
