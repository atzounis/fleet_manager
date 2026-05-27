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
    battery_level_pct_min: number;
    cpu_temperature_c_max: number;
  };
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
  const data = {
    labels,
    datasets: [
      {
        label: title,
        data: values,
        borderColor: color,
        backgroundColor: `${color}22`,
        fill: true,
        tension: 0.3,
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
      x: { ticks: { color: "#64748b" }, grid: { color: "#1e293b" } },
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

export function DeviceChart({ device, metrics, thresholds }: Props) {
  const labels = metrics.map((m) =>
    new Date(m.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="text-sm font-medium text-slate-300">
          {device.label || device.device_id} — telemetry
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Min ever free heap:{" "}
          {Math.min(...metrics.map((m) => m.heap_min_free_bytes)).toLocaleString()} bytes
        </p>
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
          title="Battery level"
          labels={labels}
          values={metrics.map((m) => m.battery_level_pct)}
          color="#f97316"
          threshold={thresholds.battery_level_pct_min}
          thresholdLabel={`Red region: below ${thresholds.battery_level_pct_min}%`}
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
