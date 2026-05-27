const API_BASE = "/api/v1/dashboard";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export interface FleetStats {
  devices_total: number;
  devices_online: number;
  crashes_pending: number;
  firmware_active: number;
  cohorts: number;
}

export interface Device {
  device_id: string;
  label: string;
  hw_version: string;
  fw_version: string;
  cohort_name: string | null;
  last_seen_at: string | null;
}

export interface Heartbeat {
  recorded_at: string;
  heap_free_bytes: number;
  heap_min_free_bytes: number;
  wifi_rssi_dbm: number;
  battery_voltage_mv: number | null;
}

export interface CrashReport {
  id: number;
  device_id: string;
  received_at: string;
  panic_reason: string;
  status: string;
  symbolicated_trace: string;
}

export interface FirmwareRelease {
  id: number;
  version: string;
  hw_version: string;
  cohort_name: string;
  is_active: boolean;
  created_at: string;
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
  firmware: () => fetchJson<Paginated<FirmwareRelease>>("/firmware/"),
};
