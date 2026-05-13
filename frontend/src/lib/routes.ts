// Internal page identifier — used by AppShell to decide which page is mounted
// in the visible slot via display:block/none. Distinct from the URL so the
// shell never has to do path-string compares mid-render.
export type PageId = 'landing' | 'intelligence' | 'flow' | 'chat';

// URL → page id. The app now lives at the root of app.ourdomain.com, so
// product surfaces map directly to top-level routes.
export const PATH_TO_PAGE: Record<string, PageId> = {
  '/asset': 'landing',
  '/intel': 'intelligence',
  '/capflow': 'flow',
  '/smart_asset': 'chat',
};
