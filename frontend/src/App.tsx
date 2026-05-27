import { useCallback, useEffect, useState } from "react";
import {
  api,
  CrashReport,
  Device,
  FleetStats,
  FirmwareRelease,
  Heartbeat,
} from "./api";
import { DeviceChart } from "./components/DeviceChart";
import { StatCard } from "./components/StatCard";

type Tab = "devices" | "crashes" | "firmware";

export default function App() {
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [crashes, setCrashes] = useState<CrashReport[]>([]);
  const [firmware, setFirmware] = useState<FirmwareRelease[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Heartbeat[]>([]);
  const [tab, setTab] = useState<Tab>("devices");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d, c, f] = await Promise.all([
        api.stats(),
        api.devices(),
        api.crashes(),
        api.firmware(),
      ]);
      setStats(s);
      setDevices(d.results);
      setCrashes(c.results);
      setFirmware(f.results);
      if (!selectedId && d.results.length > 0) {
        setSelectedId(d.results[0].device_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    api.metrics(selectedId).then((r) => setMetrics([...r.results].reverse()));
  }, [selectedId]);

  const selected = devices.find((d) => d.device_id === selectedId);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
              MicroTelemetry
            </p>
            <h1 className="text-xl font-semibold">Fleet Manager</h1>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-red-200">
            {error} — ensure Django is running (see WEB_PORT in .env).
          </div>
        )}

        {stats && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Devices" value={stats.devices_total} />
            <StatCard label="Online (24h)" value={stats.devices_online} accent="emerald" />
            <StatCard label="Pending crashes" value={stats.crashes_pending} accent="amber" />
            <StatCard label="Active firmware" value={stats.firmware_active} />
          </section>
        )}

        <nav className="flex gap-2 border-b border-slate-800 pb-2">
          {(["devices", "crashes", "firmware"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                tab === t ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {loading && <p className="text-slate-500">Loading fleet data…</p>}

        {tab === "devices" && !loading && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-2 lg:col-span-1">
              <h2 className="text-sm font-medium text-slate-400">Devices</h2>
              <ul className="max-h-[420px] space-y-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/50 p-2">
                {devices.map((d) => (
                  <li key={d.device_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(d.device_id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                        selectedId === d.device_id
                          ? "bg-slate-800 ring-1 ring-emerald-600/50"
                          : "hover:bg-slate-800/60"
                      }`}
                    >
                      <span className="font-mono text-emerald-300">{d.device_id}</span>
                      <span className="mt-0.5 block text-slate-500">
                        {d.label || "—"} · fw {d.fw_version}
                      </span>
                    </button>
                  </li>
                ))}
                {devices.length === 0 && (
                  <li className="px-3 py-6 text-center text-slate-500 text-sm">
                    No devices yet. Run <code className="text-emerald-400">seed_demo</code> or
                    send a heartbeat.
                  </li>
                )}
              </ul>
            </div>
            <div className="lg:col-span-2">
              {selected && metrics.length > 0 ? (
                <DeviceChart device={selected} metrics={metrics} />
              ) : (
                <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-500">
                  Select a device with telemetry history
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "crashes" && !loading && (
          <div className="space-y-3">
            {crashes.map((c) => (
              <article
                key={c.id}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-emerald-300">{c.device_id}</span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{c.status}</span>
                  <span className="text-slate-500">{new Date(c.received_at).toLocaleString()}</span>
                </div>
                {c.panic_reason && (
                  <p className="mt-2 text-amber-200/90">{c.panic_reason}</p>
                )}
                {c.symbolicated_trace && (
                  <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-slate-300">
                    {c.symbolicated_trace}
                  </pre>
                )}
              </article>
            ))}
            {crashes.length === 0 && (
              <p className="text-slate-500">No crash reports ingested yet.</p>
            )}
          </div>
        )}

        {tab === "firmware" && !loading && (
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-2">Version</th>
                <th className="pb-2">HW</th>
                <th className="pb-2">Cohort</th>
                <th className="pb-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {firmware.map((f) => (
                <tr key={f.id} className="border-t border-slate-800">
                  <td className="py-2 font-mono">{f.version}</td>
                  <td className="py-2">{f.hw_version}</td>
                  <td className="py-2">{f.cohort_name}</td>
                  <td className="py-2">{f.is_active ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
