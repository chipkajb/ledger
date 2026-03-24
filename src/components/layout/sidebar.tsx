"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  DollarSign,
  TrendingUp,
  Home,
  ChevronLeft,
  ChevronRight,
  Settings,
  PlusCircle,
  Calendar,
  BarChart3,
  List,
  LineChart,
  Calculator,
  Landmark,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: Array<{ label: string; href: string; icon: React.ReactNode }>;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/app/dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    label: "Budget",
    href: "/app/budget",
    icon: <DollarSign className="h-4 w-4" />,
    children: [
      { label: "Enter Expenses", href: "/app/budget/enter-expenses", icon: <PlusCircle className="h-4 w-4" /> },
      { label: "Monthly View", href: "/app/budget/monthly", icon: <Calendar className="h-4 w-4" /> },
      { label: "Yearly View", href: "/app/budget/yearly", icon: <BarChart3 className="h-4 w-4" /> },
    ],
  },
  {
    label: "Net Worth",
    href: "/app/net-worth",
    icon: <TrendingUp className="h-4 w-4" />,
    children: [
      { label: "Add Snapshot", href: "/app/net-worth/snapshot", icon: <PlusCircle className="h-4 w-4" /> },
      { label: "History & Charts", href: "/app/net-worth/history", icon: <LineChart className="h-4 w-4" /> },
    ],
  },
  {
    label: "Mortgage",
    href: "/app/mortgage",
    icon: <Home className="h-4 w-4" />,
    children: [
      { label: "Overview", href: "/app/mortgage/overview", icon: <Landmark className="h-4 w-4" /> },
      { label: "Amortization", href: "/app/mortgage/amortization", icon: <List className="h-4 w-4" /> },
      { label: "Extra Payments", href: "/app/mortgage/extra-payments", icon: <Calculator className="h-4 w-4" /> },
    ],
  },
  {
    label: "Data Manager",
    href: "/app/data",
    icon: <Database className="h-4 w-4" />,
  },
  {
    label: "Settings",
    href: "/app/settings",
    icon: <Settings className="h-4 w-4" />,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set(["Budget", "Net Worth", "Mortgage"]));

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          {!collapsed && (
            <Image src="/logo-dark.png" alt="Ledger" width={100} height={100} className="h-8 w-auto" />
          )}
          {collapsed && (
            <Image src="/logo-dark.png" alt="Ledger" width={32} height={32} className="h-8 w-8 object-contain" />
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4">
          {NAV_ITEMS.map((item) => (
            <div key={item.label}>
              {item.children ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => !collapsed && toggleGroup(item.label)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          isActive(item.href) && "bg-sidebar-accent text-sidebar-accent-foreground",
                          collapsed && "justify-center px-2"
                        )}
                      >
                        {item.icon}
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-left">{item.label}</span>
                            <ChevronRight
                              className={cn(
                                "h-3 w-3 transition-transform",
                                expandedGroups.has(item.label) && "rotate-90"
                              )}
                            />
                          </>
                        )}
                      </button>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    )}
                  </Tooltip>
                  {!collapsed && expandedGroups.has(item.label) && (
                    <div className="ml-4 border-l border-sidebar-border pl-2">
                      {item.children.map((child) => (
                        <Tooltip key={child.href}>
                          <TooltipTrigger asChild>
                            <Link
                              href={child.href}
                              className={cn(
                                "flex items-center gap-3 px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md",
                                pathname === child.href &&
                                  "bg-sidebar-primary text-sidebar-primary-foreground"
                              )}
                            >
                              {child.icon}
                              <span>{child.label}</span>
                            </Link>
                          </TooltipTrigger>
                        </Tooltip>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        isActive(item.href) && "bg-sidebar-accent text-sidebar-accent-foreground",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      {item.icon}
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  )}
                </Tooltip>
              )}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
