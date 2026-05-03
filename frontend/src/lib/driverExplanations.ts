// Plain-English explanations of every bullish/bearish driver shown on the
// Intelligence page. Surfaces in the right-side Explainer panel when the
// user hovers a driver pill.
//
// Keys are matched against driver `text` via a normalisation pass — see
// `getExplanation()` below — so editing a driver's text in
// `IntelligencePage.tsx` doesn't break the lookup as long as the keyword
// (e.g. "halving", "supply deficit") still appears.

export interface DriverExplanation {
  /** What this driver actually means in plain English. 2–4 sentences. */
  meaning: string;
  /** Optional historical example or analogy that makes the concept concrete. */
  example?: string;
}

// Each entry's KEY is a lowercase substring searched in the driver text.
const TABLE: Array<[string, DriverExplanation]> = [
  // ─── GOLD ──────────────────────────────────────────────────────────────
  ['cyclic ath', {
    meaning:
      'Gold tends to print all-time highs in roughly 15-year waves. Each ' +
      'cycle starts with a multi-year breakout, a parabolic peak, then a ' +
      'long consolidation. The 2011 peak ($1,920) and 2020 peak ($2,075) ' +
      'fit that pattern; the 2026 ATH is the third wave in the same series.',
    example:
      'Once a prior peak is taken out, it usually flips from resistance into ' +
      'long-term support — the floor for the next cycle.',
  }],
  ['war', {
    meaning:
      'When investors get scared about wars, sanctions, or sovereign-debt ' +
      'crises, they buy gold as the oldest "no-counterparty" reserve asset. ' +
      'The risk premium can add hundreds of dollars per ounce in a matter ' +
      'of weeks.',
    example:
      'The 2022 Ukraine invasion added ~$200/oz to gold within a month; the ' +
      'risk premium decays only when the underlying conflict de-escalates.',
  }],
  ['inflation hedge', {
    meaning:
      'Gold preserves purchasing power as fiat currencies get debased. ' +
      'When real yields (interest rates minus inflation) are negative, ' +
      'cash loses value year over year — investors rotate into gold to ' +
      'protect savings without paying the carry cost of holding cash.',
    example:
      'During 2020-22, US 10-year real yields hit −1%; gold rallied 35% ' +
      'in that window even as nominal rates rose.',
  }],
  // De-dollarization is treated as a separate driver from inflation hedging.
  // Same direction (bullish for gold) but a different mechanism — sovereign
  // FX-reserve flows, not retail or institutional inflation protection.
  ['de-dollar', {
    meaning:
      'Foreign central banks (BRICS+, plus much of the Global South) are ' +
      'rotating their FX reserves out of US Treasuries and into gold. They ' +
      'do this to reduce dependence on the dollar system after watching ' +
      'sanctions freeze Russian reserves in 2022. Sovereign gold demand is ' +
      'price-insensitive and almost never reverses.',
    example:
      'USD share of global FX reserves has fallen from 73% (2000) to ~58% ' +
      '(2025); much of the difference has gone into gold (China, India, ' +
      'Turkey, Poland leading the bid).',
  }],
  ['central bank', {
    meaning:
      'Central banks (China, India, Turkey, Poland) have been net buyers of ' +
      'gold at record pace since 2022 — over 1,000 tonnes per year for four ' +
      'consecutive years. Sovereign demand is sticky and price-insensitive.',
    example:
      'In 2024, central banks bought 1,045 tonnes — roughly 1/3 of all ' +
      'annual mine supply. They almost never sell.',
  }],
  ['weak us dollar', {
    meaning:
      'Gold is priced in dollars. When the DXY (USD index) falls, gold ' +
      'mechanically rises and vice versa — pure inverse correlation. A ' +
      'weakening dollar provides a constant tailwind regardless of any ' +
      'other narrative.',
  }],
  ['prolonged consolidation', {
    meaning:
      'After major rallies, gold can sit in a tight range for years (e.g. ' +
      '2013-2019). Long sideways action drains conviction and rotates ' +
      'attention to flashier assets.',
  }],
  ['strong us dollar', {
    meaning:
      'Inverse of the weak-USD tailwind. A bid for the dollar — typically ' +
      'driven by Fed hawkishness or risk-off — usually means a drag on ' +
      'gold.',
  }],
  ['risk-on capital', {
    meaning:
      'When stocks and crypto are in clear uptrends, capital leaves gold ' +
      'for higher-beta plays. Gold becomes the "boring asset" nobody wants.',
  }],
  ['rising interest rates', {
    meaning:
      'Higher real yields (rates minus inflation) increase the opportunity ' +
      'cost of holding gold, which has zero coupon. Bonds become more ' +
      'attractive than gold for safe-haven allocation.',
  }],
  ['cooling inflation', {
    meaning:
      'If headline inflation falls back toward target, the inflation-hedge ' +
      'thesis weakens. One of gold\'s main bid sources (real-rates fear) ' +
      'goes away.',
    example: 'US CPI has cooled from 9.0% (Jun 2022) to ~2.4% — a major shift.',
  }],

  // ─── SILVER ────────────────────────────────────────────────────────────
  ['supply deficit', {
    meaning:
      'Silver is in its 5th consecutive year of demand exceeding mine ' +
      'supply. Above-ground inventories at the COMEX and LBMA are being ' +
      'drawn down — a structural setup that historically precedes price ' +
      'breakouts.',
    example:
      'The Silver Institute reports a 140 Moz deficit in 2025 — about ' +
      '4 months of global mine output.',
  }],
  ['ai', {
    meaning:
      'Servers need silver in PCB trace materials, switches, high-end ' +
      'capacitors, and connectors. Hyperscale AI buildouts (OpenAI, xAI, ' +
      'Microsoft) are consuming significantly more silver per gigawatt ' +
      'than traditional data centres.',
    example:
      'Goldman Sachs projects silver demand from data centres to grow 50% ' +
      'by 2027.',
  }],
  ['solar', {
    meaning:
      'Solar panels use ~20g of silver each (paste contacts). Global solar ' +
      'installs hit 520 GW in 2025 — a single industry source of 250+ Moz ' +
      'per year, equal to ~1/3 of total annual silver demand.',
    example:
      'EV-battery silver demand adds another 50-80 Moz/year on top — both ' +
      'industries are price-inelastic buyers.',
  }],
  ['follows gold', {
    meaning:
      'Silver is gold\'s high-beta cousin. It typically lags gold by 3-9 ' +
      'months but moves 1.5-2.5x as much in either direction. When gold ' +
      'rallies hard, silver eventually catches up — sometimes violently.',
    example:
      'In 2010-11, gold rose 70%; silver rose 250% in the same window. The ' +
      'lag dynamic is documented across every major gold bull cycle.',
  }],
  ['dual store', {
    meaning:
      'Silver has two demand pillars: monetary (like gold) and industrial ' +
      '(unlike gold). When either pillar is firing, silver gets a bid; ' +
      'when both fire at once, it goes parabolic.',
  }],
  ['profit-taking', {
    meaning:
      'Silver tends to spike then crash 40-60% in weeks. Late-cycle ' +
      'entrants who chase the parabolic move usually get marked down hard ' +
      'within months.',
    example:
      'In 2011, silver hit $50, then fell to $26 within 8 months — a ~50% ' +
      'drawdown from peak.',
  }],
  ['narrative exaggeration', {
    meaning:
      'When "silver squeeze" or similar narratives go viral on social ' +
      'media, the rally is usually near exhaustion. Retail FOMO is a ' +
      'late-cycle sentiment indicator.',
  }],
  ['gold consolidation', {
    meaning:
      'If gold goes sideways, silver loses its lead-from-the-top dynamic ' +
      'and just drifts. Silver almost never sustains a rally without gold ' +
      'leading.',
  }],
  ['high volatility', {
    meaning:
      'Silver\'s beta to gold is ~2.5x — it cuts both ways. Drawdowns are ' +
      'amplified, so silver is unsuitable as a low-volatility safe-haven ' +
      'allocation despite its monetary properties.',
  }],
  ['industrial slowdown', {
    meaning:
      'Recession scenarios cut industrial silver demand (which is over 50% ' +
      'of total usage), counteracting the monetary bid. A hard landing ' +
      'would be especially painful for silver.',
  }],

  // ─── BITCOIN ───────────────────────────────────────────────────────────
  ['halving', {
    meaning:
      'Bitcoin\'s mining reward halves every 4 years (last in April 2024). ' +
      'Reduced new supply combined with continued demand has historically ' +
      'driven 10-100x rallies in the 12-18 months following each halving.',
    example:
      'Post-2012 halving: $12 → $1,150 (~95x). Post-2016: $650 → $19,500 ' +
      '(~30x). Post-2020: $8,800 → $69,000 (~7.8x). Post-2024 cycle is ' +
      'still in expansion.',
  }],
  ['fed rate', {
    meaning:
      'BTC trades like a long-duration risk asset. When central banks ease ' +
      'and global money supply (M2) grows, the BTC tailwind is mechanical: ' +
      'more dollars chasing a fixed supply of 21M coins.',
  }],
  ['m2', {
    meaning:
      'Global M2 (total money supply) is the cleanest macro driver of BTC. ' +
      'Bitcoin price has tracked M2 with a ~10-12 week lag for the past ' +
      'decade. Rising M2 = rising BTC, with delay.',
  }],
  ['institutional', {
    meaning:
      'Spot Bitcoin ETFs launched in January 2024 and have absorbed over ' +
      '$100B in record time. Wall Street wrappers represent sticky ' +
      'long-term capital — pension funds and RIAs that buy and hold ' +
      'through cycles.',
    example: 'BlackRock IBIT alone holds $52B in BTC — the fastest-growing ETF in history.',
  }],
  ['government treasury', {
    meaning:
      'The US Strategic Bitcoin Reserve (announced 2025, holds 207,189 ' +
      'BTC) and other sovereign buyers create a price-insensitive bid ' +
      'floor. Once a government holds an asset, it almost never sells — ' +
      'the supply is permanently locked.',
  }],
  ['strategic', {
    meaning:
      'Sovereign accumulation removes coin from circulation permanently. ' +
      'Combined with the ETF wrappers and lost coins, "available" supply ' +
      'is a tiny fraction of nominal 21M.',
  }],
  ['falling dxy', {
    meaning:
      'Dollar weakness historically correlates with BTC strength — BTC is ' +
      'a USD-denominated, non-sovereign asset that benefits from any flight ' +
      'from fiat debasement.',
  }],
  ['drawdown', {
    meaning:
      'Every prior BTC cycle has seen a 70-85% drawdown from the cycle ' +
      'peak. Risk grows as the cycle extends — at any point in an aging ' +
      'bull, the next 12 months could deliver a -75% scenario.',
    example:
      '2017→2018: $20K → $3K (-85%). 2021→2022: $69K → $16K (-77%). ' +
      'The pattern is the rule, not the exception.',
  }],
  ['fud', {
    meaning:
      'Macro shocks (rate scares, credit events, tariff news) hit BTC ' +
      'harder than other risk assets due to thin order books and 24/7 ' +
      'trading. BTC often becomes the first asset sold in a global ' +
      'liquidation.',
  }],
  ['macro shock', {
    meaning:
      'Same as FUD risk — sudden macro events trigger forced selling in ' +
      'BTC because it\'s the most liquid asset that trades on weekends.',
  }],
  ['hawkish', {
    meaning:
      'If the Fed pivots back to tightening (raising rates, shrinking the ' +
      'balance sheet), the long-duration risk premium that BTC enjoys ' +
      'evaporates. Higher real yields are kryptonite for BTC.',
  }],
  ['government crackdown', {
    meaning:
      'Hostile regulation in major jurisdictions (US, EU, China) is the ' +
      'tail risk that never fully disappears. A coordinated international ' +
      'crackdown remains a low-probability but high-impact scenario.',
  }],
  ['quantum computing', {
    meaning:
      'Far-future risk: practical quantum computers (10+ years out) could ' +
      'break the elliptic-curve signatures that secure BTC addresses. The ' +
      'community would need a hard-fork to a post-quantum scheme.',
  }],
];

const FALLBACK: DriverExplanation = {
  meaning:
    'No detailed explanation written for this driver yet. Hover the pill ' +
    'for the short live-state tooltip.',
};

/** Look up the explanation for a driver by its display text. */
export function getExplanation(driverText: string): DriverExplanation {
  const t = driverText.toLowerCase();
  for (const [needle, exp] of TABLE) {
    if (t.includes(needle)) return exp;
  }
  return FALLBACK;
}
