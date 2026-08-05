import * as React from "react";
import { Link, useLocation } from "wouter";
import { KanbanSquare, Table2, Users, LogOut, Loader2, TrendingUp, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClerk } from "@clerk/react";
import { toast } from "sonner";
import {
  useGetCurrentUser,
  useUpdateMyProfile,
  getGetCurrentUserQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/query-client";
import { EditProfileDialog } from "@/components/edit-profile-dialog";
import { SummaryStrip } from "./summary-strip";
import { LeadSyncBanner } from "./lead-sync-banner";
import { FeedbackDialog } from "@/components/feedback-dialog";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  
  const { data: user, isLoading } = useGetCurrentUser();
  const updateMyProfile = useUpdateMyProfile();
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false);

  const handleProfileSave = (values: { name: string; username: string | null }) => {
    updateMyProfile.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast.success("Profile updated");
          setIsProfileOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err: any) =>
          toast.error(err?.data?.error || "Failed to update profile"),
      },
    );
  };

  const links = [
    { href: "/sales", label: "Sales Pipeline", icon: TrendingUp },
    { href: "/board", label: "Kanban Board", icon: KanbanSquare },
    { href: "/list", label: "Job List", icon: Table2 },
    { href: "/team", label: "Team Access", icon: Users, adminOnly: true },
    { href: "/feedback", label: "Feedback Inbox", icon: MessageSquare, adminOnly: true },
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

        <div className="px-4 pb-2">
          <button
            onClick={() => setIsFeedbackOpen(true)}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium w-full text-left transition-colors text-sidebar-foreground/70 hover:bg-sidebar-border hover:text-sidebar-foreground"
            title="Send feedback about the app"
          >
            <MessageSquare className="w-4 h-4" />
            Feedback
          </button>
        </div>

        <div className="p-4 border-t border-sidebar-border mt-auto">
          {isLoading ? (
            <div className="flex items-center gap-3 px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-sidebar-foreground/50" />
            </div>
          ) : (
            <div className="flex items-center justify-between px-3 py-2 rounded-md">
              <button
                onClick={() => setIsProfileOpen(true)}
                className="flex flex-col items-start truncate pr-2 text-left rounded-md hover:opacity-80 transition-opacity"
                title="Edit your profile"
              >
                <span className="text-sm font-medium truncate">{user?.name || user?.email || "User"}</span>
                <span className="text-xs text-sidebar-foreground/50 truncate">
                  {user?.username ? `@${user.username}` : <span className="capitalize">{user?.role}</span>}
                </span>
              </button>
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

      <FeedbackDialog open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen} />

      <EditProfileDialog
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
        title="Your Profile"
        description={user?.email || undefined}
        initialName={user?.name || ""}
        initialUsername={user?.username || ""}
        isSaving={updateMyProfile.isPending}
        onSave={handleProfileSave}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        <LeadSyncBanner />
        <SummaryStrip />
        <main className="flex-1 overflow-auto custom-scrollbar relative">
          {children}
        </main>
      </div>
    </div>
  );
}
