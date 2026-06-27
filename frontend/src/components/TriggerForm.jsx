import React, { useState } from "react";
import { triggerFix } from "../api.js";

export default function TriggerForm({ onTriggered }) {
  const [errorText, setErrorText] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await triggerFix(errorText.trim(), repoUrl.trim(), baseBranch.trim());
      setResult(data);
      setErrorText("");
      setRepoUrl("");
      setBaseBranch("main");
      onTriggered?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 p-6 shadow-lg">
      <h2 className="mb-4 text-lg font-semibold text-white">Manual Trigger</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Error / Stack Trace
            <span className="ml-2 text-xs text-gray-500">
              — must include the full Python traceback (starting with "Traceback (most recent call last):")
            </span>
          </label>
          <textarea
            value={errorText}
            onChange={(e) => setErrorText(e.target.value)}
            required
            rows={6}
            placeholder={`Traceback (most recent call last):\n  File "buggy_math.py", line 2, in add\n    result = a + b\nAssertionError: assert -1 == 5`}
            className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Repo URL</label>
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              required
              placeholder="https://github.com/org/repo"
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Base Branch</label>
            <input
              type="text"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Queuing…" : "⚡ Run Hermes Fix"}
        </button>
      </form>

      {result && (
        <div className="mt-4 rounded-lg bg-emerald-900/50 px-4 py-3 text-sm text-emerald-300">
          ✓ Incident <code className="font-mono">{result.incident_id.slice(0, 8)}</code> created —{" "}
          {result.message}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg bg-red-900/50 px-4 py-3 text-sm text-red-300">
          ✗ {error}
        </div>
      )}
    </div>
  );
}
