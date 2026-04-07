"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "nester_theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem(THEME_KEY) as "dark" | "light") || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved === "dark" ? "dark" : "");
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.setAttribute("data-theme", next === "dark" ? "dark" : "");
  };

  if (!mounted) return <div className="w-8 h-4" />;

  return (
    <button
      onClick={toggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="relative w-8 h-4 rounded-full border border-outline/40 transition-colors"
      style={{ background: theme === "light" ? "var(--accent)" : "var(--surface-high)" }}
    >
      <span
        className="absolute top-0.5 w-3 h-3 rounded-full transition-all duration-200"
        style={{
          left: theme === "light" ? "calc(100% - 14px)" : "1px",
          background: theme === "light" ? "#fff" : "var(--muted)",
        }}
      />
    </button>
  );
}
