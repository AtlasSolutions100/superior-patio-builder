import * as React from "react";

/**
 * Light / dark / system theme. Dark mode is the `.dark` class on <html>
 * (Tailwind `@custom-variant dark`). "system" follows the device and is the
 * default — index.html applies the stored choice before first paint so
 * there's no flash.
 */
export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "spc-theme";

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
  root.classList.toggle("dark", resolveTheme(theme) === "dark");
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

  const setTheme = React.useCallback((next: Theme) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage unavailable — the choice just won't persist
    }
    setThemeState(next);
  }, []);

  return { theme, setTheme, resolved: resolveTheme(theme) };
}
