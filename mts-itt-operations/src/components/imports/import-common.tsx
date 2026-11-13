import { TERMINAL_COLORS } from "@/lib/constants";
import type { TerminalCode } from "@/types/terminal";
import { cn } from "@/lib/utils";

export const SOURCE_TERMINALS: TerminalCode[] = ["CWIT", "SAGT", "CICT"];

export const SAMPLE_FILES: { terminal: TerminalCode; href: string; name: string; description: string }[] = [
  { terminal: "CWIT", href: "/documents/sample-cwit.xlsx", name: "sample-cwit.xlsx", description: "CWIT daily report layout (Container No, Size, Origin, ...). Text date cells." },
  { terminal: "SAGT", href: "/documents/sample-sagt.xlsx", name: "sample-sagt.xlsx", description: "SAGT line-item layout (CNTR_NO, CNTR_SIZE, FROM_TERMINAL, ...). True Excel date cells." },
];

export function TerminalTag({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-ink", className)}>
      <span className="size-2 rounded-full" style={{ background: TERMINAL_COLORS[code] ?? "#94A3B8" }} />
      {code}
    </span>
  );
}

/** ISO wall-clock string → "dd MMM yyyy HH:mm" (or the raw text when it is not an ISO string). */
export function shortDateTime(v: string | undefined): string {
  if (!v) return "—";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v;
  return `${v.slice(8, 10)}/${v.slice(5, 7)} ${v.slice(11, 16)}`;
}
