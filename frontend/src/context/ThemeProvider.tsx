import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

type ThemeContext = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

const ctx = createContext<ThemeContext | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    return (saved as Theme) || "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = () => setThemeState((t) => (t === "dark" ? "light" : "dark"));
  const setTheme = (t: Theme) => setThemeState(t);

  return <ctx.Provider value={{ theme, toggle, setTheme }}>{children}</ctx.Provider>;
};

export function useTheme() {
  const c = useContext(ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}


