/**
 * Base URL for an optional external API server (e.g. Railway).
 * When unset, requests use relative URLs and hit the Next.js API routes.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    ...(API_BASE_URL ? { credentials: "include" as const } : {}),
  });
}
