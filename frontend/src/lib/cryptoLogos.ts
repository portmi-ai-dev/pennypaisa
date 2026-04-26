// Brand-accurate crypto logos for the Capital Flow visualisation.
//
// Encoded as inline SVG → URL-encoded data URLs. The Capital Flow canvas
// pre-loads each as an HTMLImageElement in a useEffect and draws them via
// ctx.drawImage on the asset bubble. We use SVG rather than PNG so:
//   • zero network requests at runtime (data URLs are inline)
//   • crisp at any DPR — drawImage scales the vector source
//   • brand colours are guaranteed correct
//   • file size is tiny (~1-2 KB total)
//
// Paths come from the official open-source SVGs (cryptologos.cc / each
// project's brand kit), trimmed to a 32×32 viewBox so they all drop in at the
// same size with no per-asset scaling math.

const BTC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path fill="#fff" d="M23.05 13.71c.32-2.13-1.3-3.27-3.51-4.04l.72-2.87-1.75-.44-.7 2.79c-.46-.11-.93-.22-1.4-.33l.7-2.81-1.75-.43-.72 2.86c-.38-.09-.75-.17-1.11-.26v-.01l-2.41-.6-.46 1.86s1.3.3 1.27.32c.71.18.83.65.81 1.02l-.81 3.27c.05.01.11.03.18.06l-.18-.05-1.14 4.58c-.09.21-.3.54-.81.41.02.02-1.27-.32-1.27-.32l-.86 2 2.27.57c.42.11.83.22 1.24.32l-.73 2.9 1.75.43.72-2.87c.48.13.94.25 1.39.36l-.71 2.85 1.75.44.73-2.89c2.99.57 5.23.34 6.18-2.36.76-2.18-.04-3.43-1.61-4.25 1.14-.27 2.01-1.02 2.24-2.59zm-4 5.62c-.54 2.18-4.21 1-5.4.71l.97-3.85c1.18.29 5 .87 4.43 3.14zm.55-5.65c-.49 1.98-3.55.97-4.55.72l.88-3.5c.99.25 4.18.71 3.66 2.78z"/></svg>`;

const ETH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#627EEA"/><g fill="#fff" fill-rule="nonzero"><path fill-opacity=".602" d="M16.498 4v8.87l7.497 3.35z"/><path d="M16.498 4 9 16.22l7.498-3.35z"/><path fill-opacity=".602" d="M16.498 21.968v6.027L24 17.616z"/><path d="M16.498 27.995v-6.028L9 17.616z"/><path fill-opacity=".2" d="m16.498 20.573 7.497-4.353-7.497-3.348z"/><path fill-opacity=".602" d="m9 16.22 7.498 4.353v-7.701z"/></g></svg>`;

const USDT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#26A17B"/><path fill="#fff" d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117"/></svg>`;

// Solana: solid black circle background + 3 brand-coloured parallelogram bars.
// We render each bar in a different brand colour rather than using a true
// linearGradient so the SVG-as-image path renders identically across every
// browser canvas implementation (some don't honour <linearGradient> when an
// SVG is loaded into an HTMLImageElement and drawn to a canvas).
const SOL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#0c0c14"/><path fill="#9945FF" d="M7.4 21.65a.5.5 0 0 1 .35-.15h15.6c.32 0 .48.39.25.61l-2.78 2.79a.5.5 0 0 1-.35.15H4.87c-.32 0-.48-.39-.25-.61z"/><path fill="#19FB9B" d="M7.4 7.13a.5.5 0 0 1 .35-.15h15.6c.32 0 .48.39.25.61L20.82 10.4a.5.5 0 0 1-.35.15H4.87c-.32 0-.48-.39-.25-.61z"/><path fill="#14F195" d="M20.82 14.34a.5.5 0 0 0-.35-.15H4.87c-.32 0-.48.39-.25.61l2.78 2.78a.5.5 0 0 0 .35.15h15.6c.32 0 .48-.39.25-.61z"/></svg>`;

const toUrl = (svg: string): string =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

/**
 * Map of asset id → data-URL SVG logo. The Capital Flow page pre-loads each
 * one into an HTMLImageElement on mount. Add new assets by appending here.
 */
export const CRYPTO_LOGOS: Record<string, string> = {
  btc:  toUrl(BTC_SVG),
  eth:  toUrl(ETH_SVG),
  usdt: toUrl(USDT_SVG),
  sol:  toUrl(SOL_SVG),
};
