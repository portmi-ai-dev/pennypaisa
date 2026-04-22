import * as React from 'react';
import { useState, useRef, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, OrbitControls, ContactShadows } from '@react-three/drei';
import { GoogleGenAI, Type } from "@google/genai";
import * as THREE from 'three';
import { GoldBullion } from './components/GoldBullion';
import { SilverBullion } from './components/SilverBullion';
import { Tether } from './components/Tether';
import { BitcoinCuboid } from './components/BitcoinCuboid';
import { CandlestickChart } from './components/CandlestickChart';
import { ArrowLeft, ArrowUp, ArrowDown, Activity } from 'lucide-react';
import { soundManager } from './lib/sounds';

import { motion, AnimatePresence } from 'motion/react';

function MarketSimulator({ isMerged, onNoiseUpdate }: { isMerged: boolean, onNoiseUpdate: (noise: number) => void }) {
  // Removed the state update every frame to prevent unnecessary re-renders of the entire app.
  // This helps stabilize the text and geometry rendering.
  return null;
}

function AnimatedBullion({ targetPos, children }: any) {
  const ref = useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (!ref.current) return;
    const targetVec = new THREE.Vector3(...targetPos);
    ref.current.position.lerp(targetVec, delta * 10);
  });

  return (
    <group ref={ref}>
      {children}
    </group>
  );
}

export default function App() {
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
  const [volatility, setVolatility] = useState(50);
  const [isMerged, setIsMerged] = useState(false);
  const [morphedGold, setMorphedGold] = useState(false);
  const [morphedSilver, setMorphedSilver] = useState(false);
  const [marketNoise, setMarketNoise] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showBitcoin, setShowBitcoin] = useState(false);
  const [showBlockchain, setShowBlockchain] = useState(false);
  const [btcVolume24h, setBtcVolume24h] = useState("$35.2B");
  const [btcVolumeChangePercent, setBtcVolumeChangePercent] = useState(0);

