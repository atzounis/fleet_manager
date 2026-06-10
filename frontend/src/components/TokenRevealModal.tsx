import { useRef, useState } from "react";

interface TokenRevealModalProps {
  deviceId: string;
  token: string;
  title?: string;
  onClose: () => void;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API blocked on non-HTTPS origins (e.g. http://IP:port).
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function TokenRevealModal({
  deviceId,
  token,
  title = "Device token",
  onClose,
}: TokenRevealModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const selectToken = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    el.setSelectionRange(0, token.length);
  };

  const copyToken = async () => {
    selectToken();
    const ok = await copyToClipboard(token);
    setCopyState(ok ? "copied" : "failed");
    if (ok) {
      window.setTimeout(() => setCopyState("idle"), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-xl border border-amber-700/60 bg-slate-900 p-5 shadow-2xl">
        <h3 className="text-base font-semibold text-amber-200">{title}</h3>
        <p className="mt-2 text-sm text-slate-400">
          Copy this token into <code className="text-emerald-300">FLEET_DEVICE_TOKEN</code> in{" "}
          <span className="font-mono text-slate-300">{deviceId}</span>&apos;s{" "}
          <code className="text-emerald-300">secrets.h</code>. It is shown only once.
        </p>
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={token}
          onFocus={selectToken}
          onClick={selectToken}
          className="mt-4 w-full rounded-lg border border-slate-700 bg-black/50 px-3 py-2 font-mono text-xs text-emerald-200 outline-none ring-emerald-500/0 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/30"
          aria-label="Device token"
        />
        <p className="mt-2 text-xs text-slate-500">
          Click the field to select all, then ⌘C / Ctrl+C if Copy does not work.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {copyState === "copied" && (
            <span className="mr-auto text-xs text-emerald-300">Copied to clipboard</span>
          )}
          {copyState === "failed" && (
            <span className="mr-auto text-xs text-amber-300">
              Auto-copy blocked — use the field above and ⌘C / Ctrl+C
            </span>
          )}
          <button
            type="button"
            onClick={copyToken}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Copy token
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
