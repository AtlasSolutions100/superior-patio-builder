import * as React from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { queryClient } from "@/lib/query-client";
import {
  useSubmitFeedback,
  getListFeedbackQueryKey,
} from "@workspace/api-client-react";

/**
 * Small feedback form. The current page and sender are captured
 * automatically; on failure the typed message is kept so nothing is lost.
 */
export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [location] = useLocation();
  const [message, setMessage] = React.useState("");
  const submitFeedback = useSubmitFeedback();

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("Please type a note first");
      return;
    }
    submitFeedback.mutate(
      { data: { message: trimmed, page: location } },
      {
        onSuccess: () => {
          toast.success("Thanks! Your feedback was sent.");
          setMessage("");
          onOpenChange(false);
          queryClient.invalidateQueries({ queryKey: getListFeedbackQueryKey() });
        },
        onError: (err: any) => {
          // Keep the typed message so the user can retry.
          toast.error(err?.data?.error || "Couldn't send feedback — try again.");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Spotted a bug, have an idea, or something confusing? Send a quick
            note — your name and current page are included automatically.
          </p>
        </DialogHeader>

        <div className="space-y-2 my-2">
          <Label htmlFor="feedbackMessage">Your note</Label>
          <textarea
            id="feedbackMessage"
            className="w-full min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            placeholder="What's on your mind?"
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={submitFeedback.isPending}>
            {submitFeedback.isPending ? "Sending..." : "Send Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
