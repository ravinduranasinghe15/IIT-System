"use client";

import { SectionCard } from "@/components/shared/section-card";
import { TERMINAL_COLORS } from "@/lib/constants";
import type { TerminalStat } from "@/lib/stats";

export function TerminalPerformance({ stats }: { stats: TerminalStat[] }) {
  return (
    <SectionCard title="Terminal performance" description="Last 14 operational days by source terminal">
      <div className="space-y-4">
        {stats.map((t) => (
          <div key={t.terminal}>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 font-medium text-ink">
                <span className="size-2.5 rounded-full" style={{ background: TERMINAL_COLORS[t.terminal] }} />
                {t.terminal}
              </div>
              <div className="text-xs text-slate">
                {t.movements} journeys · {t.containers} containers
              </div>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-success" style={{ width: `${Math.round(t.completionRate * 100)}%` }} />
            </div>
            <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-slate">
              <span>{Math.round(t.completionRate * 100)}% completed</span>
              <span>{t.rejected} rejected/damaged</span>
              <span>{t.openExceptions} open exceptions</span>
              <span>Avg transit {t.avgTransitMin === null ? "—" : `${t.avgTransitMin} min`}</span>
            </div>
          </div>
        ))}
        <p className="text-xs text-slate">CICT is conditionally available, subject to receiving a usable sample report format.</p>
      </div>
    </SectionCard>
  );
}
