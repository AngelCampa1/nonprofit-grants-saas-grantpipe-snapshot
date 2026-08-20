import { afterEach, describe, expect, it, vi } from "vitest";
import * as utils from "./exit-popup-utils";

afterEach(() => {
  localStorage.clear();
});

describe("exit-popup-utils", () => {
  describe("exported constants", () => {
    it("SUPPRESS_KEY is 'exit-popup-suppressed'", () => {
      expect(utils.SUPPRESS_KEY).toBe("exit-popup-suppressed");
    });

    it("SIGNED_UP_KEY is 'exit-popup-signed-up'", () => {
      expect(utils.SIGNED_UP_KEY).toBe("exit-popup-signed-up");
    });

    it("SUPPRESS_DAYS is 30", () => {
      expect(utils.SUPPRESS_DAYS).toBe(30);
    });
  });

  describe("isSignedUp", () => {
    it("returns false when key is absent", () => {
      expect(utils.isSignedUp()).toBe(false);
    });

    it("returns true when key equals 'true'", () => {
      localStorage.setItem(utils.SIGNED_UP_KEY, "true");
      expect(utils.isSignedUp()).toBe(true);
    });

    it("returns false when localStorage throws", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("storage unavailable");
      });

      expect(utils.isSignedUp()).toBe(false);

      spy.mockRestore();
    });
  });

  describe("isWithinSuppressWindow", () => {
    it("returns false when key is absent", () => {
      expect(utils.isWithinSuppressWindow(30)).toBe(false);
    });

    it("returns true when timestamp is recent (< 30 days)", () => {
      const recent = Date.now() - 1000 * 60 * 60;
      localStorage.setItem(utils.SUPPRESS_KEY, String(recent));
      expect(utils.isWithinSuppressWindow(30)).toBe(true);
    });

    it("returns false when timestamp is old (> 30 days)", () => {
      const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
      localStorage.setItem(utils.SUPPRESS_KEY, String(old));
      expect(utils.isWithinSuppressWindow(30)).toBe(false);
    });

    it("returns false when value is NaN", () => {
      localStorage.setItem(utils.SUPPRESS_KEY, "not-a-number");
      expect(utils.isWithinSuppressWindow(30)).toBe(false);
    });

    it("returns false when localStorage throws", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("storage unavailable");
      });

      expect(utils.isWithinSuppressWindow(30)).toBe(false);

      spy.mockRestore();
    });
  });

  describe("setSuppressed", () => {
    it("writes a numeric timestamp to localStorage", () => {
      const before = Date.now();
      utils.setSuppressed();
      const after = Date.now();
      const raw = localStorage.getItem(utils.SUPPRESS_KEY);

      expect(raw).not.toBeNull();

      const ts = parseInt(raw!, 10);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it("does not throw when localStorage is unavailable", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("storage unavailable");
      });

      expect(() => utils.setSuppressed()).not.toThrow();

      spy.mockRestore();
    });
  });

  describe("setSignedUp", () => {
    it("writes 'true' to localStorage", () => {
      utils.setSignedUp();
      expect(localStorage.getItem(utils.SIGNED_UP_KEY)).toBe("true");
    });

    it("does not throw when localStorage is unavailable", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("storage unavailable");
      });

      expect(() => utils.setSignedUp()).not.toThrow();

      spy.mockRestore();
    });
  });

  describe("lead magnet delivery state", () => {
    it("builds a magnet-specific storage key", () => {
      expect(utils.buildLeadMagnetDeliveryKey("grant-compliance-checklist")).toBe(
        "lead-magnet-delivered:grant-compliance-checklist",
      );
    });

    it("returns null when no slug is provided", () => {
      expect(utils.getLeadMagnetDelivery()).toBeNull();
    });

    it("stores the submitted email for a specific magnet", () => {
      utils.setLeadMagnetDelivered("grant-compliance-checklist", "reader@example.com");

      expect(localStorage.getItem("lead-magnet-delivered:grant-compliance-checklist")).toBe(
        '{"email":"reader@example.com"}',
      );
    });

    it("does nothing when setLeadMagnetDelivered is called without a slug", () => {
      utils.setLeadMagnetDelivered(undefined, "reader@example.com");
      expect(localStorage.length).toBe(0);
    });

    it("does not throw when storing delivery state and localStorage is unavailable", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("storage unavailable");
      });

      expect(() =>
        utils.setLeadMagnetDelivered("grant-compliance-checklist", "reader@example.com"),
      ).not.toThrow();

      spy.mockRestore();
    });

    it("reads the stored delivery state for a specific magnet", () => {
      localStorage.setItem(
        "lead-magnet-delivered:grant-compliance-checklist",
        '{"email":"reader@example.com"}',
      );

      expect(utils.getLeadMagnetDelivery("grant-compliance-checklist")).toEqual({
        email: "reader@example.com",
      });
    });

    it("returns null when a different magnet was delivered", () => {
      localStorage.setItem(
        "lead-magnet-delivered:donor-retention-playbook",
        '{"email":"reader@example.com"}',
      );

      expect(utils.getLeadMagnetDelivery("grant-compliance-checklist")).toBeNull();
    });

    it("returns null when the stored delivery payload is invalid JSON", () => {
      localStorage.setItem("lead-magnet-delivered:grant-compliance-checklist", "{");

      expect(utils.getLeadMagnetDelivery("grant-compliance-checklist")).toBeNull();
    });

    it("returns null when the stored delivery payload parses to null", () => {
      localStorage.setItem("lead-magnet-delivered:grant-compliance-checklist", "null");

      expect(utils.getLeadMagnetDelivery("grant-compliance-checklist")).toBeNull();
    });

    it("returns null when localStorage throws while reading delivery state", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("storage unavailable");
      });

      expect(utils.getLeadMagnetDelivery("grant-compliance-checklist")).toBeNull();

      spy.mockRestore();
    });

    it("returns an empty email when the stored payload omits a string email", () => {
      localStorage.setItem("lead-magnet-delivered:grant-compliance-checklist", '{"email":42}');

      expect(utils.getLeadMagnetDelivery("grant-compliance-checklist")).toEqual({
        email: "",
      });
    });
  });

  describe("detectScrollBack", () => {
    it("returns false when peakY is below scrolledDownThreshold", () => {
      expect(utils.detectScrollBack(0, 100, 300, 200)).toBe(false);
    });

    it("returns false when scrollback distance is below scrollBackThreshold", () => {
      expect(utils.detectScrollBack(350, 400, 300, 200)).toBe(false);
    });

    it("returns true when both thresholds are met", () => {
      expect(utils.detectScrollBack(100, 600, 300, 200)).toBe(true);
    });

    it("returns false when peakY exactly equals threshold but scrollback is insufficient", () => {
      expect(utils.detectScrollBack(150, 300, 300, 200)).toBe(false);
    });

    it("returns true at exact threshold boundary", () => {
      expect(utils.detectScrollBack(100, 300, 300, 200)).toBe(true);
    });
  });
});
