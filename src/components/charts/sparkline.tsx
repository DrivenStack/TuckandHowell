"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { makeTooltip } from "./kit";

interface Point {
  label: string;
  value: number;
}

/**
 * A small line graph for table rows: one series, no axes, a hover tooltip,
 * and a dot on the latest point. All rows in a table share `max` so lines compare.
 */
export function Sparkline({
  values,
  labels,
  color,
  name,
  max,
  className,
  unit,
  per,
}: {
  values: number[];
  labels: string[];
  color: string;
  name: string;
  max: number;
  className?: string;
  unit: string;
  /** Size of each point: one hour or one day */
  per: "hour" | "day";
}) {
  const data: Point[] = values.map((v, i) => ({ label: labels[i] ?? "", value: v }));
  const total = values.reduce((a, b) => a + b, 0);
  const Tip = makeTooltip<Point>((p) => ({ title: p.label, rows: [{ label: name, value: `${p.value} ${p.value === 1 ? unit : `${unit}s`}`, color }] }));
  const id = `spark-${name.replace(/\W+/g, "-")}`;
  return (
    <div
      role="img"
      aria-label={`${name}: ${total} over the period, highest ${Math.max(0, ...values)} in one ${per}.`}
      className={cn("h-10 w-full select-none", className)}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 200, height: 40 }}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, Math.max(1, max)]} />
          <Tooltip content={Tip} cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }} wrapperStyle={{ zIndex: 20 }} allowEscapeViewBox={{ x: true, y: true }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === data.length - 1 && props.cx !== undefined && props.cy !== undefined ? (
                <circle key="last" cx={props.cx} cy={props.cy} r={3} fill={color} stroke="var(--panel)" strokeWidth={1.5} />
              ) : (
                <g key={`d${props.index}`} />
              )
            }
            activeDot={{ r: 4, fill: color, stroke: "var(--panel)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
