import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchIncidents, fetchStats } from "./api.js";
import IncidentTable from "./components/IncidentTable.jsx";
import KPICards from "./components/KPICards.jsx";
import TriggerForm from "./components/TriggerForm.jsx";

const POLL_INTERVAL_MS = 10_000;
const FAST_POLL_MS = 3_000;

export default function App() {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);

  const [incidents, setIncidents] = useState(null);
  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [incidentsError, setIncidentsError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasActiveIncidents, setHasActiveIncidents] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  // Ticks every 5s so "Updated X ago" stays current between polls
  const [, setTick] = useState(0);
  const PAGE_SIZE = 20;

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setStatsLoading(true);
    try {
      const data = await fetchStats();
      setStats(data);
      setStatsError(null);
    } catch (err) {
      setStatsError(err.message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadIncidents = useCallback(
    async (p = page, silent = false) => {
      if (!silent) setIncidentsLoading(true);
      try {
        const data = await fetchIncidents(p, PAGE_SIZE);
        setIncidents(data);
        setHasActiveIncidents(
          data.items.some((i) => i.status === "running" || i.status === "pending")
        );
        setIncidentsError(null);
        setLastUpdated(new Date());
      } catch (err) {
        setIncidentsError(err.message);
      } finally {
        if (!silent) setIncidentsLoading(false);
      }
    },
    [page]
  );

  const refreshAll = useCallback((silent = false) => {
    loadStats(silent);
    loadIncidents(page, silent);
  }, [loadStats, loadIncidents, page]);

  // Keep a stable ref so intervals always call the latest version of refreshAll
  const refreshRef = useRef(refreshAll);
  useEffect(() => {
    refreshRef.current = refreshAll;
  }, [refreshAll]);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Adaptive poll: 3s when incidents are active, 10s otherwise
  useEffect(() => {
    const delay = hasActiveIncidents ? FAST_POLL_MS : POLL_INTERVAL_MS;
    const timer = setInterval(() => refreshRef.current(true), delay);
    return () => clearInterval(timer);
  }, [hasActiveIncidents]);

  // Keep the "Updated X ago" timestamp ticking
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(timer);
  }, []);

  function handlePageChange(newPage) {
    setPage(newPage);
    loadIncidents(newPage);
  }

  const backendError = statsError || incidentsError;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">⚡</span>
            <div>
              <h1 className="text-xl font-bold text-white">Hermes Cloud</h1>
              <p className="hidden text-xs text-gray-500 sm:block">Autonomous bug-fix dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {lastUpdated && !backendError && (
              <span className="hidden text-xs text-gray-500 sm:inline" aria-live="polite">
                Updated {formatAgo(lastUpdated)}
              </span>
            )}
            {backendError ? (
              <span className="rounded-full bg-red-900/60 px-3 py-1 text-xs font-medium text-red-400" role="alert">
                Backend unreachable
              </span>
            ) : hasActiveIncidents ? (
              <span className="rounded-full bg-blue-900/60 px-3 py-1 text-xs font-medium text-blue-300 animate-pulse">
                ⚡ Fix running
              </span>
            ) : (
              <span className="rounded-full bg-emerald-900/60 px-3 py-1 text-xs font-medium text-emerald-400">
                Live
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4 sm:space-y-6 sm:p-6">
        <KPICards stats={stats} loading={statsLoading} error={statsError} />
        <IncidentTable
          data={incidents}
          loading={incidentsLoading}
          error={incidentsError}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={handlePageChange}
          onRefresh={refreshAll}
        />
        <TriggerForm onTriggered={refreshAll} />
      </main>
    </div>
  );
}

function formatAgo(date) {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}
