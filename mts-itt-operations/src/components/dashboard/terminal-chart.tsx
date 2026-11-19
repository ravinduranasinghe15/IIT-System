"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "@/components/shared/section-card";
import { TERMINAL_COLORS } from "@/lib/constants";
import type { TerminalStat } from "@/lib/stats";

export function TerminalChart({ data }: { data: TerminalStat[] }) {
  return (
    <SectionCard title="Movements by source terminal" description="Last 14 operational days · journeys">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="terminal" tick={{ fontSize: 12 }} stroke="#94A3B8" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94A3B8" />
            <Tooltip cursor={{ fill: "rgb(148 163 184 / 0.15)" }} />
            <Bar dataKey="movements" name="Journeys" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((d) => (
                <Cell key={d.terminal} fill={TERMINAL_COLORS[d.terminal]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}
