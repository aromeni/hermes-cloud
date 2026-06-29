import React, { useEffect, useRef, useState } from "react";
import { fetchIncident } from "../api.js";

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
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-gray-600 text-gray-200"}`}
      aria-label={`Status: ${status}`}
    >
      {status}
    </span>
  );
}

// Skeleton row for table loading state
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800/50">
      {[...Array(8)].map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className={`h-3 animate-pulse rounded bg-gray-800 ${i === 1 ? "w-36" : i === 2 ? "w-24" : "w-16"}`} />
        </td>
      ))}
    </tr>
  );
}

function LogsModal({ incidentId, cache, onClose }) {
  const titleId = `logs-title-${incidentId}`;
  const modalRef = useRef(null);
  const [logs, setLogs] = useState(cache.has(incidentId) ? cache.get(incidentId) : undefined);
  const [loading, setLoading] = useState(!cache.has(incidentId));
  const [fetchError, setFetchError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Focus trap + Escape key handler
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const getFocusable = () => [
      ...modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ),
    ];

    // Move focus into the modal on open
    getFocusable()[0]?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const els = getFocusable();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Fetch logs, skip if already in cache
  useEffect(() => {
    if (cache.has(incidentId)) return;
    fetchIncident(incidentId)
      .then((inc) => {
        const val = inc.logs ?? null;
        cache.set(incidentId, val);
        setLogs(val);
      })
      .catch((err) => setFetchError(err.message))
      .finally(() => setLoading(false));
  }, [incidentId, cache]);

  function handleCopy() {
    if (!logs) return;
    navigator.clipboard.writeText(logs).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      aria-label="Modal backdrop — click to close"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl bg-gray-900 shadow-2xl ring-1 ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h3 id={titleId} className="font-semibold text-white">
            Logs —{" "}
            <span className="font-mono text-sm text-gray-400">
              {incidentId.slice(0, 8)}
            </span>
          </h3>
          <div className="flex items-center gap-2">
            {logs && (
              <button
                onClick={handleCopy}
                className="rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 min-h-[36px]"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close logs modal"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="space-y-2" aria-label="Loading logs">
              {[100, 80, 65, 90, 70, 55, 85, 60].map((w, i) => (
                <div
                  key={i}
                  className="h-3 animate-pulse rounded bg-gray-700"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          )}
          {fetchError && (
            <p className="text-sm text-red-400">Failed to load logs: {fetchError}</p>
          )}
          {!loading && !fetchError && (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-300">
              {logs ??
                "No logs available.\n\nThis incident was created before log persistence was enabled, or the process completed without producing output."}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IncidentTable({
  data,
  loading,
  error,
  page,
  pageSize,
  onPageChange,
  onRefresh,
}) {
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [logsModal, setLogsModal] = useState(null);
  // Persist fetched logs across modal open/close cycles
  const logsCache = useRef(new Map());
  // Restore focus to the trigger button when modal closes
  const triggerRef = useRef(null);

  function openLogs(id, e) {
    triggerRef.current = e.currentTarget;
    setLogsModal(id);
  }

  function closeLogs() {
    const trigger = triggerRef.current;
    setLogsModal(null);
    requestAnimationFrame(() => trigger?.focus());
    triggerRef.current = null;
  }

  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <>
      {logsModal && (
        <LogsModal
          incidentId={logsModal}
          cache={logsCache.current}
          onClose={closeLogs}
        />
      )}

      <div className="rounded-xl bg-gray-900 shadow-lg">
        {/* Table header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Incidents</h2>
          <button
            onClick={onRefresh}
            className="rounded-lg bg-gray-800 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-600 min-h-[44px]"
            aria-label="Refresh incidents"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="border-b border-red-900/50 bg-red-950/40 px-6 py-3 text-sm text-red-400"
            role="alert"
          >
            Failed to load incidents: {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-sm"
            aria-label="Incidents"
            aria-live="polite"
            aria-busy={loading}
          >
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th scope="col" className="px-6 py-3 font-medium">ID</th>
                <th scope="col" className="px-6 py-3 font-medium">Error</th>
                <th scope="col" className="px-6 py-3 font-medium">Repo</th>
                <th scope="col" className="px-6 py-3 font-medium">Status</th>
                <th scope="col" className="px-6 py-3 font-medium">PR</th>
                <th scope="col" className="px-6 py-3 font-medium">Logs</th>
                <th scope="col" className="px-6 py-3 font-medium">Time (s)</th>
                <th scope="col" className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-gray-500"
                    role="status"
                  >
                    No incidents yet. Trigger one below.
                  </td>
                </tr>
              ) : (
                items.map((inc) => (
                  <tr
                    key={inc.id}
                    className={[
                      "border-b border-gray-800/50 transition-colors hover:bg-gray-800/40",
                      inc.status === "running"
                        ? "border-l-2 border-l-blue-500 bg-blue-950/10"
                        : "",
                    ].join(" ")}
                  >
                    <td
                      className="px-6 py-3 font-mono text-xs text-gray-400"
                      title={inc.id}
                    >
                      {inc.id.slice(0, 8)}
                    </td>
                    <td
                      className="px-6 py-3 text-gray-200"
                      title={inc.error_text}
                    >
                      {truncate(inc.error_text, 48)}
                    </td>
                    <td
                      className="px-6 py-3 text-gray-400"
                      title={inc.repo_url}
                    >
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
                          className="rounded text-blue-400 underline hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          View PR
                        </a>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={(e) => openLogs(inc.id, e)}
                        className="rounded bg-gray-700 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 min-h-[36px] min-w-[52px]"
                        aria-label={`View logs for incident ${inc.id.slice(0, 8)}`}
                      >
                        View
                      </button>
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
          <span aria-live="polite">
            {total === 0
              ? "No incidents"
              : `Showing ${startItem}–${endItem} of ${total} incident${total !== 1 ? "s" : ""}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded px-3 py-2 transition-colors hover:bg-gray-800 disabled:opacity-40 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-600"
              aria-label="Previous page"
            >
              ← Prev
            </button>
            <span className="px-3 py-1 text-gray-500">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded px-3 py-2 transition-colors hover:bg-gray-800 disabled:opacity-40 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gray-600"
              aria-label="Next page"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
