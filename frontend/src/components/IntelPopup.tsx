import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { AssetSentiment } from '../lib/marketData';

export interface IntelPopupProps {
  visible: boolean;
  side: 'left' | 'right';
  asset: 'gold' | 'silver' | 'bitcoin';
  sentiment: AssetSentiment | null;
  topOffset?: number;
}

const ACCENT: Record<'gold' | 'silver' | 'bitcoin', { primary: string; secondary: string; title: string }> = {
  gold: {
    primary: '#d4a843',
    secondary: '#b88f2c',
    title: 'GOLD MARKET SENTIMENT',
  },
  silver: {
    primary: '#b8c4cc',
    secondary: '#8fa3ad',
    title: 'SILVER MARKET SENTIMENT',
  },
  bitcoin: {
    primary: '#f7931a',
    secondary: '#c66f0c',
    title: 'BITCOIN MARKET SENTIMENT',
  },
};

const consensusColor = (c: AssetSentiment['consensus']) =>
  c === 'bull' ? '#4caf50' : c === 'bear' ? '#ef5350' : 'rgba(255,255,255,0.55)';

export const IntelPopup: React.FC<IntelPopupProps> = ({
  visible,
  side,
  asset,
  sentiment,
  topOffset = 110,
}) => {
  const isLeft = side === 'left';
  const accent = ACCENT[asset];

  return (
    <AnimatePresence>
      {visible && sentiment && (
        <motion.div
          key={asset}
          initial={{ opacity: 0, x: isLeft ? -16 : 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: isLeft ? -12 : 12 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: topOffset,
            [isLeft ? 'left' : 'right']: 24,
            width: 380,
            maxHeight: 'calc(100vh - 160px)',
            overflowY: 'auto',
            zIndex: 50,
            padding: 22,
            borderRadius: 16,
            background: 'rgba(14,14,22,0.78)',
            border: `1px solid ${accent.primary}33`,
            boxShadow: `0 20px 60px rgba(0,0,0,0.45), 0 0 0 1px ${accent.primary}1a, inset 0 1px 0 rgba(255,255,255,0.05)`,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            color: '#e8e0d0',
            fontFamily: 'DM Sans, sans-serif',
            pointerEvents: 'auto',
          }}
        >
          {/* Title strip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: 2.5,
                textTransform: 'uppercase',
                color: accent.primary,
                fontWeight: 600,
              }}
            >
              {accent.title}
            </span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: accent.primary,
                boxShadow: `0 0 8px ${accent.primary}88`,
                flexShrink: 0,
              }}
            />
          </div>

          {/* Consensus badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 999,
              background: `${consensusColor(sentiment.consensus)}1f`,
              border: `1px solid ${consensusColor(sentiment.consensus)}55`,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: consensusColor(sentiment.consensus),
              }}
            />
            <span
              style={{
                fontSize: 11,
                letterSpacing: 1.8,
                textTransform: 'uppercase',
                color: consensusColor(sentiment.consensus),
                fontWeight: 600,
              }}
            >
              Consensus · {sentiment.consensus}
            </span>
          </div>

          {/* Summary — plain text, no box, no label */}
          {sentiment.summary && (
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: 'rgba(255,255,255,0.82)',
                margin: '0 0 14px',
              }}
            >
              {sentiment.summary}
            </p>
          )}

          {/* Analyst View — boxy card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AnalystCard
              name="Analyst View"
              accent={accent.primary}
              body={sentiment.analystView}
            />
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              fontSize: 9,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.32)',
              textAlign: 'center',
            }}
          >
            AI Sentiment ·{' '}
            {sentiment.lastUpdated ? `Updated ${sentiment.lastUpdated}` : 'Live data'}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const AnalystCard: React.FC<{ name: string; accent: string; body: string }> = ({
  name,
  accent,
  body,
}) => (
  <div
    style={{
      padding: '12px 14px',
      borderRadius: 10,
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}
  >
    <div
      style={{
        fontSize: 10,
        letterSpacing: 1.8,
        textTransform: 'uppercase',
        color: accent,
        fontWeight: 600,
        marginBottom: 6,
      }}
    >
      {name}
    </div>
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        color: 'rgba(255,255,255,0.7)',
      }}
    >
      {body}
    </div>
  </div>
);
