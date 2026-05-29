import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { Device, Heartbeat } from "../api";
import { CHART_MAX_HISTORY_DAYS, formatChartWindow } from "../api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Props {
  device: Device;
  metrics: Heartbeat[];
  thresholds: {
    heap_free_bytes_min: number;
    wifi_rssi_dbm_min: number;
    battery_voltage_mv_min: number;
    cpu_temperature_c_max: number;
  };
  rangeLabel?: string;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onLatest?: () => void;
  loading?: boolean;
  zoomLabel?: number;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onRestart?: () => void;
  canRestart?: boolean;
  restarting?: boolean;
}

function formatAxisLabel(iso: string, spanDays: boolean): string {
  const date = new Date(iso);
  return date.toLocaleString([], {
    month: spanDays ? "short" : undefined,
    day: spanDays ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatChartRange(metrics: Heartbeat[]): string {
  if (metrics.length === 0) return "No telemetry in range";
  const start = new Date(metrics[0].recorded_at);
  const end = new Date(metrics[metrics.length - 1].recorded_at);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const fmt = (date: Date) =>
    date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  if (sameDay) {
    return `${fmt(start)} – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

function MetricChart({
  title,
  labels,
  values,
  color,
  threshold,
  thresholdLabel,
}: {
  title: string;
  labels: string[];
  values: Array<number | null>;
  color: string;
  threshold: number;
  thresholdLabel: string;
}) {
  const dense = values.length > 192;

  const data = {
    labels,
    datasets: [
      {
        label: title,
        data: values,
        borderColor: color,
        backgroundColor: `${color}22`,
        fill: true,
        tension: dense ? 0.15 : 0.3,
        pointRadius: dense ? 0 : 2,
        pointHoverRadius: dense ? 3 : 4,
        borderWidth: dense ? 1.5 : 2,
      },
      {
        label: thresholdLabel,
        data: labels.map(() => threshold),
        borderColor: "#ef4444",
        borderDash: [8, 6],
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { labels: { color: "#94a3b8" } },
    },
    scales: {
      x: {
        ticks: { color: "#64748b", maxTicksLimit: dense ? 8 : 12, autoSkip: true },
        grid: { color: "#1e293b" },
      },
      y: {
        ticks: { color: "#64748b" },
        grid: { color: "#1e293b" },
      },
    },
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 className="mb-2 text-sm font-medium text-slate-300">{title}</h3>
      <Line data={data} options={options} />
      <p className="mt-2 text-xs text-slate-500">{thresholdLabel}</p>
    </div>
  );
}

export function DeviceChart({
  device,
  metrics,
  thresholds,
  rangeLabel,
  canPrev = false,
  canNext = false,
  onPrev,
  onNext,
  onLatest,
  loading = false,
  zoomLabel,
  canZoomIn = false,
  canZoomOut = false,
  onZoomIn,
  onZoomOut,
  onRestart,
  canRestart = false,
  restarting = false,
}: Props) {
  const spanDays =
    metrics.length > 1 &&
    (new Date(metrics[0].recorded_at).toDateString() !==
      new Date(metrics[metrics.length - 1].recorded_at).toDateString() ||
      (zoomLabel ?? 0) >= 1440);
  const labels = metrics.map((m) => formatAxisLabel(m.recorded_at, spanDays));
  const windowLabel = zoomLabel ? formatChartWindow(zoomLabel) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-slate-300">
              {device.label || device.device_id} — telemetry
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {rangeLabel ?? formatChartRange(metrics)}
              {windowLabel ? ` · window ${windowLabel}` : ""}
              {loading ? " · loading…" : ""}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Min ever free heap:{" "}
              {metrics.length > 0
                ? Math.min(...metrics.map((m) => m.heap_min_free_bytes)).toLocaleString()
                : "—"}{" "}
              bytes · history up to {CHART_MAX_HISTORY_DAYS} days · thresholds for HW{" "}
              {device.hw_version}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={!canRestart || loading || restarting}
              onClick={onRestart}
              title="Queue remote restart on next heartbeat (~60s)"
              className="rounded-md border border-amber-700/80 px-2 py-1 text-xs text-amber-200 hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {restarting ? "Queuing…" : "Restart device"}
            </button>
            <span className="hidden h-4 w-px bg-slate-700 sm:inline" aria-hidden />
            <button
              type="button"
              disabled={!canZoomIn || loading}
              onClick={onZoomIn}
              title="Zoom in (shorter time window)"
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Zoom in
            </button>
            <button
              type="button"
              disabled={!canZoomOut || loading}
              onClick={onZoomOut}
              title="Zoom out (longer time window, up to 1 week)"
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Zoom out
            </button>
            <span className="hidden h-4 w-px bg-slate-700 sm:inline" aria-hidden />
            <button
              type="button"
              disabled={!canPrev || loading}
              onClick={onPrev}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Older
            </button>
            <button
              type="button"
              disabled={!canNext || loading}
              onClick={onNext}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Newer →
            </button>
            <button
              type="button"
              disabled={!canNext || loading}
              onClick={onLatest}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Latest
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1">
        <MetricChart
          title="Heap free"
          labels={labels}
          values={metrics.map((m) => m.heap_free_bytes)}
          color="#34d399"
          threshold={thresholds.heap_free_bytes_min}
          thresholdLabel={`Red region: below ${thresholds.heap_free_bytes_min.toLocaleString()} bytes`}
        />
        <MetricChart
          title="Wi-Fi RSSI"
          labels={labels}
          values={metrics.map((m) => m.wifi_rssi_dbm)}
          color="#60a5fa"
          threshold={thresholds.wifi_rssi_dbm_min}
          thresholdLabel={`Red region: below ${thresholds.wifi_rssi_dbm_min} dBm`}
        />
        <MetricChart
          title="Battery voltage"
          labels={labels}
          values={metrics.map((m) => m.battery_voltage_mv)}
          color="#f59e0b"
          threshold={thresholds.battery_voltage_mv_min}
          thresholdLabel={`Red region: below ${thresholds.battery_voltage_mv_min} mV`}
        />
        <MetricChart
          title="CPU temperature"
          labels={labels}
          values={metrics.map((m) => m.cpu_temperature_c)}
          color="#a78bfa"
          threshold={thresholds.cpu_temperature_c_max}
          thresholdLabel={`Red region: above ${thresholds.cpu_temperature_c_max}°C`}
        />
      </div>
    </div>
  );
}
