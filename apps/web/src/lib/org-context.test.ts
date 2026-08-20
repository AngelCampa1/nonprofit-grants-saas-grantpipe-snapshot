import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVE_ENTITY_STORAGE_KEY,
  ACTIVE_ORG_STORAGE_KEY,
  clearActiveEntitySelection,
  clearActiveOrgSelection,
  createOrgRequestInit,
  getActiveOrgHeaders,
} from "./org-context";

describe("org-context", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the active org header from localStorage", () => {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, "org-42");

    expect(getActiveOrgHeaders()).toEqual({ "X-Org-Id": "org-42" });
  });

  it("reads the active entity header from localStorage", () => {
    localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, "entity-42");

    expect(getActiveOrgHeaders()).toEqual({ "X-Entity-Id": "entity-42" });
  });

  it("reads both active org and active entity headers from localStorage", () => {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, "org-42");
    localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, "entity-42");

    expect(getActiveOrgHeaders()).toEqual({
      "X-Org-Id": "org-42",
      "X-Entity-Id": "entity-42",
    });
  });

  it("returns no active org header outside a browser window", () => {
    vi.stubGlobal("window", undefined);

    expect(getActiveOrgHeaders()).toEqual({});
  });

  it("clears the active org selection from localStorage", () => {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, "org-42");
    localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, "entity-42");

    clearActiveOrgSelection();

    expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBeNull();
  });

  it("clears only the active entity selection from localStorage", () => {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, "org-42");
    localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, "entity-42");

    clearActiveEntitySelection();

    expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBe("org-42");
    expect(localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY)).toBeNull();
  });

  it("ignores active org clearing outside a browser window", () => {
    vi.stubGlobal("window", undefined);

    expect(() => clearActiveOrgSelection()).not.toThrow();
  });

  it("builds request init with credentials and active org headers", () => {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, "org-42");
    localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, "entity-42");

    expect(
      createOrgRequestInit({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    ).toEqual({
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "X-Org-Id": "org-42",
        "X-Entity-Id": "entity-42",
      },
      body: JSON.stringify({}),
    });
  });

  it("builds request init without org headers when nothing is selected", () => {
    expect(createOrgRequestInit()).toEqual({
      credentials: "include",
      headers: {},
    });
  });

  it("normalizes Headers instances before adding the active org", () => {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, "org-42");

    expect(
      createOrgRequestInit({
        headers: new Headers([["accept", "application/json"]]),
      }),
    ).toEqual({
      credentials: "include",
      headers: {
        accept: "application/json",
        "X-Org-Id": "org-42",
      },
    });
  });

  it("normalizes tuple headers before adding the active org", () => {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, "org-42");

    expect(
      createOrgRequestInit({
        headers: [["accept", "application/json"]],
      }),
    ).toEqual({
      credentials: "include",
      headers: {
        accept: "application/json",
        "X-Org-Id": "org-42",
      },
    });
  });
});
