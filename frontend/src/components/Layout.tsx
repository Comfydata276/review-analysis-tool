import React from "react";
import { Toaster } from "react-hot-toast";
import { SidebarProvider, SidebarTrigger } from "./ui/Sidebar";
import { AppSidebar } from "./AppSidebar";
import { Button } from "./ui/Button";
import { useTheme } from "../context/ThemeProvider";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

interface Props {
  children: React.ReactNode;
}

export const Layout: React.FC<Props> = ({ children }) => {
  const { theme, toggle } = useTheme();

  return (
    <SidebarProvider defaultOpen={true} className="bg-background text-foreground transition-colors">
      <Toaster position="top-right" reverseOrder={true} limit={3} />
      
      <AppSidebar />
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-16 flex items-center">
          <div className="flex items-center justify-between w-full px-6">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <div className="hidden text-sm text-muted-foreground sm:block">
                Steam Review Analysis Tool v0.1.0
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={toggle} 
                variant="ghost" 
                size="sm"
                className="inline-flex items-center gap-2" 
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <>
                    <MoonIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Dark</span>
                  </>
                ) : (
                  <>
                    <SunIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Light</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 pb-12">{children}</div>
      </main>
    </SidebarProvider>
  );
};