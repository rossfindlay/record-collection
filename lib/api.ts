export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, init);
}
