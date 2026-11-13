"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SectionCard } from "@/components/shared/section-card";
import { CHART_COLORS } from "@/lib/constants";

export function FleetChart({ active, maintenance, inactive }: { active: number; maintenance: number; inactive: number }) {
  const data = [
    { name: "Active", value: active, color: CHART_COLORS.green },
    { name: "In maintenance", value: maintenance, color: CHART_COLORS.orange },
    { name: "Inactive", value: inactive, color: CHART_COLORS.grey },
  ].filter((d) => d.value > 0);
  return (
    <SectionCard title="Fleet utilisation" description="Prime movers by status">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={85} stroke="#fff" strokeWidth={2} label={(p) => String(p.value)}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}
