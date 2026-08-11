"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function FyHistoryChart({
  data,
}: {
  data: { fyLabel: string; totalIncidents: number; majorIncidents: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 16, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="fyLabel" tick={{ fontSize: 11.5 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11.5 }} />
          <Tooltip
            contentStyle={{
              fontSize: 12.5,
              borderRadius: 8,
              border: "1px solid var(--color-border)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="totalIncidents"
            name="Total incidents"
            fill="var(--color-primary)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="majorIncidents"
            name="Major cases"
            fill="var(--color-sev4)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
