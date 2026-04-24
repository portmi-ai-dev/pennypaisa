import * as React from 'react';
import { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls, ContactShadows } from '@react-three/drei';
import { GoogleGenAI, Type } from '@google/genai';
import * as THREE from 'three';
import { GoldBullion } from './components/GoldBullion';
import { SilverBullion } from './components/SilverBullion';
import { Tether } from './components/Tether';
import { BitcoinCuboid } from './components/BitcoinCuboid';
import { ArrowLeft } from 'lucide-react';
import { soundManager } from './lib/sounds';
import { motion, AnimatePresence } from 'motion/react';

import { AppHeader, type PageId } from './components/AppHeader';
import { IntelligencePage } from './components/IntelligencePage';
import { ChatPage } from './components/ChatPage';
import { ChartPage } from './components/ChartPage';
import { type Prices, type AssetKey, type Sentiments } from './lib/marketData';

// If the URL contains ?chart=<asset>, this tab is a dedicated full-screen
// candlestick view. Resolved once at module load — the URL doesn't change
// for the lifetime of the tab, so we don't need a hook for this.
const CHART_TAB_ASSET: AssetKey | null = (() => {
  if (typeof window === 'undefined') return null;
  const param = new URLSearchParams(window.location.search).get('chart');
  if (param === 'gold' || param === 'silver' || param === 'bitcoin') return param;
  return null;
})();

function AnimatedBullion({ targetPos, children }: { targetPos: [number, number, number]; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (!ref.current) return;
    const targetVec = new THREE.Vector3(...targetPos);
    ref.current.position.lerp(targetVec, delta * 10);
  });

  return <group ref={ref}>{children}</group>;
}

// Standalone chart-tab wrapper — keeps hook order identical to the main App.
function ChartTabApp({ asset }: { asset: AssetKey }) {
  return <ChartPage asset={asset} />;
}

