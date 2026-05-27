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
}

export function DeviceChart({ device, metrics }: Props) {
  const labels = metrics.map((m) =>
    new Date(m.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  const data = {
    labels,
    datasets: [
      {
        label: "Heap free (bytes)",
        data: metrics.map((m) => m.heap_free_bytes),
        borderColor: "#34d399",
        backgroundColor: "rgba(52, 211, 153, 0.1)",
        fill: true,
        tension: 0.3,
        yAxisID: "y",
      },
      {
        label: "Wi-Fi RSSI (dBm)",
        data: metrics.map((m) => m.wifi_rssi_dbm),
        borderColor: "#60a5fa",
        tension: 0.3,
        yAxisID: "y1",
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      title: {
        display: true,
        text: `${device.label || device.device_id} — telemetry`,
        color: "#e2e8f0",
      },
      legend: { labels: { color: "#94a3b8" } },
    },
    scales: {
      x: { ticks: { color: "#64748b" }, grid: { color: "#1e293b" } },
      y: {
        type: "linear" as const,
        display: true,
        position: "left" as const,
        ticks: { color: "#64748b" },
        grid: { color: "#1e293b" },
      },
      y1: {
        type: "linear" as const,
        display: true,
        position: "right" as const,
        grid: { drawOnChartArea: false },
        ticks: { color: "#64748b" },
      },
    },
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <Line data={data} options={options} />
      <p className="mt-2 text-xs text-slate-500">
        Min ever free heap:{" "}
        {Math.min(...metrics.map((m) => m.heap_min_free_bytes)).toLocaleString()} bytes
      </p>
    </div>
  );
}
