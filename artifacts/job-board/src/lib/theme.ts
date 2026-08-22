import * as React from "react";

/**
 * Light / dark / system theme. Dark mode is the `.dark` class on <html>
 * (Tailwind `@custom-variant dark`). "system" follows the device and is the
 * default — index.html applies the stored choice before first paint so
 * there's no flash.
 */
export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "spc-theme";

/** Cycle order for the toggle. */
export const THEME_ORDER: Theme[] = ["system", "light", "dark"];

const mql = () =>
  typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return mql()?.matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  // Suspend transitions while the palette swaps. Without this, elements using
  // transition-colors interpolate from CSS variables that changed underneath
  // and can settle on the previous theme's color (e.g. dark blue text left on
  // a light background).
  root.classList.add("theme-switching");
  root.classList.toggle("dark", resolveTheme(theme) === "dark");
  void root.offsetHeight; // commit the class change with transitions off
  window.setTimeout(() => root.classList.remove("theme-switching"), 0);
}

export function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>(() => getStoredTheme());

  React.useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    // Follow the device while in system mode.
    const m = mql();
    if (!m) return;
    const onChange = () => applyTheme("system");
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [theme]);

  const persist = (next: Theme) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage unavailable — the choice just won't persist
    }
  };

  const setTheme = React.useCallback((next: Theme) => {
    persist(next);
    setThemeState(next);
  }, []);

  /**
   * Advance device -> light -> dark. Uses the functional update form so the
   * stored value and React state can never diverge on rapid clicks.
   */
  const cycleTheme = React.useCallback(() => {
    setThemeState((prev) => {
      const next = THEME_ORDER[(THEME_ORDER.indexOf(prev) + 1) % THEME_ORDER.length];
      persist(next);
      return next;
    });
  }, []);

  return { theme, setTheme, cycleTheme, resolved: resolveTheme(theme) };
}
