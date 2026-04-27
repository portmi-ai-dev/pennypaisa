import * as React from 'react';
import { useState, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { GoldBullion } from '../components/GoldBullion';
import { SilverBullion } from '../components/SilverBullion';
import { Tether } from '../components/Tether';
import { BitcoinCuboid } from '../components/BitcoinCuboid';
import { CursorBackground } from '../components/CursorBackground';
import { soundManager } from '../lib/sounds';
import { type AssetKey, type AssetSentiment, type Prices } from '../lib/marketData';

interface AnimatedBullionProps {
  targetPos: [number, number, number];
  children: React.ReactNode;
}

function AnimatedBullion({ targetPos, children }: AnimatedBullionProps) {
  const ref = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (!ref.current) return;
    const targetVec = new THREE.Vector3(...targetPos);
    ref.current.position.lerp(targetVec, delta * 10);
  });

  return <group ref={ref}>{children}</group>;
}

export interface AssetPageProps {
  // ── shared market data forwarded from AppShell ──
  isLoading: boolean;
  isWeekend: boolean;
  prices: Prices | null;
  goldPrice: number;
  silverPrice: number;
  btcPrice: number;
  goldChangePercent: number;
  goldWeeklyChangePercent: number;
  silverChangePercent: number;
  silverWeeklyChangePercent: number;
  btcChangePercent: number;
  btcWeeklyChangePercent: number;
  btcMarketCap: number;
  btcDominance: number;
  btcVolume24h: string;
  btcVolumeChangePercent: number;
  // ── per-asset sentiment, fetched on hover ──
  goldSentiment: AssetSentiment | null;
  silverSentiment: AssetSentiment | null;
  bitcoinSentiment: AssetSentiment | null;
  // ── hover-triggered sentiment fetch (throttled in AppShell) ──
  fetchSentimentFor: (asset: 'gold' | 'silver' | 'bitcoin') => void;
}

export const AssetPage: React.FC<AssetPageProps> = ({
  isLoading,
  isWeekend,
  prices,
  goldPrice,
  silverPrice,
  btcPrice,
  goldChangePercent,
  goldWeeklyChangePercent,
  silverChangePercent,
  silverWeeklyChangePercent,
  btcChangePercent,
  btcWeeklyChangePercent,
  btcMarketCap,
  btcDominance,
  btcVolume24h,
  btcVolumeChangePercent,
  goldSentiment,
  silverSentiment,
  bitcoinSentiment,
  fetchSentimentFor,
}) => {
  // ── Scene-local state (does not need to survive route changes) ──
  const [isMerged, setIsMerged] = useState(false);
  const [morphedGold, setMorphedGold] = useState(false);
  const [morphedSilver, setMorphedSilver] = useState(false);
  const [showBitcoin, setShowBitcoin] = useState(false);
  const [showBlockchain, setShowBlockchain] = useState(false);
  // Tracks which bullion the cursor is over. Currently only the setter is
  // used (the smaller HTML hover popup that read this was removed) — kept
  // wired up in the bullion onPointerOver/Out callbacks for future overlays.
  const [, setHoveredAsset] = useState<AssetKey | null>(null);

  const goldRef = useRef<THREE.Group>(null);
  const silverRef = useRef<THREE.Group>(null);

  // ── Derived bullion layout ──
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

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Cursor-reactive shimmer behind the canvas. The Canvas's default
          alpha:true clear lets this show through everywhere the 3D scene
          isn't actively painting. */}
      <CursorBackground />

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
                    fetchSentimentFor('gold');
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
                    fetchSentimentFor('silver');
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
                  onHoverIntelligence={() => fetchSentimentFor('bitcoin')}
                  isBlockchainExpanded={showBlockchain}
                  marketCap={btcMarketCap}
                  dominance={btcDominance}
                  volume24h={btcVolume24h}
                  volumeChangePercent={btcVolumeChangePercent}
                  marketSentiment={bitcoinSentiment}
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
  );
};
