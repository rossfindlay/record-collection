/**
 * Base URL for the Railway-hosted API server.
 * Set via NEXT_PUBLIC_API_URL (e.g. https://record-collection-api.up.railway.app).
 * Defaults to http://localhost:8080 in local dev.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * Wrapper around fetch() that prefixes the API base URL and includes
 * credentials so the session cookie travels cross-origin.
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
  });
}
