import * as React from "react";
import {
  useListJobNotes,
  useAddJobNote,
  getListJobNotesQueryKey,
  getListJobsQueryKey,
  getGetBoardSummaryQueryKey,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(iso).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function JobNotes({ jobId, archived }: { jobId: number; archived?: boolean }) {
  const { data: user } = useGetCurrentUser();
  const { data: notes, isLoading } = useListJobNotes(jobId);
  const addNote = useAddJobNote();
  const [text, setText] = React.useState("");

  const canAdd = (user?.role === "admin" || user?.role === "tech") && !archived;

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || addNote.isPending) return;
    addNote.mutate(
      { id: jobId, data: { text: trimmed } },
      {
        onSuccess: () => {
          setText("");
          queryClient.invalidateQueries({ queryKey: getListJobNotesQueryKey(jobId) });
          // The newest note also feeds board cards and the list column.
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
        },
        onError: (err: any) => toast.error(err?.data?.error || "Failed to add note"),
      },
    );
  };

  return (
    <div className="space-y-3">
      {canAdd && (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a note — site details, customer calls, progress..."
            className="min-h-[64px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={!text.trim() || addNote.isPending}
            >
              {addNote.isPending ? "Adding..." : "Add Note"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading notes...
        </div>
      ) : !notes || notes.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No notes yet{canAdd ? " — add the first one above." : "."}
        </p>
      ) : (
        <ul className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md border border-border/70 bg-accent/20 px-3 py-2">
              <p className="text-sm whitespace-pre-wrap break-words">{note.text}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {note.authorName} · <span title={new Date(note.createdAt).toLocaleString()}>{relativeTime(note.createdAt)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
