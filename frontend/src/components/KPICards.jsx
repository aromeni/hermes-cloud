import React from "react";

const CARDS = [
  {
    key: "total_incidents",
    label: "Total Incidents",
    format: (v) => v,
    icon: "🔔",
    color: "from-blue-600 to-blue-800",
  },
  {
    key: "success_rate",
    label: "Success Rate",
    format: (v) => `${v}%`,
    icon: "✅",
    color: "from-emerald-600 to-emerald-800",
  },
  {
    key: "avg_time_seconds",
    label: "Avg Fix Time",
    format: (v) => `${v}s`,
    icon: "⏱",
    color: "from-violet-600 to-violet-800",
  },
  {
    key: "total_cost_saved",
    label: "Cost Saved",
    format: (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    icon: "💰",
    color: "from-amber-500 to-amber-700",
  },
];

export default function KPICards({ stats, loading }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {CARDS.map(({ key, label, format, icon, color }) => (
        <div
          key={key}
          className={`rounded-xl bg-gradient-to-br ${color} p-5 shadow-lg`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white/80">{label}</span>
            <span className="text-xl">{icon}</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            {loading ? "—" : stats ? format(stats[key]) : "—"}
          </p>
        </div>
      ))}
    </div>
  );
}
