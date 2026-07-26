"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function IncidentBarChart({
  data,
  color = "var(--color-primary)",
}: {
  data: { label: string; count: number }[];
  color?: string;
}) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No incidents in this period.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} stroke="var(--color-border)" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tick={{ fontSize: 11.5 }}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: "var(--color-accent)" }}
          contentStyle={{
            fontSize: 12.5,
            borderRadius: 8,
            border: "1px solid var(--color-border)",
          }}
        />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
