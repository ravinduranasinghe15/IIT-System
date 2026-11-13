"use client";

import type { ParsedSheet } from "@/lib/excel-parser";
import { STD_FIELDS, type ColumnMapping } from "@/types/import";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionCard } from "@/components/shared/section-card";

/** First rows of the uploaded sheet exactly as displayed in Excel; mapped columns are tagged with their standard field. */
export function ImportPreview({ parsed, mapping, limit = 8 }: { parsed: ParsedSheet; mapping: ColumnMapping; limit?: number }) {
  const tagFor = (header: string) => STD_FIELDS.find((f) => mapping[f.key] === header)?.label;
  const rows = parsed.display.slice(0, limit);
  return (
    <SectionCard
      title="File preview"
      description={`First ${rows.length} of ${parsed.rows.length} data row(s) from “${parsed.sheetName}” – values shown as they appear in the source file.`}
      bodyClassName="p-0"
    >
      <div className="scroll-thin overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead className="h-auto w-10 py-1.5 text-xs text-slate">#</TableHead>
              {parsed.headers.map((h) => {
                const tag = tagFor(h);
                return (
                  <TableHead key={h} className="h-auto whitespace-nowrap py-1.5 align-top">
                    <div className="text-xs font-semibold text-ink">{h}</div>
                    <div className={tag ? "text-[11px] font-medium text-brand" : "text-[11px] font-normal text-slate/70"}>{tag ? `→ ${tag}` : "not mapped"}</div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="py-1.5 font-mono text-xs text-slate">{i + 2}</TableCell>
                {parsed.headers.map((h) => (
                  <TableCell key={h} className="whitespace-nowrap py-1.5 text-xs">
                    {row[h] || <span className="text-slate/50">—</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}
