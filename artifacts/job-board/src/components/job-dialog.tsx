import * as React from "react";
import { Job, JobStage, JobInput, JobUpdate, useCreateJob, useUpdateJob, useDeleteJob, useArchiveJob, getListJobsQueryKey, getGetBoardSummaryQueryKey, useGetCurrentUser } from "@workspace/api-client-react";
import { queryClient } from "@/lib/query-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { STAGE_LABELS } from "@/lib/utils";
import { toast } from "sonner";
import { JobNotes } from "./job-notes";

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
}).superRefine((data, ctx) => {
  if (data.stage === "sold" && !data.estimatedInstallDate) {
    ctx.addIssue({
      path: ["estimatedInstallDate"],
      code: z.ZodIssueCode.custom,
      message: "Required when initial stage is Sold",
    });
  }
});

type JobFormData = z.infer<typeof jobSchema>;

export function JobDialog({ job, open, onOpenChange }: { job?: Job, open: boolean, onOpenChange: (open: boolean) => void }) {
  const { data: user } = useGetCurrentUser();
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
          stage: "new_lead",
        });
      }
    }
  }, [job, open, form]);

  const onSubmit = (data: JobFormData) => {
    if (!isAdmin) {
      // Techs/viewers manage notes through the Notes section; nothing else to save.
      onOpenChange(false);
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
        onError: (err: any) => toast.error(err?.response?.data?.error || "Failed to update job")
      });
    } else {
      createJob.mutate({
        data: {
          ...data,
          stage: data.stage as JobStage,
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
        onError: (err: any) => toast.error(err?.response?.data?.error || "Failed to create job")
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
          <DialogTitle>{isEditing ? `Edit Job: ${job.customerName}` : "Create New Job"}</DialogTitle>
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
              <Input id="phone" {...form.register("phone")} disabled={fieldsDisabled} />
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
                  {Object.entries(STAGE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

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
