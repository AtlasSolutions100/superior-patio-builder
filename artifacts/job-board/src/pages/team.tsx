import * as React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { queryClient } from "@/lib/query-client";
import { formatDate } from "@/lib/utils";
import { useListUsers, useUpdateUserRole, useGetCurrentUser, UserRoleUpdate, getListUsersQueryKey } from "@workspace/api-client-react";

export default function TeamPage() {
  const { data: currentUser, isLoading: isLoadingMe } = useGetCurrentUser();
  const { data: users, isLoading: isLoadingUsers } = useListUsers({
    query: {
      enabled: currentUser?.role === "admin",
      queryKey: getListUsersQueryKey()
    }
  });

  const updateRole = useUpdateUserRole();

  if (isLoadingMe) {
    return <div className="p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <ShieldAlert className="w-12 h-12 mb-4 text-destructive/80" />
        <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
        <p className="max-w-md">You do not have permission to view or manage the team. Only administrators can access this page.</p>
      </div>
    );
  }

  const handleRoleChange = (userId: number, newRole: string) => {
    updateRole.mutate({
      id: userId,
      data: { role: newRole as any } as UserRoleUpdate
    }, {
      onSuccess: () => {
        toast.success("User role updated");
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      },
      onError: () => {
        toast.error("Failed to update role");
      }
    });
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="flex-none p-4 md:p-6 border-b border-border bg-card">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Access</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who can view and edit the job board.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-6 bg-accent/10">
        <div className="border border-border rounded-lg bg-card overflow-hidden max-w-4xl mx-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              <tr>
                <th className="px-6 py-4">Name / Email</th>
                <th className="px-6 py-4">Joined</th>
                <th className="px-6 py-4 text-right">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoadingUsers ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading team...
                  </td>
                </tr>
              ) : users?.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                users?.map(user => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{user.name || 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{user.email || 'No email'}</div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-mono">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {user.id === currentUser.id ? (
                        <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          Admin (You)
                        </span>
                      ) : (
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          disabled={updateRole.isPending}
                        >
                          <option value="viewer">Viewer (Read Only)</option>
                          <option value="tech">Tech (Install + Notes)</option>
                          <option value="admin">Admin (Full Edit)</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
