"""Prices API routes."""

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request

from app.models.prices import PricesResponse

router = APIRouter(prefix="/api", tags=["prices"])

# Store baseline prices for weekly change
weekly_gold_open: float | None = None
weekly_silver_open: float | None = None
weekly_btc_open: float | None = None
last_weekly_fetch_date: str | None = None


def current_timestamp() -> str:
    """Return an ISO timestamp matching the Express output."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _to_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


async def _safe_get_json(client, url: str) -> dict[str, Any] | list[Any] | None:
    try:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()
    except Exception:
        return None


def _extract_quick_quote(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not payload:
        return None
    return payload.get("QuickQuoteResult", {}).get("QuickQuote", [None])[0]


async def _get_weekly_open_prices(client) -> None:
    global weekly_gold_open, weekly_silver_open, weekly_btc_open, last_weekly_fetch_date

    try:
        btc_klines = await _safe_get_json(
            client,
            "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=1",
        )
        if isinstance(btc_klines, list) and btc_klines:
            weekly_btc_open = _to_float(btc_klines[0][1], weekly_btc_open or 0)

        gold_cnbc = await _safe_get_json(
            client,
            "https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=@GC.1&requestMethod=quick&noform=1&exthrs=1&output=json",
        )
        gold_data = _extract_quick_quote(gold_cnbc)
        if gold_data and gold_data.get("settlePrice") is not None:
            weekly_gold_open = _to_float(gold_data.get("settlePrice"), weekly_gold_open or 0)

        silver_cnbc = await _safe_get_json(
            client,
            "https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=@SI.1&requestMethod=quick&noform=1&exthrs=1&output=json",
        )
        silver_data = _extract_quick_quote(silver_cnbc)
        if silver_data and silver_data.get("settlePrice") is not None:
            weekly_silver_open = _to_float(
                silver_data.get("settlePrice"), weekly_silver_open or 0
            )

        last_weekly_fetch_date = datetime.now(timezone.utc).date().isoformat()
    except Exception:
        return


@router.get("/prices", response_model=PricesResponse)
async def get_prices(request: Request) -> PricesResponse:
    """Return a price payload that mirrors the Express /api/prices response."""
    client = request.app.state.http_client

    try:
        today = datetime.now(timezone.utc).date().isoformat()
        if last_weekly_fetch_date != today or not weekly_gold_open:
            await _get_weekly_open_prices(client)

        (
            gold_res,
            silver_res,
            btc_res,
            gold_cnbc,
            silver_cnbc,
            gold_futures,
            silver_futures,
            global_res,
            btc_ticker_global,
        ) = await asyncio.gather(
            _safe_get_json(client, "https://api.gold-api.com/price/XAU"),
            _safe_get_json(client, "https://api.gold-api.com/price/XAG"),
            _safe_get_json(client, "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"),
            _safe_get_json(
                client,
                "https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=XAU=&requestMethod=quick&noform=1&exthrs=1&output=json",
            ),
            _safe_get_json(
                client,
                "https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=XAG=&requestMethod=quick&noform=1&exthrs=1&output=json",
            ),
            _safe_get_json(
                client,
                "https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=@GC.1&requestMethod=quick&noform=1&exthrs=1&output=json",
            ),
            _safe_get_json(
                client,
                "https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=@SI.1&requestMethod=quick&noform=1&exthrs=1&output=json",
            ),
            _safe_get_json(client, "https://api.coingecko.com/api/v3/global"),
            _safe_get_json(client, "https://api.coinlore.net/api/ticker/?id=90"),
        )

        g_cnbc = _extract_quick_quote(gold_cnbc)
        s_cnbc = _extract_quick_quote(silver_cnbc)
        g_fut = _extract_quick_quote(gold_futures)
        s_fut = _extract_quick_quote(silver_futures)

        gold_price = _to_float(
            gold_res.get("price") if isinstance(gold_res, dict) else None,
            _to_float(g_cnbc.get("last") if g_cnbc else None, 0.0),
        )
        silver_price = _to_float(
            silver_res.get("price") if isinstance(silver_res, dict) else None,
            _to_float(s_cnbc.get("last") if s_cnbc else None, 0.0),
        )
        btc_price = _to_float(
            btc_res.get("lastPrice") if isinstance(btc_res, dict) else None,
            weekly_btc_open or 0.0,
        )

        btc_dominance = 57.5
        if isinstance(global_res, dict):
            btc_dominance = _to_float(
                global_res.get("data", {}).get("market_cap_percentage", {}).get("btc"),
                btc_dominance,
            )

        btc_market_cap = 0.0
        if isinstance(btc_ticker_global, list) and btc_ticker_global:
            btc_market_cap = _to_float(
                btc_ticker_global[0].get("market_cap_usd"), 0.0
            )

        gold_change_percent = _to_float(g_cnbc.get("change_pct") if g_cnbc else None, 0.0)
        gold_absolute_change = _to_float(g_cnbc.get("change") if g_cnbc else None, 0.0)
        silver_change_percent = _to_float(s_cnbc.get("change_pct") if s_cnbc else None, 0.0)
        silver_absolute_change = _to_float(s_cnbc.get("change") if s_cnbc else None, 0.0)
        btc_change_percent = _to_float(
            btc_res.get("priceChangePercent") if isinstance(btc_res, dict) else None,
            0.0,
        )

        now = datetime.now(timezone.utc)
        day = now.weekday()  # Monday=0 ... Sunday=6
        is_monday = day == 0

        gold_weekly_change_percent = gold_change_percent
        if weekly_gold_open and g_fut and g_fut.get("last") is not None:
            gold_weekly_change_percent = (
                (_to_float(g_fut.get("last"), 0.0) - weekly_gold_open)
                / weekly_gold_open
            ) * 100
            if is_monday:
                gold_weekly_change_percent = gold_change_percent

        silver_weekly_change_percent = silver_change_percent
        if weekly_silver_open and s_fut and s_fut.get("last") is not None:
            silver_weekly_change_percent = (
                (_to_float(s_fut.get("last"), 0.0) - weekly_silver_open)
                / weekly_silver_open
            ) * 100
            if is_monday:
                silver_weekly_change_percent = silver_change_percent

        btc_weekly_change_percent = (
            ((btc_price - weekly_btc_open) / weekly_btc_open) * 100
            if weekly_btc_open
            else btc_change_percent
        )

        gold_change = gold_absolute_change or (gold_price * gold_change_percent) / 100
        silver_change = silver_absolute_change or (silver_price * silver_change_percent) / 100
        btc_change = _to_float(
            btc_res.get("priceChange") if isinstance(btc_res, dict) else None,
            (btc_price * btc_change_percent) / 100,
        )

        btc_volume_24h = _to_float(
            btc_res.get("quoteVolume") if isinstance(btc_res, dict) else None,
            0.0,
        )
        btc_volume_change_percent = _to_float(
            btc_res.get("priceChangePercent") if isinstance(btc_res, dict) else None,
            0.0,
        )

        is_weekend = (
            day == 5
            or (day == 4 and now.hour >= 22)
            or (day == 6 and now.hour < 22)
        )

        return PricesResponse(
            gold=gold_price,
            silver=silver_price,
            btc=btc_price,
            btcMarketCap=btc_market_cap,
            btcDominance=btc_dominance,
            goldChange=gold_change,
            goldChangePercent=gold_change_percent,
            goldWeeklyChangePercent=gold_weekly_change_percent,
            silverChange=silver_change,
            silverChangePercent=silver_change_percent,
            silverWeeklyChangePercent=silver_weekly_change_percent,
            btcChange=btc_change,
            btcChangePercent=btc_change_percent,
            btcWeeklyChangePercent=btc_weekly_change_percent,
            btcVolume24h=btc_volume_24h,
            btcVolumeChangePercent=btc_volume_change_percent,
            isWeekend=is_weekend,
            timestamp=current_timestamp(),
            source="Financial Data Feed (Aligned with Professional Benchmarks)",
        )
    except Exception as error:
        error_message = str(error)
        print(f"Error fetching prices: {error_message}")

        return PricesResponse(
            gold=0.0,
            silver=0.0,
            btc=0.0,
            btcMarketCap=0.0,
            btcDominance=0.0,
            goldChange=0.0,
            goldChangePercent=0.0,
            goldWeeklyChangePercent=0.0,
            silverChange=0.0,
            silverChangePercent=0.0,
            silverWeeklyChangePercent=0.0,
            btcChange=0.0,
            btcChangePercent=0.0,
            btcWeeklyChangePercent=0.0,
            btcVolume24h=0.0,
            btcVolumeChangePercent=0.0,
            isWeekend=False,
            timestamp=current_timestamp(),
            source="Recovery Feed",
            error=error_message,
        )
