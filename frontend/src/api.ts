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
  heap_free_bytes_min: number;
  wifi_rssi_dbm_min: number;
  battery_voltage_mv_min: number;
  cpu_temperature_c_max: number;
  updated_at: string | null;
}

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
  results: T[];
}

export const api = {
  stats: () => fetchJson<FleetStats>("/stats/"),
  devices: () => fetchJson<Paginated<Device>>("/devices/"),
  metrics: (deviceId: string, limit = 48) =>
    fetchJson<Paginated<Heartbeat>>(
      `/devices/${deviceId}/metrics/?limit=${limit}`
    ),
  crashes: () => fetchJson<Paginated<CrashReport>>("/crashes/"),
  events: (params?: { deviceId?: string; hours?: number }) => {
    const qs = new URLSearchParams();
    if (params?.deviceId) qs.set("device_id", params.deviceId);
    if (params?.hours) qs.set("hours", String(params.hours));
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
  thresholds: () => fetchJson<ThresholdConfig>("/thresholds/"),
  updateThresholds: async (payload: Omit<ThresholdConfig, "updated_at">) => {
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
};
