// LOGAN Vercel tools — thin Vercel REST API client.
//
// Plain `fetch` (NOT z-ai-web-dev-sdk — Vercel tools are deterministic API
// calls, not LLM tasks). The token is a Vercel API token with full project +
// deploy scope for the team (or personal account).
//
// Team slug is configured via VERCEL_TEAM_SLUG. If present, all API calls
// carry `?teamId=...` (resolved from the slug via /v2/teams). If absent,
// we fall back to the personal account of the token.
//
// CRITICAL: we NEVER include the token in error messages or logs. All error
// surfaces are scrubbed to status + sanitized body. See `vercelFetch`.

const VERCEL_API = "https://api.vercel.com";

let cachedTeamId: string | null | undefined;

/**
 * Returns the configured Vercel team slug (defaults to "" — personal account).
 */
export function getTeamSlug(): string {
  return (process.env.VERCEL_TEAM_SLUG || "").trim();
}

/**
 * Resolves the teamId for the configured team slug. Caches the result for
 * the lifetime of the process. Returns "" for personal accounts (no team).
 *
 * IMPORTANT: this function uses raw `fetch` directly (NOT `vercelFetch`) so it
 * doesn't trigger the teamId lookup recursion (vercelFetch → getTeamId →
 * vercelFetch → ...).
 *
 * If the slug is set but resolution fails, throws a sanitized error.
 */
export async function getTeamId(): Promise<string> {
  if (cachedTeamId !== undefined) return cachedTeamId ?? "";
  const slug = getTeamSlug();
  if (!slug) {
    cachedTeamId = null;
    return "";
  }
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN no configurado");

  // Raw fetch — bypasses the vercelFetch wrapper to avoid recursion.
  const res = await fetch(`${VERCEL_API}/v2/teams?slug=${encodeURIComponent(slug)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: { message?: string } | string };
      const e = body?.error;
      if (typeof e === "string" && e.length > 0) msg = e;
      else if (e && typeof e === "object" && e.message) msg = e.message;
    } catch {
      // ignore
    }
    throw new Error(`Vercel API ${res.status} al resolver el team "${slug}": ${msg}`);
  }
  // Vercel returns EITHER:
  //   - { id, slug, name, ... } (top-level team object) when `?slug=` matches, OR
  //   - { teams: [...] } (full list) when no slug filter is applied.
  // We handle both shapes for safety.
  const body = (await res.json()) as
    | { id?: string; slug?: string; team?: { id?: string }; teams?: Array<{ id: string; slug: string }> };
  let teamId = "";
  if (body?.id && typeof body.slug === "string") teamId = body.id; // top-level
  else if (body?.team?.id) teamId = body.team.id;
  else if (Array.isArray(body?.teams)) {
    const match = body.teams.find((t) => t.slug === slug);
    if (match) teamId = match.id;
  }
  if (!teamId) {
    throw new Error(`No se encontró el equipo de Vercel con slug "${slug}".`);
  }
  cachedTeamId = teamId;
  return teamId;
}

/**
 * Wrapper around fetch for the Vercel REST API. Adds Authorization + Content-Type
 * headers and the teamId query param (when configured). Returns parsed JSON.
 * Throws on non-2xx with a sanitized message (NEVER includes the token).
 *
 * Path is the part AFTER https://api.vercel.com (e.g. "/v10/projects").
 *
 * Team-scope resolution: if the configured VERCEL_TEAM_SLUG matches a team,
 * `?teamId=...` is appended to every call EXCEPT the team-resolution call
 * itself (which is handled inside `getTeamId` with raw fetch).
 */
export async function vercelFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error("VERCEL_TOKEN no configurado");
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // Inject the teamId query param if a team slug is configured.
  // /v2/user and /v2/teams are personal-account endpoints — they don't take teamId.
  let finalPath = path;
  const isPersonalEndpoint =
    path.startsWith("/v2/user") || path.startsWith("/v2/teams");
  if (!isPersonalEndpoint) {
    const teamId = await getTeamId();
    if (teamId) {
      const sep = path.includes("?") ? "&" : "?";
      finalPath = `${path}${sep}teamId=${encodeURIComponent(teamId)}`;
    }
  }

  const res = await fetch(`${VERCEL_API}${finalPath}`, { ...options, headers });
  if (!res.ok) {
    let errMessage = res.statusText;
    try {
      const errBody = (await res.json()) as { error?: { message?: string } | string; message?: string };
      // Vercel errors look like { error: { message: "..." } } OR { error: "..." }.
      const e = errBody?.error;
      if (typeof e === "string" && e.length > 0) errMessage = e;
      else if (e && typeof e === "object" && e.message) errMessage = e.message;
      else if (errBody?.message) errMessage = errBody.message;
    } catch {
      // ignore JSON parse errors — fall back to statusText
    }
    // Never include the token in error messages.
    throw new Error(`Vercel API ${res.status}: ${errMessage}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
