import * as React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Sparkles, Activity, Workflow, MessageSquare } from 'lucide-react';
import { MarketingHeader } from '../components/MarketingHeader';
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

/**
 * 3D glass logo (gold + silver overlapping squares) that follows the cursor
 * like a sunflower. Background also reacts to mouse position with a silver
 * shimmer that chases the cursor.
 */
const HeroSpotlight: React.FC = () => {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const bgRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let tRX = 0, tRY = 0, cRX = 0, cRY = 0;
    let tBgX = 30, tBgY = 50, bgX = 30, bgY = 50;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const maxR = 35;
      tRY = Math.max(-maxR, Math.min(maxR, dx / 18));
      tRX = Math.max(-maxR, Math.min(maxR, -dy / 22));
      tBgX = (e.clientX / window.innerWidth) * 100;
      tBgY = (e.clientY / window.innerHeight) * 100;
    };

    const loop = () => {
      cRX += (tRX - cRX) * 0.07;
      cRY += (tRY - cRY) * 0.07;
      bgX += (tBgX - bgX) * 0.04;
      bgY += (tBgY - bgY) * 0.04;
      if (stageRef.current) {
        stageRef.current.style.transform = `rotateX(${cRX}deg) rotateY(${cRY}deg)`;
      }
      if (bgRef.current) {
        bgRef.current.style.setProperty('--mx', bgX + '%');
        bgRef.current.style.setProperty('--my', bgY + '%');
      }
      raf = requestAnimationFrame(loop);
    };
    document.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);
    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      {/* Mouse-reactive silvery background */}
      <div
        ref={bgRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 70% 60% at var(--mx, 30%) var(--my, 50%),
              rgba(210,215,240,0.22) 0%,
              rgba(180,185,215,0.08) 35%,
              transparent 65%),
            radial-gradient(ellipse 65% 55% at calc(100% - var(--mx, 30%)) calc(100% - var(--my, 50%)),
              rgba(220,180,90,0.13) 0%,
              rgba(201,168,76,0.04) 40%,
              transparent 70%),
            radial-gradient(ellipse 100% 60% at 50% 0%,
              rgba(210,215,235,0.06) 0%,
              transparent 55%)
          `,
        } as React.CSSProperties}
      />

      {/* 3D glass logo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          perspective: 900,
          height: 360,
        }}
      >
        <div
          ref={stageRef}
          style={{
            position: 'relative',
            width: 280,
            height: 280,
            transformStyle: 'preserve-3d',
            transition: 'transform 0.1s ease-out',
          }}
        >
          {/* ambient glows */}
          <div
            style={{
              position: 'absolute',
              width: 280, height: 280,
              top: -30, left: -50,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(220,180,80,0.18) 0%, transparent 70%)',
              filter: 'blur(80px)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 240, height: 240,
              bottom: -30, right: -30,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(180,185,220,0.14) 0%, transparent 70%)',
              filter: 'blur(80px)',
              pointerEvents: 'none',
            }}
          />

          {/* GOLD square */}
          <div
            style={{
              position: 'absolute',
              width: 170, height: 170,
              top: 20, left: 20,
              borderRadius: 28,
              background: 'linear-gradient(135deg, rgba(255,225,130,0.55) 0%, rgba(232,201,122,0.4) 30%, rgba(201,168,76,0.45) 60%, rgba(154,122,46,0.5) 100%)',
              border: '1.5px solid rgba(255,225,130,0.55)',
              backdropFilter: 'blur(14px)',
              boxShadow: 'inset 0 2px 16px rgba(255,235,140,0.4), inset 0 -2px 10px rgba(120,80,0,0.25), 0 12px 50px rgba(201,168,76,0.3), 0 4px 8px rgba(0,0,0,0.4)',
              transform: 'translateZ(20px) rotateX(8deg) rotateY(-10deg)',
              animation: 'gilverFloatGold 7s ease-in-out infinite',
            }}
          >
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 27,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.12) 32%, transparent 60%)',
              pointerEvents: 'none',
            }}/>
            <div style={{
              position: 'absolute', top: 8, left: 8, right: 8, height: '42%',
              borderRadius: '22px 22px 0 0',
              background: 'linear-gradient(to bottom, rgba(255,245,180,0.45) 0%, transparent 100%)',
              filter: 'blur(5px)',
              pointerEvents: 'none',
            }}/>
          </div>

          {/* SILVER square */}
          <div
            style={{
              position: 'absolute',
              width: 155, height: 155,
              top: 90, left: 90,
              borderRadius: 28,
              background: 'linear-gradient(135deg, rgba(225,225,240,0.55) 0%, rgba(180,185,210,0.4) 30%, rgba(140,145,170,0.45) 60%, rgba(95,100,125,0.5) 100%)',
              border: '1.5px solid rgba(220,220,240,0.55)',
              backdropFilter: 'blur(18px)',
              boxShadow: 'inset 0 2px 16px rgba(235,235,255,0.4), inset 0 -2px 10px rgba(60,60,85,0.25), 0 12px 50px rgba(168,168,200,0.25), 0 4px 8px rgba(0,0,0,0.5)',
              transform: 'translateZ(50px) rotateX(-5deg) rotateY(8deg)',
              animation: 'gilverFloatSilver 9s ease-in-out infinite -3s',
            }}
          >
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 27,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.1) 35%, transparent 60%)',
              pointerEvents: 'none',
            }}/>
            <div style={{
              position: 'absolute', top: 8, left: 8, right: 8, height: '42%',
              borderRadius: '22px 22px 0 0',
              background: 'linear-gradient(to bottom, rgba(230,230,255,0.4) 0%, transparent 100%)',
              filter: 'blur(5px)',
              pointerEvents: 'none',
            }}/>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes gilverFloatGold {
          0%,100% { transform: translateZ(20px) rotateX(8deg) rotateY(-10deg) translateY(0px); }
          50%      { transform: translateZ(20px) rotateX(8deg) rotateY(-10deg) translateY(-12px); }
        }
        @keyframes gilverFloatSilver {
          0%,100% { transform: translateZ(50px) rotateX(-5deg) rotateY(8deg) translateY(0px); }
          50%      { transform: translateZ(50px) rotateX(-5deg) rotateY(8deg) translateY(-10px); }
        }
      `}</style>
    </>
  );
};

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

      {/* Hero — split layout: 3D logo left, text right */}
      <section
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '140px 32px 100px',
          maxWidth: 1280,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.1fr)',
          alignItems: 'center',
          gap: 40,
        }}
      >
        {/* LEFT: cursor-following 3D logo + reactive bg */}
        <HeroSpotlight />

        {/* RIGHT: text */}
        <div style={{ position: 'relative', zIndex: 2 }}>
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
                width: 6, height: 6, borderRadius: '50%',
                background: '#d4a843',
                boxShadow: '0 0 8px #d4a84388',
              }}
            />
            Your Personal Market Analyst
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: 'clamp(48px, 6vw, 84px)',
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
              maxWidth: 540,
              margin: '24px 0 0',
              fontSize: 17,
              lineHeight: 1.65,
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
              marginTop: 40,
              flexWrap: 'wrap',
            }}
          >
            <Link
              to="/app/asset"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 26px',
                borderRadius: 999,
                background: 'linear-gradient(180deg, #d4a843 0%, #b88f2c 100%)',
                color: '#1a1306',
                fontWeight: 600, fontSize: 15,
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
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 26px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.78)',
                fontWeight: 500, fontSize: 15,
                textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              How it works
            </a>
          </motion.div>
        </div>
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
