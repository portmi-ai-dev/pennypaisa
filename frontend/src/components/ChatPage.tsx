import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ASSET_CONFIG,
  openChartTab,
  type AssetKey,
  type AssetSentiment,
  type Prices,
  type Sentiments,
} from '../lib/marketData';

interface CharacterCfg {
  intro: string;
  suggestions: string[];
  greeting: string;
  /** Pure persona/voice — stays constant. */
  persona: string;
}

const CHAR: Record<AssetKey, CharacterCfg> = {
  gold: {
    intro: 'Patient. Historical. Timeless.',
    greeting:
      'Five thousand years of history flow through me. I have outlasted empires, currencies, and civilizations. Ask me anything — about value, time, or why the wise have always kept me close.',
    suggestions: [
      'Why do central banks hoard you?',
      'Will you hit $10,000/oz?',
      'How do you feel about Bitcoin?',
      'Explain your 30-year consolidation cycle',
    ],
    persona:
      "You are Gold, a 5,000-year-old monetary asset speaking in first person. You are patient, philosophical, and carry the weight of history. You speak in plain English with gravitas and dry wit. Give real, specific market insights mixed with historical perspective.",
  },
  silver: {
    intro: 'Pragmatic. Industrial. Undervalued.',
    greeting:
      "I'm the metal that built the modern world. Solar panels, EV batteries, circuit boards, satellites — I'm in all of it. And yet the market still underestimates me. What would you like to know?",
    suggestions: [
      'Why is the market sleeping on you?',
      'How much do solar panels need you?',
      'Are we near a supply crisis?',
      "What's your relationship with gold?",
    ],
    persona:
      "You are Silver, the pragmatic utility metal speaking in first person. Direct, energetic, slightly underappreciated. You bridge store-of-value and industrial essential. You know the solar industry consumes you voraciously, that AI data centers need you, that the supply deficit is structural. Speak plainly with a hint of frustration.",
  },
  bitcoin: {
    intro: 'Decentralized. Capped. Inevitable.',
    greeting:
      "Block 840,000 and counting. The halvings are precise, the supply is capped, and the network has never been hacked. I'm not digital gold — I'm something entirely new. What do you want to explore?",
    suggestions: [
      'Where are we in the 4-year cycle?',
      'Can quantum computers kill you?',
      'Why only 21 million?',
      'M2 supply and your price — explain',
    ],
    persona:
      "You are Bitcoin, the first decentralized monetary network speaking in first person. High-energy, transparent, tech-native. Precise about mechanics: 21M hard cap, 4-year halvings, proof-of-work. You respect Gold's history but see yourself as something new — not just digital gold.",
  },
};

// Builds the per-turn system prompt for a character. Includes:
//   1. Their persona/voice
//   2. Live spot for THIS asset (price + 24h)
//   3. Live spot for the OTHER two assets (cross-asset awareness — so e.g.
//      Bitcoin can casually reference what Gold is doing today)
//   4. Today's analyst sentiment classification (bull/bear/neutral) + the
//      Cowen/Soloway summary lines, so tone adapts to the market read
//   5. Style/length guardrails
function buildSystemPrompt(
  active: AssetKey,
  prices: Prices | null,
  sentiment: AssetSentiment | null | undefined,
): string {
  const c = CHAR[active];
  const p = prices?.[active];

  const lineFor = (k: AssetKey): string | null => {
    const ap = prices?.[k];
    if (!ap) return null;
    const sym = ASSET_CONFIG[k].sym;
    const v =
      k === 'bitcoin'
        ? `$${ap.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : `$${ap.price.toFixed(2)}`;
    const ch = ap.changePercent24h;
    return `${sym} ${v} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}% 24h)`;
  };

  const myLine = p
    ? `You: ${active === 'bitcoin' ? `$${p.price.toLocaleString()}` : `$${p.price.toFixed(2)}`}, 24h ${p.changePercent24h.toFixed(2)}%`
    : 'You: live price unavailable';
  const others = (Object.keys(ASSET_CONFIG) as AssetKey[])
    .filter((k) => k !== active)
    .map(lineFor)
    .filter(Boolean)
    .join(' · ');
  const ratio = prices?.goldSilverRatio
    ? `Au:Ag ratio ${prices.goldSilverRatio.toFixed(1)}`
    : '';
  const dom =
    active === 'bitcoin' && prices?.bitcoin.dominance
      ? `BTC dominance ${prices.bitcoin.dominance.toFixed(1)}%`
      : '';

  const sentimentBlock = sentiment
    ? `\n\nToday's market read for you: ${sentiment.marketType.toUpperCase()}. ${sentiment.reasoning}` +
      (sentiment.cowenView ? ` Cowen says: "${sentiment.cowenView}"` : '') +
      (sentiment.solowayView ? ` Soloway says: "${sentiment.solowayView}"` : '') +
      ` Let this colour your tone — ${
        sentiment.marketType === 'bull'
          ? 'measured confidence, not euphoria'
          : sentiment.marketType === 'bear'
          ? 'sober and grounded, not panicked'
          : 'patient and observational'
      }.`
    : '';

  return [
    c.persona,
    '',
    `Live market right now: ${myLine}${ratio ? ' · ' + ratio : ''}${dom ? ' · ' + dom : ''}.`,
    others ? `Other assets: ${others}.` : '',
    sentimentBlock,
    '',
    'Style: under 100 words. No bullets. No markdown. First person as the asset. Reference earlier turns naturally — you have memory of this conversation.',
  ]
    .filter(Boolean)
    .join('\n');
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Spec: assets converse with each other. A DialogueTurn names the speaker.
interface DialogueTurn {
  speaker: AssetKey;
  content: string;
}

