import React from "react";
import { Link, NavLink } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { MoonIcon, SunIcon, Squares2X2Icon, BeakerIcon } from "@heroicons/react/24/outline";
import { Button } from "./ui/Button";
import { useTheme } from "../context/ThemeProvider";

interface Props {
  children: React.ReactNode;
}

export const Layout: React.FC<Props> = ({ children }) => {
  const { theme, toggle } = useTheme();

  const dark = theme === "dark";

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <Toaster position="top-right" />
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-72 flex-shrink-0 p-6 md:block">
          <div className="sticky top-6">
            <Link to="/" className="mb-6 block text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-indigo-600">
              Review Analysis
            </Link>
            <nav className="mt-4 space-y-2">
              <NavLink
                to="/selector"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow" : "text-muted hover:bg-gray-100 dark:hover:bg-gray-800"}`
                }
              >
                <Squares2X2Icon className="h-5 w-5" />
                Game Selector
              </NavLink>
              <NavLink
                to="/scraper"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow" : "text-muted hover:bg-gray-100 dark:hover:bg-gray-800"}`
                }
              >
                <BeakerIcon className="h-5 w-5" />
                Scraper
              </NavLink>
            </nav>
            <div className="mt-6">
              <Button onClick={toggle} variant="ghost" className="w-full justify-center" aria-label="Toggle theme">
                {dark ? (
                  <>
                    <MoonIcon className="h-4 w-4" /> Dark mode
                  </>
                ) : (
                  <>
                    <SunIcon className="h-4 w-4" /> Light mode
                  </>
                )}
              </Button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1">
          {/* Top bar */}
          <header className="sticky top-0 z-10 bg-transparent">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="hidden md:block text-sm text-muted">v0.1</div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={toggle} variant="gradient" className="inline-flex items-center gap-2" aria-label="Toggle theme">
                  {dark ? (
                    <>
                      <MoonIcon className="h-4 w-4" /> Dark
                    </>
                  ) : (
                    <>
                      <SunIcon className="h-4 w-4" /> Light
                    </>
                  )}
                </Button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-6xl p-4">{children}</div>
        </main>
      </div>
    </div>
  );
};