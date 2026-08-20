import { useState, useCallback } from "react";

const STORAGE_KEY = "gp-sidebar-collapsed";

export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // storage may be unavailable
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
