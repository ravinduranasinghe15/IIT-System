"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useDriverActions } from "@/hooks/use-drivers";
import { DriverForm } from "./driver-form";

export function DriverNewView() {
  const { can } = useAuth();
  const router = useRouter();
  const actions = useDriverActions();
  if (!can("driver.manage")) {
    return <EmptyState title="Not permitted" description="Your role cannot register drivers." action={<Button render={<Link href="/drivers" />}>Back to drivers</Button>} />;
  }
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Register driver"
        description="Add a driver to the directory and optionally assign a prime mover."
        actions={
          <Button variant="outline" render={<Link href="/drivers" />}>
            <ArrowLeft /> Back
          </Button>
        }
      />
      <SectionCard title="Driver details">
        <DriverForm
          submitLabel="Register driver"
          onCancel={() => router.push("/drivers")}
          onSubmit={(input) => {
            const drv = actions.register(input);
            if (drv) router.push(`/drivers/${drv.id}`);
          }}
        />
      </SectionCard>
    </div>
  );
}
