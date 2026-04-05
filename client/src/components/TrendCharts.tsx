import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import type { Chart } from "chart.js";
import { useEffect, useMemo, useRef } from "react";
import { Line } from "react-chartjs-2";
import type { Entry, Settings } from "../types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const COLORS = {
  bf: "#3b9eff",
  weight: "#34c759",
  waist: "#bf5af2",
  neck: "#ff9f0a",
};

/** High-contrast horizontal goal reference (drawn on top via `order`). */
const GOAL_LINE = "#ffd60a";

function shortLabels(isoDates: string[]) {
  return isoDates.map((d) => {
    const [, m, day] = d.split("-");
    return `${m}/${day}`;
  });
}

function hexToRgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** Must be a color string — do not use an object here (Chart.js calls .startsWith on color). */
const GRID_LINE = "rgba(255,255,255,0.06)";

function asNum(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function goalLineDataset(
  label: string,
  goalValue: number,
  pointCount: number,
  yAxisID?: "y" | "y1"
) {
  const v = asNum(goalValue);
  const data = Number.isFinite(v) ? Array(pointCount).fill(v) : Array(pointCount).fill(null);
  return {
    label,
    data,
    borderColor: GOAL_LINE,
    backgroundColor: "transparent",
    borderDash: [10, 6] as number[],
    borderWidth: 2.5,
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0,
    fill: false,
    order: 100,
    ...(yAxisID ? { yAxisID } : {}),
  };
}

export function TrendCharts({
  rowsAsc,
  settings,
}: {
  rowsAsc: Entry[];
  settings: Settings;
}) {
  const labels = useMemo(
    () => shortLabels(rowsAsc.map((r) => r.entry_date)),
    [rowsAsc]
  );
  const n = rowsAsc.length;
  const chartKey = useMemo(() => rowsAsc.map((r) => r.id).join("-"), [rowsAsc]);

  const bfRef = useRef<Chart<"line">>(null);
  const wRef = useRef<Chart<"line">>(null);
  const mRef = useRef<Chart<"line">>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      bfRef.current?.resize();
      wRef.current?.resize();
      mRef.current?.resize();
    });
    return () => cancelAnimationFrame(id);
  }, [chartKey]);

  if (n === 0) {
    return (
      <div className="chart-grid">
        {[1, 2, 3].map((k) => (
          <div key={k} className="chart-card">
            <h3>{k === 1 ? "Body fat %" : k === 2 ? "Weight" : "Waist & neck"}</h3>
            <div className="chart-empty">Add measurements to plot trends.</div>
          </div>
        ))}
      </div>
    );
  }

  const goalBf = asNum(settings.goal_body_fat);
  const goalWaist = asNum(settings.goal_waist_cm);
  const goalWeight = asNum(settings.goal_weight_kg);

  const bfData = rowsAsc.map((r) => {
    const p = r.body_fat_pct;
    if (p == null) return null;
    const x = asNum(p);
    return Number.isFinite(x) ? x : null;
  });

  const weightData = rowsAsc.map((r) => asNum(r.weight_kg));
  const waistData = rowsAsc.map((r) => asNum(r.waist_cm));
  const neckData = rowsAsc.map((r) => asNum(r.neck_cm));
  const pr = n > 24 ? 0 : 3;

  const bfDatasets = [
    {
      label: "Body fat %",
      data: bfData,
      borderColor: COLORS.bf,
      backgroundColor: hexToRgba(COLORS.bf, 0.12),
      fill: true,
      tension: 0.35,
      borderWidth: 2,
      pointRadius: pr,
      pointHoverRadius: 5,
      spanGaps: false,
      order: 0,
    },
    goalLineDataset("BF goal", goalBf, n),
  ];

  const weightDatasets = [
    {
      label: "Weight (kg)",
      data: weightData,
      borderColor: COLORS.weight,
      backgroundColor: hexToRgba(COLORS.weight, 0.12),
      fill: true,
      tension: 0.35,
      borderWidth: 2,
      pointRadius: pr,
      pointHoverRadius: 5,
      order: 0,
    },
    goalLineDataset("Weight goal", goalWeight, n),
  ];

  const measDatasets = [
    {
      label: "Waist (cm)",
      data: waistData,
      borderColor: COLORS.waist,
      yAxisID: "y",
      fill: false,
      tension: 0.35,
      borderWidth: 2,
      pointRadius: pr,
      pointHoverRadius: 5,
      order: 0,
    },
    {
      label: "Neck (cm)",
      data: neckData,
      borderColor: COLORS.neck,
      yAxisID: "y1",
      fill: false,
      tension: 0.35,
      borderWidth: 2,
      pointRadius: pr,
      pointHoverRadius: 5,
      order: 0,
    },
    goalLineDataset("Waist goal", goalWaist, n, "y"),
  ];

  const legendOpts = {
    position: "bottom" as const,
    labels: { boxWidth: 10, padding: 12, font: { size: 11 }, color: "#8b9bab" },
  };

  const common = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
  };

  return (
    <div className="chart-grid" key={chartKey}>
      <div className="chart-card">
        <h3>Body fat %</h3>
        <div className="chart-canvas-wrap">
          <Line
            ref={bfRef}
            height={220}
            data={{ labels, datasets: bfDatasets }}
            options={{
              ...common,
              interaction: { mode: "index", intersect: false },
              plugins: {
                legend: legendOpts,
                tooltip: {
                  callbacks: {
                    label(ctx) {
                      const v = ctx.parsed.y;
                      if (v == null || typeof v !== "number") return `${ctx.dataset.label}: —`;
                      return `${ctx.dataset.label}: ${v.toFixed(2)} %`;
                    },
                  },
                },
              },
              scales: {
                x: { grid: { color: GRID_LINE }, ticks: { color: "#8b9bab", maxRotation: 45, font: { size: 10 } } },
                y: {
                  grace: "12%",
                  grid: { color: GRID_LINE },
                  ticks: { color: "#8b9bab", font: { size: 10 } },
                  title: { display: true, text: "%", color: "#8b9bab", font: { size: 10 } },
                },
              },
            }}
          />
        </div>
      </div>

      <div className="chart-card">
        <h3>Weight</h3>
        <div className="chart-canvas-wrap">
          <Line
            ref={wRef}
            height={220}
            data={{ labels, datasets: weightDatasets }}
            options={{
              ...common,
              interaction: { mode: "index", intersect: false },
              plugins: {
                legend: legendOpts,
                tooltip: {
                  callbacks: {
                    label(ctx) {
                      const y = ctx.parsed.y;
                      if (y == null) return `${ctx.dataset.label}: —`;
                      return `${ctx.dataset.label}: ${y.toFixed(1)} kg`;
                    },
                  },
                },
              },
              scales: {
                x: { grid: { color: GRID_LINE }, ticks: { color: "#8b9bab", maxRotation: 45, font: { size: 10 } } },
                y: {
                  grace: "12%",
                  grid: { color: GRID_LINE },
                  ticks: { color: "#8b9bab", font: { size: 10 } },
                  title: { display: true, text: "kg", color: "#8b9bab", font: { size: 10 } },
                },
              },
            }}
          />
        </div>
      </div>

      <div className="chart-card">
        <h3>Waist & neck</h3>
        <div className="chart-canvas-wrap">
          <Line
            ref={mRef}
            height={220}
            data={{ labels, datasets: measDatasets }}
            options={{
              ...common,
              interaction: { mode: "index", intersect: false },
              plugins: {
                legend: legendOpts,
                tooltip: {
                  callbacks: {
                    label(ctx) {
                      const y = ctx.parsed.y;
                      if (y == null) return `${ctx.dataset.label}: —`;
                      return `${ctx.dataset.label}: ${y.toFixed(1)} cm`;
                    },
                  },
                },
              },
              scales: {
                x: { grid: { color: GRID_LINE }, ticks: { color: "#8b9bab", maxRotation: 45, font: { size: 10 } } },
                y: {
                  type: "linear" as const,
                  position: "left" as const,
                  grace: "12%",
                  grid: { color: GRID_LINE },
                  ticks: { color: "#8b9bab", font: { size: 10 } },
                  title: { display: true, text: "Waist (cm)", color: "#8b9bab", font: { size: 10 } },
                },
                y1: {
                  type: "linear" as const,
                  position: "right" as const,
                  grace: "12%",
                  grid: { color: GRID_LINE, drawOnChartArea: false },
                  ticks: { color: "#8b9bab", font: { size: 10 } },
                  title: { display: true, text: "Neck (cm)", color: "#8b9bab", font: { size: 10 } },
                },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
