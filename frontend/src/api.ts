const API_BASE = "/api/v1/dashboard";

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: string; error?: string };
    if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // Ignore JSON parse failures and use fallback.
  }
  return fallback;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `API ${res.status}: ${path}`));
  }
  return res.json() as Promise<T>;
}

export interface FleetStats {
  devices_total: number;
  devices_online: number;
  devices_offline: number;
  crashes_pending: number;
  firmware_active: number;
  cohorts: number;
  heartbeat_expected_interval_seconds: number;
  heartbeat_missed_iterations: number;
  online_window_seconds: number;
  thresholds: {
    heap_free_bytes_min: number;
    wifi_rssi_dbm_min: number;
    battery_voltage_mv_min: number;
    cpu_temperature_c_max: number;
  };
}

export interface ThresholdConfig {
  hw_version: string;
  heap_free_bytes_min: number;
  wifi_rssi_dbm_min: number;
  battery_voltage_mv_min: number;
  cpu_temperature_c_max: number;
  updated_at: string | null;
}

export const THRESHOLD_HW_PROFILES = [
  { hw_version: "1.0", label: "ESP32 (HW 1.0)" },
  { hw_version: "8266", label: "ESP8266 (HW 8266)" },
] as const;

export interface Device {
  device_id: string;
  label: string;
  hw_version: string;
  fw_version: string;
  cohort_name: string | null;
  last_seen_at: string | null;
  is_online: boolean;
  status: "online" | "offline";
  seconds_since_last_seen: number | null;
  offline_after_seconds: number;
}

export interface Heartbeat {
  recorded_at: string;
  heap_free_bytes: number;
  heap_min_free_bytes: number;
  wifi_rssi_dbm: number;
  battery_voltage_mv: number | null;
  cpu_temperature_c: number | null;
}

export interface CrashReport {
  id: number;
  device_id: string;
  received_at: string;
  panic_reason: string;
  status: string;
  symbolicated_trace: string;
}

export interface FleetEvent {
  id: number;
  event_at: string;
  event_type: string;
  severity: "info" | "warning" | "critical";
  summary: string;
  details: Record<string, unknown>;
  device_id: string | null;
}

export interface FirmwareRelease {
  id: number;
  version: string;
  hw_version: string;
  cohort_name: string;
  is_active: boolean;
  created_at: string;
}

