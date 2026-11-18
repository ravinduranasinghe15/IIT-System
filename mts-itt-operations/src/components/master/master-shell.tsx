"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { SearchInput } from "@/components/shared/search-input";
import { useAuth } from "@/contexts/auth-context";
import type { ActionKey } from "@/lib/permissions";

/** Reusable shell for every master-data sub-page: header, permission guard, toolbar and table card. */
export function MasterShell({
  title,
  description,
  requires = "master.edit",
  addLabel,
  onAdd,
  search,
  onSearch,
  searchPlaceholder,
  filters,
  summary,
  children,
}: {
  title: string;
  description: string;
  requires?: ActionKey;
  addLabel?: string;
  onAdd?: () => void;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const { can, role } = useAuth();
  const allowed = can(requires);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-card py-6 shadow-sm">
        <EmptyState
          icon={Lock}
          title="Not available for this demo role"
          description={`The ${role} role cannot open ${title}. Master data is limited to the Manager.`}
          action={
            <Button render={<Link href="/master-data" />} variant="outline">
              Back to Master Data
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <Button render={<Link href="/master-data" />} variant="outline" size="sm">
              <ArrowLeft /> Master Data
            </Button>
            {addLabel && onAdd && (
              <Button size="sm" onClick={onAdd}>
                <Plus /> {addLabel}
              </Button>
            )}
          </>
        }
      />
      {summary}
      <SectionCard
        bodyClassName="p-0"
        title={
          onSearch || filters ? (
            <div className="flex flex-wrap items-center gap-2 py-0.5 font-normal">
              {onSearch && <SearchInput value={search ?? ""} onChange={onSearch} placeholder={searchPlaceholder} className="w-64" />}
              {filters}
            </div>
          ) : undefined
        }
      >
        {children}
      </SectionCard>
    </div>
  );
}
