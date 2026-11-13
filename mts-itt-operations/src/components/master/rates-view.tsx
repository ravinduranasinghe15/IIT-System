"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RateManagement } from "@/components/invoicing/rate-management";
import { useAuth } from "@/contexts/auth-context";

export function RatesView() {
  const { can } = useAuth();
  return (
    <div>
      {can("master.edit") && (
        <div className="mb-2 flex justify-end">
          <Button render={<Link href="/master-data" />} variant="outline" size="sm">
            <ArrowLeft /> Master Data
          </Button>
        </div>
      )}
      <RateManagement />
    </div>
  );
}
