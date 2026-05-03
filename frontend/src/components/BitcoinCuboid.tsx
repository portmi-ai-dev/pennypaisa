import * as React from 'react';
import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

import { BlockchainNode } from './BlockchainNode';
import { BlockchainTether } from './BlockchainTether';
import { soundManager } from '../lib/sounds';

interface BitcoinCuboidProps {
  visible: boolean;
  price: number;
  changePercent: number;
  weeklyChangePercent?: number;
  onClick?: () => void;
  /**
   * Fires when the user begins hovering the cuboid. Used to lazily fetch the
   * latest BTC market intelligence so the floating panel reads fresh data.
   */
  onHoverIntelligence?: () => void;
  /**
   * Fires whenever the local intelligence-hover state flips. Lets the parent
   * render an HTML floating panel outside the 3D scene (the in-scene
   * Billboard panel was removed because it competed with the cuboid).
   */
  onIntelHover?: (hover: boolean) => void;
  isBlockchainExpanded?: boolean;
  marketCap?: number;
  dominance?: number;
  volume24h?: string;
  volumeChangePercent?: number;
  marketSentiment?: {
    marketType: 'bull' | 'bear' | 'neutral';
    reasoning: string;
    cowenView: string;
    solowayView: string;
    lastUpdated?: string;
  } | null;
}

const INTER_FONT = "https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff";

