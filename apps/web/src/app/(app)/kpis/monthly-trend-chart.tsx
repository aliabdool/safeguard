"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function MonthlyTrendChart({
  data,
  currentLabel,
  comparisonLabel,
}: {
  data: { monthLabel: string; current: number; comparison: number }[];
  currentLabel: string;
  comparisonLabel: string;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 16, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 11.5 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11.5 }} />
          <Tooltip
            contentStyle={{
              fontSize: 12.5,
              borderRadius: 8,
              border: "1px solid var(--color-border)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="current"
            name={currentLabel}
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={{ r: 2.5 }}
          />
          <Line
            type="monotone"
            dataKey="comparison"
            name={comparisonLabel}
            stroke="var(--color-muted-foreground)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 2.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
