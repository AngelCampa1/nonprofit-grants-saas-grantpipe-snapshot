import { useCallback, useEffect, useState } from "react";
import { captureEvent } from "../lib/analytics";

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((isOpen) => {
          const nextOpen = !isOpen;
          if (nextOpen) {
            captureEvent("command_palette_opened", {
              source: e.metaKey ? "keyboard_meta_k" : "keyboard_ctrl_k",
            });
          }
          return nextOpen;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  return { open, setOpen, toggle };
}
