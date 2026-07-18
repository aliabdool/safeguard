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

export function ComparisonChart({
  currentLabel,
  currentValue,
  comparisonLabel,
  comparisonValue,
}: {
  currentLabel: string;
  currentValue: number | null;
  comparisonLabel: string;
  comparisonValue: number | null;
}) {
  const data = [
    { period: comparisonLabel, value: comparisonValue ?? 0 },
    { period: currentLabel, value: currentValue ?? 0 },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
