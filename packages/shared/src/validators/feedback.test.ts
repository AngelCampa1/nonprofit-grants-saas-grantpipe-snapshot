import { describe, it, expect } from "vitest";
import { submitFeedbackSchema, publicSubmitFeedbackSchema } from "./feedback";

describe("submitFeedbackSchema", () => {
  describe("valid submissions", () => {
    it("accepts a minimal valid submission with only message", () => {
      const result = submitFeedbackSchema.safeParse({ message: "This is great!" });
      expect(result.success).toBe(true);
    });

    it("accepts a full valid submission with all fields", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "Please add keyboard shortcuts.",
        category: "idea",
        reporterEmail: "user@example.com",
        reporterName: "Jane Doe",
        pageUrl: "https://app.grantpipe.com/grants",
        userAgent: "Mozilla/5.0",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe("Please add keyboard shortcuts.");
        expect(result.data.category).toBe("idea");
        expect(result.data.reporterEmail).toBe("user@example.com");
        expect(result.data.reporterName).toBe("Jane Doe");
        expect(result.data.pageUrl).toBe("https://app.grantpipe.com/grants");
        expect(result.data.userAgent).toBe("Mozilla/5.0");
      }
    });

    it("trims leading and trailing whitespace from message", () => {
      const result = submitFeedbackSchema.safeParse({ message: "  hello world  " });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe("hello world");
      }
    });

    it("trims leading and trailing whitespace from reporterName", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "test",
        reporterName: "  Alice  ",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reporterName).toBe("Alice");
      }
    });

    it("accepts message at maximum length boundary (5000 chars)", () => {
      const result = submitFeedbackSchema.safeParse({ message: "A".repeat(5000) });
      expect(result.success).toBe(true);
    });

    it("accepts userAgent at maximum length boundary (500 chars)", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "test",
        userAgent: "A".repeat(500),
      });
      expect(result.success).toBe(true);
    });

    it("accepts reporterName at maximum length boundary (200 chars)", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "test",
        reporterName: "A".repeat(200),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("category enum", () => {
    it("defaults category to 'other' when omitted", () => {
      const result = submitFeedbackSchema.safeParse({ message: "Hello" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe("other");
      }
    });

    it("accepts category: bug", () => {
      const result = submitFeedbackSchema.safeParse({ message: "Hello", category: "bug" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe("bug");
      }
    });

    it("accepts category: idea", () => {
      const result = submitFeedbackSchema.safeParse({ message: "Hello", category: "idea" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe("idea");
      }
    });

    it("accepts category: question", () => {
      const result = submitFeedbackSchema.safeParse({ message: "Hello", category: "question" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe("question");
      }
    });

    it("accepts category: other", () => {
      const result = submitFeedbackSchema.safeParse({ message: "Hello", category: "other" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe("other");
      }
    });

    it("rejects invalid category value", () => {
      const result = submitFeedbackSchema.safeParse({ message: "Hello", category: "complaint" });
      expect(result.success).toBe(false);
    });
  });

  describe("message validation", () => {
    it("rejects empty message", () => {
      const result = submitFeedbackSchema.safeParse({ message: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Feedback cannot be empty");
      }
    });

    it("rejects whitespace-only message (trims to empty)", () => {
      const result = submitFeedbackSchema.safeParse({ message: "   " });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Feedback cannot be empty");
      }
    });

    it("rejects message exceeding 5000 characters", () => {
      const result = submitFeedbackSchema.safeParse({ message: "A".repeat(5001) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Feedback must be 5000 characters or fewer");
      }
    });

    it("rejects missing message field", () => {
      const result = submitFeedbackSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("optional field validation", () => {
    it("rejects invalid email format", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "Hello",
        reporterEmail: "not-an-email",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("Invalid email address");
      }
    });

    it("rejects invalid URL format for pageUrl", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "Hello",
        pageUrl: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    it("rejects reporterName exceeding 200 characters", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "Hello",
        reporterName: "A".repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it("rejects userAgent exceeding 500 characters", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "Hello",
        userAgent: "A".repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it("accepts undefined optional fields", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "Hello",
        reporterEmail: undefined,
        reporterName: undefined,
        pageUrl: undefined,
        userAgent: undefined,
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid https URL for pageUrl", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "Hello",
        pageUrl: "https://app.grantpipe.com/donors/123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid http URL for pageUrl", () => {
      const result = submitFeedbackSchema.safeParse({
        message: "Hello",
        pageUrl: "http://localhost:3050/grants",
      });
      expect(result.success).toBe(true);
    });

    it("rejects reporterEmail exceeding 320 characters", () => {
      // 315 local + "@b.com" (6) = 321 chars
      const local = "a".repeat(315);
      const result = submitFeedbackSchema.safeParse({
        message: "Hello",
        reporterEmail: `${local}@b.com`,
      });
      expect(result.success).toBe(false);
    });

    it("accepts reporterEmail at exactly 320 characters", () => {
      // 314 local + "@b.com" (6) = 320 chars
      const local = "a".repeat(314);
      const result = submitFeedbackSchema.safeParse({
        message: "Hello",
        reporterEmail: `${local}@b.com`,
      });
      expect(result.success).toBe(true);
      expect(result.data?.reporterEmail?.length).toBe(320);
    });
  });
});

describe("publicSubmitFeedbackSchema", () => {
  it("accepts companyWebsite when present and within limit", () => {
    const result = publicSubmitFeedbackSchema.safeParse({
      message: "hi",
      reporterEmail: "user@example.com",
      companyWebsite: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyWebsite).toBe("https://example.com");
    }
  });

  it("accepts companyWebsite when absent (optional)", () => {
    const result = publicSubmitFeedbackSchema.safeParse({
      message: "hi",
      reporterEmail: "user@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyWebsite).toBeUndefined();
    }
  });

  it("rejects companyWebsite exceeding 200 characters", () => {
    const result = publicSubmitFeedbackSchema.safeParse({
      message: "hi",
      reporterEmail: "user@example.com",
      companyWebsite: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("accepts turnstileToken when present and within limit", () => {
    const result = publicSubmitFeedbackSchema.safeParse({
      message: "hi",
      reporterEmail: "user@example.com",
      turnstileToken: "tok-abc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.turnstileToken).toBe("tok-abc");
    }
  });

  it("accepts turnstileToken when absent (optional)", () => {
    const result = publicSubmitFeedbackSchema.safeParse({
      message: "hi",
      reporterEmail: "user@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.turnstileToken).toBeUndefined();
    }
  });

  it("rejects turnstileToken exceeding 2048 characters", () => {
    const result = publicSubmitFeedbackSchema.safeParse({
      message: "hi",
      reporterEmail: "user@example.com",
      turnstileToken: "t".repeat(2049),
    });
    expect(result.success).toBe(false);
  });

  it("still requires reporterEmail (refine check)", () => {
    const result = publicSubmitFeedbackSchema.safeParse({
      message: "hi",
    });
    expect(result.success).toBe(false);
  });
});
