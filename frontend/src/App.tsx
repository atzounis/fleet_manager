import { useCallback, useEffect, useState } from "react";
import {
  api,
  Device,
  FleetEvent,
  FleetStats,
  FirmwareRelease,
  Heartbeat,
  OtaDeployment,
  ThresholdConfig,
} from "./api";
import { DeviceChart } from "./components/DeviceChart";
import { StatCard } from "./components/StatCard";

type Tab = "devices" | "events" | "firmware" | "settings";

function formatAgo(seconds: number | null): string {
  if (seconds == null) return "never";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function formatWindow(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export default function App() {
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [firmware, setFirmware] = useState<FirmwareRelease[]>([]);
  const [deployments, setDeployments] = useState<OtaDeployment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Heartbeat[]>([]);
  const [tab, setTab] = useState<Tab>("devices");
  const [thresholds, setThresholds] = useState<ThresholdConfig | null>(null);
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [otaVersion, setOtaVersion] = useState("");
  const [otaHwVersion, setOtaHwVersion] = useState("1.0");
  const [otaFile, setOtaFile] = useState<File | null>(null);
  const [otaTargets, setOtaTargets] = useState<string[]>([]);
  const [otaSending, setOtaSending] = useState(false);
  const [otaError, setOtaError] = useState<string | null>(null);
  const [eventDeviceFilter, setEventDeviceFilter] = useState<string>("all");
  const [eventHoursFilter, setEventHoursFilter] = useState<number>(24);
  const [error, setError] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingLabel, setSavingLabel] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d, c, f, od] = await Promise.all([
        api.stats(),
        api.devices(),
        api.events({
          deviceId: eventDeviceFilter === "all" ? undefined : eventDeviceFilter,
          hours: eventHoursFilter,
        }),
        api.firmware(),
        api.otaDeployments(),
      ]);
      setStats(s);
      setDevices(d.results);
      setEvents(c.results);
      setFirmware(f.results);
      setDeployments(od.results);
      setThresholds((current) => ({
        heap_free_bytes_min: s.thresholds.heap_free_bytes_min,
        wifi_rssi_dbm_min: s.thresholds.wifi_rssi_dbm_min,
        battery_voltage_mv_min: s.thresholds.battery_voltage_mv_min,
        cpu_temperature_c_max: s.thresholds.cpu_temperature_c_max,
        updated_at: current?.updated_at ?? null,
      }));
      // Best-effort fetch; do not block dashboard if this endpoint briefly fails.
      api.thresholds()
        .then((th) => {
          setThresholds(th);
          setThresholdError(null);
        })
        .catch(() => null);
      if (!selectedId && d.results.length > 0) {
        setSelectedId(d.results[0].device_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [selectedId, eventDeviceFilter, eventHoursFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    api.metrics(selectedId).then((r) => setMetrics([...r.results].reverse()));
  }, [selectedId]);

  const selected = devices.find((d) => d.device_id === selectedId);
  const toggleOtaTarget = (deviceId: string) => {
    setOtaTargets((current) =>
      current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : [...current, deviceId]
    );
  };

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
            <StatCard
              label={`Online (${formatWindow(stats.online_window_seconds)})`}
              value={stats.devices_online}
              accent="emerald"
            />
            <StatCard label="Offline" value={stats.devices_offline} accent="amber" />
            <StatCard label="Pending crashes" value={stats.crashes_pending} accent="amber" />
            <StatCard label="Active firmware" value={stats.firmware_active} />
          </section>
        )}

        <nav className="flex gap-2 border-b border-slate-800 pb-2">
          {(["devices", "events", "firmware", "settings"] as Tab[]).map((t) => (
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
                    <div
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                        selectedId === d.device_id
                          ? "bg-slate-800 ring-1 ring-emerald-600/50"
                          : "hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(d.device_id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="font-mono text-emerald-300">{d.device_id}</span>
                          <span
                            className={`ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                              d.is_online
                                ? "bg-emerald-600/30 text-emerald-300"
                                : "bg-rose-600/30 text-rose-300"
                            }`}
                          >
                            {d.status}
                          </span>
                          <span className="mt-0.5 block text-slate-500">
                            {d.label || "—"} · fw {d.fw_version}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            last seen {formatAgo(d.seconds_since_last_seen)} (offline after{" "}
                            {Math.floor(d.offline_after_seconds / 60)}m)
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Edit ${d.device_id}`}
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                          onClick={() => {
                            setEditingDevice(d);
                            setEditingLabel(d.label ?? "");
                            setEditError(null);
                          }}
                        >
                          ✎
                        </button>
                      </div>
                    </div>
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
              {selected && metrics.length > 0 && stats ? (
                <DeviceChart device={selected} metrics={metrics} thresholds={stats.thresholds} />
              ) : (
                <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-500">
                  Select a device with telemetry history
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "events" && !loading && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <select
                value={eventDeviceFilter}
                onChange={(e) => setEventDeviceFilter(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="all">All devices</option>
                {devices.map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.device_id}
                  </option>
                ))}
              </select>
              <select
                value={eventHoursFilter}
                onChange={(e) => setEventHoursFilter(Number(e.target.value))}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              >
                <option value={1}>Last 1h</option>
                <option value={6}>Last 6h</option>
                <option value={24}>Last 24h</option>
                <option value={72}>Last 72h</option>
                <option value={168}>Last 7d</option>
              </select>
            </div>
            {events.map((ev) => (
              <article
                key={ev.id}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-emerald-300">{ev.device_id ?? "system"}</span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{ev.event_type}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      ev.severity === "critical"
                        ? "bg-rose-600/30 text-rose-200"
                        : ev.severity === "warning"
                          ? "bg-amber-600/30 text-amber-200"
                          : "bg-emerald-600/30 text-emerald-200"
                    }`}
                  >
                    {ev.severity}
                  </span>
                  <span className="text-slate-500">
                    {new Date(ev.event_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-slate-200">{ev.summary}</p>
                {Object.keys(ev.details || {}).length > 0 && (
                  <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-slate-300">
                    {JSON.stringify(ev.details, null, 2)}
                  </pre>
                )}
              </article>
            ))}
            {events.length === 0 && (
              <p className="text-slate-500">No events in selected time range.</p>
            )}
          </div>
        )}

        {tab === "firmware" && !loading && (
          <div className="space-y-6">
            <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <h2 className="text-sm font-medium text-slate-300">Deploy OTA Update</h2>
              <p className="mt-1 text-xs text-slate-500">
                Upload a firmware binary, select target devices, and queue deployment.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <input
                  type="text"
                  placeholder="Firmware version (e.g. 1.2.0)"
                  value={otaVersion}
                  onChange={(e) => setOtaVersion(e.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="HW version (e.g. 1.0)"
                  value={otaHwVersion}
                  onChange={(e) => setOtaHwVersion(e.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
                <input
                  type="file"
                  accept=".bin,application/octet-stream"
                  onChange={(e) => setOtaFile(e.target.files?.[0] ?? null)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-slate-200"
                />
              </div>

              <div className="mt-4 rounded-lg border border-slate-800 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-slate-400">Target devices ({otaTargets.length} selected)</p>
                  <button
                    type="button"
                    onClick={() => setOtaTargets(devices.map((d) => d.device_id))}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    Select all
                  </button>
                </div>
                <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
                  {devices.map((d) => (
                    <label
                      key={d.device_id}
                      className="flex items-center gap-2 rounded border border-slate-800 px-2 py-1 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={otaTargets.includes(d.device_id)}
                        onChange={() => toggleOtaTarget(d.device_id)}
                      />
                      <span className="font-mono text-emerald-300">{d.device_id}</span>
                      <span className="text-slate-500">{d.label || "—"}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={otaSending}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={async () => {
                    if (!otaFile || !otaVersion.trim() || otaTargets.length === 0) {
                      setOtaError("Version, firmware file, and at least one target are required.");
                      return;
                    }
                    setOtaSending(true);
                    setOtaError(null);
                    try {
                      await api.createOtaDeployment({
                        firmware: otaFile,
                        version: otaVersion.trim(),
                        hwVersion: otaHwVersion.trim() || "1.0",
                        deviceIds: otaTargets,
                      });
                      setOtaVersion("");
                      setOtaFile(null);
                      setOtaTargets([]);
                      await load();
                    } catch (e) {
                      setOtaError(
                        e instanceof Error ? e.message : "Failed to queue OTA deployment"
                      );
                    } finally {
                      setOtaSending(false);
                    }
                  }}
                >
                  {otaSending ? "Sending..." : "Send OTA"}
                </button>
                {otaError && <p className="text-xs text-red-300">{otaError}</p>}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-400">Firmware Releases</h3>
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
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-400">Recent Deployments</h3>
              <div className="space-y-3">
                {deployments.map((dep) => (
                  <article
                    key={dep.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="rounded bg-slate-800 px-2 py-0.5">#{dep.id}</span>
                      <span className="font-mono text-emerald-300">{dep.firmware_version}</span>
                      <span className="text-slate-400">hw {dep.firmware_hw_version}</span>
                      <span className="rounded border border-slate-700 px-2 py-0.5">
                        {dep.status}
                      </span>
                      <span className="text-slate-500">
                        {new Date(dep.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dep.targets.map((t) => (
                        <span
                          key={`${dep.id}-${t.device_id}`}
                          className="rounded border border-slate-700 px-2 py-0.5 text-[11px]"
                        >
                          {t.device_id}: {t.status}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
                {deployments.length === 0 && (
                  <p className="text-sm text-slate-500">No OTA deployments yet.</p>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === "settings" && !loading && thresholds && (
          <section className="max-w-xl space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="text-sm font-medium text-slate-300">
              Threshold Configuration
            </h2>
            <p className="text-xs text-slate-500">
              These values control the red dashed region lines in telemetry charts.
            </p>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Heap free minimum (bytes)</span>
              <input
                type="number"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={thresholds.heap_free_bytes_min}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    heap_free_bytes_min: Number(e.target.value),
                  })
                }
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Wi-Fi RSSI minimum (dBm)</span>
              <input
                type="number"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={thresholds.wifi_rssi_dbm_min}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    wifi_rssi_dbm_min: Number(e.target.value),
                  })
                }
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Battery voltage minimum (mV)</span>
              <input
                type="number"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={thresholds.battery_voltage_mv_min}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    battery_voltage_mv_min: Number(e.target.value),
                  })
                }
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">CPU temperature maximum (°C)</span>
              <input
                type="number"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={thresholds.cpu_temperature_c_max}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    cpu_temperature_c_max: Number(e.target.value),
                  })
                }
              />
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={savingThresholds}
                onClick={async () => {
                  setSavingThresholds(true);
                  setThresholdError(null);
                  try {
                    await api.updateThresholds({
                      heap_free_bytes_min: thresholds.heap_free_bytes_min,
                      wifi_rssi_dbm_min: thresholds.wifi_rssi_dbm_min,
                      battery_voltage_mv_min: thresholds.battery_voltage_mv_min,
                      cpu_temperature_c_max: thresholds.cpu_temperature_c_max,
                    });
                    await load();
                    setThresholdError(null);
                  } catch (e) {
                    setThresholdError(
                      e instanceof Error ? e.message : "Failed to save threshold settings"
                    );
                  } finally {
                    setSavingThresholds(false);
                  }
                }}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingThresholds ? "Saving..." : "Save thresholds"}
              </button>
              {thresholds.updated_at && (
                <span className="text-xs text-slate-500">
                  Last updated {new Date(thresholds.updated_at).toLocaleString()}
                </span>
              )}
            </div>
            {thresholdError && (
              <p className="text-xs text-red-300">
                {thresholdError} — threshold save failed, please retry.
              </p>
            )}
          </section>
        )}

        {editingDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-100">
                  Edit Device Identification
                </h3>
                <button
                  type="button"
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  onClick={() => {
                    setEditingDevice(null);
                    setEditError(null);
                  }}
                >
                  Close
                </button>
              </div>

              <dl className="mb-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">Device ID</dt>
                  <dd className="font-mono text-emerald-300">{editingDevice.device_id}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">Hardware</dt>
                  <dd className="text-slate-200">{editingDevice.hw_version || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">Firmware</dt>
                  <dd className="text-slate-200">{editingDevice.fw_version || "—"}</dd>
                </div>
              </dl>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">Label</span>
                <input
                  type="text"
                  value={editingLabel}
                  maxLength={120}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder="e.g. Lab ESP32 #2"
                />
              </label>

              {editError && <p className="mt-2 text-xs text-red-300">{editError}</p>}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                  onClick={() => {
                    setEditingDevice(null);
                    setEditError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingLabel}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={async () => {
                    if (!editingDevice) return;
                    setSavingLabel(true);
                    setEditError(null);
                    try {
                      const updated = await api.updateDeviceLabel(
                        editingDevice.device_id,
                        editingLabel
                      );
                      setDevices((current) =>
                        current.map((d) =>
                          d.device_id === updated.device_id ? { ...d, label: updated.label } : d
                        )
                      );
                      setEditingDevice(null);
                    } catch (e) {
                      setEditError(
                        e instanceof Error ? e.message : "Failed to update device label"
                      );
                    } finally {
                      setSavingLabel(false);
                    }
                  }}
                >
                  {savingLabel ? "Saving..." : "Save label"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
