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
import { Loader2 } from "lucide-react";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialName: string;
  initialUsername: string;
  isSaving: boolean;
  onSave: (values: { name: string; username: string | null }) => void;
  /** When set, shows a clearly separated "Remove account" section. */
  remove?: {
    label: string;
    isRemoving: boolean;
    onRemove: () => void;
  };
}

export function EditProfileDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName,
  initialUsername,
  isSaving,
  onSave,
  remove,
}: EditProfileDialogProps) {
  const [name, setName] = React.useState(initialName);
  const [username, setUsername] = React.useState(initialUsername);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initialName);
      setUsername(initialUsername);
      setConfirmingRemove(false);
    }
  }, [open, initialName, initialUsername]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSave({ name: trimmedName, username: username.trim() || null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              required
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-username">Username</Label>
            <Input
              id="profile-username"
              placeholder="e.g. justin (optional)"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={24}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, dots, dashes, underscores. Leave blank to
              clear.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>

        {remove && (
          <div className="mt-2 border-t border-border/70 pt-4">
            {confirmingRemove ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm text-foreground font-medium">
                  Remove this account?
                </p>
                <p className="text-xs text-muted-foreground">
                  {remove.label} will immediately lose access to the app. This can
                  only be undone by inviting them again.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingRemove(false)}
                  >
                    Keep account
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={remove.isRemoving}
                    onClick={remove.onRemove}
                  >
                    {remove.isRemoving && (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    )}
                    Remove account
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Removing revokes access immediately.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmingRemove(true)}
                >
                  Remove account
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
