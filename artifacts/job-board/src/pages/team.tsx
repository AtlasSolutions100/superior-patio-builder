import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { queryClient } from "@/lib/query-client";
import { formatDate } from "@/lib/utils";
import {
  useListUsers,
  useUpdateUserRole,
  useGetCurrentUser,
  useListInvites,
  useCreateInvite,
  useUpdateInvite,
  useDeleteInvite,
  UserRoleUpdate,
  getListUsersQueryKey,
  getListInvitesQueryKey,
} from "@workspace/api-client-react";

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer (Read Only)" },
  { value: "tech", label: "Tech (Install + Notes)" },
  { value: "admin", label: "Admin (Full Edit)" },
] as const;

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {ROLE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default function TeamPage() {
  const { data: currentUser, isLoading: isLoadingMe } = useGetCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  const { data: users, isLoading: isLoadingUsers } = useListUsers({
    query: { enabled: isAdmin, queryKey: getListUsersQueryKey() },
  });
  const { data: invites } = useListInvites({
    query: { enabled: isAdmin, queryKey: getListInvitesQueryKey() },
  });

  const updateRole = useUpdateUserRole();
  const createInvite = useCreateInvite();
  const updateInvite = useUpdateInvite();
  const deleteInvite = useDeleteInvite();

  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("viewer");

  if (isLoadingMe) {
    return (
      <div className="p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <ShieldAlert className="w-12 h-12 mb-4 text-destructive/80" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
        <p className="max-w-md">
          You do not have permission to view or manage the team. Only administrators can access
          this page.
        </p>
      </div>
    );
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListInvitesQueryKey() });
  };

  const handleRoleChange = (userId: number, newRole: string) => {
    updateRole.mutate(
      { id: userId, data: { role: newRole } as UserRoleUpdate },
      {
        onSuccess: () => {
          toast.success("Role updated");
          invalidate();
        },
        onError: (err: any) =>
          toast.error(err?.data?.error || "Failed to update role"),
      },
    );
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    createInvite.mutate(
      { data: { email, role: inviteRole as any } },
      {
        onSuccess: () => {
          toast.success(`${email} will get ${inviteRole} access when they sign in`);
          setIsInviteOpen(false);
          setInviteEmail("");
          setInviteRole("viewer");
          invalidate();
        },
        onError: (err: any) =>
          toast.error(err?.data?.error || "Couldn't add team member"),
      },
    );
  };

  const handleInviteRoleChange = (inviteId: number, role: string) => {
    updateInvite.mutate(
      { id: inviteId, data: { role: role as any } },
      {
        onSuccess: () => {
          toast.success("Invite updated");
          invalidate();
        },
        onError: () => toast.error("Failed to update invite"),
      },
    );
  };

  const handleInviteRemove = (inviteId: number, email: string) => {
    deleteInvite.mutate(
      { id: inviteId },
      {
        onSuccess: () => {
          toast.success(`Removed invite for ${email}`);
          invalidate();
        },
        onError: () => toast.error("Failed to remove invite"),
      },
    );
  };

  const memberCount = users?.length ?? 0;
  const inviteCount = invites?.length ?? 0;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-none px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Team</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {memberCount} member{memberCount === 1 ? "" : "s"}
            {inviteCount > 0 &&
              ` · ${inviteCount} invited`}
          </p>
        </div>
        <Button onClick={() => setIsInviteOpen(true)} size="sm" className="h-8">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Team Member
        </Button>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar px-6 pb-8">
        <div className="max-w-3xl">
          <div className="rounded-xl border border-border/70 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border/70">
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Joined</th>
                  <th className="px-4 py-3 font-medium text-right">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isLoadingUsers ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : (
                  <>
                    {users?.map((user) => (
                      <tr key={user.id} className="hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-foreground">
                            {user.name || "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {user.email || "No email"}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground hidden sm:table-cell">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {user.id === currentUser.id ? (
                            <span className="inline-flex items-center rounded-full bg-accent/60 px-2.5 py-1 text-xs font-medium text-foreground">
                              Admin (You)
                            </span>
                          ) : (
                            <RoleSelect
                              value={user.role}
                              onChange={(role) => handleRoleChange(user.id, role)}
                              disabled={updateRole.isPending}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                    {invites?.map((invite) => (
                      <tr key={`invite-${invite.id}`} className="hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-muted-foreground">
                              {invite.email}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              Invited
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground/70 mt-0.5">
                            Gets access when they sign in with this email
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground hidden sm:table-cell">
                          {formatDate(invite.createdAt)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <RoleSelect
                              value={invite.role}
                              onChange={(role) => handleInviteRoleChange(invite.id, role)}
                              disabled={updateInvite.isPending}
                            />
                            <button
                              onClick={() => handleInviteRemove(invite.id, invite.email)}
                              disabled={deleteInvite.isPending}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                              title="Remove invite"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {memberCount === 0 && inviteCount === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                          No team members yet.
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground/70 mt-4 leading-relaxed">
            Admin — full access. Tech — views jobs, moves them to Installed, adds notes.
            Viewer — read only.
          </p>
        </div>
      </div>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              They'll get this role automatically the first time they sign in with this email.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsInviteOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createInvite.isPending}>
                {createInvite.isPending && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                )}
                Add Member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
