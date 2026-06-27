import React, { useCallback, useEffect, useState } from "react";
import { fetchIncidents, fetchStats } from "./api.js";
import IncidentTable from "./components/IncidentTable.jsx";
import KPICards from "./components/KPICards.jsx";
import TriggerForm from "./components/TriggerForm.jsx";

const POLL_INTERVAL_MS = 10_000;

export default function App() {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [incidents, setIncidents] = useState(null);
  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchStats();
      setStats(data);
    } catch (_) {
      // swallow; backend may not be ready yet
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadIncidents = useCallback(
    async (p = page) => {
      setIncidentsLoading(true);
      try {
        const data = await fetchIncidents(p, PAGE_SIZE);
        setIncidents(data);
      } catch (_) {
        // swallow
      } finally {
        setIncidentsLoading(false);
      }
    },
    [page]
  );

  const refreshAll = useCallback(() => {
    loadStats();
    loadIncidents(page);
  }, [loadStats, loadIncidents, page]);

  useEffect(() => {
    refreshAll();
    const timer = setInterval(refreshAll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshAll]);

  function handlePageChange(newPage) {
    setPage(newPage);
    loadIncidents(newPage);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <h1 className="text-xl font-bold text-white">Hermes Cloud</h1>
              <p className="text-xs text-gray-500">Autonomous bug-fix dashboard</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-900/60 px-3 py-1 text-xs font-medium text-emerald-400">
            Live
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <KPICards stats={stats} loading={statsLoading} />
        <IncidentTable
          data={incidents}
          loading={incidentsLoading}
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
