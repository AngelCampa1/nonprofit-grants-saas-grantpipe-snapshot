import { useState, useCallback } from "react";
import type { NavSection } from "../config/nav";

const STORAGE_KEY_PREFIX = "gp_nav_sections_";

type CollapsedState = Record<string, boolean>;

function buildDefaultState(sections: NavSection[]): CollapsedState {
  const state: CollapsedState = {};
  for (const section of sections) {
    if (section.label && section.collapsible) {
      state[section.label] = section.defaultCollapsed === true;
    }
  }
  return state;
}

function loadFromStorage(key: string, defaults: CollapsedState): CollapsedState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return defaults;
    }
    // Merge: stored values win over defaults, but only for known sections
    const merged: CollapsedState = { ...defaults };
    for (const [label, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "boolean") {
        merged[label] = value;
      }
    }
    return merged;
  } catch {
    return defaults;
  }
}

function saveToStorage(key: string, state: CollapsedState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage may be unavailable; state update still proceeds in memory
  }
}

export function useNavSections(sections: NavSection[], userId: string | null) {
  const storageKey = `${STORAGE_KEY_PREFIX}${userId ?? "anonymous"}`;

  const [collapsedState, setCollapsedState] = useState<CollapsedState>(() => {
    const defaults = buildDefaultState(sections);
    return loadFromStorage(storageKey, defaults);
  });

  const toggle = useCallback(
    (label: string) => {
      setCollapsedState((prev) => {
        const next = { ...prev, [label]: !prev[label] };
        saveToStorage(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const isCollapsed = useCallback(
    (label: string | undefined): boolean => {
      if (!label) return false;
      return collapsedState[label] === true;
    },
    [collapsedState],
  );

  return { isCollapsed, toggle };
}