export default function App() {
  // Standalone chart tab: detected at module load, so the early return is safe
  // (no hooks are declared above this in the App component).
  if (CHART_TAB_ASSET) {
    return <ChartTabApp asset={CHART_TAB_ASSET} />;
  }

  // ── Page routing ──
  const [page, setPage] = useState<PageId>(() => {
    if (typeof window === 'undefined') return 'landing';
    const stored = window.localStorage.getItem('gilver_page') as PageId | null;
    return stored && ['landing', 'intelligence', 'chat'].includes(stored) ? stored : 'landing';
  });
  useEffect(() => {
    window.localStorage.setItem('gilver_page', page);
  }, [page]);

  // ── Market data state (preserved from previous app) ──
  const [goldPrice, setGoldPrice] = useState(2150);
  const [silverPrice, setSilverPrice] = useState(25);
  const [goldChange, setGoldChange] = useState(0);
  const [goldChangePercent, setGoldChangePercent] = useState(0);
  const [goldWeeklyChangePercent, setGoldWeeklyChangePercent] = useState(0);
  const [silverChange, setSilverChange] = useState(0);
  const [silverChangePercent, setSilverChangePercent] = useState(0);
  const [silverWeeklyChangePercent, setSilverWeeklyChangePercent] = useState(0);
  const [isWeekend, setIsWeekend] = useState(false);
  const [btcPrice, setBtcPrice] = useState(65000);
  const [btcChange, setBtcChange] = useState(0);
  const [btcChangePercent, setBtcChangePercent] = useState(0);
  const [btcWeeklyChangePercent, setBtcWeeklyChangePercent] = useState(0);
  const [btcMarketCap, setBtcMarketCap] = useState(1280000000000);
  const [btcDominance, setBtcDominance] = useState(52.5);
  const [btcVolume24h, setBtcVolume24h] = useState('$35.2B');
  const [btcVolumeChangePercent, setBtcVolumeChangePercent] = useState(0);

  const [isMerged, setIsMerged] = useState(false);
  const [morphedGold, setMorphedGold] = useState(false);
  const [morphedSilver, setMorphedSilver] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showBitcoin, setShowBitcoin] = useState(false);
  const [showBlockchain, setShowBlockchain] = useState(false);
  // Which bullion is currently being hovered — drives the floating Market
  // Intelligence panel (spec: "Hovering on the Bullions show Market Intelligence").
  // Tracks which bullion the cursor is over. Currently only the setter is
  // used (the smaller HTML hover popup that read this was removed) — kept
  // wired up in the bullion onPointerOver/Out callbacks for future overlays.
  const [, setHoveredAsset] = useState<AssetKey | null>(null);

  const [marketSentiment, setMarketSentiment] = useState<{
    marketType: 'bull' | 'bear' | 'neutral';
    reasoning: string;
    cowenView: string;
    solowayView: string;
    lastUpdated?: string;
  } | null>(null);
  const [goldSentiment, setGoldSentiment] = useState<typeof marketSentiment>(null);
  const [silverSentiment, setSilverSentiment] = useState<typeof marketSentiment>(null);

  const goldRef = useRef<THREE.Group>(null);
  const silverRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // ── Fetch market sentiment via Gemini (unchanged from prior version) ──
  useEffect(() => {
    const fetchSentiment = async () => {
      const STORAGE_KEY = 'market_sentiment_cache';
      const CACHE_DURATION = 60 * 60 * 1000;

      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            setMarketSentiment(data.crypto);
            setGoldSentiment(data.gold);
            setSilverSentiment(data.silver);
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to read sentiment cache', e);
      }

      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('API Key missing');
        const ai = new GoogleGenAI({ apiKey });
        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

        const fetchOne = async (label: string, contents: string) => {
          try {
            const r = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents,
              config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    marketType: { type: Type.STRING },
                    reasoning: { type: Type.STRING },
                    cowenView: { type: Type.STRING },
                    solowayView: { type: Type.STRING },
                  },
                  required: ['marketType', 'reasoning', 'cowenView', 'solowayView'],
                },
              },
            });
            if (r.text) {
              return {
                ...JSON.parse(r.text),
                lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              };
            }
          } catch (e) {
            console.warn(`${label} sentiment fetch failed:`, e);
          }
          return null;
        };

        const today = new Date().toLocaleDateString();
        const prompt = (asset: string) =>
          `Determine the absolute latest ${asset} market sentiment (Bull or Bear) as of today, ${today}, based on the most recent analysis, videos, and tweets from Benjamin Cowen and Gareth Soloway. Provide JSON: marketType ("bull"|"bear"), reasoning (MAX 30 WORDS), cowenView (MAX 25 WORDS), solowayView (MAX 25 WORDS).`;

        const cryptoData = await fetchOne('Crypto', prompt('Bitcoin/Crypto'));
        if (cryptoData) setMarketSentiment(cryptoData);
        await delay(2000);
        const goldData = await fetchOne('Gold', prompt('Gold (XAU)'));
        if (goldData) setGoldSentiment(goldData);
        await delay(2000);
        const silverData = await fetchOne('Silver', prompt('Silver (XAG)'));
        if (silverData) setSilverSentiment(silverData);

        if (cryptoData || goldData || silverData) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              timestamp: Date.now(),
              data: {
                crypto: cryptoData || marketSentiment,
                gold: goldData || goldSentiment,
                silver: silverData || silverSentiment,
              },
            }),
          );
        }
      } catch (error) {
        console.error('Error fetching sentiment:', error);
        const fallback = {
          marketType: 'bull' as const,
          reasoning: 'Market showing strong resilience above key support levels.',
          cowenView: 'Watching the bull market support band closely.',
          solowayView: 'Technical breakout confirmed on the weekly chart.',
        };
        setMarketSentiment(fallback);
        setGoldSentiment(fallback);
        setSilverSentiment(fallback);
      }
    };

    fetchSentiment();
  }, []);

  // ── Fetch real-time prices from backend ──
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices');
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) return;
        const data = await response.json();
        if (data && data.gold && data.silver) {
          setGoldPrice(data.gold);
          setSilverPrice(data.silver);
          if (data.btc) setBtcPrice(data.btc);
          if (data.btcMarketCap) setBtcMarketCap(data.btcMarketCap);
          if (data.btcDominance) setBtcDominance(data.btcDominance);
          if (data.btcVolume24h) {
            const vol = data.btcVolume24h;
            if (vol >= 1e9) setBtcVolume24h(`$${(vol / 1e9).toFixed(2)}B`);
            else if (vol >= 1e6) setBtcVolume24h(`$${(vol / 1e6).toFixed(2)}M`);
            else setBtcVolume24h(`$${vol.toLocaleString()}`);
          }
          if (data.btcVolumeChangePercent !== undefined) setBtcVolumeChangePercent(data.btcVolumeChangePercent);
          if (data.goldChange !== undefined) setGoldChange(data.goldChange);
          if (data.goldChangePercent !== undefined) setGoldChangePercent(data.goldChangePercent);
          if (data.goldWeeklyChangePercent !== undefined) setGoldWeeklyChangePercent(data.goldWeeklyChangePercent);
          if (data.silverChange !== undefined) setSilverChange(data.silverChange);
          if (data.silverChangePercent !== undefined) setSilverChangePercent(data.silverChangePercent);
          if (data.silverWeeklyChangePercent !== undefined) setSilverWeeklyChangePercent(data.silverWeeklyChangePercent);
          if (data.btcChange !== undefined) setBtcChange(data.btcChange);
          if (data.btcChangePercent !== undefined) setBtcChangePercent(data.btcChangePercent);
          if (data.btcWeeklyChangePercent !== undefined) setBtcWeeklyChangePercent(data.btcWeeklyChangePercent);
          if (data.isWeekend !== undefined) setIsWeekend(data.isWeekend);
        }
      } catch (error) {
        console.warn('Temporary network error fetching market prices.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Derived ──
  const ratio = goldPrice / (silverPrice || 0.1);
  const totalRatio = ratio + 1;
  const goldWeight = ratio / totalRatio;
  const silverWeight = 1 / totalRatio;
  const totalWidth = 10;
  const goldTargetWidth = isMerged ? totalWidth * goldWeight : 10;
  const silverTargetWidth = isMerged ? totalWidth * silverWeight : 10;
  // 3D bullion resting Y is -7 (slightly lower than previous -6) so the
  // bullions sit comfortably below the centred Au:Ag ratio / hover panels.
  // The MORPHED 2D plate positions (passed inline at the AnimatedBullion call
  // site as [-7,-4,0] / [7,-4,0]) intentionally stay where they were so the
  // chart plate remains anchored to its existing on-screen slot.
  const goldTargetPos: [number, number, number] = isMerged
    ? [-(totalWidth / 2) + goldTargetWidth / 2, -7, 0]
    : [-6.5, -7, 0];
  const silverTargetPos: [number, number, number] = isMerged
    ? [totalWidth / 2 - silverTargetWidth / 2, -7, 0]
    : [6.5, -7, 0];

  const isAnyMorphed = morphedGold || morphedSilver;

  // ── Shared prices object for header / pages ──
  const prices: Prices | null =
    goldPrice && silverPrice && btcPrice
      ? {
          gold: {
            price: goldPrice,
            changePercent24h: goldChangePercent,
            weeklyChangePercent: goldWeeklyChangePercent,
          },
          silver: {
            price: silverPrice,
            changePercent24h: silverChangePercent,
            weeklyChangePercent: silverWeeklyChangePercent,
          },
          bitcoin: {
            price: btcPrice,
            changePercent24h: btcChangePercent,
            weeklyChangePercent: btcWeeklyChangePercent,
            marketCap: btcMarketCap,
            dominance: btcDominance,
          },
          goldSilverRatio: ratio,
          isWeekend,
        }
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', background: '#06060e', overflow: 'hidden' }}>
      <AppHeader page={page} setPage={setPage} prices={prices} loading={isLoading} />

      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Landing — Three.js scene stays mounted to preserve WebGL context */}
        <div
          style={{
            display: page === 'landing' ? 'block' : 'none',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          <div className="absolute inset-0 z-0">
            <Canvas
              shadows
              camera={{ position: [0, 2, 18], fov: 45 }}
              gl={{ antialias: true, toneMapping: 3, localClippingEnabled: true }}
            >
              <OrbitControls
                makeDefault
                enablePan={false}
                target={[0, -4, 0]}
                minPolarAngle={Math.PI / 4}
                maxPolarAngle={Math.PI / 1.5}
                minAzimuthAngle={-Math.PI / 2}
                maxAzimuthAngle={Math.PI / 2}
                minDistance={10}
                maxDistance={25}
              />

              <group position={[0, 0, 0]}>
                <Suspense fallback={null}>
                  <AnimatedBullion targetPos={morphedGold ? [-7, -4, 0] : goldTargetPos}>
                    <GoldBullion
                      ref={goldRef}
                      otherBullionRef={silverRef}
                      price={100}
                      basePrice={goldPrice}
                      changePercent={goldChangePercent}
                      weeklyChangePercent={goldWeeklyChangePercent}
                      width={goldTargetWidth}
                      isMerged={isMerged}
                      isMorphed={morphedGold}
                      isWeekend={isWeekend}
                      onPointerOver={() => {
                        if (!morphedGold) document.body.style.cursor = 'pointer';
                        setHoveredAsset('gold');
                      }}
                      onPointerOut={() => {
                        document.body.style.cursor = 'auto';
                        setHoveredAsset((cur) => (cur === 'gold' ? null : cur));
                      }}
                      onClick={() => setMorphedGold(!morphedGold)}
                      marketSentiment={goldSentiment}
                    />
                  </AnimatedBullion>

                  <AnimatedBullion targetPos={morphedSilver ? [7, -4, 0] : silverTargetPos}>
                    <SilverBullion
                      ref={silverRef}
                      otherBullionRef={goldRef}
                      price={100}
                      basePrice={silverPrice}
                      changePercent={silverChangePercent}
                      weeklyChangePercent={silverWeeklyChangePercent}
                      width={silverTargetWidth}
                      isMerged={isMerged}
                      isMorphed={morphedSilver}
                      isWeekend={isWeekend}
                      onPointerOver={() => {
                        if (!morphedSilver) document.body.style.cursor = 'pointer';
                        setHoveredAsset('silver');
                      }}
                      onPointerOut={() => {
                        document.body.style.cursor = 'auto';
                        setHoveredAsset((cur) => (cur === 'silver' ? null : cur));
                      }}
                      onClick={() => setMorphedSilver(!morphedSilver)}
                      marketSentiment={silverSentiment}
                    />
                  </AnimatedBullion>

                  <Tether
                    startRef={goldRef}
                    endRef={silverRef}
                    visible={!isMerged && !morphedGold && !morphedSilver}
                    onClick={() => setShowBitcoin(!showBitcoin)}
                  />

                  <Suspense fallback={null}>
                    <BitcoinCuboid
                      visible={showBitcoin && !isMerged && !morphedGold && !morphedSilver}
                      price={btcPrice}
                      changePercent={btcChangePercent}
                      weeklyChangePercent={btcWeeklyChangePercent}
                      onClick={() => setShowBlockchain(!showBlockchain)}
                      isBlockchainExpanded={showBlockchain}
                      marketCap={btcMarketCap}
                      dominance={btcDominance}
                      volume24h={btcVolume24h}
                      volumeChangePercent={btcVolumeChangePercent}
                      marketSentiment={marketSentiment}
                    />
                  </Suspense>
                </Suspense>
              </group>

              <Environment preset="studio" />
              <ContactShadows position={[0, -8.5, 0]} opacity={0.4} scale={20} blur={2} far={4.5} />
              <ambientLight intensity={0.8} />
              <hemisphereLight intensity={0.8} groundColor="#333333" color="#ffffff" />
              <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow />
              <directionalLight position={[-10, 10, 10]} intensity={1.2} />
              <directionalLight position={[0, -10, 5]} intensity={1.5} />
              <directionalLight position={[-10, -5, 5]} intensity={1.2} />
              <pointLight position={[0, 0, 15]} intensity={1.5} />
              <pointLight position={[-15, 0, 5]} intensity={0.8} />
              <pointLight position={[15, 0, 5]} intensity={0.8} />
            </Canvas>
          </div>

          {/* Atmospheric halos behind the canvas (matches Gilver design) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 1,
              background: `
                radial-gradient(ellipse 55% 45% at 28% 62%, rgba(212,168,67,0.045) 0%, transparent 65%),
                radial-gradient(ellipse 55% 45% at 72% 62%, rgba(140,180,210,0.04) 0%, transparent 65%)
              `,
            }}
          />
          {/* Vignette */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 2,
              background:
                'radial-gradient(ellipse 90% 85% at 50% 50%, transparent 40%, rgba(3,3,10,0.65) 100%)',
            }}
          />

          {/* Loading Overlay */}
          <div
            className={`absolute inset-0 z-[200] bg-black flex flex-col items-center justify-center transition-opacity duration-1000 pointer-events-none ${
              isLoading ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="flex flex-col items-center gap-8">
              <div className="w-24 h-24 border-t-2 border-white/20 rounded-full animate-spin relative">
                <div className="absolute inset-0 border-t-2 border-white rounded-full animate-[spin_1.5s_linear_infinite]" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <h3
                  className="text-white text-xs uppercase animate-pulse"
                  style={{ letterSpacing: '0.8em', fontFamily: 'DM Sans, sans-serif' }}
                >
                  Synchronizing
                </h3>
                <p
                  className="text-white/30 text-[9px] uppercase"
                  style={{ letterSpacing: '0.4em', fontFamily: 'DM Sans, sans-serif' }}
                >
                  Global Market Feed
                </p>
              </div>
            </div>
          </div>

          {/* Ratio Display (visible only when merged) */}
          <div
            className={`absolute z-10 text-right transition-all duration-1000 ${
              isMerged && !isAnyMorphed ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'
            }`}
            style={{ top: 32, right: 48 }}
          >
            <h2
              className="uppercase mb-2"
              style={{ fontSize: 11, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans, sans-serif' }}
            >
              Gold:Silver Ratio
            </h2>
            <div className="flex items-baseline justify-end gap-2">
              <span
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  fontSize: 80,
                  fontWeight: 300,
                  color: '#e8e0d0',
                  fontStyle: 'italic',
                  lineHeight: 1,
                }}
              >
                {ratio.toFixed(1)}
              </span>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 300,
                  color: 'rgba(255,255,255,0.2)',
                  letterSpacing: 4,
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                :1
              </span>
            </div>
            <div className="ml-auto mt-4" style={{ height: 1, width: 128, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* NOTE: The smaller XAU/XAG hover Market Intelligence pop-up and the
              bottom-center Bullion-State strip were removed per design — the
              full intelligence breakdown lives in the Intelligence tab and the
              large in-scene panels rendered by GoldBullion / SilverBullion /
              BitcoinCuboid on hover. */}

          {/* Back arrows for morphed assets */}
          <AnimatePresence>
            {morphedGold && (
              <motion.button
                key="close-gold-chart"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => setMorphedGold(false)}
                className="fixed z-[300] flex items-center justify-center w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white backdrop-blur-xl pointer-events-auto cursor-pointer group transition-colors"
                style={{ top: 78, left: 32 }}
              >
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
              </motion.button>
            )}
            {morphedSilver && (
              <motion.button
                key="close-silver-chart"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => setMorphedSilver(false)}
                className="fixed z-[300] flex items-center justify-center w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white backdrop-blur-xl pointer-events-auto cursor-pointer group transition-colors"
                style={{ top: 78, left: 32 }}
              >
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Au:Ag Ratio button (bottom-left) — Gilver style */}
          <div
            className={`absolute z-20 transition-opacity duration-500 ${isAnyMorphed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            style={{ bottom: 28, left: 28 }}
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                soundManager.playHeavyCollision();
                setIsMerged(!isMerged);
              }}
              style={{
                background: isMerged ? '#e8e0d0' : 'rgba(5,5,12,0.8)',
                border: `1px solid ${isMerged ? '#e8e0d0' : 'rgba(255,255,255,0.09)'}`,
                borderRadius: 4,
                padding: '10px 20px',
                color: isMerged ? '#06060e' : 'rgba(255,255,255,0.6)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 10,
                letterSpacing: 2,
                textTransform: 'uppercase',
                cursor: 'pointer',
                backdropFilter: 'blur(16px)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: isMerged ? '#a07b1e' : '#d4a843', fontSize: 12 }}>Au</span>
              <span style={{ opacity: 0.5 }}>:</span>
              <span style={{ color: isMerged ? '#5b6b78' : '#90a8bc', fontSize: 12 }}>Ag</span>
              {prices?.goldSilverRatio && (
                <span style={{ marginLeft: 6, color: isMerged ? '#06060e' : 'rgba(255,255,255,0.5)' }}>
                  {prices.goldSilverRatio.toFixed(1)}×
                </span>
              )}
              <span style={{ marginLeft: 10, opacity: 0.5 }}>{isMerged ? 'Deconstruct' : 'Merge'}</span>
            </motion.button>
          </div>

          {/* Subtle right hint */}
          <div
            className={`absolute z-10 transition-opacity duration-500 ${isAnyMorphed ? 'opacity-0' : 'opacity-100'}`}
            style={{
              bottom: 36,
              right: 32,
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 9,
              letterSpacing: 2.5,
              color: 'rgba(255,255,255,0.16)',
              textTransform: 'uppercase',
              pointerEvents: 'none',
            }}
          >
            Hover · Click · Explore
          </div>
        </div>

        {/* Intelligence */}
        <div
          style={{
            display: page === 'intelligence' ? 'block' : 'none',
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
          }}
        >
          <IntelligencePage prices={prices} />
        </div>

        {/* Smart Assets / Chat */}
        <div
          style={{
            display: page === 'chat' ? 'block' : 'none',
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
          }}
        >
          <ChatPage
            prices={prices}
            sentiments={
              {
                gold: goldSentiment,
                silver: silverSentiment,
                bitcoin: marketSentiment,
              } satisfies Sentiments
            }
          />
        </div>
      </main>
    </div>
  );
}
