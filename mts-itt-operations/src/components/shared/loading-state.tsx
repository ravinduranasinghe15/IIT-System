import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ rows = 5, label = "Loading…" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3 p-2" role="status" aria-label={label}>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
