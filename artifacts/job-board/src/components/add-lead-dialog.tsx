import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { queryClient } from "@/lib/query-client";
import { formatPhoneInput, isLikelyValidPhone } from "@/lib/phone";
import {
  useCreateJob,
  getListJobsQueryKey,
  getGetBoardSummaryQueryKey,
  JobInput,
} from "@workspace/api-client-react";

const LEAD_SOURCES = ["Manual", "Phone", "Website", "Manufacturer", "Other"];

/**
 * Fast, minimal lead capture for calls/texts/referrals. Creates the job
 * directly in the New Lead stage; the full job form stays available on the
 * Job List. Typed values are kept on failure so nothing is lost.
 */
export function AddLeadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createJob = useCreateJob();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [city, setCity] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [source, setSource] = React.useState("Manual");
  const [note, setNote] = React.useState("");
  const [nameError, setNameError] = React.useState(false);

  // Fresh form each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setCity("");
      setAddress("");
      setSource("Manual");
      setNote("");
      setNameError(false);
    }
  }, [open]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }
    createJob.mutate(
      {
        data: {
          customerName: trimmedName,
          phone: phone.trim() || undefined,
          city: city.trim() || undefined,
          address: address.trim() || undefined,
          source,
          lastNote: note.trim() || undefined,
          stage: "new_lead",
        } as JobInput,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
          toast.success(`Lead added — ${trimmedName} is in New Lead`);
          onOpenChange(false);
        },
        onError: (err: any) => {
          // Keep the typed values so the user can retry.
          toast.error(err?.data?.error || "Couldn't add the lead — try again.");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Lead</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Quickly jot down a lead from a call, text, or referral. It lands in
            the New Lead column.
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="leadName">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="leadName"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError && e.target.value.trim()) setNameError(false);
              }}
              placeholder="Customer name"
            />
            {nameError && (
              <p className="text-xs text-destructive">Name is required</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="leadPhone">Phone</Label>
              <Input
                id="leadPhone"
                type="tel"
                placeholder="(555) 555-1234"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                onBlur={(e) => setPhone(formatPhoneInput(e.target.value.trim()))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leadSource">Source</Label>
              <select
                id="leadSource"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {phone && !isLikelyValidPhone(phone) && (
            <p className="text-xs text-amber-600 dark:text-amber-500 -mt-2">
              This doesn't look like a full phone number — tap-to-call may not work.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="leadCity">City (optional)</Label>
              <Input
                id="leadCity"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leadAddress">Address (optional)</Label>
              <Input
                id="leadAddress"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="leadNote">Note</Label>
            <Textarea
              id="leadNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Called about a 12x20 patio cover, call back Thursday"
              className="min-h-[70px]"
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createJob.isPending}>
            {createJob.isPending ? "Adding..." : "Add Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
