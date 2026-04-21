import * as React from 'react';
import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, RoundedBox, Billboard } from '@react-three/drei';
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
  const bearShape = useMemo(() => {
    const shape = new THREE.Shape();
    // Walking bear silhouette approximation
    shape.moveTo(-1.0, -0.5); // Back leg back
    shape.lineTo(-0.7, -0.5); // Back leg front
    shape.lineTo(-0.6, -0.1); // Belly
    shape.lineTo(-0.2, -0.1); // Belly
    shape.lineTo(-0.1, -0.5); // Front leg back
    shape.lineTo(0.2, -0.5);  // Front leg front
    shape.lineTo(0.3, 0.1);   // Chest
    shape.lineTo(0.7, 0.1);   // Neck bottom
    shape.lineTo(0.9, 0.0);   // Snout bottom
    shape.lineTo(1.1, 0.1);   // Snout tip
    shape.lineTo(1.1, 0.3);   // Snout top
    shape.lineTo(0.9, 0.4);   // Forehead
    shape.lineTo(0.8, 0.6);   // Ear front
    shape.lineTo(0.7, 0.6);   // Ear back
    shape.lineTo(0.6, 0.5);   // Head back
    shape.quadraticCurveTo(0.2, 0.8, -0.3, 0.7); // Hump
    shape.lineTo(-0.8, 0.6);  // Back
    shape.quadraticCurveTo(-1.1, 0.5, -1.1, 0.1); // Tail/Rear
    shape.closePath();
    return shape;
  }, []);

  const bullShape = useMemo(() => {
    const shape = new THREE.Shape();
    // Bull silhouette approximation
    shape.moveTo(-0.9, -0.5); // Back leg
    shape.lineTo(-0.6, -0.5);
    shape.lineTo(-0.5, 0);
    shape.lineTo(0.1, 0);
    shape.lineTo(0.2, -0.5); // Front leg
    shape.lineTo(0.5, -0.5);
    shape.lineTo(0.6, 0.2);
    shape.lineTo(0.9, 0.2); // Head bottom
    shape.lineTo(1.1, 0.4); // Snout
    shape.lineTo(1.1, 0.6); // Forehead
    shape.lineTo(0.9, 0.8); // Horn base
    shape.lineTo(1.0, 1.0); // Horn tip
    shape.lineTo(0.8, 0.8); // Horn back
    shape.lineTo(0.6, 0.7); // Neck top
    shape.quadraticCurveTo(0, 0.9, -0.4, 0.7); // Hump
    shape.lineTo(-0.9, 0.5); // Back
    shape.closePath();
    return shape;
  }, []);

  return (
    <group position={[0, -0.1, 1.11]} scale={0.7}>
      {marketType === 'bear' ? (
        <group>
          <mesh>
            <shapeGeometry args={[bearShape]} />
            <meshBasicMaterial color="#ff0000" side={THREE.DoubleSide} />
          </mesh>
          {/* Eye */}
          <mesh position={[0.85, 0.35, 0.01]}>
            <circleGeometry args={[0.04, 16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {/* Bearish Mood Text */}
          <Text
            position={[0, -0.8, 0.01]}
            fontSize={0.25}
            color="#ff0000"
            fontWeight="bold"
            anchorY="top"
          >
            BEARISH MOOD
          </Text>
        </group>
      ) : marketType === 'bull' ? (
        <group>
          <mesh>
            <shapeGeometry args={[bullShape]} />
            <meshBasicMaterial color="#00ff00" side={THREE.DoubleSide} />
          </mesh>
          {/* Eye */}
          <mesh position={[0.85, 0.45, 0.01]}>
            <circleGeometry args={[0.04, 16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {/* Bullish Mood Text for consistency */}
          <Text
            position={[0, -0.8, 0.01]}
            fontSize={0.25}
            color="#00ff00"
            fontWeight="bold"
            anchorY="top"
          >
            BULLISH MOOD
          </Text>
        </group>
      ) : null}
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
  }, [displayMode, showMoon]);
  
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
        <group position={[0, -2.5, 0]}>
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
            
            {/* Secondary Circuitry Core (Magenta) */}
            <mesh scale={0.96} rotation={[0.5, 0.5, 0.5]}>
              <boxGeometry args={[2.2, 2.2, 2.2]} />
              <meshBasicMaterial color="#ff00ff" wireframe transparent opacity={0.15} />
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

            {/* Bitcoin Symbol (Front Face) */}
            <Text
              position={[0, 0.4, 1.11]}
              fontSize={1.2}
              color="#F7931A" // Bitcoin Orange
              fontWeight="bold"
              onPointerOver={() => {
                if (marketSentiment?.marketType === 'bull') {
                  soundManager.playBullBellow();
                } else if (marketSentiment?.marketType === 'bear') {
                  soundManager.playBearRoar();
                } else {
                  soundManager.playRuffle();
                }
                setHoveredLogo(true);
              }}
              onPointerOut={() => setHoveredLogo(false)}
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

            {/* Sentiment Animal Display (Front Face) */}
            {displayMode === 'sentiment' && marketSentiment && (
              <SentimentDisplay marketType={marketSentiment.marketType} />
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
    </Float>    {/* Static Hover Pop-up Reasoning - Moved to the LEFT of the cuboid, elevated to avoid bullion */}
    {hoveredLogo && marketSentiment && (
      <group position={[-8.5, 1.8, 0]}>
        <Billboard follow={true}>
            {/* Main Background Panel - Deep Obsidian Glass style */}
            <mesh position={[0, 0, -0.05]} frustumCulled={false}>
              <planeGeometry args={[15, 8.5]} />
              <meshPhysicalMaterial 
                color="#000000" 
                emissive="#000510"
                emissiveIntensity={0.2}
                transmission={0.3}
                thickness={2}
                roughness={0.1}
                metalness={0.05}
                ior={1.5}
                transparent 
                opacity={0.98} 
              />
            </mesh>
            
            {/* Accent Border Glow - Subtle and refined */}
            <mesh position={[0, 0, -0.06]} frustumCulled={false}>
              <planeGeometry args={[15.1, 8.6]} />
              <meshBasicMaterial 
                color={marketSentiment.marketType === 'bull' ? "#00ff00" : "#ff0000"} 
                transparent 
                opacity={0.15} 
              />
            </mesh>

            {/* Header Section */}
            <group position={[0, 3.6, 0]}>
              <Text
                fontSize={0.7}
                color="#ffffff"
                fontWeight="bold"
                textAlign="center"
                font={INTER_FONT}
              >
                MARKET INTELLIGENCE
              </Text>
              <mesh position={[0, -0.5, 0]} frustumCulled={false}>
                <planeGeometry args={[10, 0.02]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
              </mesh>
            </group>
            
            {/* Consensus Badge */}
            <group position={[0, 2.2, 0]}>
              <mesh position={[0, 0, -0.01]} frustumCulled={false}>
                <planeGeometry args={[7, 0.8]} />
                <meshBasicMaterial 
                  color={marketSentiment.marketType === 'bull' ? "#00ff00" : "#ff0000"} 
                  transparent 
                  opacity={0.2} 
                />
              </mesh>
              <Text
                fontSize={0.5}
                color={marketSentiment.marketType === 'bull' ? "#00ff00" : "#ff0000"}
                fontWeight="bold"
                textAlign="center"
                font={INTER_FONT}
              >
                CONSENSUS: {marketSentiment.marketType.toUpperCase()}
              </Text>
            </group>

            {/* Main Reasoning Section */}
            <group position={[0, 0.8, 0]}>
              <Text
                position={[0, 0.2, 0]}
                fontSize={0.35}
                color="#ffffff"
                maxWidth={13.5}
                textAlign="center"
                lineHeight={1.4}
                font={INTER_FONT}
              >
                {marketSentiment.reasoning}
              </Text>
            </group>

            {/* Analyst Perspectives Grid */}
            <group position={[0, -1.6, 0]}>
              {/* Benjamin Cowen Card */}
              <group position={[-3.6, 0, 0]}>
                <mesh position={[0, -0.2, -0.01]} frustumCulled={false}>
                  <planeGeometry args={[7.0, 3.2]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.04} />
                </mesh>
                <Text
                  position={[0, 1.0, 0]}
                  fontSize={0.36}
                  color="#00ffff"
                  fontWeight="bold"
                  textAlign="center"
                  anchorX="center"
                  font={INTER_FONT}
                >
                  BENJAMIN COWEN
                </Text>
                <Text
                  position={[0, 0.5, 0]}
                  fontSize={0.3}
                  color="#cccccc"
                  maxWidth={6.5}
                  textAlign="center"
                  anchorX="center"
                  anchorY="top"
                  lineHeight={1.3}
                  font={INTER_FONT}
                >
                  {marketSentiment.cowenView}
                </Text>
              </group>

              {/* Gareth Soloway Card */}
              <group position={[3.6, 0, 0]}>
                <mesh position={[0, -0.2, -0.01]} frustumCulled={false}>
                  <planeGeometry args={[7.0, 3.2]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.04} />
                </mesh>
                <Text
                  position={[0, 1.0, 0]}
                  fontSize={0.36}
                  color="#ff00ff"
                  fontWeight="bold"
                  textAlign="center"
                  anchorX="center"
                  font={INTER_FONT}
                >
                  GARETH SOLOWAY
                </Text>
                <Text
                  position={[0, 0.5, 0]}
                  fontSize={0.3}
                  color="#cccccc"
                  maxWidth={6.5}
                  textAlign="center"
                  anchorX="center"
                  anchorY="top"
                  lineHeight={1.3}
                  font={INTER_FONT}
                >
                  {marketSentiment.solowayView}
                </Text>
              </group>
            </group>

            {/* Footer Decoration */}
            <Text
              position={[0, -3.8, 0]}
              fontSize={0.16}
              color="#555555"
              textAlign="center"
              font={INTER_FONT}
            >
              AI AGGREGATED MARKET SENTIMENT • {marketSentiment.lastUpdated ? `UPDATED AT ${marketSentiment.lastUpdated}` : 'REAL-TIME DATA'}
            </Text>
        </Billboard>
      </group>
    )}
  </group>
);
};