export interface OtaDeploymentTarget {
  device_id: string;
  status: "pending" | "offered" | "updated" | "failed" | "rolled_back";
  last_error: string;
  offered_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface OtaDeployment {
  id: number;
  status: "pending" | "in_progress" | "completed" | "failed";
  firmware: number;
  firmware_version: string;
  firmware_hw_version: string;
  created_at: string;
  updated_at: string;
  targets: OtaDeploymentTarget[];
}

export interface Paginated<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export const EVENT_PAGE_SIZE = 50;

export const EVENT_SEVERITY_OPTIONS = [
  { value: "", label: "All severities" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
] as const;

export const EVENT_METRIC_OPTIONS = [
  { value: "", label: "All metrics" },
  { value: "heap_free_bytes", label: "Heap free" },
  { value: "wifi_rssi_dbm", label: "Wi-Fi RSSI" },
  { value: "battery_voltage_mv", label: "Battery voltage" },
  { value: "cpu_temperature_c", label: "CPU temperature" },
] as const;

export const CHART_MAX_HISTORY_DAYS = 7;
export const CHART_MAX_LIMIT = 10080;

/** Window sizes in heartbeat points (~1/min → minutes of history). */
export const CHART_ZOOM_LEVELS = [
  24, 48, 96, 192, 384, 768, 1536, 3024, 6048, 10080,
] as const;

export const CHART_DEFAULT_ZOOM_INDEX = 1;

/** @deprecated use CHART_ZOOM_LEVELS[CHART_DEFAULT_ZOOM_INDEX] */
export const CHART_METRICS_LIMIT = CHART_ZOOM_LEVELS[CHART_DEFAULT_ZOOM_INDEX];

export function formatChartWindow(limit: number): string {
  if (limit >= 10080) return "~1 week";
  if (limit < 60) return `~${limit} min`;
  if (limit < 1440) {
    const hours = Math.round(limit / 60);
    return hours === 1 ? "~1 hour" : `~${hours} hours`;
  }
  const days = Math.round(limit / 1440);
  return days === 1 ? "~1 day" : `~${days} days`;
}

export const api = {
  stats: () => fetchJson<FleetStats>("/stats/"),
  devices: () => fetchJson<Paginated<Device>>("/devices/"),
  metrics: (
    deviceId: string,
    params?: { limit?: number; end?: string }
  ) => {
    const qs = new URLSearchParams();
    qs.set("limit", String(params?.limit ?? CHART_ZOOM_LEVELS[CHART_DEFAULT_ZOOM_INDEX]));
    if (params?.end) qs.set("end", params.end);
    return fetchJson<Paginated<Heartbeat>>(
      `/devices/${deviceId}/metrics/?${qs.toString()}`
    );
  },
  crashes: () => fetchJson<Paginated<CrashReport>>("/crashes/"),
  events: (params?: {
    deviceId?: string;
    hours?: number;
    page?: number;
    severity?: string;
    metric?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.deviceId) qs.set("device_id", params.deviceId);
    if (params?.hours) qs.set("hours", String(params.hours));
    if (params?.page && params.page > 1) qs.set("page", String(params.page));
    if (params?.severity) qs.set("severity", params.severity);
    if (params?.metric) qs.set("metric", params.metric);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return fetchJson<Paginated<FleetEvent>>(`/events/${suffix}`);
  },
  firmware: () => fetchJson<Paginated<FirmwareRelease>>("/firmware/"),
  otaDeployments: () => fetchJson<Paginated<OtaDeployment>>("/ota/deployments/"),
  createOtaDeployment: async (payload: {
    firmware: File;
    version: string;
    hwVersion: string;
    deviceIds: string[];
  }) => {
    const body = new FormData();
    body.append("firmware", payload.firmware);
    body.append("version", payload.version);
    body.append("hw_version", payload.hwVersion);
    body.append("device_ids", JSON.stringify(payload.deviceIds));
    const res = await fetch(`${API_BASE}/ota/deployments/`, {
      method: "POST",
      body,
    });
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, `API ${res.status}: /ota/deployments/`)
      );
    }
    return (await res.json()) as OtaDeployment;
  },
  deleteOtaDeployment: async (deploymentId: number) => {
    const res = await fetch(`${API_BASE}/ota/deployments/${deploymentId}/`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(
          res,
          `API ${res.status}: /ota/deployments/${deploymentId}/`
        )
      );
    }
  },
  thresholdsList: () => fetchJson<Paginated<ThresholdConfig>>("/thresholds/"),
  thresholds: (hwVersion = "1.0") =>
    fetchJson<ThresholdConfig>(
      `/thresholds/?hw_version=${encodeURIComponent(hwVersion)}`
    ),
  updateThresholds: async (payload: ThresholdConfig) => {
    const res = await fetch(`${API_BASE}/thresholds/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, `API ${res.status}: /thresholds/`));
    }
    return (await res.json()) as ThresholdConfig;
  },
  updateDeviceLabel: async (deviceId: string, label: string) => {
    const res = await fetch(`${API_BASE}/devices/${deviceId}/label/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, `API ${res.status}: /devices/${deviceId}/label/`)
      );
    }
    return (await res.json()) as Device;
  },
  queueDeviceReboot: async (deviceId: string) => {
    const res = await fetch(`${API_BASE}/devices/${deviceId}/commands/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "reboot" }),
    });
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, `API ${res.status}: /devices/${deviceId}/commands/`)
      );
    }
    return (await res.json()) as {
      id: number;
      device_id: string;
      command: string;
      status: string;
      created_at: string;
    };
  },
};
