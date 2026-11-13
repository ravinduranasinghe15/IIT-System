"use client";

import { useState } from "react";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { useDriverActions } from "@/hooks/use-drivers";
import type { Driver, DriverStatus } from "@/types/driver";
import { DriverForm } from "./driver-form";

export function EditDriverDialog({ driver, open, onOpenChange }: { driver: Driver; open: boolean; onOpenChange: (o: boolean) => void }) {
  const actions = useDriverActions();
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit driver – ${driver.name}`}
      description={`${driver.id} · changes are recorded in the audit log.`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`driver-edit-${driver.id}`}>
            Save changes
          </Button>
        </>
      }
    >
      <DriverForm
        driver={driver}
        formId={`driver-edit-${driver.id}`}
        hideActions
        onSubmit={(input) => {
          if (actions.edit(driver.id, input)) onOpenChange(false);
        }}
      />
    </FormDialog>
  );
}

export function AssignPrimeMoverDialog({ driver, open, onOpenChange }: { driver: Driver; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { db } = useApp();
  const actions = useDriverActions();
  const [pmId, setPmId] = useState(driver.primeMoverId ?? "");
  const holder = pmId ? db.primeMovers.find((p) => p.id === pmId)?.driverId : null;
  const holderName = holder && holder !== driver.id ? db.drivers.find((x) => x.id === holder)?.name : null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Assign prime mover – ${driver.name}`}
      description="Updates both the driver record and the vehicle's current driver."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pmId === (driver.primeMoverId ?? "")}
            onClick={() => {
              actions.assignPrimeMover(driver.id, pmId || null);
              onOpenChange(false);
            }}
          >
            Save assignment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Prime mover">
          <NativeSelect
            value={pmId}
            onValueChange={setPmId}
            placeholder="Not assigned"
            options={db.primeMovers.map((p) => {
              const h = p.driverId ? db.drivers.find((x) => x.id === p.driverId) : null;
              return { value: p.id, label: `${p.id} · ${p.regNo}${h && h.id !== driver.id ? ` (${h.name})` : ""}${p.status !== "Active" ? ` – ${p.status}` : ""}` };
            })}
          />
        </Field>
        {holderName && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {pmId} is currently assigned to {holderName}. Saving will unassign them from this vehicle.
          </p>
        )}
      </div>
    </FormDialog>
  );
}

const STATUSES: DriverStatus[] = ["Active", "On Leave", "Suspended", "Inactive"];

export function DriverStatusDialog({ driver, open, onOpenChange }: { driver: Driver; open: boolean; onOpenChange: (o: boolean) => void }) {
  const actions = useDriverActions();
  const [status, setStatus] = useState<DriverStatus>(driver.status);
  const [note, setNote] = useState("");
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Update status – ${driver.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={status === driver.status}
            onClick={() => {
              actions.setStatus(driver.id, status, note.trim());
              onOpenChange(false);
            }}
          >
            Update status
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Employment status">
          <NativeSelect value={status} onValueChange={(v) => setStatus(v as DriverStatus)} options={STATUSES} />
        </Field>
        <Field label="Note (optional)" hint="Recorded in the audit log.">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </FormDialog>
  );
}
