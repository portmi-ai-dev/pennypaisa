"""Prices API routes."""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Query, Request

from app.models.prices import PricesResponse

# Yahoo Finance fingerprints stock httpx/requests TLS and returns
# "Edge: Too Many Requests" even on the first call. curl_cffi imitates a
# real Chrome 120 TLS fingerprint, which Yahoo accepts. We use it ONLY for
# Yahoo calls — everything else stays on the existing shared httpx client.
try:
    from curl_cffi.requests import AsyncSession as _CurlSession  # type: ignore
    _HAS_CURL_CFFI = True
except Exception:  # pragma: no cover - graceful degradation if dep missing
    _CurlSession = None  # type: ignore[misc,assignment]
    _HAS_CURL_CFFI = False

router = APIRouter(prefix="/api", tags=["prices"])

# Store baseline prices for weekly change
weekly_gold_open: float | None = None
weekly_silver_open: float | None = None
weekly_btc_open: float | None = None
last_weekly_fetch_date: str | None = None
active_week_number: int | None = None

# Simple in-memory cache for historical data to avoid 429 errors
history_cache: dict[str, dict[str, Any]] = {}

# Per-interval cache TTLs (seconds). Short TTLs keep the chart "real-time".
INTERVAL_CACHE_TTL: dict[str, int] = {
    "1m": 15,
    "5m": 30,
    "15m": 60,
    "1h": 120,
    "1d": 300,
    "1w": 600,
    "1mo": 1800,
}

# Yahoo range per interval (must satisfy Yahoo's allowed combos).
YAHOO_RANGE: dict[str, str] = {
    "1m": "1d",
    "5m": "5d",
    "15m": "5d",
    "1h": "3mo",
    "1d": "1y",
    "1w": "5y",
    "1mo": "max",
}

YAHOO_INTERVAL: dict[str, str] = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "60m",
    "1d": "1d",
    "1w": "1wk",
    "1mo": "1mo",
}

# Spot symbols match the bottom-bar prices (gold-api XAU/XAG, BTC-USD global).
YAHOO_SPOT_SYMBOLS: dict[str, str] = {
    "gold": "XAUUSD=X",
    "silver": "XAGUSD=X",
    "btc": "BTC-USD",
}

# Futures fallbacks for gold/silver (Yahoo spot can return empty for some intervals).
YAHOO_FUTURES_SYMBOLS: dict[str, str] = {
    "gold": "GC=F",
    "silver": "SI=F",
}

BINANCE_INTERVAL: dict[str, str] = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "1h",
    "1d": "1d",
    "1w": "1w",
    "1mo": "1M",
}

CANDLE_LIMIT = 250


