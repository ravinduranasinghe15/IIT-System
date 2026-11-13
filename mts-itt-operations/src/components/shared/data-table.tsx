"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";
import { NativeSelect } from "./native-select";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Provide to make the column sortable */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  align?: "left" | "right" | "center";
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  /** Hide the pager when everything fits on one page */
  hidePagerIfSinglePage?: boolean;
}

/** Sortable, paginated table used across modules. */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50],
  initialSort,
  emptyTitle = "No records found",
  emptyDescription = "Try adjusting your search or filters.",
  emptyAction,
  rowClassName,
  hidePagerIfSinglePage,
}: Props<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sv(a);
      const bv = sv(b);
      if (av === bv) return 0;
      if (av === null || av === undefined || av === "") return 1;
      if (bv === null || bv === undefined || bv === "") return -1;
      return (av < bv ? -1 : 1) * dir;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * size, current * size + size);

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  if (!rows.length) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;

  return (
    <div>
      <div className="scroll-thin overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn("h-9 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((row) => (
              <TableRow
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
              >
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn("py-2 text-sm", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}
                  >
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!(hidePagerIfSinglePage && pages === 1) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-slate">
          <div>
            Showing {current * size + 1}–{Math.min(sorted.length, current * size + size)} of {sorted.length}
          </div>
          <div className="flex items-center gap-2">
            <span>Rows</span>
            <NativeSelect
              className="w-20"
              value={String(size)}
              onValueChange={(v) => {
                setSize(Number(v));
                setPage(0);
              }}
              options={pageSizeOptions.map(String)}
              aria-label="Rows per page"
            />
            <Button variant="outline" size="icon-sm" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="min-w-14 text-center">
              {current + 1} / {pages}
            </span>
            <Button variant="outline" size="icon-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
