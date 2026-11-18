"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { FormDialog } from "@/components/shared/form-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { useDriverActions } from "@/hooks/use-drivers";
import { formatDay, realToday } from "@/lib/date-utils";
import { SHIFT_HOURS, isWorkShift, type WorkShift } from "@/lib/roster-rules";

const REASONS = ["Sick", "Family emergency", "Transport problem", "Personal reason", "Could not be reached", "Other"];

/**
 * "Driver is not coming": the driver tells the supervisor, the supervisor marks it here. The shift is marked Absent,
 * becomes an open shift on the roster and the Manager is notified automatically.
 */
export function AbsenceDialog({
  open,
  onOpenChange,
  initialDriverId,
  initialDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialDriverId?: string;
  initialDate?: string;
}) {
  const { db } = useApp();
  const actions = useDriverActions();
  const [date, setDate] = useState(initialDate ?? realToday());
  const [driverId, setDriverId] = useState(initialDriverId ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(initialDate ?? realToday());
    setDriverId(initialDriverId ?? "");
    setReason("");
    setNote("");
    setError(null);
  }, [open, initialDriverId, initialDate]);

  const options = useMemo(
    () =>
      db.roster
        .filter((r) => r.date === date && isWorkShift(r.shift) && !r.absentReason && r.attendance !== "Absent")
        .map((r) => {
          const drv = db.drivers.find((d) => d.id === r.driverId);
          return { value: r.driverId, label: `${drv?.name ?? r.driverId} · ${r.shift} (${SHIFT_HOURS[r.shift as WorkShift].short})${r.primeMoverId ? ` · ${r.primeMoverId}` : ""}` };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [db.roster, db.drivers, date],
  );

  const submit = () => {
    if (!driverId) return setError("Select the driver who is not coming.");
    if (!reason) return setError("Select the reason the driver gave.");
    if (actions.reportAbsence({ driverId, date, reason, note })) onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Driver not coming"
      description="Mark the driver absent for his shift. The Manager is told automatically and the shift appears under Open shifts so a replacement can be assigned."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={submit}>
            <BellRing /> Mark absent & notify Manager
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Shift date">
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8" />
        </Field>
        <div className="-mt-1 text-xs text-slate">{formatDay(date, "EEEE, dd MMM yyyy")}</div>
        <Field label="Driver" error={options.length === 0 ? "Nobody is rostered for a shift on this date (or everyone is already marked absent)." : undefined}>
          <NativeSelect value={driverId} onValueChange={setDriverId} placeholder="Select driver" options={options} />
        </Field>
        <Field label="Reason given by the driver">
          <NativeSelect value={reason} onValueChange={setReason} placeholder="Select reason" options={REASONS} />
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. fever, will get a medical certificate" className="h-8" />
        </Field>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>
    </FormDialog>
  );
}