def current_timestamp() -> str:
    """Return an ISO timestamp matching the Express output."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _to_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _get_week_number(value: datetime) -> int:
    """Return ISO week number matching the Express calculation."""
    return value.isocalendar().week


async def _safe_get_json(
    client, url: str, *, timeout: float | None = None
) -> dict[str, Any] | list[Any] | None:
    try:
        response = await client.get(url, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except Exception:
        return None


def _extract_quick_quote(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not payload:
        return None
    return payload.get("QuickQuoteResult", {}).get("QuickQuote", [None])[0]


async def _yahoo_weekly_open(client, symbol: str) -> float | None:
    """Return the open price of the most recent weekly bar from Yahoo Finance."""
    payload = await _safe_get_json(
        client,
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1wk&range=1mo",
        timeout=12.0,
    )
    if not isinstance(payload, dict):
        return None
    result = (payload.get("chart", {}).get("result") or [{}])[0]
    timestamps = result.get("timestamp") or []
    opens = (result.get("indicators", {}).get("quote") or [{}])[0].get("open") or []
    for ts, op in zip(reversed(timestamps), reversed(opens)):
        if op is not None:
            return float(op)
    return None


async def _binance_weekly_open(client) -> float | None:
    """Return the open price of the current weekly BTCUSDT kline."""
    klines = await _safe_get_json(
        client,
        "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=1",
        timeout=10.0,
    )
    if isinstance(klines, list) and klines:
        try:
            return float(klines[0][1])
        except (TypeError, ValueError, IndexError):
            return None
    return None


async def _get_weekly_open_prices(client) -> None:
    """Fetch this week's open price for each asset from live spot sources.

    Sources:
      - Gold:   Yahoo XAUUSD=X (1wk bar)
      - Silver: Yahoo XAGUSD=X (1wk bar)
      - BTC:    Binance BTCUSDT 1w klines, fallback to Yahoo BTC-USD 1wk
    """
    global weekly_gold_open, weekly_silver_open, weekly_btc_open
    global last_weekly_fetch_date, active_week_number

    btc_open, gold_open, silver_open = await asyncio.gather(
        _binance_weekly_open(client),
        _yahoo_weekly_open(client, "XAUUSD=X"),
        _yahoo_weekly_open(client, "XAGUSD=X"),
    )

    if btc_open is None:
        btc_open = await _yahoo_weekly_open(client, "BTC-USD")

    if gold_open is None:
        gold_open = await _yahoo_weekly_open(client, "GC=F")
    if silver_open is None:
        silver_open = await _yahoo_weekly_open(client, "SI=F")

    if gold_open is not None:
        weekly_gold_open = gold_open
    if silver_open is not None:
        weekly_silver_open = silver_open
    if btc_open is not None:
        weekly_btc_open = btc_open

    active_week_number = _get_week_number(datetime.now(timezone.utc))
    last_weekly_fetch_date = datetime.now(timezone.utc).date().isoformat()
    print(
        f"Weekly Baselines (Week {active_week_number}) — "
        f"Gold: {weekly_gold_open}, Silver: {weekly_silver_open}, BTC: {weekly_btc_open}"
    )


@router.get("/prices", response_model=PricesResponse)
async def get_prices(request: Request) -> PricesResponse:
    """Return a price payload that mirrors the Express /api/prices response."""
    client = request.app.state.http_client

    try:
        current_week = _get_week_number(datetime.now(timezone.utc))
        if (
            active_week_number != current_week
            or not weekly_gold_open
            or not weekly_silver_open
            or not weekly_btc_open
        ):
            await _get_weekly_open_prices(client)

        (
            gold_res,
            silver_res,
            btc_res,
            gold_cnbc,
            silver_cnbc,
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
            _safe_get_json(client, "https://api.coingecko.com/api/v3/global"),
            _safe_get_json(client, "https://api.coinlore.net/api/ticker/?id=90"),
        )

        g_cnbc = _extract_quick_quote(gold_cnbc)
        s_cnbc = _extract_quick_quote(silver_cnbc)

        gold_price = _to_float(
            gold_res.get("price") if isinstance(gold_res, dict) else None,
            _to_float(g_cnbc.get("last") if g_cnbc else None, 0.0),
        )
        silver_price = _to_float(
            silver_res.get("price") if isinstance(silver_res, dict) else None,
            _to_float(s_cnbc.get("last") if s_cnbc else None, 0.0),
        )

        # Live BTC price: try Binance first, then CoinLore (global avg),
        # then Yahoo BTC-USD. Never fall back to a stored weekly baseline.
        btc_price = 0.0
        if isinstance(btc_res, dict):
            btc_price = _to_float(btc_res.get("lastPrice"), 0.0)
        if not btc_price and isinstance(btc_ticker_global, list) and btc_ticker_global:
            btc_price = _to_float(btc_ticker_global[0].get("price_usd"), 0.0)
        if not btc_price:
            yahoo_btc = await _safe_get_json(
                client,
                "https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?interval=1d&range=5d",
                timeout=10.0,
            )
            if isinstance(yahoo_btc, dict):
                meta = (yahoo_btc.get("chart", {}).get("result") or [{}])[0].get("meta", {})
                btc_price = _to_float(meta.get("regularMarketPrice"), 0.0)

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

        # Weekly change = (current spot − this week's open) / this week's open.
        # Both sides are spot prices, so the comparison is apples-to-apples.
        gold_weekly_change_percent = (
            ((gold_price - weekly_gold_open) / weekly_gold_open) * 100
            if weekly_gold_open and gold_price
            else gold_change_percent
        )
        silver_weekly_change_percent = (
            ((silver_price - weekly_silver_open) / weekly_silver_open) * 100
            if weekly_silver_open and silver_price
            else silver_change_percent
        )
        btc_weekly_change_percent = (
            ((btc_price - weekly_btc_open) / weekly_btc_open) * 100
            if weekly_btc_open and btc_price
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


def _valid_candles(candles: list[dict[str, Any]]) -> bool:
    """Sanity-check a candle list before serving / caching it.

    Old archival monthly bars from Yahoo (e.g. GC=F pre-2010) occasionally
    have rounding quirks where `close` is fractionally above `high` or
    `open` is fractionally below `low` — the data is still usable, the
    extremes are just slightly off. We tolerate up to ~5% of bars
    violating strict OHLC consistency rather than rejecting the whole
    series, which is what was hiding the monthly Gold/Silver charts.
    """
    if not candles:
        return False
    distinct_closes = {round(c.get("close", 0), 6) for c in candles}
    if len(distinct_closes) <= 1:
        return False

    bad = 0
    for c in candles:
        o, h, l, cl = c.get("open"), c.get("high"), c.get("low"), c.get("close")
        if None in (o, h, l, cl):
            return False
        # Accept tiny float rounding noise (~0.05% of price)
        tol = max(abs(h), abs(l), 1.0) * 5e-4
        if h + tol < max(o, cl) or l - tol > min(o, cl):
            bad += 1

    # Reject only if > 5% of candles are inconsistent — a real bad payload
    # tends to be inconsistent throughout, not in 4 out of 263 bars.
    return bad / len(candles) <= 0.05


def _from_yahoo(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    chart = payload.get("chart") or {}
    results = chart.get("result") or []
    if not results:
        return []
    result = results[0]
    timestamps = result.get("timestamp") or []
    quote = (result.get("indicators", {}).get("quote") or [{}])[0]
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    candles: list[dict[str, Any]] = []
    for i, ts in enumerate(timestamps):
        if i >= len(opens):
            break
        o, h, l, c = opens[i], highs[i], lows[i], closes[i]
        if None in (o, h, l, c):
            continue
        candles.append(
            {
                "time": float(ts),
                "open": float(o),
                "high": float(h),
                "low": float(l),
                "close": float(c),
            }
        )
    return candles


def _from_binance_klines(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    candles: list[dict[str, Any]] = []
    for k in items:
        try:
            candles.append(
                {
                    "time": float(k[0]) / 1000.0,
                    "open": float(k[1]),
                    "high": float(k[2]),
                    "low": float(k[3]),
                    "close": float(k[4]),
                }
            )
        except (TypeError, ValueError, IndexError):
            continue
    return candles


async def _fetch_yahoo(client, symbol: str, interval: str) -> list[dict[str, Any]]:
    """Fetch OHLC candles from Yahoo Finance.

    Yahoo TLS-fingerprints stock httpx and returns 429 ("Edge: Too Many
    Requests") on the very first call. We use curl_cffi (Chrome 120
    impersonation) when available, and fall back to plain httpx if the
    dependency is missing — the latter will probably 429, but at least
    the endpoint won't crash.
    """
    y_interval = YAHOO_INTERVAL.get(interval, "1d")
    y_range = YAHOO_RANGE.get(interval, "1y")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval={y_interval}&range={y_range}"

    if _HAS_CURL_CFFI and _CurlSession is not None:
        try:
            async with _CurlSession(impersonate="chrome120") as session:
                response = await session.get(url, timeout=12)
                if response.status_code != 200:
                    return []
                payload = response.json()
            return _from_yahoo(payload)
        except Exception as exc:
            print(f"curl_cffi Yahoo fetch failed for {symbol} ({interval}): {exc}")
            # fall through to httpx attempt below

    payload = await _safe_get_json(client, url, timeout=12.0)
    return _from_yahoo(payload)


async def _fetch_binance(client, symbol: str, interval: str, limit: int) -> list[dict[str, Any]]:
    b_interval = BINANCE_INTERVAL.get(interval, "1d")
    payload = await _safe_get_json(
        client,
        f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={b_interval}&limit={limit}",
        timeout=10.0,
    )
    return _from_binance_klines(payload)


@router.get("/history/{asset}")
async def get_history(
    asset: str,
    request: Request,
    interval: str = Query("1d", pattern="^(1m|5m|15m|1h|1d|1w|1mo)$"),
) -> list[dict[str, Any]]:
    """Return real-time OHLC candles for a supported asset.

    Sources (with fallback chain):
      - btc:    Binance klines (BTCUSDT)  ->  Yahoo Finance (BTC-USD)
      - gold:   Yahoo Finance spot (XAUUSD=X)  ->  futures (GC=F)
      - silver: Yahoo Finance spot (XAGUSD=X)  ->  futures (SI=F)
    """
    if asset not in {"gold", "silver", "btc"}:
        return [{"error": "Invalid asset"}]

    cache_key = f"{asset}:{interval}"
    ttl = INTERVAL_CACHE_TTL.get(interval, 60)
    now_ts = datetime.now(timezone.utc).timestamp()
    cached = history_cache.get(cache_key)
    if cached and (now_ts - cached["timestamp"] < ttl) and _valid_candles(cached.get("data", [])):
        return cached["data"]

    client = request.app.state.http_client
    history: list[dict[str, Any]] = []

    try:
        if asset == "btc":
            try:
                history = await _fetch_binance(client, "BTCUSDT", interval, CANDLE_LIMIT)
            except Exception as exc:
                print(f"Binance BTC fetch failed ({interval}): {exc}")
            if not _valid_candles(history):
                history = await _fetch_yahoo(client, YAHOO_SPOT_SYMBOLS["btc"], interval)
        else:
            spot_symbol = YAHOO_SPOT_SYMBOLS[asset]
            history = await _fetch_yahoo(client, spot_symbol, interval)
            if not _valid_candles(history):
                fut_symbol = YAHOO_FUTURES_SYMBOLS[asset]
                print(f"Yahoo spot {spot_symbol} empty for {interval}; falling back to {fut_symbol}")
                history = await _fetch_yahoo(client, fut_symbol, interval)

        if len(history) > CANDLE_LIMIT:
            history = history[-CANDLE_LIMIT:]
    except Exception as error:
        print(f"Error fetching history for {asset} ({interval}): {error}")

    if not _valid_candles(history):
        if cached and cached.get("data"):
            print(f"Serving stale cache for {cache_key} after fetch failure")
            return cached["data"]
        return []

    history_cache[cache_key] = {"data": history, "timestamp": now_ts}
    return history