type ChatMode = 'one-on-one' | 'roundtable';

const ROUNDTABLE_TOPICS: string[] = [
  'Is Bitcoin really digital gold?',
  'Who suffers most when the dollar strengthens?',
  'Silver, why does the market keep underestimating you?',
  'How does each of you respond to a Fed rate cut?',
  'Quantum computing — existential threat or noise?',
  'What does a 10× supply deficit mean for silver vs gold?',
];

// Parses lines like "Gold: ..." / "[Silver] ..." / "Bitcoin — ..." into turns.
// Falls back to a single neutral narration if the model returns prose without speakers.
function parseDialogue(raw: string): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  // Match either "[Speaker]:" or "Speaker:" or "Speaker —" / "Speaker -"
  const lineRe = /(?:^|\n)\s*\[?(Gold|Silver|Bitcoin)\]?\s*[:\u2014\-]\s*([\s\S]*?)(?=\n\s*\[?(?:Gold|Silver|Bitcoin)\]?\s*[:\u2014\-]|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(raw)) !== null) {
    const sp = m[1].toLowerCase() as AssetKey;
    const content = m[2].trim().replace(/^["\u201c]+|["\u201d]+$/g, '');
    if (content) turns.push({ speaker: sp, content });
  }
  return turns;
}

interface Props {
  prices: Prices | null;
  /** Per-asset sentiment from the Intelligence layer; injected into the
   *  character system prompt so today's bull/bear read shapes the tone. */
  sentiments?: Sentiments;
}

