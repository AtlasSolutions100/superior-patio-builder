import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";

const ORDER: Theme[] = ["system", "light", "dark"];
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
  const { theme, setTheme } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={`text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors p-1 rounded-md ${className}`}
      title={`${LABEL[theme]} — click for ${next === "system" ? "device" : next}`}
      aria-label={LABEL[theme]}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
