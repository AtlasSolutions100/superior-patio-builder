import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, THEME_ORDER, type Theme } from "@/lib/theme";

const LABEL: Record<Theme, string> = {
  system: "Theme: follows your device",
  light: "Theme: light",
  dark: "Theme: dark",
};

/**
 * One small button that cycles device → light → dark. Lives next to the
 * sign-out control in the sidebar and the mobile drawer.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, cycleTheme } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className={`text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors p-1 rounded-md ${className}`}
      title={`${LABEL[theme]} — click for ${next === "system" ? "device" : next}`}
      aria-label={LABEL[theme]}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
