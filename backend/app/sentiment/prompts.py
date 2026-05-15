"""Transcript-driven prompt builders for each tracked asset.

Generates market sentiment from YouTube analyst transcripts only.
Transcripts come from Benjamin Cowen and Gareth Soloway channels.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
import logging

Asset = Literal["gold", "silver", "crypto"]

logger = logging.getLogger(__name__)


def today_str() -> str:
    return datetime.now().strftime("%B %d, %Y")


# ---------------------------------------------------------------------------
# Per-asset signal definitions — explicit whitelist + blacklist to stop
# cross-asset contamination. The LLM is told exactly what counts as a signal
# for each asset and what to ignore.
# ---------------------------------------------------------------------------

_GOLD_SIGNALS = """SIGNALS THAT APPLY TO GOLD (use these):
  ✓ Direct gold mentions (price, target, support, resistance, "yellow metal", XAU)
  ✓ DXY / US Dollar trajectory (inverse correlation with gold)
  ✓ Real yields (10Y TIPS) — falling real yields = bullish gold
  ✓ Inflation (CPI, PPI) — high/rising inflation = bullish gold
  ✓ Fed rate cuts/dovish pivot = bullish gold
  ✓ Geopolitical conflict, war, sanctions = bullish gold (safe haven)
  ✓ Central bank gold buying = bullish gold
  ✓ Fiscal deficits, currency debasement = bullish gold
  ✓ Gold-silver ratio discussion (Au:Ag)

SIGNALS THAT DO NOT APPLY TO GOLD (ignore):
  ✗ Bitcoin price action, BTC dominance, crypto cycle position
  ✗ Equity rotation, S&P 500 levels, sector performance
  ✗ Stock market valuation, P/E ratios
  ✗ Crypto on-chain metrics, halving cycle
"""

_SILVER_SIGNALS = """SIGNALS THAT APPLY TO SILVER (use these):
  ✓ Direct silver mentions (price, target, support, resistance, XAG)
  ✓ Gold-silver ratio (Au:Ag) — high ratio = silver cheap, mean reversion bullish silver
  ✓ Gold's direction (silver follows gold but with higher beta)
  ✓ DXY / US Dollar trajectory (inverse correlation)
  ✓ Real yields, inflation (similar to gold)
  ✓ Industrial demand (solar, EV, electronics, AI infrastructure) — bullish silver
  ✓ Supply deficit / Silver Institute data
  ✓ Fed pivot, geopolitics (similar to gold but amplified)

SIGNALS THAT DO NOT APPLY TO SILVER (ignore):
  ✗ Bitcoin price action, BTC dominance, crypto cycle position
  ✗ Equity rotation, individual stock moves
  ✗ Crypto on-chain metrics
"""

_CRYPTO_SIGNALS = """SIGNALS THAT APPLY TO BITCOIN/CRYPTO (use these):
  ✓ Direct BTC/crypto mentions (price, target, support, resistance)
  ✓ BTC dominance, alt season indicators
  ✓ Halving cycle position, post-halving analogs
  ✓ On-chain metrics (MVRV, realised price, LTH/STH, exchange reserves)
  ✓ Spot ETF flows, institutional adoption
  ✓ Global liquidity / M2 expansion = bullish BTC
  ✓ Risk-on/risk-off sentiment, correlation with NDX
  ✓ Stablecoin supply growth = bullish BTC
  ✓ Bull market support band (20W/21W EMA)

SIGNALS THAT DO NOT APPLY TO CRYPTO (ignore):
  ✗ Gold safe-haven flows, central bank gold buying
  ✗ Silver industrial demand
  ✗ Precious metals specific discussion
"""


_SCHEMA_SPEC = """OUTPUT FORMAT — pure JSON, no markdown, no code fences:

{
  "consensus": "bull" | "bear" | "neutral",
  "nearTermView": "<string>",
  "longTermView": "<string>",
  "confidence": "low" | "medium" | "high"
}

