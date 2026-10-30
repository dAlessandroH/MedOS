"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { fill: "#94a3b8", fontSize: 11 };

export interface BarSeries {
  key: string;
  name: string;
  color: string;
}

/** Gráfica de barras sobria (apiladas si hay varias series) con los tokens de MedOS. */
export function SimpleBars({
  data,
  xKey,
  series,
  height = 180,
  unit = "",
  label,
}: {
  data: object[];
  xKey: string;
  series: BarSeries[];
  height?: number;
  unit?: string;
  label: string;
}) {
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} stroke="#1e293b" />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
            contentStyle={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12, color: "#f8fafc" }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(value, name) => [`${value}${unit}`, name]}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="a"
              fill={s.color}
              radius={(i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) as [number, number, number, number]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
