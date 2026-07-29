import * as React from "react";
import { Link, useLocation } from "wouter";
import { KanbanSquare, Table2, Users, LayoutDashboard, LogOut, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClerk } from "@clerk/react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { SummaryStrip } from "./summary-strip";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  
  const { data: user, isLoading } = useGetCurrentUser();

  const links = [
    { href: "/list", label: "Job List", icon: Table2 },
    { href: "/board", label: "Kanban Board", icon: KanbanSquare },
    { href: "/team", label: "Team Access", icon: Users, adminOnly: true },
  ];

  const handleSignOut = () => {
    signOut({ redirectUrl: basePath || "/" });
  };

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden text-foreground">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">
              SP
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm leading-none">Superior Patio</span>
              <span className="text-xs text-sidebar-foreground/60 mt-1 font-mono">Job Board</span>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1">
          {links.map((link) => {
            if (link.adminOnly && user?.role !== "admin") return null;
            
            const isActive = location === link.href || location.startsWith(link.href + "/");
            return (
              <Link key={link.href} href={link.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-border hover:text-sidebar-foreground"
                  )}
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border mt-auto">
          {isLoading ? (
            <div className="flex items-center gap-3 px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-sidebar-foreground/50" />
            </div>
          ) : (
            <div className="flex items-center justify-between px-3 py-2 rounded-md">
              <div className="flex flex-col truncate pr-2">
                <span className="text-sm font-medium truncate">{user?.name || user?.email || "User"}</span>
                <span className="text-xs text-sidebar-foreground/50 capitalize">{user?.role}</span>
              </div>
              <button 
                onClick={handleSignOut}
                className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors p-1 rounded-md"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        <SummaryStrip />
        <main className="flex-1 overflow-auto custom-scrollbar relative">
          {children}
        </main>
      </div>
    </div>
  );
}
