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
    <section
      className="rounded-xl bg-gray-900 p-6 shadow-lg"
      aria-label="Manual trigger"
    >
      <h2 className="mb-4 text-lg font-semibold text-white">Manual Trigger</h2>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="error-text"
            className="mb-1 block text-sm font-medium text-gray-400"
          >
            Error / Stack Trace
            <span className="ml-2 text-xs font-normal text-gray-500">
              — must start with "Traceback (most recent call last):"
            </span>
          </label>
          <textarea
            id="error-text"
            value={errorText}
            onChange={(e) => setErrorText(e.target.value)}
            required
            rows={6}
            placeholder={`Traceback (most recent call last):\n  File "buggy_math.py", line 2, in add\n    result = a + b\nAssertionError: assert -1 == 5`}
            className="w-full rounded-lg bg-gray-800 px-3 py-2.5 font-mono text-sm text-white placeholder-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="repo-url"
              className="mb-1 block text-sm font-medium text-gray-400"
            >
              Repo URL
            </label>
            <input
              id="repo-url"
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              required
              placeholder="https://github.com/org/repo"
              className="w-full rounded-lg bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="base-branch"
              className="mb-1 block text-sm font-medium text-gray-400"
            >
              Base Branch
            </label>
            <input
              id="base-branch"
              type="text"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded-lg bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 min-h-[48px]"
        >
          {loading ? "Queuing…" : "⚡ Run Hermes Fix"}
        </button>
      </form>

      {result && (
        <div
          className="mt-4 rounded-lg bg-emerald-900/50 px-4 py-3 text-sm text-emerald-300"
          role="status"
          aria-live="polite"
        >
          ✓ Incident{" "}
          <code className="font-mono">{result.incident_id.slice(0, 8)}</code>{" "}
          created — {result.message}
        </div>
      )}
      {error && (
        <div
          className="mt-4 rounded-lg bg-red-900/50 px-4 py-3 text-sm text-red-300"
          role="alert"
          aria-live="assertive"
        >
          ✗ {error}
        </div>
      )}
    </section>
  );
}
