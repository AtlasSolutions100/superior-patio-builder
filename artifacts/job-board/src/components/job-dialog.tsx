import * as React from "react";
import { Job, JobStage, JobInput, JobUpdate, useCreateJob, useUpdateJob, useDeleteJob, useArchiveJob, useListUsers, useSetJobAssignees, getListJobsQueryKey, getListUsersQueryKey, getGetBoardSummaryQueryKey, useGetCurrentUser } from "@workspace/api-client-react";
import { queryClient } from "@/lib/query-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useStages } from "@/hooks/use-stages";
import { formatPhoneInput, isLikelyValidPhone } from "@/lib/phone";
import { initials } from "@/lib/utils";
import { toast } from "sonner";
import { JobNotes } from "./job-notes";

const LEAD_SOURCE_PRESETS = [
  "Google Ads",
  "Referral",
  "Home Show",
  "Website",
  "Facebook",
  "Yard Sign",
  "Repeat Customer",
];

const jobSchema = z.object({
  customerName: z.string().min(1, "Name is required"),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  coverType: z.string().optional().nullable(),
  contractAmount: z.union([z.string(), z.number()]).optional().nullable().transform(v => {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }),
  source: z.string().optional().nullable(),
  estimatedInstallDate: z.string().optional().nullable(),
  lastNote: z.string().optional().nullable(),
  stage: z.string().optional(),
});
// The "job stages need an install date" rule is checked in onSubmit — which
// stages are job stages is data (Settings), not something a static schema knows.

type JobFormData = z.infer<typeof jobSchema>;

