interface Props {
  label: string;
  value: number;
  accent?: "emerald" | "amber";
}

export function StatCard({ label, value, accent }: Props) {
  const ring =
    accent === "emerald"
      ? "ring-emerald-600/30"
      : accent === "amber"
        ? "ring-amber-500/30"
        : "ring-slate-700";

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/60 p-4 ring-1 ${ring}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
