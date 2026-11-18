import { cn } from "@/lib/utils";

type Tone = "green" | "orange" | "red" | "blue" | "navy" | "grey" | "purple";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  orange: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  navy: "bg-slate-100 text-navy ring-navy/20",
  grey: "bg-slate-100 text-slate-600 ring-slate-500/20",
  purple: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

const MAP: Record<string, Tone> = {
  // movement
  Completed: "green",
  "In Transit": "blue",
  Pending: "orange",
  Rejected: "red",
  Damaged: "red",
  "Under Review": "purple",
  // billable
  Billable: "green",
  "Blocked – Exception": "red",
  "Pending Approval": "orange",
  "Pending Completion": "grey",
  "Pending Chits": "orange",
  "Pending Driver Log": "orange",
  "Blocked – Mismatch": "red",
  "Non-billable": "grey",
  // exceptions
  Open: "red",
  Resolved: "green",
  Critical: "red",
  High: "orange",
  Medium: "blue",
  Low: "grey",
  // generic
  Active: "green",
  Inactive: "grey",
  Conditional: "orange",
  Draft: "orange",
  Approved: "green",
  Exported: "navy",
  Imported: "green",
  Invalid: "red",
  Duplicate: "orange",
  "Completed with Issues": "orange",
  "Rejected – Duplicate File": "red",
  Present: "green",
  Absent: "red",
  Late: "orange",
  Scheduled: "grey",
  "On Leave": "orange",
  Suspended: "red",
  "In Maintenance": "orange",
  Overdue: "red",
  OK: "green",
  "Due Soon": "orange",
  Disabled: "grey",
  Morning: "blue",
  Night: "navy",
  Rotating: "purple",
  Off: "grey",
  Leave: "orange",
  Verified: "green",
  "Needs Verification": "orange",
  "Pending Review": "orange",
  "Reviewed – Explained": "green",
  "Reviewed – Escalated": "red",
  Reviewed: "green",
};

export function statusTone(status: string): Tone {
  return MAP[status] ?? "grey";
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE_CLASS[statusTone(status)],
        className,
      )}
    >
      {status}
    </span>
  );
}
