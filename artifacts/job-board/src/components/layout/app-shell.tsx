import * as React from "react";
import { Link, useLocation } from "wouter";
import {
  KanbanSquare,
  Table2,
  Users,
  LogOut,
  Loader2,
  TrendingUp,
  MessageSquare,
  SlidersHorizontal,
  Menu,
} from "lucide-react";
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
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { SummaryStrip } from "./summary-strip";
import { LeadSyncBanner } from "./lead-sync-banner";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { ThemeToggle } from "@/components/theme-toggle";

interface AppShellProps {
  children: React.ReactNode;
}

const LINKS = [
  // Sales Pipeline is admin-only: the API doesn't hand leads to other roles.
  { href: "/sales", label: "Sales Pipeline", icon: TrendingUp, adminOnly: true },
  { href: "/board", label: "Job Board", icon: KanbanSquare },
  { href: "/list", label: "Job List", icon: Table2 },
  { href: "/team", label: "Team Access", icon: Users, adminOnly: true },
  { href: "/feedback", label: "Feedback Inbox", icon: MessageSquare, adminOnly: true },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal, adminOnly: true },
];

function NavLinks({
  role,
  location,
  onNavigate,
}: {
  role?: string;
  location: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {LINKS.map((link) => {
        if (link.adminOnly && role !== "admin") return null;
        const isActive = location === link.href || location.startsWith(link.href + "/");
        return (
          <Link key={link.href} href={link.href} onClick={onNavigate}>
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
    </>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">
        SP
      </div>
      <div className="flex flex-col">
        <span className="font-bold text-sm leading-none">Superior Patio</span>
        <span className="text-xs text-sidebar-foreground/60 mt-1 font-mono">Job Board</span>
      </div>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: user, isLoading, error: meError } = useGetCurrentUser();
  const updateMyProfile = useUpdateMyProfile();
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = React.useState(false);

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

  const handleSignOut = () => {
    signOut({ redirectUrl: basePath || "/" });
  };

  // 403 from /me means the account has no access (invite-only sign-up, or
  // an admin removed it). Show why instead of a broken empty app.
  const accessDenied =
    (meError as any)?.status === 403
      ? ((meError as any)?.data?.error as string | undefined) ??
        "Your account doesn't have access to this app."
      : null;
  if (accessDenied) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
            SP
          </div>
          <h1 className="text-lg font-semibold">No access yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">{accessDenied}</p>
          <button
            onClick={handleSignOut}
            className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const userBlock = isLoading ? (
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
      <div className="flex items-center gap-0.5 shrink-0">
        <ThemeToggle />
      <button
        onClick={handleSignOut}
        className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors p-1 rounded-md"
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-full bg-background overflow-hidden text-foreground">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center gap-3 h-14 shrink-0 px-3 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="p-2 -ml-1 rounded-md hover:bg-sidebar-border"
              title="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground flex flex-col">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="p-6 pb-4">
              <Brand />
            </div>
            <nav className="flex-1 px-4 py-2 space-y-1">
              <NavLinks
                role={user?.role}
                location={location}
                onNavigate={() => setIsMobileNavOpen(false)}
              />
            </nav>
            <div className="px-4 pb-2">
              <button
                onClick={() => {
                  setIsMobileNavOpen(false);
                  setIsFeedbackOpen(true);
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium w-full text-left transition-colors text-sidebar-foreground/70 hover:bg-sidebar-border hover:text-sidebar-foreground"
              >
                <MessageSquare className="w-4 h-4" />
                Feedback
              </button>
            </div>
            <div className="p-4 border-t border-sidebar-border">{userBlock}</div>
          </SheetContent>
        </Sheet>
        <Brand />
        <ThemeToggle className="ml-auto p-2" />
        <button
          onClick={handleSignOut}
          className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors p-2 rounded-md"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex-col">
        <div className="p-6">
          <Brand />
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <NavLinks role={user?.role} location={location} />
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

        <div className="p-4 border-t border-sidebar-border mt-auto">{userBlock}</div>
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
