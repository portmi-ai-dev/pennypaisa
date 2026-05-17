// Shared API client with debug logging.
//
// In dev, every request + response is logged to the browser console under
// the [API] prefix so you can trace what the UI is asking for and what came
// back. Enable verbose body logging by setting `VITE_API_DEBUG_BODIES=1`.

const RAW_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
const NORMALIZED_BASE = RAW_BASE ? RAW_BASE.replace(/\/+$/, '') : '';
const DEBUG_BODIES = import.meta.env.VITE_API_DEBUG_BODIES === '1';
const IS_DEV = import.meta.env.DEV;

export const API_BASE_URL = NORMALIZED_BASE;

export function apiUrl(path: string): string {
  if (!NORMALIZED_BASE) return path;
  if (!path.startsWith('/')) return `${NORMALIZED_BASE}/${path}`;
  return `${NORMALIZED_BASE}${path}`;
}

let _rid = 0;
function nextRid(): string {
  _rid = (_rid + 1) % 0xffffff;
  return _rid.toString(16).padStart(6, '0');
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = apiUrl(path);
  const method = init?.method ?? 'GET';
  const rid = nextRid();
  const t0 = performance.now();

  if (IS_DEV) {
    // eslint-disable-next-line no-console
    console.debug(`[API ${rid}] → ${method} ${url}`);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    const elapsed = (performance.now() - t0).toFixed(1);
    // eslint-disable-next-line no-console
    console.error(`[API ${rid}] ✗ ${method} ${url} network-error elapsed=${elapsed}ms`, err);
    throw err;
  }

  const elapsed = (performance.now() - t0).toFixed(1);
  const tag = response.ok ? '✓' : '✗';
  const logFn = response.ok ? console.debug : console.warn;
  // eslint-disable-next-line no-console
  logFn(
    `[API ${rid}] ${tag} ${method} ${url} status=${response.status} elapsed=${elapsed}ms`,
  );

  if (DEBUG_BODIES && IS_DEV) {
    try {
      const clone = response.clone();
      const text = await clone.text();
      // eslint-disable-next-line no-console
      console.debug(`[API ${rid}] body:`, text.slice(0, 500));
    } catch {
      /* ignore body log errors */
    }
  }

  return response;
}
