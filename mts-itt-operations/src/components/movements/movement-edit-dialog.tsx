"use client";

import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/shared/form-dialog";
import { useAuth } from "@/contexts/auth-context";
import { useApp } from "@/contexts/app-context";
import { useMovements } from "@/hooks/use-movements";
import { MovementForm } from "./movement-form";
import type { Movement } from "@/types/movement";

export function MovementEditDialog({ movement, onOpenChange }: { movement: Movement | null; onOpenChange: (open: boolean) => void }) {
  const { edit } = useMovements();
  const { db } = useApp();
  const { role } = useAuth();
  const isManager = role === "Manager";

  return (
    <FormDialog
      open={!!movement}
      onOpenChange={onOpenChange}
      size="xl"
      title={movement ? `Edit ${movement.id}` : "Edit movement"}
      description="Corrections are recorded in the movement history and the audit log."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="movement-edit-form">
            Save changes
          </Button>
        </>
      }
    >
      {movement && (
        <div className="space-y-3">
          {!isManager && db.settings.requireManagerApproval && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              <ShieldAlert className="size-4 shrink-0" />
              Financially material changes (containers, size, route, status, driver) will be held for manager approval and block billing until approved.
            </div>
          )}
          <MovementForm
            formId="movement-edit-form"
            initial={movement}
            requireReason
            onSubmit={({ input, reason }) => {
              const res = edit(movement.id, input, reason);
              if (!res) {
                toast.error("Movement not found");
                return;
              }
              if (!res.changes.length) toast.info("No changes to save");
              else if (res.needsApproval) toast.warning(`${movement.id} updated – awaiting manager approval`, { description: "Billing is blocked until a manager approves." });
              else toast.success(`${movement.id} updated`, { description: `${res.changes.length} field(s) changed` });
              onOpenChange(false);
            }}
          />
        </div>
      )}
    </FormDialog>
  );
}
