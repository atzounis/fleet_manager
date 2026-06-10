import { useCallback, useEffect, useState } from "react";
import {
  api,
  auth,
  CHART_DEFAULT_ZOOM_INDEX,
  CHART_MAX_HISTORY_DAYS,
  CHART_ZOOM_LEVELS,
  EVENT_METRIC_OPTIONS,
  EVENT_PAGE_SIZE,
  EVENT_SEVERITY_OPTIONS,
  Device,
  FleetEvent,
  FleetStats,
  FirmwareRelease,
  Heartbeat,
  OtaDeployment,
  ThresholdConfig,
  THRESHOLD_HW_PROFILES,
} from "./api";
import { DeviceChart } from "./components/DeviceChart";
import { LoginPage } from "./components/LoginPage";
import { RegisterDeviceModal } from "./components/RegisterDeviceModal";
import { StatCard } from "./components/StatCard";
import { TokenRevealModal } from "./components/TokenRevealModal";

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
  const [username, setUsername] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [firmware, setFirmware] = useState<FirmwareRelease[]>([]);
  const [deployments, setDeployments] = useState<OtaDeployment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Heartbeat[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [chartEndBefore, setChartEndBefore] = useState<string | null>(null);
  const [chartNavStack, setChartNavStack] = useState<(string | null)[]>([]);
  const [chartZoomIndex, setChartZoomIndex] = useState(CHART_DEFAULT_ZOOM_INDEX);
  const chartMetricsLimit = CHART_ZOOM_LEVELS[chartZoomIndex];
  const [tab, setTab] = useState<Tab>("devices");
  const [thresholdConfigs, setThresholdConfigs] = useState<Record<string, ThresholdConfig>>({});
  const [settingsHwVersion, setSettingsHwVersion] = useState("1.0");
  const [thresholds, setThresholds] = useState<ThresholdConfig | null>(null);
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [otaVersion, setOtaVersion] = useState("");
  const [otaHwVersion, setOtaHwVersion] = useState("1.0");
  const [otaFile, setOtaFile] = useState<File | null>(null);
  const [otaTargets, setOtaTargets] = useState<string[]>([]);
  const [otaSending, setOtaSending] = useState(false);
  const [deletingDeploymentId, setDeletingDeploymentId] = useState<number | null>(null);
  const [confirmDeleteDeploymentId, setConfirmDeleteDeploymentId] = useState<number | null>(null);
  const [otaError, setOtaError] = useState<string | null>(null);
  const [eventDeviceFilter, setEventDeviceFilter] = useState<string>("all");
  const [eventHoursFilter, setEventHoursFilter] = useState<number>(24);
  const [eventSeverityFilter, setEventSeverityFilter] = useState("");
  const [eventMetricFilter, setEventMetricFilter] = useState("");
  const [eventPage, setEventPage] = useState(1);
  const [eventCount, setEventCount] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [thresholdSuccess, setThresholdSuccess] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingLabel, setSavingLabel] = useState(false);
  const [rebootMessage, setRebootMessage] = useState<string | null>(null);
  const [rebootError, setRebootError] = useState<string | null>(null);
  const [queuingReboot, setQueuingReboot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showRegisterDevice, setShowRegisterDevice] = useState(false);
  const [revealedToken, setRevealedToken] = useState<{ deviceId: string; token: string } | null>(
    null
  );
  const [rotatingToken, setRotatingToken] = useState(false);

  useEffect(() => {
    auth
      .ensureCsrf()
      .then(() => auth.session())
      .then((session) => setUsername(session.username))
      .catch(() => setUsername(null))
      .finally(() => setAuthChecking(false));
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setUsername(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d, f, od] = await Promise.all([
        api.stats(),
        api.devices(),
        api.firmware(),
        api.otaDeployments(),
      ]);
      setStats(s);
      setDevices(d.results);
      setFirmware(f.results);
      setDeployments(od.results);
      api.thresholdsList()
        .then((response) => {
          setThresholdConfigs(
            Object.fromEntries(response.results.map((row) => [row.hw_version, row]))
          );
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
  }, [selectedId]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const response = await api.events({
        deviceId: eventDeviceFilter === "all" ? undefined : eventDeviceFilter,
        hours: eventHoursFilter,
        page: eventPage,
        severity: eventSeverityFilter || undefined,
        metric: eventMetricFilter || undefined,
      });
      setEvents(response.results);
      setEventCount(response.count);
    } catch (e) {
      setEvents([]);
      setEventCount(0);
      setError(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      setEventsLoading(false);
    }
  }, [
    eventDeviceFilter,
    eventHoursFilter,
    eventSeverityFilter,
    eventMetricFilter,
    eventPage,
  ]);

  useEffect(() => {
    if (username) {
      load();
    }
  }, [load, username]);

  useEffect(() => {
    if (!username || tab !== "events") return;
    loadEvents();
  }, [tab, loadEvents, username]);

  useEffect(() => {
    if (!username || tab !== "settings") return;
    setThresholdSuccess(null);
    api
      .thresholds(settingsHwVersion)
      .then((config) => {
        setThresholds(config);
        setThresholdConfigs((current) => ({
          ...current,
          [config.hw_version]: config,
        }));
        setThresholdError(null);
      })
      .catch((e) => {
        setThresholdError(e instanceof Error ? e.message : "Failed to load thresholds");
      });
  }, [tab, settingsHwVersion, username]);

  useEffect(() => {
    if (!thresholdSuccess) return;
    const timer = window.setTimeout(() => setThresholdSuccess(null), 5000);
    return () => window.clearTimeout(timer);
  }, [thresholdSuccess]);

  useEffect(() => {
    if (!username || !selectedId) {
      setMetrics([]);
      return;
    }
    setMetricsLoading(true);
    api
      .metrics(selectedId, {
        limit: chartMetricsLimit,
        end: chartEndBefore ?? undefined,
      })
      .then((r) => setMetrics([...r.results].reverse()))
      .catch(() => setMetrics([]))
      .finally(() => setMetricsLoading(false));
  }, [selectedId, chartEndBefore, chartMetricsLimit, username]);

  useEffect(() => {
    setChartEndBefore(null);
    setChartNavStack([]);
    setChartZoomIndex(CHART_DEFAULT_ZOOM_INDEX);
  }, [selectedId]);

  const chartHistoryMinMs = Date.now() - CHART_MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const chartCanPrev =
    metrics.length > 0 &&
    new Date(metrics[0].recorded_at).getTime() > chartHistoryMinMs + 1000;
  const chartCanNext = chartEndBefore !== null || chartNavStack.length > 0;

  const goChartOlder = () => {
    if (!chartCanPrev || metrics.length === 0) return;
    setChartNavStack((stack) => [...stack, chartEndBefore]);
    setChartEndBefore(metrics[0].recorded_at);
  };

  const goChartNewer = () => {
    if (!chartCanNext) return;
    if (chartNavStack.length === 0) {
      setChartEndBefore(null);
      return;
    }
    const nextStack = [...chartNavStack];
    const previousEnd = nextStack.pop() ?? null;
    setChartNavStack(nextStack);
    setChartEndBefore(previousEnd);
  };

  const goChartLatest = () => {
    setChartEndBefore(null);
    setChartNavStack([]);
  };

  const chartCanZoomIn = chartZoomIndex > 0;
  const chartCanZoomOut = chartZoomIndex < CHART_ZOOM_LEVELS.length - 1;

  const goChartZoomIn = () => {
    if (!chartCanZoomIn) return;
    setChartZoomIndex((index) => index - 1);
    goChartLatest();
  };

  const goChartZoomOut = () => {
    if (!chartCanZoomOut) return;
    setChartZoomIndex((index) => index + 1);
    goChartLatest();
  };

  const queueDeviceRestart = async () => {
    if (!selectedId || !selected?.is_online) return;
    const label = selected.label || selected.device_id;
    if (
      !window.confirm(
        `Queue a remote restart for ${label}?\n\nThe device will reboot on its next heartbeat (about 60 seconds).`
      )
    ) {
      return;
    }
    setQueuingReboot(true);
    setRebootError(null);
    setRebootMessage(null);
    try {
      await api.queueDeviceReboot(selectedId);
      setRebootMessage(
        `Restart queued for ${label}. Expect reboot within ~60s on the next heartbeat.`
      );
    } catch (e) {
      setRebootError(e instanceof Error ? e.message : "Failed to queue restart");
    } finally {
      setQueuingReboot(false);
    }
  };

  useEffect(() => {
    setRebootMessage(null);
    setRebootError(null);
  }, [selectedId]);

  const selected = devices.find((d) => d.device_id === selectedId);
  const chartThresholds =
    (selected && thresholdConfigs[selected.hw_version]) || stats?.thresholds;
  const settingsProfileLabel =
    THRESHOLD_HW_PROFILES.find((profile) => profile.hw_version === settingsHwVersion)
      ?.label ?? `HW ${settingsHwVersion}`;

  const eventTotalPages = Math.max(1, Math.ceil(eventCount / EVENT_PAGE_SIZE));
  const eventRangeStart =
    eventCount === 0 ? 0 : (eventPage - 1) * EVENT_PAGE_SIZE + 1;
  const eventRangeEnd = Math.min(eventPage * EVENT_PAGE_SIZE, eventCount);

  const resetEventFilters = () => {
    setEventDeviceFilter("all");
    setEventHoursFilter(24);
    setEventSeverityFilter("");
    setEventMetricFilter("");
    setEventPage(1);
  };
  const toggleOtaTarget = (deviceId: string) => {
    setOtaTargets((current) =>
      current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : [...current, deviceId]
    );
  };

  /* Match deployment HW to selected devices (must equal FLEET_HW_VERSION on the device). */
  useEffect(() => {
    if (otaTargets.length === 0) return;
    const hwVersions = otaTargets
      .map((id) => devices.find((d) => d.device_id === id)?.hw_version)
      .filter((v): v is string => Boolean(v));
    const unique = [...new Set(hwVersions)];
    if (unique.length === 1) {
      setOtaHwVersion(unique[0]);
    }
  }, [otaTargets, devices]);

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading…
      </div>
    );
  }

  if (!username) {
    return <LoginPage onSuccess={setUsername} />;
  }

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
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-400 sm:inline">{username}</span>
            <button
              type="button"
              onClick={load}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-red-200">
            {error}
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
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-slate-400">Devices</h2>
                <button
                  type="button"
                  onClick={() => setShowRegisterDevice(true)}
                  className="rounded-md border border-emerald-700/60 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-950/40"
                >
                  + Register
                </button>
              </div>
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
                          {!d.is_provisioned && (
                            <span className="ml-1 rounded bg-amber-600/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                              no token
                            </span>
                          )}
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
                    No devices yet. Use <strong className="text-slate-300">Register</strong> or run{" "}
                    <code className="text-emerald-400">seed_demo</code>.
                  </li>
                )}
              </ul>
            </div>
            <div className="lg:col-span-2 space-y-3">
              {rebootMessage && (
                <p className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
                  {rebootMessage}
                </p>
              )}
              {rebootError && (
                <p className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                  {rebootError}
                </p>
              )}
              {selected && stats && chartThresholds ? (
                metrics.length > 0 ? (
                  <DeviceChart
                    device={selected}
                    metrics={metrics}
                    thresholds={chartThresholds}
                    loading={metricsLoading}
                    canPrev={chartCanPrev}
                    canNext={chartCanNext}
                    onPrev={goChartOlder}
                    onNext={goChartNewer}
                    onLatest={goChartLatest}
                    zoomLabel={chartMetricsLimit}
                    canZoomIn={chartCanZoomIn}
                    canZoomOut={chartCanZoomOut}
                    onZoomIn={goChartZoomIn}
                    onZoomOut={goChartZoomOut}
                    onRestart={queueDeviceRestart}
                    canRestart={selected.is_online}
                    restarting={queuingReboot}
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                      <p className="text-sm text-slate-400">
                        {metricsLoading
                          ? "Loading telemetry…"
                          : "No telemetry in this time window"}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!chartCanNext || metricsLoading}
                          onClick={goChartNewer}
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Newer →
                        </button>
                        <button
                          type="button"
                          disabled={!chartCanNext || metricsLoading}
                          onClick={goChartLatest}
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Latest
                        </button>
                      </div>
                    </div>
                  </div>
                )
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
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-slate-400">Device</span>
                <select
                  value={eventDeviceFilter}
                  onChange={(e) => {
                    setEventPage(1);
                    setEventDeviceFilter(e.target.value);
                  }}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="all">All devices</option>
                  {devices.map((d) => (
                    <option key={d.device_id} value={d.device_id}>
                      {d.label ? `${d.label} (${d.device_id})` : d.device_id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-slate-400">Time range</span>
                <select
                  value={eventHoursFilter}
                  onChange={(e) => {
                    setEventPage(1);
                    setEventHoursFilter(Number(e.target.value));
                  }}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value={1}>Last 1h</option>
                  <option value={6}>Last 6h</option>
                  <option value={24}>Last 24h</option>
                  <option value={72}>Last 72h</option>
                  <option value={168}>Last 7d</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-slate-400">Severity</span>
                <select
                  value={eventSeverityFilter}
                  onChange={(e) => {
                    setEventPage(1);
                    setEventSeverityFilter(e.target.value);
                  }}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                >
                  {EVENT_SEVERITY_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-slate-400">Metric</span>
                <select
                  value={eventMetricFilter}
                  onChange={(e) => {
                    setEventPage(1);
                    setEventMetricFilter(e.target.value);
                  }}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  title="Filters threshold breach events by telemetry field"
                >
                  {EVENT_METRIC_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={resetEventFilters}
                className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
              >
                Clear filters
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <span>
                {eventsLoading
                  ? "Loading events…"
                  : eventCount === 0
                    ? "No matching events"
                    : `Showing ${eventRangeStart}–${eventRangeEnd} of ${eventCount}`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={eventsLoading || eventPage <= 1}
                  onClick={() => setEventPage((page) => Math.max(1, page - 1))}
                  className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="text-slate-500">
                  Page {eventPage} of {eventTotalPages}
                </span>
                <button
                  type="button"
                  disabled={eventsLoading || eventPage >= eventTotalPages}
                  onClick={() =>
                    setEventPage((page) => Math.min(eventTotalPages, page + 1))
                  }
                  className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>

            {events.map((ev) => {
              const metric =
                typeof ev.details?.metric === "string" ? ev.details.metric : null;
              return (
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
                  {metric && (
                    <span className="rounded bg-violet-600/20 px-2 py-0.5 font-mono text-xs text-violet-200">
                      {metric}
                    </span>
                  )}
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
            );
            })}
            {!eventsLoading && events.length === 0 && (
              <p className="text-slate-500">No events match the selected filters.</p>
            )}
          </div>
        )}

        {tab === "firmware" && !loading && (
          <div className="space-y-6">
            <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <h2 className="text-sm font-medium text-slate-300">Deploy OTA Update</h2>
              <p className="mt-1 text-xs text-slate-500">
                Upload a firmware binary, select target devices, and queue deployment.{" "}
                <span className="text-amber-400/90">
                  HW version must match each device&apos;s reported HW (ESP8266 agents use{" "}
                  <span className="font-mono">8266</span>, not <span className="font-mono">1.0</span>
                  ).
                </span>
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
                  placeholder="HW version (ESP32: 1.0, ESP8266: 8266)"
                  value={otaHwVersion}
                  onChange={(e) => setOtaHwVersion(e.target.value)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  title="Must match FLEET_HW_VERSION in the device secrets.h and X-Hw-Version on ota-check"
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
                      <span className="ml-auto font-mono text-slate-500">
                        hw {d.hw_version} fw {d.fw_version}
                      </span>
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
                    const targetDevices = devices.filter((d) =>
                      otaTargets.includes(d.device_id)
                    );
                    const deviceHws = [
                      ...new Set(targetDevices.map((d) => d.hw_version).filter(Boolean)),
                    ];
                    const deployHw = otaHwVersion.trim() || "1.0";
                    if (deviceHws.length > 1) {
                      setOtaError(
                        "Selected devices report different HW versions. Deploy to one HW group at a time."
                      );
                      return;
                    }
                    if (deviceHws.length === 1 && deviceHws[0] !== deployHw) {
                      setOtaError(
                        `HW version must be ${deviceHws[0]} to match selected device(s) (ota-check uses each device's reported HW).`
                      );
                      return;
                    }
                    setOtaSending(true);
                    setOtaError(null);
                    try {
                      await api.createOtaDeployment({
                        firmware: otaFile,
                        version: otaVersion.trim(),
                        hwVersion: deployHw,
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
                      {confirmDeleteDeploymentId === dep.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-amber-300">
                            Delete deployment #{dep.id}?
                          </span>
                          <button
                            type="button"
                            disabled={deletingDeploymentId === dep.id}
                            className="rounded border border-rose-700 px-2 py-0.5 text-rose-200 hover:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={async (e) => {
                              e.stopPropagation();
                              setDeletingDeploymentId(dep.id);
                              setOtaError(null);
                              try {
                                await api.deleteOtaDeployment(dep.id);
                                const firmwareId = dep.firmware;
                                setDeployments((current) =>
                                  current.filter((d) => d.id !== dep.id)
                                );
                                setFirmware((current) =>
                                  current.filter((f) => f.id !== firmwareId)
                                );
                                setConfirmDeleteDeploymentId(null);
                              } catch (err) {
                                setOtaError(
                                  err instanceof Error
                                    ? err.message
                                    : "Failed to delete deployment"
                                );
                              } finally {
                                setDeletingDeploymentId(null);
                              }
                            }}
                          >
                            {deletingDeploymentId === dep.id ? "Deleting..." : "Confirm"}
                          </button>
                          <button
                            type="button"
                            disabled={deletingDeploymentId === dep.id}
                            className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteDeploymentId(null);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={deletingDeploymentId === dep.id}
                          className="rounded border border-rose-700/70 px-2 py-0.5 text-rose-300 hover:bg-rose-950/60 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteDeploymentId(dep.id);
                          }}
                        >
                          Delete
                        </button>
                      )}
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
              Thresholds are applied per device type (HW version). Charts and breach
              alerts use the profile that matches each device&apos;s reported HW.
            </p>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Device type</span>
              <select
                value={settingsHwVersion}
                onChange={(e) => setSettingsHwVersion(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              >
                {THRESHOLD_HW_PROFILES.map((profile) => (
                  <option key={profile.hw_version} value={profile.hw_version}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>

            <p className="text-xs text-slate-500">
              Editing <span className="text-slate-300">{settingsProfileLabel}</span>
            </p>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Heap free minimum (bytes)</span>
              <input
                type="number"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={thresholds.heap_free_bytes_min}
                onChange={(e) => {
                  setThresholdSuccess(null);
                  setThresholds({
                    ...thresholds,
                    heap_free_bytes_min: Number(e.target.value),
                  });
                }}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Wi-Fi RSSI minimum (dBm)</span>
              <input
                type="number"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={thresholds.wifi_rssi_dbm_min}
                onChange={(e) => {
                  setThresholdSuccess(null);
                  setThresholds({
                    ...thresholds,
                    wifi_rssi_dbm_min: Number(e.target.value),
                  });
                }}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Battery voltage minimum (mV)</span>
              <input
                type="number"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={thresholds.battery_voltage_mv_min}
                onChange={(e) => {
                  setThresholdSuccess(null);
                  setThresholds({
                    ...thresholds,
                    battery_voltage_mv_min: Number(e.target.value),
                  });
                }}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">CPU temperature maximum (°C)</span>
              <input
                type="number"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                value={thresholds.cpu_temperature_c_max}
                onChange={(e) => {
                  setThresholdSuccess(null);
                  setThresholds({
                    ...thresholds,
                    cpu_temperature_c_max: Number(e.target.value),
                  });
                }}
              />
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={savingThresholds}
                onClick={async () => {
                  setSavingThresholds(true);
                  setThresholdError(null);
                  setThresholdSuccess(null);
                  try {
                    const saved = await api.updateThresholds({
                      hw_version: settingsHwVersion,
                      heap_free_bytes_min: thresholds.heap_free_bytes_min,
                      wifi_rssi_dbm_min: thresholds.wifi_rssi_dbm_min,
                      battery_voltage_mv_min: thresholds.battery_voltage_mv_min,
                      cpu_temperature_c_max: thresholds.cpu_temperature_c_max,
                      updated_at: null,
                    });
                    setThresholds(saved);
                    setThresholdConfigs((current) => ({
                      ...current,
                      [saved.hw_version]: saved,
                    }));
                    setThresholdError(null);
                    setThresholdSuccess(
                      `Thresholds saved for ${settingsProfileLabel}.`
                    );
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
            {thresholdSuccess && (
              <p className="text-xs text-emerald-300" role="status">
                {thresholdSuccess}
              </p>
            )}
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

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={rotatingToken}
                  className="rounded-md border border-amber-700/70 px-3 py-2 text-sm text-amber-200 hover:bg-amber-950/40 disabled:opacity-50"
                  onClick={async () => {
                    if (!editingDevice) return;
                    if (
                      !window.confirm(
                        `Issue a new agent token for ${editingDevice.device_id}? The old token stops working immediately.`
                      )
                    ) {
                      return;
                    }
                    setRotatingToken(true);
                    setEditError(null);
                    try {
                      const result = await api.rotateDeviceToken(editingDevice.device_id);
                      setDevices((current) =>
                        current.map((d) =>
                          d.device_id === result.deviceId
                            ? { ...d, is_provisioned: true }
                            : d
                        )
                      );
                      setRevealedToken(result);
                      setEditingDevice(null);
                    } catch (e) {
                      setEditError(
                        e instanceof Error ? e.message : "Failed to rotate device token"
                      );
                    } finally {
                      setRotatingToken(false);
                    }
                  }}
                >
                  {rotatingToken ? "Rotating…" : "Rotate agent token"}
                </button>
                <div className="flex items-center gap-2">
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
          </div>
        )}

        {showRegisterDevice && (
          <RegisterDeviceModal
            onClose={() => setShowRegisterDevice(false)}
            registerDevice={api.registerDevice}
            onRegistered={(deviceId, token) => {
              setRevealedToken({ deviceId, token });
              void load();
            }}
          />
        )}

        {revealedToken && (
          <TokenRevealModal
            deviceId={revealedToken.deviceId}
            token={revealedToken.token}
            onClose={() => setRevealedToken(null)}
          />
        )}
      </main>
    </div>
  );
}
