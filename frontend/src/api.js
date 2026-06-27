const BASE = import.meta.env.VITE_API_URL ?? "";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text);
  }
  return res.json();
}

export const fetchStats = () => request("/api/stats");

export const fetchIncidents = (page = 1, pageSize = 20) =>
  request(`/api/incidents?page=${page}&page_size=${pageSize}`);

export const fetchIncident = (id) => request(`/api/incidents/${id}`);

export const triggerFix = (errorText, repoUrl, baseBranch = "main") =>
  request("/api/trigger", {
    method: "POST",
    body: JSON.stringify({ error_text: errorText, repo_url: repoUrl, base_branch: baseBranch }),
  });
