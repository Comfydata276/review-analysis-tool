import React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/Sidebar";
import {
  Squares2X2Icon,
  BeakerIcon,
  ChartBarIcon,
  CogIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

const navigationItems = [
  {
    title: "Game Selector",
    url: "/selector",
    icon: Squares2X2Icon,
    description: "Search and manage Steam games",
  },
  {
    title: "Scraper",
    url: "/scraper",
    icon: BeakerIcon,
    description: "Monitor and control review scraping",
  },
  {
    title: "Analysis",
    url: "/analysis",
    icon: ChartBarIcon,
    description: "Analyze stored reviews",
  },
];

const toolItems = [
  {
    title: "Analytics",
    url: "/analytics",
    icon: ChartBarIcon,
    description: "View scraping statistics",
    disabled: true,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: CogIcon,
    description: "Configure application settings",
    disabled: true,
  },
  {
    title: "Logs",
    url: "/logs",
    icon: DocumentTextIcon,
    description: "View application logs",
    disabled: true,
  },
];

export function AppSidebar() {
  const { state } = useSidebar();

  const isCollapsed = state === "collapsed";

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
            <BeakerIcon className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-indigo-600">
                Review Analysis
              </h1>
              <p className="text-xs text-muted-foreground">Steam Scraper Tool</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <NavLink
                    to={item.url}
                    className={({ isActive }) =>
                      cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-none",
                        isActive
                          ? "bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-sm"
                          : "text-muted-foreground"
                      )
                    }
                  >
                    <item.icon className="h-5 w-5" />
                    {!isCollapsed && (
                      <div className="flex flex-col">
                        <span className="font-medium">{item.title}</span>
                        <span className="text-xs opacity-70">{item.description}</span>
                      </div>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton disabled={item.disabled}>
                    <item.icon className="h-5 w-5" />
                    {!isCollapsed && (
                      <div className="flex flex-col">
                        <span className="font-medium">{item.title}</span>
                        <span className="text-xs opacity-70">{item.description}</span>
                      </div>
                    )}
                    {item.disabled && !isCollapsed && (
                      <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Soon
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {!isCollapsed && (
          <div className="text-center text-xs text-muted-foreground">
            <p>Steam Review Analysis Tool</p>
            <p className="text-[10px] opacity-60">v0.1.0 Beta</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
