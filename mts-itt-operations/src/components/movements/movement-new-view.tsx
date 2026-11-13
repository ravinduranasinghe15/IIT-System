"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuth } from "@/contexts/auth-context";
import { useMovements } from "@/hooks/use-movements";
import { MovementForm } from "./movement-form";

export function MovementNewView() {
  const router = useRouter();
  const { can } = useAuth();
  const { create } = useMovements();

  if (!can("movement.create")) {
    return (
      <EmptyState
        icon={Lock}
        title="Not permitted"
        description="Your demo role cannot register movements."
        action={
          <Button variant="outline" render={<Link href="/movements" />}>
            Back to movements
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Register Movement"
        description="Create a manual movement. Reconciliation runs on save and raises exceptions for missing or conflicting data."
        actions={
          <Button variant="outline" render={<Link href="/movements" />}>
            <ArrowLeft /> Back
          </Button>
        }
      />
      <MovementForm
        formId="movement-create-form"
        showAttachment
        onSubmit={({ input, attachment }) => {
          const m = create(input, attachment);
          toast.success(`Movement ${m.id} registered`, { description: attachment ? "Supporting document attached." : undefined });
          router.push(`/movements/${m.id}`);
        }}
      />
      <div className="mt-4 flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" render={<Link href="/movements" />}>
          Cancel
        </Button>
        <Button type="submit" form="movement-create-form">
          Register movement
        </Button>
      </div>
    </div>
  );
}
