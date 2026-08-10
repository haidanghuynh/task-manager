"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const THEME_KEY = "task-manager-theme";
const THEME_EVENT = "theme-change";

function getTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_EVENT, onStoreChange);
  };
}

function selectTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeToggle({
  lightLabel = "Sáng",
  darkLabel = "Tối",
  className = "",
}: {
  lightLabel?: string;
  darkLabel?: string;
  className?: string;
}) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light");

  return (
    <div
      className={`theme-toggle flex items-center rounded-lg bg-gray-100 p-1 ${className}`}
      role="group"
      aria-label={`${lightLabel} / ${darkLabel}`}
    >
      <button
        type="button"
        onClick={() => selectTheme("light")}
        aria-pressed={theme === "light"}
        title={lightLabel}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
          theme === "light" ? "bg-white font-medium text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
        <span>{lightLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => selectTheme("dark")}
        aria-pressed={theme === "dark"}
        title={darkLabel}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
          theme === "dark" ? "bg-gray-900 font-medium text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
        <span>{darkLabel}</span>
      </button>
    </div>
  );
}