const SentimentDisplay: React.FC<{ marketType: 'bull' | 'bear' | 'neutral' }> = ({ marketType }) => {
  // Beefier, more recognisable silhouettes drawn with more silhouette mass so
  // the bull/bear actually reads as an animal even at small scale on the front
  // face. Procedural Shape (no texture) so we don't need extra asset files.
  const bullShape = useMemo(() => {
    const s = new THREE.Shape();
    // Body & legs (forward-facing bull, head right)
    s.moveTo(-1.05, -0.55);
    s.lineTo(-0.65, -0.55);              // back-leg foot
    s.lineTo(-0.55, -0.1);               // back-leg upper
    s.lineTo(0.25, -0.1);                // belly
    s.lineTo(0.35, -0.55);               // front-leg upper
    s.lineTo(0.75, -0.55);               // front-leg foot
    s.lineTo(0.85, 0.05);                // chest
    s.lineTo(1.05, 0.15);                // neck bottom
    s.lineTo(1.30, 0.30);                // snout bottom
    s.lineTo(1.32, 0.55);                // snout tip
    s.lineTo(1.18, 0.70);                // jaw
    s.lineTo(1.40, 0.95);                // right horn tip
    s.lineTo(1.10, 0.85);                // right horn base
    s.lineTo(0.95, 1.00);                // forehead
    s.lineTo(0.65, 1.05);                // left horn base
    s.lineTo(0.50, 1.25);                // left horn tip
    s.lineTo(0.55, 0.95);                // head back
    s.quadraticCurveTo(0.0, 1.10, -0.55, 0.85); // hump
    s.lineTo(-1.05, 0.55);               // back
    s.quadraticCurveTo(-1.25, 0.30, -1.05, -0.05); // rump
    s.lineTo(-1.10, -0.20);              // tail tuft
    s.closePath();
    return s;
  }, []);

  const bearShape = useMemo(() => {
    const s = new THREE.Shape();
    // Standing bear, head-right
    s.moveTo(-1.10, -0.55);
    s.lineTo(-0.55, -0.55);              // back paw
    s.lineTo(-0.45, -0.10);              // back leg
    s.lineTo(0.30, -0.10);               // belly
    s.lineTo(0.40, -0.55);               // front leg
    s.lineTo(0.85, -0.55);               // front paw
    s.lineTo(0.95, 0.10);                // chest
    s.lineTo(1.15, 0.20);                // neck bottom
    s.lineTo(1.35, 0.35);                // snout bottom
    s.lineTo(1.38, 0.55);                // snout tip
    s.lineTo(1.20, 0.70);                // upper snout
    s.lineTo(1.10, 0.95);                // right ear front
    s.lineTo(0.85, 1.00);                // right ear back
    s.lineTo(0.70, 0.85);                // head dip
    s.lineTo(0.45, 0.95);                // left ear front
    s.lineTo(0.25, 0.95);                // left ear back
    s.lineTo(0.20, 0.80);                // back of head
    s.quadraticCurveTo(-0.30, 1.05, -0.85, 0.85); // big rounded hump
    s.lineTo(-1.20, 0.55);               // back
    s.quadraticCurveTo(-1.35, 0.20, -1.10, -0.10); // rump
    s.closePath();
    return s;
  }, []);

  if (marketType === 'neutral') {
    return (
      <group position={[0, 0, 1.11]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[1.95, 1.95]} />
          <meshBasicMaterial color="#222230" transparent opacity={0.55} />
        </mesh>
        <Text position={[0, 0.15, 0]} fontSize={0.7} color="#cccccc" fontWeight="bold" font={INTER_FONT}>~</Text>
        {/* Shortened from "NEUTRAL MOOD" — at the previous fontSize/letterSpacing
            the 12-char string overflowed the 1.95-wide cuboid face. */}
        <Text
          position={[0, -0.55, 0]}
          fontSize={0.20}
          color="#cccccc"
          fontWeight="bold"
          font={INTER_FONT}
          letterSpacing={0.06}
          maxWidth={1.7}
          anchorX="center"
          anchorY="middle"
        >
          NEUTRAL
        </Text>
      </group>
    );
  }

  const isBull = marketType === 'bull';
  const accent = isBull ? '#00ff66' : '#ff3a3a';
  const accentDim = isBull ? 'rgba(0,255,102,0.18)' : 'rgba(255,58,58,0.18)';
  const shape = isBull ? bullShape : bearShape;

  return (
    <group position={[0, 0, 1.11]}>
      {/* Coloured card so the silhouette stands out against the dark cuboid */}
      <mesh position={[0, 0, -0.015]}>
        <planeGeometry args={[1.95, 1.95]} />
        <meshBasicMaterial color={accent} transparent opacity={0.18} />
      </mesh>
      {/* Inner dark plate for contrast behind the silhouette */}
      <mesh position={[0, 0.05, -0.008]}>
        <planeGeometry args={[1.7, 1.45]} />
        <meshBasicMaterial color="#050510" transparent opacity={0.78} />
      </mesh>
      {/* Big bold silhouette (centred + scaled to fill the card) */}
      <group position={[-0.05, 0.15, 0]} scale={0.6}>
        <mesh>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial color={accent} side={THREE.DoubleSide} />
        </mesh>
        {/* Eye */}
        <mesh position={[isBull ? 1.05 : 1.10, isBull ? 0.55 : 0.55, 0.01]}>
          <circleGeometry args={[0.06, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[isBull ? 1.05 : 1.10, isBull ? 0.55 : 0.55, 0.02]}>
          <circleGeometry args={[0.025, 16]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
      </group>
      {/* Mood label — single word ("BULLISH" / "BEARISH") instead of the
          previous "BULLISH MOOD" / "BEARISH MOOD". With fontSize 0.30 and
          letterSpacing 0.12, the longer string measured ~3.5 units wide and
          spilled outside the 1.95-wide face. The animal silhouette above it
          already conveys "mood" — the word is redundant. `maxWidth` clamps
          the renderer if a future longer label is ever passed in. */}
      <Text
        position={[0, -0.70, 0]}
        fontSize={0.26}
        color={accent}
        fontWeight="bold"
        anchorX="center"
        anchorY="middle"
        font={INTER_FONT}
        letterSpacing={0.08}
        maxWidth={1.7}
        outlineWidth={0.005}
        outlineColor="#000000"
      >
        {isBull ? 'BULLISH' : 'BEARISH'}
      </Text>
      {/* Faint accent underline */}
      <mesh position={[0, -0.88, 0]}>
        <planeGeometry args={[1.4, 0.015]} />
        <meshBasicMaterial color={accent} transparent opacity={0.6} />
      </mesh>
      {/* Soft outer halo to imply "image" framing */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[2.05, 2.05]} />
        <meshBasicMaterial color={accent} transparent opacity={0.08} />
      </mesh>
    </group>
  );
};

const BoosterEffect = ({ intensity }: { intensity: number }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const particleCount = 100;
  
  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const vel = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1.5;
      pos[i * 3 + 1] = -1.1; // Bottom of cuboid
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      
      vel[i * 3] = (Math.random() - 0.5) * 0.2;
      vel[i * 3 + 1] = -Math.random() * 2 - 1;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }
    return [pos, vel];
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    
    for (let i = 0; i < particleCount; i++) {
      posAttr.array[i * 3] += velocities[i * 3] * delta;
      posAttr.array[i * 3 + 1] += velocities[i * 3 + 1] * delta * intensity;
      posAttr.array[i * 3 + 2] += velocities[i * 3 + 2] * delta;
      
      // Reset particles
      if (posAttr.array[i * 3 + 1] < -4) {
        posAttr.array[i * 3] = (Math.random() - 0.5) * 0.5;
        posAttr.array[i * 3 + 1] = -1.1;
        posAttr.array[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      }
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.15} 
        color="#F7931A" 
        transparent 
        opacity={0.8 * intensity} 
        blending={THREE.AdditiveBlending} 
      />
    </points>
  );
};

export const BitcoinCuboid: React.FC<BitcoinCuboidProps> = ({
  visible,
  price,
  changePercent,
  weeklyChangePercent = 0,
  onClick,
  onHoverIntelligence,
  onIntelHover,
  isBlockchainExpanded = false,
  marketCap = 1280000000000,
  dominance = 52.5,
  volume24h = "$35.2B",
  volumeChangePercent = 0,
  marketSentiment
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  
  const [hoveredLogo, setHoveredLogo] = useState(false);
  const [displayMode, setDisplayMode] = useState<'default' | 'sentiment' | 'moon'>('default');

  const showMoon = weeklyChangePercent > 10.0;

  useEffect(() => {
    // Pause the front-face rotation while the intelligence panel is open so
    // the user can read the panel without the face flipping under them.
    if (hoveredLogo) {
      if (displayMode !== 'default') setDisplayMode('default');
      return;
    }
    const duration = displayMode === 'default' ? 5000 : 2000;
    const timer = setTimeout(() => {
      if (showMoon) {
        setDisplayMode(prev => {
          if (prev === 'default') return 'sentiment';
          if (prev === 'sentiment') return 'moon';
          return 'default';
        });
      } else {
        setDisplayMode(prev => prev === 'default' ? 'sentiment' : 'default');
      }
    }, duration);
    return () => clearTimeout(timer);
  }, [displayMode, showMoon, hoveredLogo]);
  
  const barMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);

  // Red Day Logic
  const weeklyDamage = useMemo(() => {
    if (weeklyChangePercent >= -3.0) return 0;
    return Math.min(1.0, (Math.abs(weeklyChangePercent) - 3.0) / 7.0);
  }, [weeklyChangePercent]);

  const weeklyMelt = useMemo(() => {
    if (weeklyChangePercent >= -10.0) return 0;
    return Math.min(1.0, (Math.abs(weeklyChangePercent) - 10.0) / 10.0);
  }, [weeklyChangePercent]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Floating animation - enhanced if in booster mode
    const isRocket = weeklyChangePercent > 3.0;
    const t = state.clock.elapsedTime;
    const floatFreq = isRocket ? 1.5 : 0.5;
    const floatAmp = isRocket ? 0.4 : 0.2;
    groupRef.current.position.y = Math.sin(t * floatFreq) * floatAmp + (isRocket ? 0.5 : 0);

    if (barMaterialRef.current && barMaterialRef.current.userData.shader) {
      const uniforms = barMaterialRef.current.userData.shader.uniforms;
      uniforms.uTime.value = t;
      uniforms.uMelt.value = weeklyMelt;
      uniforms.uDamage.value = weeklyDamage;
    }
  });

  if (!visible) return null;

  const isPositive = changePercent >= 0;

  return (
    <group>
      <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.2}>
        {/* Cuboid resting Y lowered to -3.5 (was -2.5) so the BTC cube sits
            comfortably with the lowered Gold/Silver bullions. */}
        <group position={[0, -3.5, 0]}>
        <group
          ref={groupRef}
          onClick={(e) => {
            e.stopPropagation();
            soundManager.playBitcoinHum();
            onClick?.();
          }}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = 'auto')}
        >
          {weeklyChangePercent > 3.0 && (
            <BoosterEffect intensity={weeklyChangePercent > 10.0 ? 2.5 : 1.2} />
          )}

          <RoundedBox
            args={[2.2, 2.2, 2.2]}
            radius={0.05}
            smoothness={10}
            // Hover directly on the cuboid mesh (matches GoldBullion / SilverBullion's
            // pattern of attaching pointer handlers to a specific always-visible
            // mesh rather than to a parent <group>, which doesn't reliably bubble
            // through <Float> + drei's RoundedBox in R3F).
            onPointerOver={(e) => {
              e.stopPropagation();
              if (!hoveredLogo) {
                if (marketSentiment?.marketType === 'bull') {
                  soundManager.playBullBellow();
                } else if (marketSentiment?.marketType === 'bear') {
                  soundManager.playBearRoar();
                } else {
                  soundManager.playRuffle();
                }
                setHoveredLogo(true);
                onIntelHover?.(true);
                onHoverIntelligence?.();
              }
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHoveredLogo(false);
              onIntelHover?.(false);
            }}
          >
            <meshPhysicalMaterial
              ref={barMaterialRef}
              color="#050505"
              transmission={0.1}
              thickness={2}
              roughness={0.05}
              metalness={0.8}
              ior={1.5}
              clearcoat={1}
              transparent
              opacity={0.98}
              onBeforeCompile={(shader) => {
                shader.uniforms.uTime = { value: 0 };
                shader.uniforms.uDamage = { value: 0 };
                shader.uniforms.uMelt = { value: 0 };
                
                shader.vertexShader = `
                  uniform float uTime;
                  uniform float uMelt;
                  varying vec3 vLocalPos;
                  ${shader.vertexShader}
                `.replace(
                  '#include <begin_vertex>',
                  `
                  vLocalPos = position;
                  #include <begin_vertex>
                  // Melting distortion
                  if (position.y > 0.0) {
                    transformed.y -= uMelt * 0.5;
                    transformed.x += sin(position.y * 5.0 + uTime) * 0.1 * uMelt;
                  }
                  `
                );

                shader.fragmentShader = `
                  uniform float uTime;
                  uniform float uDamage;
                  varying vec3 vLocalPos;
                  
                  float hash(float n) { return fract(sin(n) * 43758.5453123); }
                  float voronoi(vec3 x) {
                    vec3 p = floor(x);
                    vec3 f = fract(x);
                    float res = 8.0;
                    for(int j=-1; j<=1; j++)
                    for(int i=-1; i<=1; i++) {
                        vec3 b = vec3(float(i), float(j), 0.0);
                        float d = length(b + hash(p.x + b.x + (p.y + b.y)*57.0) - f);
                        res = min(res, d);
                    }
                    return res;
                  }

                  ${shader.fragmentShader}
                `.replace(
                  '#include <color_fragment>',
                  `
                  #include <color_fragment>
                  if (uDamage > 0.05) {
                    float v = voronoi(vLocalPos * 3.0);
                    float crackMask = 1.0 - smoothstep(0.0, 0.1, v - 0.05);
                    // Glowing lava-like cracks for BTC
                    vec3 crackColor = vec3(0.97, 0.58, 0.1); 
                    diffuseColor.rgb = mix(diffuseColor.rgb, crackColor, crackMask * uDamage);
                  }
                  `
                );
                barMaterialRef.current!.userData.shader = shader;
              }}
            />
            
            {/* Internal Circuitry Core (Cyan) */}
            <mesh scale={0.98}>
              <boxGeometry args={[2.2, 2.2, 2.2]} />
              <meshBasicMaterial color="#00ffff" wireframe transparent opacity={0.3} />
            </mesh>

            {/* Solid Inner CPU Core */}
            <mesh scale={0.3}>
              <boxGeometry args={[2.2, 2.2, 2.2]} />
              <meshStandardMaterial 
                color="#00ffff" 
                emissive="#00ffff" 
                emissiveIntensity={10} 
                metalness={1}
                roughness={0}
              />
            </mesh>
            
            {/* CPU Glow Aura */}
            <mesh scale={0.5}>
              <boxGeometry args={[2.2, 2.2, 2.2]} />
              <meshStandardMaterial 
                color="#ff00ff" 
                emissive="#ff00ff" 
                emissiveIntensity={2} 
                transparent 
                opacity={0.2} 
              />
            </mesh>

            {/* Backup hover-capture plane on the front face. Renders as an
                effectively-invisible (opacity 0.001) but real visible mesh so
                R3F's raycaster definitely picks it up — guarantees the
                Market Intelligence panel pops up regardless of what the
                front facet is currently displaying (₿ / sentiment / moon). */}
            <mesh
              position={[0, 0, 1.115]}
              onPointerOver={(e) => {
                e.stopPropagation();
                if (!hoveredLogo) {
                  if (marketSentiment?.marketType === 'bull') {
                    soundManager.playBullBellow();
                  } else if (marketSentiment?.marketType === 'bear') {
                    soundManager.playBearRoar();
                  } else {
                    soundManager.playRuffle();
                  }
                  setHoveredLogo(true);
                  onIntelHover?.(true);
                }
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoveredLogo(false);
                onIntelHover?.(false);
              }}
            >
              <planeGeometry args={[2.0, 2.0]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.001} depthWrite={false} />
            </mesh>

            {/* Bitcoin Symbol (Front Face) */}
            <Text
              position={[0, 0.4, 1.11]}
              fontSize={1.2}
              color="#F7931A" // Bitcoin Orange
              fontWeight="bold"
              visible={displayMode === 'default'}
            >
              ₿
            </Text>

            {/* Price Text (Front Face) */}
            <Text
              position={[0, -0.4, 1.11]}
              fontSize={0.3}
              color="#F7931A"
              fontWeight="bold"
              visible={displayMode === 'default'}
            >
              ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>

            {/* Change Text (Front Face) */}
            <Text
              position={[0, -0.7, 1.11]}
              fontSize={0.2}
              color={isPositive ? "#00ff00" : "#ff0000"}
              fontWeight="bold"
              visible={displayMode === 'default'}
            >
              {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
            </Text>

            {/* Sentiment Animal Display (Front Face)
                Always render in sentiment mode — falls back to "neutral"
                while the Gemini-fed marketSentiment is null/loading so the
                front-face rotation is always visibly happening. */}
            {displayMode === 'sentiment' && (
              <SentimentDisplay marketType={marketSentiment?.marketType ?? 'neutral'} />
            )}

            {/* To The Moon Display (Front Face) */}
            {displayMode === 'moon' && (
              <group position={[0, 0, 1.11]}>
                <Text
                  fontSize={0.6}
                  color="#00ff00"
                  fontWeight="bold"
                  textAlign="center"
                  maxWidth={2}
                  font={INTER_FONT}
                >
                  TO THE MOON
                </Text>
                <Text
                  position={[0, -0.8, 0]}
                  fontSize={0.4}
                  color="#F7931A"
                  fontWeight="bold"
                >
                  🚀
                </Text>
              </group>
            )}
          </RoundedBox>

          {/* Internal Light Source - Reduced to one */}
          <pointLight color="#F7931A" intensity={2} distance={5} />
        </group>

        {/* Blockchain Expansion (to the LEFT, away from center) */}
        {isBlockchainExpanded && (
          <>
            <BlockchainTether start={[0, 0, 0]} end={[-3.5, 0, 0]} visible={true} />
            <BlockchainNode 
              position={[-3.5, 0, 0]} 
              marketCap={marketCap} 
              dominance={dominance} 
              visible={true} 
              volume24h={volume24h}
              volumeChangePercent={volumeChangePercent}
            />
          </>
        )}
      </group>
    </Float>
    {/* In-3D Billboard intel panel removed — replaced by the HTML IntelPopup
        rendered by AssetPage on the right side of the viewport. The local
        `hoveredLogo` state is still used to pause the front-face rotation
        while the user reads the popup. */}
  </group>
);
};
