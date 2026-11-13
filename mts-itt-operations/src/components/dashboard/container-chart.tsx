"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SectionCard } from "@/components/shared/section-card";
import { CHART_COLORS } from "@/lib/constants";

export function ContainerChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <SectionCard title="Container distribution" description="Last 14 operational days · container units (not journeys)">
      <div className="relative h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
              <Cell fill={CHART_COLORS.blue} />
              <Cell fill={CHART_COLORS.navy} />
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">
          <div className="text-xl font-semibold text-ink">{total}</div>
          <div className="text-xs text-slate">containers</div>
        </div>
      </div>
    </SectionCard>
  );
}
