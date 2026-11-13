"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "@/components/shared/section-card";
import { CHART_COLORS } from "@/lib/constants";
import { formatDay } from "@/lib/date-utils";
import type { TrendPoint } from "@/lib/stats";

export function MovementChart({ data, title = "Daily movement trend" }: { data: TrendPoint[]; title?: string }) {
  return (
    <SectionCard title={title} description="Last 14 operational days (07:00 → 07:00) · journeys by outcome">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="day" tickFormatter={(d: string) => formatDay(d, "dd MMM")} tick={{ fontSize: 11 }} stroke="#94A3B8" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94A3B8" />
            <Tooltip labelFormatter={(d) => formatDay(String(d), "EEE dd MMM yyyy")} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="completed" name="Completed" stroke={CHART_COLORS.green} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="pending" name="Pending / in progress" stroke={CHART_COLORS.orange} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="rejected" name="Rejected / damaged" stroke={CHART_COLORS.red} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}
