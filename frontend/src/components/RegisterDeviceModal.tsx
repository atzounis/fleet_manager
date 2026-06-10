import { FormEvent, useState } from "react";
import { THRESHOLD_HW_PROFILES } from "../api";

interface RegisterDeviceModalProps {
  onClose: () => void;
  onRegistered: (deviceId: string, token: string) => void;
  registerDevice: (payload: {
    deviceId: string;
    label: string;
    hwVersion: string;
  }) => Promise<{ deviceId: string; token: string }>;
}

export function RegisterDeviceModal({
  onClose,
  onRegistered,
  registerDevice,
}: RegisterDeviceModalProps) {
  const [deviceId, setDeviceId] = useState("");
  const [label, setLabel] = useState("");
  const [hwVersion, setHwVersion] = useState("1.0");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const normalized = deviceId.trim().toLowerCase().replace(/[:-]/g, "");
      const result = await registerDevice({
        deviceId: normalized,
        label: label.trim(),
        hwVersion,
      });
      onRegistered(result.deviceId, result.token);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">Register device</h3>
          <button
            type="button"
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Register the factory MAC (12 hex chars) before the device can send heartbeats or
          receive OTA.
        </p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Device ID (MAC)</span>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="240ac4a1b2c3"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Label</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Lab ESP32 #2"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Hardware version</span>
            <select
              value={hwVersion}
              onChange={(e) => setHwVersion(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              {THRESHOLD_HW_PROFILES.map((profile) => (
                <option key={profile.hw_version} value={profile.hw_version}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {submitting ? "Registering…" : "Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
