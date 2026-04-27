// Internal page identifier — used by AppShell to decide which page is mounted
// in the visible slot via display:block/none. Distinct from the URL so the
// shell never has to do path-string compares mid-render.
export type PageId = 'landing' | 'intelligence' | 'flow' | 'chat';

// URL → page id. The four product surfaces all live under the /app namespace
// so additional top-level routes (/login, /pricing, /blog, …) won't collide.
export const PATH_TO_PAGE: Record<string, PageId> = {
  '/app/asset': 'landing',
  '/app/intel': 'intelligence',
  '/app/capflow': 'flow',
  '/app/smart_asset': 'chat',
};