WRITING RULES:
- Write as YOUR OWN authoritative view. Never say "analysts say", "Cowen", "Soloway", "they expect".
- Every sentence MUST contain a concrete number, level, percentage, date, or named event.
- BANNED phrases (auto-fail if you use these): "potential levels to watch", "key catalysts", "may occur", "remains to be seen", "limited specific data", "developments in", "market structure suggests", "could potentially".
- Length: enough to convey real information. 2-4 sentences each. Quality over brevity.
- consensus MUST match longTermView direction. If longTermView is bullish, consensus = "bull".

ANTI-HALLUCINATION RULES (CRITICAL):
- ONLY use signals from the whitelist above. If transcripts only discuss Bitcoin and you're analysing gold, do NOT invent a connection. BTC dominance has ZERO relevance to gold.
- If a transcript discusses inflation/yields/DXY/geopolitics — those DO apply (per whitelist). Use them.
- If transcripts ONLY discuss blacklisted topics for this asset, set confidence "low" and base your view on whatever whitelisted macro signals exist.
- Numbers and levels must come from the transcripts OR be widely-known current facts. Do NOT invent specific levels like "$2,400 invalidation" if no transcript mentions it."""


# ---------------------------------------------------------------------------
# Per-asset framings
# ---------------------------------------------------------------------------


def _gold_frame() -> str:
    return (
        "You are writing an institutional market intelligence brief on GOLD (XAU/USD).\n\n"
        "These YouTube transcripts cover multiple assets. Your job: extract ONLY gold-relevant signals.\n\n"
        + _GOLD_SIGNALS
        + "\nIMPORTANT: If the transcripts discuss Bitcoin, ignore that. "
        "If they discuss inflation, geopolitics, DXY — use those for gold.\n"
    )


def _silver_frame() -> str:
    return (
        "You are writing an institutional market intelligence brief on SILVER (XAG/USD).\n\n"
        "These YouTube transcripts cover multiple assets. Your job: extract ONLY silver-relevant signals.\n\n"
        + _SILVER_SIGNALS
        + "\nIMPORTANT: Silver follows gold with higher beta. Gold signals apply to silver. "
        "Bitcoin signals do NOT apply.\n"
    )


def _crypto_frame() -> str:
    return (
        "You are writing an institutional market intelligence brief on BITCOIN (BTC/USD).\n\n"
        "These YouTube transcripts cover multiple assets. Your job: extract ONLY crypto-relevant signals.\n\n"
        + _CRYPTO_SIGNALS
        + "\nIMPORTANT: Gold-specific commentary does NOT apply to bitcoin. "
        "But global liquidity, M2, risk-on/risk-off macro DO apply.\n"
    )


_FRAMES = {
    "gold": _gold_frame,
    "silver": _silver_frame,
    "crypto": _crypto_frame,
}


def build_prompt(
    asset: Asset,
    transcript_block: str = "",
) -> str:
    """Build the full prompt for the given asset."""
    today = today_str()
    frame = _FRAMES[asset]()
    asset_label = asset.upper() if asset != "crypto" else "BITCOIN"

    transcript_section = ""
    if transcript_block:
        transcript_section = f"\n{transcript_block}\n"
    else:
        transcript_section = (
            "\n[No recent transcripts available. Set confidence to 'low'.]\n"
        )

    reasoning_steps = (
        "REASONING STEPS (think through these before writing JSON):\n"
        f"1. Scan transcripts for direct {asset_label} mentions. Note any specific levels, targets, or technical setups quoted.\n"
        f"2. Identify whitelisted macro signals (inflation, yields, DXY, geopolitics, etc.).\n"
        f"3. Filter OUT blacklisted signals — do not let them influence your {asset_label} view.\n"
        f"4. For nearTermView: synthesise direct {asset_label} commentary + whitelisted macro for next 1 month.\n"
        f"5. For longTermView: synthesise structural drivers + whitelisted macro for next 1 year.\n"
        f"6. Set consensus to match longTermView direction. They cannot contradict.\n"
        f"7. Confidence: high if multiple whitelisted signals align, medium if mixed, low if mostly indirect.\n"
    )

    return (
        f"{frame}\n"
        f"DATE: {today}\n"
        f"{transcript_section}\n"
        f"{reasoning_steps}\n"
        f"{_SCHEMA_SPEC}"
    )
