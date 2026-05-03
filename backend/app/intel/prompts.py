"""Analyst-grade prompt builders for each tracked asset.

The prompts are engineered to produce institutional-style market intelligence
rather than surface-level sentiment. Each builder frames the task as a
multi-dimensional analyst brief:

* Macro / cycle context specific to the asset
* Technical structure (trend, key levels, momentum)
* Fundamentals unique to the asset (central-bank flows for gold, industrial
  demand for silver, on-chain + ETF flows for Bitcoin)
* Analyst view — a single fused institutional take blending macro/cycle context
  with technical structure, so the output reads like one coherent desk brief.

Price context is always injected so the model reasons about *current* levels
rather than stale training data.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

Asset = Literal["gold", "silver", "crypto"]


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def today_str() -> str:
    """Return today's date formatted for prompts."""
    return datetime.now().strftime("%B %d, %Y")


def _fmt(value: Any, digits: int = 2) -> str:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return "—"
    return f"{num:,.{digits}f}"


def _pct(value: Any) -> str:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return "—"
    return f"{num:+.2f}%"


def format_price_context(prices: dict[str, Any] | None, asset: Asset) -> str:
    """Return an asset-specific live price snapshot for prompt injection."""
    if not prices:
        return "Live price snapshot unavailable — reason from the most recent public data."

    gold = _fmt(prices.get("gold"))
    silver = _fmt(prices.get("silver"))
    btc = _fmt(prices.get("btc"), 0)

    if asset == "gold":
        return (
            "LIVE GOLD SNAPSHOT — "
            f"Spot ${gold} | 24h {_pct(prices.get('goldChangePercent'))} | "
            f"Weekly {_pct(prices.get('goldWeeklyChangePercent'))} | "
            f"Au:Ag ratio {_fmt(prices.get('gold', 0) / max(prices.get('silver', 0) or 1, 1), 1)}. "
            "Anchor ALL reasoning to these exact numbers — do not invent different prices."
        )
    if asset == "silver":
        return (
            "LIVE SILVER SNAPSHOT — "
            f"Spot ${silver} | 24h {_pct(prices.get('silverChangePercent'))} | "
            f"Weekly {_pct(prices.get('silverWeeklyChangePercent'))} | "
            f"Au:Ag ratio {_fmt(prices.get('gold', 0) / max(prices.get('silver', 0) or 1, 1), 1)}. "
            "Anchor ALL reasoning to these exact numbers — do not invent different prices."
        )

    # crypto
    return (
        "LIVE BITCOIN SNAPSHOT — "
        f"Spot ${btc} | 24h {_pct(prices.get('btcChangePercent'))} | "
        f"Weekly {_pct(prices.get('btcWeeklyChangePercent'))} | "
        f"Dominance {_fmt(prices.get('btcDominance'), 1)}% | "
        f"Market Cap ${_fmt(prices.get('btcMarketCap'), 0)} | "
        f"24h Volume ${_fmt(prices.get('btcVolume24h'), 0)}. "
        "Anchor ALL reasoning to these exact numbers — do not invent different prices."
    )


# ---------------------------------------------------------------------------
# Schema contract — kept in sync with AssetSentiment in app.models.intel
# ---------------------------------------------------------------------------

_SCHEMA_SPEC = """Respond with pure JSON (no markdown, no prose, no code fences) matching exactly this schema:

{
  "marketType": "bull" | "bear" | "neutral",
  "confidence": "low" | "medium" | "high",
  "horizon": "short-term" | "medium-term" | "long-term",
  "reasoning": "<=35 word thesis synthesising macro + technical + flows. No hedging filler.",
  "analystView": "<=55 word institutional analyst take fusing macro/cycle context (cycle position, key moving averages, risk-on/off) with precise technical structure (levels, patterns, targets, invalidations).",
  "technicalSignal": "<=20 word read on trend + momentum + nearest level to watch.",
  "macroContext": "<=25 word description of the dominant macro driver right now (Fed, DXY, liquidity, geopolitics).",
  "keyLevels": { "support": "<nearest major support>", "resistance": "<nearest major resistance>" },
  "catalysts": ["<=3 near-term bullish or neutral catalysts, each <=12 words>"],
  "risks": ["<=3 concrete downside risks, each <=12 words>"]
}

Hard rules:
- Output JSON ONLY. No commentary before or after.
- Do not invent prices that contradict the LIVE SNAPSHOT above.
- `confidence` reflects signal alignment: high = macro+technical+flows agree; medium = mixed; low = conflicting.
- Lists must have at least 1 item. Keep every string tight and specific — no generic fluff."""