export function JobDialog({ job, open, onOpenChange }: { job?: Job, open: boolean, onOpenChange: (open: boolean) => void }) {
  const { data: user } = useGetCurrentUser();
  const stg = useStages();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const archiveJob = useArchiveJob();
  
  const isEditing = !!job;
  const isAdmin = user?.role === "admin";
  const isTech = user?.role === "tech";
  // Techs and viewers can't edit job fields; the notes section governs its own permissions.
  const fieldsDisabled = !isAdmin;

  const form = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: job || {
      customerName: "",
      phone: "",
      address: "",
      city: "",
      coverType: "",
      contractAmount: null,
      source: "",
      estimatedInstallDate: "",
      lastNote: "",
      stage: "new_lead",
    },
  });

  // reset form when job changes or dialog opens
  const entrySalesKey = stg.entrySalesStage?.key;
  React.useEffect(() => {
    if (open) {
      if (job) {
        form.reset({
          ...job,
          estimatedInstallDate: job.estimatedInstallDate || "",
        });
      } else {
        form.reset({
          customerName: "",
          phone: "",
          address: "",
          city: "",
          coverType: "",
          contractAmount: null,
          source: "",
          estimatedInstallDate: "",
          lastNote: "",
          stage: entrySalesKey ?? "",
        });
      }
    }
  }, [job, open, form, entrySalesKey]);

  const onSubmit = (data: JobFormData) => {
    if (!isAdmin) {
      // Techs/viewers manage notes through the Notes section; nothing else to save.
      onOpenChange(false);
      return;
    }

    // Starting a job in the job pipeline requires an install date (same rule
    // as the server); leads (sales pipeline) don't.
    const stageKey = data.stage || stg.entrySalesStage?.key;
    if (!isEditing && stageKey && stg.isJobStage(stageKey) && !data.estimatedInstallDate) {
      form.setError("estimatedInstallDate", {
        type: "custom",
        message: `Required when starting in ${stg.labelOf(stageKey)}`,
      });
      return;
    }

    if (isEditing) {
      // Notes are managed in the Notes section, not through the job form.
      const { lastNote: _omit, ...fields } = data;
      updateJob.mutate({
        id: job.id,
        data: {
          ...fields,
          contractAmount: data.contractAmount || null,
          estimatedInstallDate: data.estimatedInstallDate || null,
        } as JobUpdate
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
          toast.success("Job updated successfully");
          onOpenChange(false);
        },
        onError: (err: any) => toast.error(err?.data?.error || "Failed to update job")
      });
    } else {
      createJob.mutate({
        data: {
          ...data,
          stage: stageKey as JobStage,
          contractAmount: data.contractAmount || undefined,
          estimatedInstallDate: data.estimatedInstallDate || undefined,
        } as JobInput
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
          toast.success("Job created successfully");
          onOpenChange(false);
        },
        onError: (err: any) => toast.error(err?.data?.error || "Failed to create job")
      });
    }
  };

  const handleDelete = () => {
    if (!job || !window.confirm("Are you sure you want to delete this job? This cannot be undone.")) return;
    
    deleteJob.mutate({ id: job.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
        toast.success("Job deleted");
        onOpenChange(false);
      },
      onError: () => toast.error("Failed to delete job")
    });
  };

  const handleArchive = () => {
    if (
      !job ||
      !window.confirm(
        `Archive "${job.customerName}"? The job leaves the board and job list but is kept safe — you can restore it any time from the Archived view.`,
      )
    )
      return;

    archiveJob.mutate({ id: job.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
        toast.success("Job archived — find it under Archived on the Job List");
        onOpenChange(false);
      },
      onError: (err: any) => toast.error(err?.data?.error || "Failed to archive job")
    });
  };

  const isPending = createJob.isPending || updateJob.isPending || deleteJob.isPending || archiveJob.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? `${isAdmin ? "Edit" : "View"} Job: ${job.customerName}`
              : "Create New Job"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name <span className="text-destructive">*</span></Label>
              <Input id="customerName" {...form.register("customerName")} disabled={fieldsDisabled} />
              {form.formState.errors.customerName && <p className="text-xs text-destructive">{form.formState.errors.customerName.message}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Controller
                name="phone"
                control={form.control}
                render={({ field }) => (
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 555-1234"
                    value={field.value ?? ""}
                    onChange={e => field.onChange(formatPhoneInput(e.target.value))}
                    onBlur={e => {
                      field.onChange(formatPhoneInput(e.target.value.trim()));
                      field.onBlur();
                    }}
                    disabled={fieldsDisabled}
                  />
                )}
              />
              {(() => {
                const v = form.watch("phone");
                return v && !isLikelyValidPhone(v) ? (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    This doesn't look like a full phone number — tap-to-call may not work.
                  </p>
                ) : null;
              })()}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="source">Lead Source</Label>
              <Input
                id="source"
                list="lead-source-options"
                placeholder="Pick a common source or type your own"
                {...form.register("source")}
                disabled={fieldsDisabled}
              />
              <datalist id="lead-source-options">
                {LEAD_SOURCE_PRESETS.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...form.register("address")} disabled={fieldsDisabled} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...form.register("city")} disabled={fieldsDisabled} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coverType">Cover Type</Label>
              <Input id="coverType" {...form.register("coverType")} disabled={fieldsDisabled} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractAmount">Contract Amount ($)</Label>
              <Input id="contractAmount" type="number" step="0.01" {...form.register("contractAmount")} disabled={fieldsDisabled} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedInstallDate">Est. Install Date</Label>
              <Input id="estimatedInstallDate" type="date" {...form.register("estimatedInstallDate")} disabled={fieldsDisabled} />
              {form.formState.errors.estimatedInstallDate && <p className="text-xs text-destructive">{form.formState.errors.estimatedInstallDate.message}</p>}
            </div>

            {!isEditing && (
              <div className="space-y-2">
                <Label htmlFor="stage">Initial Stage</Label>
                <select 
                  id="stage" 
                  {...form.register("stage")}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={fieldsDisabled}
                >
                  <optgroup label="Sales Pipeline (lead)">
                    {stg.salesStages.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Job Board">
                    {stg.jobStages.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}
          </div>

          {isEditing && (
            <div className="space-y-2">
              <Label>Assigned Crew</Label>
              <AssignedCrew job={job} isAdmin={isAdmin} />
            </div>
          )}

          {isEditing ? (
            <div className="space-y-2">
              <Label>Notes</Label>
              <JobNotes jobId={job.id} archived={!!job.archivedAt} />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="lastNote">Initial Note</Label>
              <Textarea 
                id="lastNote" 
                {...form.register("lastNote")} 
                placeholder="Add details, site notes, etc..."
                className="min-h-[100px]"
              />
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <div className="flex items-center gap-2">
              {isEditing && isAdmin && !job.archivedAt && (
                <Button type="button" variant="outline" onClick={handleArchive} disabled={isPending}>
                  Archive Job
                </Button>
              )}
              {isEditing && isAdmin && (
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
                  Delete Job
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {isAdmin ? "Cancel" : "Close"}
              </Button>
              {isAdmin && (
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Job"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Who's on this job. Admins toggle team members on/off (saved immediately);
 * techs and viewers see the list read-only. Viewer-role accounts aren't
 * assignable — they don't work jobs.
 */
function AssignedCrew({ job, isAdmin }: { job: Job; isAdmin: boolean }) {
  const { data: users } = useListUsers({
    query: { enabled: isAdmin, queryKey: getListUsersQueryKey() },
  });
  const setAssignees = useSetJobAssignees();
  const assigned = job.assignees ?? [];

  // Local optimistic set: toggling two people quickly must not lose the
  // first click while the jobs list is still refetching (each PUT replaces
  // the full set, so it has to be computed from the latest local state, not
  // the possibly-stale job prop).
  const [ids, setIds] = React.useState<number[]>(assigned.map(a => a.id));
  const jobIdRef = React.useRef(job.id);
  React.useEffect(() => {
    if (jobIdRef.current !== job.id) {
      jobIdRef.current = job.id;
      setIds((job.assignees ?? []).map(a => a.id));
    }
  }, [job.id, job.assignees]);
  const assignedIds = new Set(ids);

  const toggle = (userId: number) => {
    setIds(prev => {
      const next = prev.includes(userId)
        ? prev.filter(i => i !== userId)
        : [...prev, userId];
      setAssignees.mutate(
        { id: job.id, data: { userIds: next } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
          },
          onError: (err: any) => {
            toast.error(err?.data?.error || "Couldn't update the crew — try again.");
            // Roll back the optimistic toggle that failed.
            setIds(cur =>
              prev.includes(userId) ? [...cur, userId] : cur.filter(i => i !== userId),
            );
          },
        },
      );
      return next;
    });
  };

  if (!isAdmin) {
    return assigned.length > 0 ? (
      <div className="flex flex-wrap items-center gap-1.5">
        {assigned.map(a => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold">
              {initials(a.name)}
            </span>
            {a.name}
          </span>
        ))}
      </div>
    ) : (
      <p className="text-xs text-muted-foreground">No one assigned yet.</p>
    );
  }

  const assignable = (users ?? []).filter(u => u.role !== "viewer");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assignable.map(u => {
        const on = assignedIds.has(u.id);
        const name = u.name || u.username || u.email || "Unknown";
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => toggle(u.id)}
            title={on ? `Unassign ${name}` : `Assign ${name}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                on ? "bg-primary/20" : "bg-muted"
              }`}
            >
              {initials(name)}
            </span>
            {name}
            <span className="text-[10px] uppercase opacity-60">{u.role}</span>
          </button>
        );
      })}
      {assignable.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No assignable team members yet — invite techs on the Team page.
        </p>
      )}
    </div>
  );
}
