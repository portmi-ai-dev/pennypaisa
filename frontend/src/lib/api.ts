const RAW_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
const NORMALIZED_BASE = RAW_BASE ? RAW_BASE.replace(/\/+$/, '') : '';

export const API_BASE_URL = NORMALIZED_BASE;

export function apiUrl(path: string): string {
  if (!NORMALIZED_BASE) return path;
  if (!path.startsWith('/')) return `${NORMALIZED_BASE}/${path}`;
  return `${NORMALIZED_BASE}${path}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