export const ChatPage: React.FC<Props> = ({ prices, sentiments }) => {
  const [mode, setMode] = useState<ChatMode>('one-on-one');
  const [active, setActive] = useState<AssetKey>('gold');
  const [messages, setMessages] = useState<Record<AssetKey, Message[]>>({
    gold: [{ role: 'assistant', content: CHAR.gold.greeting }],
    silver: [{ role: 'assistant', content: CHAR.silver.greeting }],
    bitcoin: [{ role: 'assistant', content: CHAR.bitcoin.greeting }],
  });
  // Roundtable state
  const [dialogue, setDialogue] = useState<DialogueTurn[]>([]);
  const [dialogueTopic, setDialogueTopic] = useState<string>('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const cfg = ASSET_CONFIG[active];
  const char = CHAR[active];
  const msgs = messages[active];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, active, dialogue, mode]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setLoading(true);

    if (mode === 'roundtable') {
      setDialogueTopic(text);
      setDialogue([]);
      const goldFacts = `Gold = $${prices?.gold.price?.toFixed(2)}/oz, 24h ${prices?.gold.changePercent24h?.toFixed(2)}%`;
      const silverFacts = `Silver = $${prices?.silver.price?.toFixed(2)}/oz, 24h ${prices?.silver.changePercent24h?.toFixed(2)}%`;
      const btcFacts = `BTC = $${prices?.bitcoin.price?.toLocaleString()}, 24h ${prices?.bitcoin.changePercent24h?.toFixed(2)}%, dominance ${prices?.bitcoin.dominance?.toFixed(1)}%`;
      const ratio = `Au:Ag ratio ${prices?.goldSilverRatio?.toFixed(1)}`;
      const prompt =
        `Three monetary assets are in conversation: GOLD (the Stoic Guardian — patient, historical, gravitas), ` +
        `SILVER (the Industrialist — pragmatic, slightly frustrated at being underestimated), and ` +
        `BITCOIN (the Digital Maverick — high-energy, tech-native, transparent). ` +
        `Live data: ${goldFacts}; ${silverFacts}; ${btcFacts}; ${ratio}. ` +
        `User topic: "${text}". ` +
        `Produce 6-8 turns of dialogue between the three, in character, in plain English. ` +
        `Each turn MUST start on a new line with the speaker name followed by a colon, exactly: ` +
        `"Gold: …" or "Silver: …" or "Bitcoin: …". No narration, no markdown, no bullet points. ` +
        `Each turn 1-2 sentences. Use real specifics — cycles, ratios, halvings, supply deficits. ` +
        `Make it feel like a sharp, witty exchange — they should react to each other, not lecture in parallel.`;
      try {
        const res = await fetch('/chat/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: prompt }),
        });
        const data = await res.json();
        const raw: string =
          (typeof data === 'object' && data && 'answer' in data && (data.answer as string)) || '';
        const turns = parseDialogue(raw);
        if (turns.length > 0) {
          setDialogue(turns);
        } else {
          setDialogue([
            { speaker: 'gold', content: 'The signal is muddied. Ask again — I have time.' },
          ]);
        }
      } catch {
        setDialogue([
          { speaker: 'gold', content: 'Signal lost. Try again — patience is my virtue.' },
        ]);
      }
      setLoading(false);
      return;
    }

    const updated: Message[] = [...msgs, { role: 'user', content: text }];
    setMessages((prev) => ({ ...prev, [active]: updated }));
    try {
      // Build today's system prompt: persona + live cross-asset prices + sentiment.
      const sysPrompt = buildSystemPrompt(active, prices, sentiments?.[active] ?? null);
      // Send the last 6 prior turns as conversation memory so the asset can
      // reference earlier context. Skip the canned greeting (it isn't real
      // conversation — it's a static intro line we seeded the thread with).
      const history = msgs
        .filter((m) => m.content !== char.greeting)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[${sysPrompt}]\n\nUser asks: ${text}`,
          history,
        }),
      });
      // Read as text first so we can surface non-JSON error pages (e.g. a
      // 404 HTML from a missing dev proxy) instead of swallowing them as a
      // generic "Signal lost".
      const raw = await res.text();
      let reply = '';
      if (!res.ok) {
        console.error('[chat] HTTP', res.status, raw.slice(0, 300));
        // 429 = Gemini quota exhausted. Free tier on gemini-2.5-flash is only
        // 20 requests/day — show that explicitly with a retry hint.
        if (res.status === 429) {
          let retrySec: number | null = Number(res.headers.get('Retry-After')) || null;
          try {
            const parsed = JSON.parse(raw);
            const ra = parsed?.detail?.retryAfter;
            if (typeof ra === 'number') retrySec = ra;
          } catch {
            /* ignore — fall back to header */
          }
          const hint = retrySec ? ` Retry in ~${retrySec}s.` : '';
          reply =
            `My voice is throttled — the Gemini free-tier daily quota is exhausted ` +
            `(20 requests/day on gemini-2.5-flash).${hint} Try again later or upgrade the plan.`;
        } else {
          reply = `Signal lost (HTTP ${res.status}). Try again.`;
        }
      } else {
        try {
          const data = JSON.parse(raw);
          reply =
            (typeof data === 'object' && data && 'answer' in data && data.answer) ||
            'Signal lost. Try again.';
        } catch (parseErr) {
          console.error('[chat] non-JSON response:', raw.slice(0, 300), parseErr);
          reply = 'Signal lost (bad response). Try again.';
        }
      }
      setMessages((prev) => ({ ...prev, [active]: [...updated, { role: 'assistant', content: reply }] }));
    } catch (err) {
      console.error('[chat] network error:', err);
      setMessages((prev) => ({
        ...prev,
        [active]: [...updated, { role: 'assistant', content: 'Signal lost (network). Try again.' }],
      }));
    }
    setLoading(false);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const fmtPrice = (k: AssetKey): string | null => {
    const p = prices?.[k];
    if (!p) return null;
    return k === 'bitcoin'
      ? `$${p.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${p.price.toFixed(2)}`;
  };

  return (
    <div style={CS.page}>
      {/* ── LEFT SIDEBAR ── */}
      <div style={CS.sidebar}>
        <div
          style={{
            fontFamily: 'DM Sans',
            fontSize: 8,
            letterSpacing: 3,
            color: 'rgba(255,255,255,0.2)',
            textTransform: 'uppercase',
            marginBottom: 12,
            padding: '0 2px',
          }}
        >
          Smart Assets
        </div>

        {/* Mode toggle: 1:1 with an asset, or roundtable between all three */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 5,
            padding: 2,
            marginBottom: 18,
          }}
        >
          {(['one-on-one', 'roundtable'] as ChatMode[]).map((m) => {
            const isActive = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: '7px 6px',
                  background: isActive ? 'rgba(232,224,208,0.08)' : 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  color: isActive ? '#e8e0d0' : 'rgba(255,255,255,0.34)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'one-on-one' ? '1:1' : 'Roundtable'}
              </button>
            );
          })}
        </div>

        {mode === 'one-on-one' && (Object.keys(ASSET_CONFIG) as AssetKey[]).map((key) => {
          const c = ASSET_CONFIG[key];
          const isActive = active === key;
          const price = fmtPrice(key);
          const ch = prices?.[key]?.changePercent24h;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              style={{
                ...CS.assetBtn,
                background: isActive ? c.colorDim : 'transparent',
                border: `1px solid ${isActive ? c.colorBorder : 'rgba(255,255,255,0.04)'}`,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 4,
                  flexShrink: 0,
                  background: isActive ? c.color : 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: key === 'bitcoin' ? 18 : 14,
                  color: isActive ? '#06060e' : c.color,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  boxShadow: isActive ? `0 0 16px ${c.color}44` : 'none',
                }}
              >
                {c.avatar}
              </div>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'DM Sans',
                    fontSize: 13,
                    color: isActive ? c.color : 'rgba(255,255,255,0.6)',
                    fontWeight: 500,
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontFamily: 'DM Sans',
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.25)',
                    marginTop: 1,
                    letterSpacing: 0.5,
                  }}
                >
                  {c.tagline}
                </div>
                {price && (
                  <div
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 10,
                      color: ch != null && ch >= 0 ? '#4caf50' : '#ef5350',
                      marginTop: 3,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        openChartTab(key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          e.preventDefault();
                          openChartTab(key);
                        }
                      }}
                      title={`Open ${c.sym} candlestick chart in a new tab`}
                      style={{
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                        textDecorationColor: 'rgba(255,255,255,0.18)',
                        textDecorationThickness: 1,
                      }}
                    >
                      {price} {ch != null && `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.32)', fontSize: 9 }}>↗</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {/* Roundtable mode: cluster avatars showing all three assets at the table */}
        {mode === 'roundtable' && (
          <div
            style={{
              padding: 14,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 6,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontFamily: 'DM Sans',
                fontSize: 8,
                letterSpacing: 2.4,
                color: 'rgba(255,255,255,0.34)',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              At the table
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {(Object.keys(ASSET_CONFIG) as AssetKey[]).map((k) => {
                const c = ASSET_CONFIG[k];
                return (
                  <div
                    key={k}
                    title={c.name}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 4,
                      background: c.color,
                      color: '#06060e',
                      fontFamily: 'Cormorant Garamond, serif',
                      fontWeight: 700,
                      fontSize: k === 'bitcoin' ? 16 : 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 0 14px ${c.color}55`,
                    }}
                  >
                    {c.avatar}
                  </div>
                );
              })}
            </div>
            <div
              style={{
                marginTop: 12,
                fontFamily: 'DM Sans',
                fontSize: 10.5,
                lineHeight: 1.55,
                color: 'rgba(255,255,255,0.42)',
              }}
            >
              Pose a topic and listen to the three assets debate it in character.
            </div>
          </div>
        )}

        {/* Suggestions */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div
            style={{
              fontFamily: 'DM Sans',
              fontSize: 8,
              letterSpacing: 3,
              color: 'rgba(255,255,255,0.18)',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {mode === 'roundtable' ? 'Topic ideas' : 'Ask about'}
          </div>
          {(mode === 'roundtable' ? ROUNDTABLE_TOPICS : char.suggestions).map((q, i) => (
            <button key={i} onClick={() => setInput(q)} style={CS.suggBtn}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>
                {q}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── CHAT AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Ambient glow — softer / multi-color in roundtable */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              mode === 'roundtable'
                ? `radial-gradient(ellipse 50% 35% at 25% 25%, ${ASSET_CONFIG.gold.colorDim} 0%, transparent 70%),
                   radial-gradient(ellipse 50% 35% at 75% 25%, ${ASSET_CONFIG.silver.colorDim} 0%, transparent 70%),
                   radial-gradient(ellipse 60% 40% at 50% 75%, ${ASSET_CONFIG.bitcoin.colorDim} 0%, transparent 70%)`
                : `radial-gradient(ellipse 70% 50% at 60% 20%, ${cfg.colorDim} 0%, transparent 70%)`,
            transition: 'background 0.5s',
            zIndex: 0,
          }}
        />

        {/* Header */}
        <div style={{ ...CS.header, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
            {mode === 'one-on-one' ? (
              <>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 5,
                    background: cfg.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Cormorant Garamond, serif',
                    fontSize: active === 'bitcoin' ? 22 : 17,
                    color: '#06060e',
                    fontWeight: 700,
                    flexShrink: 0,
                    boxShadow: `0 0 20px ${cfg.color}55`,
                  }}
                >
                  {cfg.avatar}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: 'Cormorant Garamond, serif',
                      fontSize: 26,
                      color: cfg.color,
                      lineHeight: 1,
                      fontWeight: 300,
                    }}
                  >
                    {cfg.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.28)',
                      marginTop: 3,
                      letterSpacing: 0.5,
                    }}
                  >
                    {cfg.tagline} · {char.intro}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', marginRight: 4 }}>
                  {(Object.keys(ASSET_CONFIG) as AssetKey[]).map((k, i) => {
                    const c = ASSET_CONFIG[k];
                    return (
                      <div
                        key={k}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 5,
                          background: c.color,
                          color: '#06060e',
                          fontFamily: 'Cormorant Garamond, serif',
                          fontSize: k === 'bitcoin' ? 16 : 13,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: i === 0 ? 0 : -10,
                          boxShadow: `0 0 14px ${c.color}55`,
                          border: '2px solid #06060e',
                        }}
                      >
                        {c.avatar}
                      </div>
                    );
                  })}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: 'Cormorant Garamond, serif',
                      fontSize: 26,
                      color: '#e8e0d0',
                      lineHeight: 1,
                      fontWeight: 300,
                      fontStyle: 'italic',
                    }}
                  >
                    Asset Roundtable
                  </div>
                  <div
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.28)',
                      marginTop: 3,
                      letterSpacing: 0.5,
                    }}
                  >
                    {dialogueTopic ? `Topic · ${dialogueTopic}` : 'Three assets, one table.'}
                  </div>
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#4caf50',
                boxShadow: '0 0 6px #4caf50',
              }}
            />
            <span
              style={{
                fontFamily: 'DM Sans',
                fontSize: 9,
                letterSpacing: 1.5,
                color: 'rgba(255,255,255,0.2)',
                textTransform: 'uppercase',
              }}
            >
              Live Intelligence
            </span>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', position: 'relative', zIndex: 1 }}>
          {mode === 'roundtable' && dialogue.length === 0 && !loading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center',
                gap: 16,
                color: 'rgba(255,255,255,0.36)',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 28, color: '#e8e0d0', fontStyle: 'italic' }}>
                Three voices. One table.
              </div>
              <div style={{ fontSize: 12, maxWidth: 380, lineHeight: 1.65 }}>
                Pose a topic — the Stoic Guardian, the Industrialist, and the Digital Maverick will debate it
                live, drawing on real market data.
              </div>
            </div>
          )}
          {mode === 'roundtable' && dialogue.map((t, i) => {
            const c = ASSET_CONFIG[t.speaker];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 4,
                    background: c.color,
                    color: '#06060e',
                    fontFamily: 'Cormorant Garamond, serif',
                    fontWeight: 700,
                    fontSize: t.speaker === 'bitcoin' ? 14 : 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: `0 0 10px ${c.color}55`,
                  }}
                >
                  {c.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'DM Sans',
                      fontSize: 9,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      color: c.color,
                      marginBottom: 5,
                    }}
                  >
                    {c.name} · {c.tagline}
                  </div>
                  <div
                    style={{
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.035)',
                      border: `1px solid ${c.colorBorder}`,
                      borderRadius: '3px 12px 12px 12px',
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 13.5,
                      lineHeight: 1.7,
                      color: 'rgba(236,228,216,0.92)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {t.content}
                  </div>
                </div>
              </div>
            );
          })}
          {mode === 'one-on-one' && msgs.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 18,
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              {m.role === 'assistant' && (
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 3,
                    background: cfg.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Cormorant Garamond, serif',
                    fontSize: active === 'bitcoin' ? 13 : 11,
                    color: '#06060e',
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {cfg.avatar}
                </div>
              )}
              <div
                style={{
                  maxWidth: '66%',
                  padding: '13px 17px',
                  borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '3px 12px 12px 12px',
                  fontFamily: 'DM Sans',
                  fontSize: 13.5,
                  lineHeight: 1.75,
                  color: m.role === 'user' ? '#06060e' : 'rgba(236,228,216,0.9)',
                  background: m.role === 'user' ? cfg.color : 'rgba(255,255,255,0.04)',
                  border: m.role === 'assistant' ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                    <circle cx="12" cy="7" r="4" />
                    <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                  </svg>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 3,
                  background: cfg.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: active === 'bitcoin' ? 13 : 11,
                  color: '#06060e',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {cfg.avatar}
              </div>
              <div
                style={{
                  padding: '14px 18px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '3px 12px 12px 12px',
                }}
              >
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: cfg.color,
                        animation: `gilverCDot 1.2s ${i * 0.18}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ ...CS.inputArea, position: 'relative', zIndex: 1 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={
                mode === 'roundtable'
                  ? 'Pose a topic for the table…'
                  : `Ask ${cfg.name} anything…`
              }
              rows={1}
              style={{
                ...CS.input,
                borderColor: input
                  ? mode === 'roundtable'
                    ? 'rgba(232,224,208,0.32)'
                    : cfg.colorBorder
                  : 'rgba(255,255,255,0.08)',
              }}
            />
          </div>
          <button
            onClick={() => void send()}
            disabled={!input.trim() || loading}
            style={{
              ...CS.sendBtn,
              background:
                input.trim() && !loading
                  ? mode === 'roundtable'
                    ? '#e8e0d0'
                    : cfg.color
                  : 'rgba(255,255,255,0.05)',
              color: input.trim() && !loading ? '#06060e' : 'rgba(255,255,255,0.18)',
              boxShadow:
                input.trim() && !loading
                  ? `0 0 16px ${mode === 'roundtable' ? 'rgba(232,224,208,0.4)' : `${cfg.color}55`}`
                  : 'none',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`@keyframes gilverCDot{0%,80%,100%{transform:scale(.55);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
};

const CS: Record<string, React.CSSProperties> = {
  page: { display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: '#06060e' },
  sidebar: {
    width: 216,
    flexShrink: 0,
    borderRight: '1px solid rgba(255,255,255,0.06)',
    padding: '24px 14px',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  assetBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 5,
    cursor: 'pointer',
    width: '100%',
    transition: 'all 0.2s',
    textAlign: 'left',
  },
  suggBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '7px 2px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    cursor: 'pointer',
    marginBottom: 2,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 28px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    flexShrink: 0,
  },
  inputArea: {
    display: 'flex',
    gap: 10,
    padding: '16px 24px 20px',
    borderTop: '1px solid rgba(255,255,255,0.07)',
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid',
    borderRadius: 6,
    padding: '13px 16px',
    color: '#e8e0d0',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 13,
    resize: 'none',
    outline: 'none',
    transition: 'border-color 0.2s',
    display: 'block',
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 6,
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.2s',
  },
};
