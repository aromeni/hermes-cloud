import React from "react";

const STATUS_STYLES = {
  pending: "bg-gray-700 text-gray-300",
  running: "bg-blue-700 text-blue-100 animate-pulse",
  success: "bg-emerald-700 text-emerald-100",
  failed: "bg-red-700 text-red-100",
};

function truncate(str, n = 40) {
  if (!str) return "—";
  return str.length > n ? str.slice(0, n) + "…" : str;
}

function StatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-gray-600 text-gray-200"}`}>
      {status}
    </span>
  );
}

export default function IncidentTable({ data, loading, page, pageSize, onPageChange, onRefresh }) {
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-xl bg-gray-900 shadow-lg">
      <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <h2 className="text-lg font-semibold text-white">Incidents</h2>
        <button
          onClick={onRefresh}
          className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-gray-700 hover:text-white"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th className="px-6 py-3 font-medium">ID</th>
              <th className="px-6 py-3 font-medium">Error</th>
              <th className="px-6 py-3 font-medium">Repo</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">PR</th>
              <th className="px-6 py-3 font-medium">Time (s)</th>
              <th className="px-6 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No incidents yet. Trigger one below.
                </td>
              </tr>
            ) : (
              items.map((inc) => (
                <tr key={inc.id} className="border-b border-gray-800/50 hover:bg-gray-800/40">
                  <td className="px-6 py-3 font-mono text-xs text-gray-400" title={inc.id}>
                    {inc.id.slice(0, 8)}
                  </td>
                  <td className="px-6 py-3 text-gray-200" title={inc.error_text}>
                    {truncate(inc.error_text, 48)}
                  </td>
                  <td className="px-6 py-3 text-gray-400" title={inc.repo_url}>
                    {truncate(inc.repo_url, 32)}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={inc.status} />
                  </td>
                  <td className="px-6 py-3">
                    {inc.pr_url ? (
                      <a
                        href={inc.pr_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 underline hover:text-blue-300"
                      >
                        View PR
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-300">
                    {inc.time_taken != null ? inc.time_taken : "—"}
                  </td>
                  <td className="px-6 py-3 text-gray-400">
                    {new Date(inc.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-gray-800 px-6 py-3 text-sm text-gray-400">
        <span>
          {total} incident{total !== 1 ? "s" : ""} total
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded px-2 py-1 hover:bg-gray-800 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="px-2 py-1">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="rounded px-2 py-1 hover:bg-gray-800 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