# ---------------------------------------------------------------------------
# Per-asset analyst framings
# ---------------------------------------------------------------------------


def _gold_analysis_frame() -> str:
    return (
        "You are a precious-metals desk analyst producing an institutional-grade brief on GOLD (XAU/USD).\n"
        "Weigh the following drivers explicitly:\n"
        "  • Macro: DXY trajectory, real yields (10Y TIPS), Fed path, global liquidity, fiscal deficits.\n"
        "  • Central bank demand: PBoC/RBI/CBR accumulation pace, de-dollarisation flows, BRICS+ reserves.\n"
        "  • Geopolitics: active conflicts, sanctions regime, safe-haven bid.\n"
        "  • Technical: weekly trend, 20/50-week SMA, key breakout/retest zones, Au:Ag ratio context.\n"
        "  • Flows: COMEX positioning, ETF holdings (GLD), physical premiums in key regions.\n"
    )


def _silver_analysis_frame() -> str:
    return (
        "You are a precious-metals desk analyst producing an institutional-grade brief on SILVER (XAG/USD).\n"
        "Weigh the following drivers explicitly:\n"
        "  • Structural: Silver Institute deficit, mine supply, recycling, above-ground stocks.\n"
        "  • Industrial demand: solar (PV paste), EV/electronics, AI/data-centre wiring.\n"
        "  • Monetary leg: correlation with gold, Au:Ag ratio (mean-reversion signal), DXY.\n"
        "  • Technical: multi-year cup-and-handle, key breakout levels, volatility regime (silver beta vs gold).\n"
        "  • Flows: SLV holdings, LBMA vaulted stocks, retail premiums.\n"
    )


def _crypto_analysis_frame() -> str:
    return (
        "You are a crypto market strategist producing an institutional-grade brief on BITCOIN (BTC/USD).\n"
        "Weigh the following drivers explicitly:\n"
        "  • Cycle: post-halving phase, historical cycle analogs, 4-year seasonality.\n"
        "  • On-chain: realised price, MVRV, LTH/STH cost basis, exchange reserves, miner behaviour.\n"
        "  • Flows: US spot ETF net flows, CME OI/funding, stablecoin supply, corporate/sovereign treasury buys.\n"
        "  • Macro: DXY, global M2, Fed liquidity, risk-asset correlation (NDX, gold).\n"
        "  • Technical: weekly trend, bull-market support band (20W/21W EMA), key range extremes, dominance structure.\n"
    )


_FRAMES = {
    "gold": _gold_analysis_frame,
    "silver": _silver_analysis_frame,
    "crypto": _crypto_analysis_frame,
}


def build_prompt(asset: Asset, prices: dict[str, Any] | None = None) -> str:
    """Build the full analyst prompt for the given asset."""
    today = today_str()
    frame = _FRAMES[asset]()
    price_ctx = format_price_context(prices, asset)

    return (
        f"{frame}\n"
        f"DATE: {today}. Use only information valid as of today — no stale narratives.\n"
        f"{price_ctx}\n\n"
        "Synthesise current macro/cycle reasoning (Benjamin-Cowen-style frameworks) with precise "
        "technical structure (Gareth-Soloway-style level work) into ONE fused analyst view. Do NOT "
        "attribute or quote — produce a single coherent institutional take.\n\n"
        f"{_SCHEMA_SPEC}"
    )