// Chart State
  const [activeChart, setActiveChart] = useState<'gold' | 'silver' | 'btc' | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);

  const [marketSentiment, setMarketSentiment] = useState<{
    marketType: 'bull' | 'bear' | 'neutral';
    reasoning: string;
    cowenView: string;
    solowayView: string;
    lastUpdated?: string;
  } | null>(null);

  const [goldSentiment, setGoldSentiment] = useState<{
    marketType: 'bull' | 'bear' | 'neutral';
    reasoning: string;
    cowenView: string;
    solowayView: string;
    lastUpdated?: string;
  } | null>(null);

  const [silverSentiment, setSilverSentiment] = useState<{
    marketType: 'bull' | 'bear' | 'neutral';
    reasoning: string;
    cowenView: string;
    solowayView: string;
    lastUpdated?: string;
  } | null>(null);

  const goldRef = useRef<THREE.Group>(null);
  const silverRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Removed the manual price drift interval to keep the base price accurate to the API.

  // Fetch market sentiment using Gemini with Google Search
  useEffect(() => {
    const fetchSentiment = async () => {
      const STORAGE_KEY = 'market_sentiment_cache';
      const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

      // Check cache first
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            console.log("Using cached market sentiment");
            setMarketSentiment(data.crypto);
            setGoldSentiment(data.gold);
            setSilverSentiment(data.silver);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to read sentiment cache", e);
      }

      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          console.warn("Gemini API key not found. Using fallback sentiment.");
          throw new Error("API Key missing");
        }
        const ai = new GoogleGenAI({ apiKey });
        
        // Helper to delay between requests
        const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

        // Fetch Crypto Sentiment
        let cryptoData = null;
        try {
          const cryptoResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Determine the absolute latest Bitcoin/Crypto market sentiment (Bull or Bear) as of today, ${new Date().toLocaleDateString()}, based on the most recent analysis, videos, and tweets from Benjamin Cowen and Gareth Soloway. 
            Provide the answer in JSON format with the following fields:
            - marketType: "bull" or "bear"
            - reasoning: a very concise summary (MAX 30 WORDS)
            - cowenView: latest stance from Benjamin Cowen (MAX 25 WORDS)
            - solowayView: latest stance from Gareth Soloway (MAX 25 WORDS)`,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  marketType: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                  cowenView: { type: Type.STRING },
                  solowayView: { type: Type.STRING }
                },
                required: ["marketType", "reasoning", "cowenView", "solowayView"]
              }
            }
          });

          if (cryptoResponse.text) {
            cryptoData = {
              ...JSON.parse(cryptoResponse.text),
              lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMarketSentiment(cryptoData);
          }
        } catch (e) {
          console.warn("Crypto sentiment fetch failed:", e);
        }

        await delay(2000); // Wait 2 seconds between requests to avoid burst limits

        // Fetch Gold Sentiment
        let goldData = null;
        try {
          const goldResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Determine the absolute latest Gold (XAU) market sentiment (Bull or Bear) as of today, ${new Date().toLocaleDateString()}, based on the most recent analysis, videos, and tweets from Benjamin Cowen and Gareth Soloway. 
            Provide the answer in JSON format with the following fields:
            - marketType: "bull" or "bear"
            - reasoning: a very concise summary (MAX 30 WORDS)
            - cowenView: latest stance from Benjamin Cowen (MAX 25 WORDS)
            - solowayView: latest stance from Gareth Soloway (MAX 25 WORDS)`,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  marketType: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                  cowenView: { type: Type.STRING },
                  solowayView: { type: Type.STRING }
                },
                required: ["marketType", "reasoning", "cowenView", "solowayView"]
              }
            }
          });

          if (goldResponse.text) {
            goldData = {
              ...JSON.parse(goldResponse.text),
              lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setGoldSentiment(goldData);
          }
        } catch (e) {
          console.warn("Gold sentiment fetch failed:", e);
        }

        await delay(2000);

        // Fetch Silver Sentiment
        let silverData = null;
        try {
          const silverResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Determine the absolute latest Silver (XAG) market sentiment (Bull or Bear) as of today, ${new Date().toLocaleDateString()}, based on the most recent analysis, videos, and tweets from Benjamin Cowen and Gareth Soloway. 
            Provide the answer in JSON format with the following fields:
            - marketType: "bull" or "bear"
            - reasoning: a very concise summary (MAX 30 WORDS)
            - cowenView: latest stance from Benjamin Cowen (MAX 25 WORDS)
            - solowayView: latest stance from Gareth Soloway (MAX 25 WORDS)`,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  marketType: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                  cowenView: { type: Type.STRING },
                  solowayView: { type: Type.STRING }
                },
                required: ["marketType", "reasoning", "cowenView", "solowayView"]
              }
            }
          });

          if (silverResponse.text) {
            silverData = {
              ...JSON.parse(silverResponse.text),
              lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setSilverSentiment(silverData);
          }
        } catch (e) {
          console.warn("Silver sentiment fetch failed:", e);
        }

        // Cache the successful results
        if (cryptoData || goldData || silverData) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: {
              crypto: cryptoData || marketSentiment,
              gold: goldData || goldSentiment,
              silver: silverData || silverSentiment
            }
          }));
        }

      } catch (error) {
        console.error("Error fetching sentiment:", error);
        
        // Final fallback logic
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const { data } = JSON.parse(cached);
          setMarketSentiment(data.crypto);
          setGoldSentiment(data.gold);
          setSilverSentiment(data.silver);
          return;
        }

        const fallback = {
          marketType: 'bull' as const,
          reasoning: 'Market showing strong resilience above key support levels.',
          cowenView: 'Watching the bull market support band closely.',
          solowayView: 'Technical breakout confirmed on the weekly chart.'
        };
        setMarketSentiment(fallback);
        setGoldSentiment(fallback);
        setSilverSentiment(fallback);
      }
    };

    fetchSentiment();
  }, []);

  // Fetch real-time prices from our Yahoo Finance proxy
  React.useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices');
        
        // Check if the response is actually JSON to prevent parsing errors on 502/HTML pages
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.warn("Received non-JSON response from server (likely a temporary proxy error during restart). Retrying next cycle.");
          return; // Exit early without throwing
        }

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
        
        if (data.error) {
          console.warn('Price API returned an error (using fallback):', data.error);
        }
      } catch (error) {
        console.warn('Temporary network error fetching market prices. Retrying next cycle.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const displayGoldPrice = goldPrice;
  const displaySilverPrice = silverPrice;

  const ratio = displayGoldPrice / (displaySilverPrice || 0.1);
  const totalRatio = ratio + 1;
  const goldWeight = ratio / totalRatio;
  const silverWeight = 1 / totalRatio;

  // Base width of a bullion bar is 10
  const totalWidth = 10;
  const goldTargetWidth = isMerged ? totalWidth * goldWeight : 10;
  const silverTargetWidth = isMerged ? totalWidth * silverWeight : 10;

  const goldTargetPos: [number, number, number] = isMerged 
    ? [-(totalWidth / 2) + (goldTargetWidth / 2), -6, 0] 
    : [-6.5, -6, 0];
    
  const silverTargetPos: [number, number, number] = isMerged 
    ? [(totalWidth / 2) - (silverTargetWidth / 2), -6, 0] 
    : [6.5, -6, 0];

  const handleMorphGold = () => setMorphedGold(!morphedGold);
  const handleMorphSilver = () => setMorphedSilver(!morphedSilver);

  const fetchHistory = async (asset: 'gold' | 'silver' | 'btc') => {
    setIsChartLoading(true);
    try {
      const response = await fetch(`/api/history/${asset}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setChartData(data);
        setActiveChart(asset);
      } else {
        console.error("API returned error or invalid format:", data);
        setChartData([]); // Clear old data
        setActiveChart(asset); // Still show chart container with "loading/error" state
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
      setChartData([]);
      setActiveChart(asset);
    } finally {
      setIsChartLoading(false);
    }
  };

  const isAnyMorphed = morphedGold || morphedSilver;

  return (
    <div className="w-full h-screen bg-[#050505] overflow-hidden relative">
      <div className="absolute inset-0 z-0">
        <Canvas
          shadows
          camera={{ position: [0, 2, 18], fov: 45 }}
          gl={{ 
            antialias: true, 
            toneMapping: 3,
            localClippingEnabled: true 
          }}
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
            <MarketSimulator isMerged={isMerged} onNoiseUpdate={setMarketNoise} />
            <Suspense fallback={null}>
              {/* Gold Bullion Container */}
              <AnimatedBullion
                targetPos={morphedGold ? [-7, -4, 0] : goldTargetPos}
              >
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
                  onPointerOver={() => !morphedGold && (document.body.style.cursor = 'pointer')}
                  onPointerOut={() => (document.body.style.cursor = 'auto')}
                  onClick={() => {
                    console.log('Gold handleMorph triggered');
                    handleMorphGold();
                  }}
                  marketSentiment={goldSentiment}
                />
              </AnimatedBullion>

              {/* Silver Bullion Container */}
              <AnimatedBullion
                targetPos={morphedSilver ? [7, -4, 0] : silverTargetPos}
              >
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
                  onPointerOver={() => !morphedSilver && (document.body.style.cursor = 'pointer')}
                  onPointerOut={() => (document.body.style.cursor = 'auto')}
                  onClick={() => {
                    console.log('Silver handleMorph triggered');
                    handleMorphSilver();
                  }}
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
          <ContactShadows
            position={[0, -8.5, 0]}
            opacity={0.4}
            scale={20}
            blur={2}
            far={4.5}
          />
          
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

      {/* Loading Overlay */}
      <div className={`absolute inset-0 z-[200] bg-black flex flex-col items-center justify-center transition-opacity duration-1000 pointer-events-none ${isLoading ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex flex-col items-center gap-8">
          <div className="w-24 h-24 border-t-2 border-white/20 rounded-full animate-spin relative">
            <div className="absolute inset-0 border-t-2 border-white rounded-full animate-[spin_1.5s_linear_infinite]" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <h3 className="text-white text-xs tracking-[0.8em] uppercase font-mono animate-pulse">Synchronizing</h3>
            <p className="text-white/30 text-[9px] tracking-[0.4em] uppercase font-mono">Global Market Feed</p>
          </div>
        </div>
      </div>

      {/* Removed top-left header text */}

      {/* Ratio Display */}
      <div className={`absolute top-12 right-12 z-10 text-right transition-all duration-1000 ${isMerged && !isAnyMorphed ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}>
        <h2 className="text-xs tracking-[0.4em] text-white/40 uppercase font-mono mb-2">Gold:Silver Ratio</h2>
        <div className="flex items-baseline justify-end gap-2">
          <span className="text-7xl font-black text-white font-mono tracking-tighter italic">
            {ratio.toFixed(1)}
          </span>
          <span className="text-2xl font-light text-white/20 font-mono tracking-widest">:1</span>
        </div>
        <div className="h-px w-32 bg-white/10 ml-auto mt-4" />
      </div>

      {/* Global Close Buttons for Morphed Assets */}
      <AnimatePresence>
        {morphedGold && (
          <motion.button
            key="close-gold-chart"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onClick={() => setMorphedGold(false)}
            className="fixed top-8 left-8 z-[300] flex items-center justify-center w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white backdrop-blur-xl pointer-events-auto cursor-pointer group transition-colors"
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
            className="fixed top-8 left-8 z-[300] flex items-center justify-center w-12 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white backdrop-blur-xl pointer-events-auto cursor-pointer group transition-colors"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>

      <CandlestickChart 
        isVisible={!!activeChart}
        data={chartData}
        title={activeChart === 'gold' ? 'Gold Spot / USD' : activeChart === 'silver' ? 'Silver Spot / USD' : 'Bitcoin / USD'}
        color={activeChart === 'gold' ? '#FFD700' : activeChart === 'silver' ? '#C0C0C0' : '#f7931a'}
        onClose={() => setActiveChart(null)}
      />

      {/* Merge Button - Bottom Left */}
      <div className={`absolute bottom-12 left-12 z-20 transition-opacity duration-500 ${isAnyMorphed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            soundManager.playHeavyCollision();
            setIsMerged(!isMerged);
          }}
          className={`w-72 py-5 rounded-full border transition-all duration-700 font-mono tracking-[0.3em] uppercase text-[10px] shadow-2xl backdrop-blur-xl ${
            isMerged 
              ? 'bg-white text-black border-white' 
              : 'bg-white/5 text-white border-white/10 hover:border-white/30'
          }`}
        >
          {isMerged ? 'Deconstruct Assets' : 'Gold:Silver Ratio'}
        </motion.button>
      </div>

      {/* Market Info Display - Centered Bottom Horizontal Layout */}
      <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-500 ${isAnyMorphed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="bg-white/[0.02] backdrop-blur-3xl px-12 py-6 rounded-[2.5rem] border border-white/5 flex flex-row items-center gap-16">
          <div 
            onClick={() => fetchHistory('gold')}
            className="flex items-center gap-6 cursor-pointer group hover:bg-white/[0.03] px-6 py-3 -mx-6 rounded-2xl transition-all"
          >
            <div className="flex flex-col items-center">
              <span className="text-[9px] tracking-[0.2em] text-white/30 uppercase font-mono mb-1 group-hover:text-[#FFD700] transition-colors">XAU Spot</span>
              <span className="text-2xl font-extralight text-[#FFD700] font-mono tracking-tighter">${goldPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="text-sm text-white/50 ml-1">/oz</span></span>
              <div className={`flex items-center gap-1.5 mt-1 text-xs font-mono font-bold ${goldChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {goldChange >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                <span>${Math.abs(goldChange).toFixed(2)}</span>
                <span>({Math.abs(goldChangePercent).toFixed(2)}%)</span>
              </div>
            </div>
          </div>
          <div className="w-px h-12 bg-white/5" />

          <div 
            onClick={() => fetchHistory('silver')}
            className="flex items-center gap-6 cursor-pointer group hover:bg-white/[0.04] px-6 py-3 -mx-6 rounded-2xl transition-all"
          >
            <div className="flex flex-col items-center">
              <span className="text-[9px] tracking-[0.2em] text-white/30 uppercase font-mono mb-1 group-hover:text-[#C0C0C0] transition-colors">XAG Spot</span>
              <span className="text-2xl font-extralight text-[#C0C0C0] font-mono tracking-tighter">${silverPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="text-sm text-white/50 ml-1">/oz</span></span>
              <div className={`flex items-center gap-1.5 mt-1 text-xs font-mono font-bold ${silverChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {silverChange >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                <span>${Math.abs(silverChange).toFixed(2)}</span>
                <span>({Math.abs(silverChangePercent).toFixed(2)}%)</span>
              </div>
            </div>
            </div>

          <div className="w-px h-12 bg-white/5" />

          <div 
            onClick={() => fetchHistory('btc')}
            className="flex items-center gap-6 cursor-pointer group hover:bg-white/[0.05] px-6 py-3 -mx-6 rounded-2xl transition-all"
          >
            <div className="flex flex-col items-center">
              <span className="text-[9px] tracking-[0.2em] text-white/30 uppercase font-mono mb-1 group-hover:text-[#F7931A] transition-colors">BTC / USD</span>
              <span className="text-2xl font-extralight text-[#F7931A] font-mono tracking-tighter">${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}<span className="text-sm text-white/50 ml-1">/coin</span></span>
              <div className={`flex items-center gap-1.5 mt-1 text-xs font-mono font-bold ${btcChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {btcChange >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                <span>${Math.abs(btcChange).toFixed(0)}</span>
                <span>({Math.abs(btcChangePercent).toFixed(2)}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Close Button for Morphed Assets - REMOVED for independent buttons */}
    </div>
  );
}
