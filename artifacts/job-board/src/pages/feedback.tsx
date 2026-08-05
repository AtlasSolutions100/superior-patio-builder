import * as React from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { useListFeedback, useGetCurrentUser } from "@workspace/api-client-react";

const PAGE_LABELS: Record<string, string> = {
  "/sales": "Sales Pipeline",
  "/board": "Kanban Board",
  "/list": "Job List",
  "/team": "Team Access",
  "/feedback": "Feedback",
};

/** Admin-only list of feedback notes, newest first. */
export default function FeedbackPage() {
  const { data: currentUser, isLoading: isUserLoading } = useGetCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const { data: items, isLoading, isError } = useListFeedback({
    query: { enabled: isAdmin } as any,
  });

  if (!isUserLoading && !isAdmin) {
    return (
      <div className="p-6 max-w-3xl">
        <h1 className="text-xl font-bold">Feedback</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Only administrators can view the feedback inbox. You can still send
          feedback anytime with the Feedback button in the sidebar.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Feedback</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Notes sent by the team from the Feedback button, newest first.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading feedback…
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          Couldn't load feedback. Refresh the page to try again.
        </p>
      ) : !items || items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <MessageSquare className="w-8 h-8 mb-3 opacity-40" />
          <p className="text-sm">No feedback yet.</p>
          <p className="text-xs mt-1">
            Notes sent from the Feedback button will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((f) => (
            <div
              key={f.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="text-sm font-semibold">
                  {f.authorName}
                  {f.authorRole && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground capitalize">
                      {f.authorRole}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(f.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {f.page && (
                    <span className="ml-2">
                      · {PAGE_LABELS[f.page] || f.page}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm mt-2 whitespace-pre-wrap">{f.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
