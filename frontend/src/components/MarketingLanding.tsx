import * as React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Sparkles, Activity, Workflow, MessageSquare } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import { usePrices } from '../lib/usePrices';

const PILLARS = [
  {
    to: '/app/asset',
    label: 'Assets',
    accent: '#d4a843',
    title: 'A living view of capital.',
    body: 'Gold, silver and bitcoin rendered as physical objects you can rotate, merge and explore. The 3D scene is the dashboard — every motion is a market signal.',
    icon: <Sparkles size={18} strokeWidth={1.6} />,
  },
  {
    to: '/app/capflow',
    label: 'Capital Flow',
    accent: '#48c09e',
    title: 'See where money is moving.',
    body: 'Rotation between safe-havens and risk assets, mapped onto a single flow diagram. Spot the pivot before the headline lands.',
    icon: <Workflow size={18} strokeWidth={1.6} />,
  },
  {
    to: '/app/intel',
    label: 'Intelligence',
    accent: '#4a8fe8',
    title: 'Two analysts, one panel.',
    body: 'A bull and a bear — Cowen and Soloway — argue every move with macro context, technical signals, key levels and catalysts. Updated hourly.',
    icon: <Activity size={18} strokeWidth={1.6} />,
  },
  {
    to: '/app/smart_asset',
    label: 'Smart Assets',
    accent: '#9b72cf',
    title: 'Talk to the assets.',
    body: 'Ask gold why it broke out. Ask silver where it sees support. Each asset has a voice tuned by today’s sentiment, not last week’s training data.',
    icon: <MessageSquare size={18} strokeWidth={1.6} />,
  },
];

export const MarketingLanding: React.FC = () => {
  const { prices, loading } = usePrices();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#06060e',
        color: '#e8e0d0',
        fontFamily: 'DM Sans, sans-serif',
        overflowX: 'hidden',
        position: 'relative',
      }}
    >
      <MarketingHeader prices={prices} loading={loading} variant="marketing" />

      {/* Ambient glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: `
            radial-gradient(ellipse 60% 40% at 25% 20%, rgba(212,168,67,0.10) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 30%, rgba(140,180,210,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 80% 60% at 50% 90%, rgba(155,114,207,0.06) 0%, transparent 70%)
          `,
        }}
      />

      {/* Hero */}
      <section
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '180px 32px 120px',
          maxWidth: 1200,
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(212,168,67,0.08)',
            border: '1px solid rgba(212,168,67,0.22)',
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#d4a843',
            marginBottom: 28,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#d4a843',
              boxShadow: '0 0 8px #d4a84388',
            }}
          />
          Live · Au · Ag · BTC
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 'clamp(48px, 7vw, 88px)',
            fontWeight: 300,
            lineHeight: 1.05,
            letterSpacing: -1,
            margin: 0,
            color: '#f3ecdc',
          }}
        >
          The market,<br />
          <span style={{ fontStyle: 'italic', color: '#d4a843' }}>cast in metal.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          style={{
            maxWidth: 640,
            margin: '28px auto 0',
            fontSize: 18,
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.62)',
          }}
        >
          gilver.ai is a live market terminal where gold, silver and bitcoin are
          rendered as physical objects. Hover, merge and interrogate them — every
          motion encodes price, sentiment and capital flow.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          style={{
            display: 'flex',
            gap: 14,
            justifyContent: 'center',
            marginTop: 44,
            flexWrap: 'wrap',
          }}
        >
          <Link
            to="/app/asset"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 26px',
              borderRadius: 999,
              background: 'linear-gradient(180deg, #d4a843 0%, #b88f2c 100%)',
              color: '#1a1306',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              boxShadow: '0 8px 28px rgba(212,168,67,0.35)',
              border: '1px solid rgba(212,168,67,0.5)',
            }}
          >
            Enter the terminal
            <ArrowRight size={16} strokeWidth={2.2} />
          </Link>
          <a
            href="#pillars"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 26px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.78)',
              fontWeight: 500,
              fontSize: 15,
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            How it works
          </a>
        </motion.div>
      </section>

      {/* Pillars */}
      <section
        id="pillars"
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '60px 32px 120px',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: 14,
            }}
          >
            Four pillars · One terminal
          </div>
          <h2
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: 'clamp(32px, 4vw, 48px)',
              fontWeight: 300,
              margin: 0,
              color: '#f3ecdc',
            }}
          >
            Built around how capital actually moves.
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.label}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
            >
              <Link
                to={p.to}
                style={{
                  display: 'block',
                  padding: 28,
                  borderRadius: 14,
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  textDecoration: 'none',
                  color: 'inherit',
                  height: '100%',
                  transition: 'transform 0.2s, border-color 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.borderColor = `${p.accent}55`;
                  e.currentTarget.style.boxShadow = `0 14px 36px ${p.accent}1a`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: `${p.accent}14`,
                    border: `1px solid ${p.accent}33`,
                    color: p.accent,
                    fontSize: 11,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    marginBottom: 18,
                  }}
                >
                  {p.icon}
                  {p.label}
                </div>
                <h3
                  style={{
                    fontFamily: 'Cormorant Garamond, serif',
                    fontSize: 26,
                    fontWeight: 400,
                    margin: '0 0 12px',
                    color: '#f3ecdc',
                    lineHeight: 1.2,
                  }}
                >
                  {p.title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'rgba(255,255,255,0.6)',
                    margin: 0,
                  }}
                >
                  {p.body}
                </p>
                <div
                  style={{
                    marginTop: 22,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: p.accent,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  Open <ArrowRight size={14} strokeWidth={2} />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '40px 32px 140px',
          maxWidth: 900,
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 'clamp(32px, 4.5vw, 56px)',
            fontWeight: 300,
            margin: 0,
            color: '#f3ecdc',
            lineHeight: 1.15,
          }}
        >
          Stop reading the market.<br />
          <span style={{ fontStyle: 'italic', color: '#d4a843' }}>Watch it move.</span>
        </h2>
        <Link
          to="/app/asset"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 36,
            padding: '14px 26px',
            borderRadius: 999,
            background: 'linear-gradient(180deg, #d4a843 0%, #b88f2c 100%)',
            color: '#1a1306',
            fontWeight: 600,
            fontSize: 15,
            textDecoration: 'none',
            boxShadow: '0 8px 28px rgba(212,168,67,0.35)',
            border: '1px solid rgba(212,168,67,0.5)',
          }}
        >
          Launch terminal
          <ArrowRight size={16} strokeWidth={2.2} />
        </Link>
      </section>

      {/* Footer */}
      <footer
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '40px 32px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          color: 'rgba(255,255,255,0.35)',
          fontSize: 12,
          textAlign: 'center',
        }}
      >
        <span style={{ letterSpacing: 2, textTransform: 'uppercase' }}>
          gilver.ai · capital, rendered.
        </span>
      </footer>
    </div>
  );
};
