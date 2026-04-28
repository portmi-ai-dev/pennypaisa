import * as React from 'react';
import { useRef, useMemo, useState, forwardRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { USDBearishAnimation } from './USDBearishAnimation';

import { motion } from 'motion/react';

import { soundManager } from '../lib/sounds';

interface SilverBullionProps {
  price?: number; // 0 to 100
  basePrice?: number;
  changePercent?: number;
  weeklyChangePercent?: number;
  width?: number;
  isMerged?: boolean;
  isMorphed?: boolean;
  isWeekend?: boolean;
  marketSentiment?: {
    marketType: 'bull' | 'bear' | 'neutral';
    reasoning: string;
    cowenView: string;
    solowayView: string;
    lastUpdated?: string;
  } | null;
  otherBullionRef?: React.RefObject<THREE.Group>;
  onClick?: () => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  // Fires when the user hovers/leaves the XAG intelligence trigger. Lets the
  // parent render an HTML floating panel outside the 3D scene (the in-scene
  // Billboard panel was removed because it competed with the bullion).
  onIntelHover?: (hover: boolean) => void;
}

const UtilityMetalAnimation = ({ scale = 1, color = "#404040" }) => {
  return (
    <group scale={scale}>
      {/* Solar Farm */}
      <group position={[-2.4, 0, 0]}>
        {Array.from({ length: 6 }).map((_, i) => (
          <mesh key={i} position={[(i % 3) * 0.25 - 0.25, Math.floor(i / 3) * 0.25, 0]}>
            <planeGeometry args={[0.2, 0.2]} />
            <meshPhysicalMaterial 
              color="#1a3a5a" 
              emissive="#4a9eff" 
              emissiveIntensity={1 + Math.sin(Date.now() * 0.005 + i) * 0.5} 
              metalness={0.8} 
              roughness={0.2} 
            />
          </mesh>
        ))}
        <Text position={[0, -0.3, 0.01]} fontSize={0.12} color={color}>SOLAR</Text>
      </group>

      {/* EVs */}
      <group position={[-1.0, 0, 0]}>
        <Float speed={5} rotationIntensity={0.2} floatIntensity={0.5}>
          <group scale={0.8}>
            {/* Chassis */}
            <mesh>
              <boxGeometry args={[0.7, 0.15, 0.3]} />
              <meshPhysicalMaterial color="#222" emissive="#00ffcc" emissiveIntensity={0.5} />
            </mesh>
            {/* Cabin */}
            <mesh position={[-0.05, 0.15, 0]}>
              <boxGeometry args={[0.35, 0.15, 0.25]} />
              <meshPhysicalMaterial color="#333" roughness={0.1} metalness={0.8} />
            </mesh>
            {/* Windshield */}
            <mesh position={[0.13, 0.15, 0]} rotation={[0, 0, -0.5]}>
              <planeGeometry args={[0.2, 0.25]} />
              <meshBasicMaterial color="#4a9eff" transparent opacity={0.4} />
            </mesh>
            {/* Wheels */}
            {[
              [0.2, -0.08, 0.15], [0.2, -0.08, -0.15],
              [-0.2, -0.08, 0.15], [-0.2, -0.08, -0.15]
            ].map((pos, i) => (
              <mesh key={i} position={pos as [number, number, number]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.05, 16]} />
                <meshBasicMaterial color="#111" />
              </mesh>
            ))}
            {/* Headlights */}
            <mesh position={[0.35, 0, 0.1]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshBasicMaterial color="#00ffcc" />
            </mesh>
            <mesh position={[0.35, 0, -0.1]}>
              <sphereGeometry args={[0.03, 8, 8]} />
              <meshBasicMaterial color="#00ffcc" />
            </mesh>
          </group>
        </Float>
        <Text position={[0, -0.3, 0.01]} fontSize={0.12} color={color}>EVs</Text>
      </group>

      {/* Satellites */}
      <group position={[0.4, 0.2, 0]}>
        <Float speed={3} rotationIntensity={1} floatIntensity={1}>
          <group scale={0.6}>
            <mesh>
              <sphereGeometry args={[0.15, 12, 12]} />
              <meshPhysicalMaterial color="#aaa" metalness={1} roughness={0.1} />
            </mesh>
            <mesh position={[0.3, 0, 0]}>
              <planeGeometry args={[0.3, 0.15]} />
              <meshPhysicalMaterial color="#4a9eff" emissive="#4a9eff" emissiveIntensity={1} transparent opacity={0.8} />
            </mesh>
            <mesh position={[-0.3, 0, 0]}>
              <planeGeometry args={[0.3, 0.15]} />
              <meshPhysicalMaterial color="#4a9eff" emissive="#4a9eff" emissiveIntensity={1} transparent opacity={0.8} />
            </mesh>
          </group>
        </Float>
        <Text position={[0, -0.5, 0.01]} fontSize={0.12} color={color}>SATELLITES</Text>
      </group>

      {/* Data Centers */}
      <group position={[1.6, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.5, 0.7, 0.1]} />
          <meshPhysicalMaterial color="#111" metalness={0.5} roughness={0.5} />
        </mesh>
        {Array.from({ length: 12 }).map((_, i) => (
          <mesh key={i} position={[(i % 2) * 0.15 - 0.075, Math.floor(i / 2) * 0.1 - 0.25, 0.06]}>
            <sphereGeometry args={[0.02, 4, 4]} />
            <meshBasicMaterial color={Math.random() > 0.7 ? "#00ff00" : "#ff0000"} />
          </mesh>
        ))}
        <Text position={[0, -0.45, 0.01]} fontSize={0.12} color={color}>DATA</Text>
      </group>

      {/* Mobile Phones & Semi Conductors */}
      <group position={[2.8, 0, 0]}>
        {/* Phone */}
        <mesh position={[-0.3, 0, 0]}>
          <boxGeometry args={[0.25, 0.5, 0.05]} />
          <meshPhysicalMaterial color="#000" roughness={0.1} />
        </mesh>
        <mesh position={[-0.3, 0, 0.03]}>
          <planeGeometry args={[0.2, 0.4]} />
          <meshBasicMaterial color="#4a9eff" transparent opacity={0.3 + Math.sin(Date.now() * 0.01) * 0.2} />
        </mesh>
        
        {/* Chip */}
        <mesh position={[0.3, 0, 0]}>
          <boxGeometry args={[0.4, 0.4, 0.05]} />
          <meshPhysicalMaterial color="#222" />
        </mesh>
        <group position={[0.3, 0, 0.03]}>
          {Array.from({ length: 4 }).map((_, i) => (
            <mesh key={i} position={[0, 0, 0]}>
              <planeGeometry args={[0.3, 0.01]} />
              <meshBasicMaterial color="#00ffcc" transparent opacity={Math.random()} />
            </mesh>
          ))}
        </group>
        <Text position={[0, -0.45, 0.01]} fontSize={0.12} color={color}>TECH</Text>
      </group>
    </group>
  );
};

const INTER_FONT = "https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff";

const AuraEffect = ({ isActive, width, height }: { isActive: boolean, width: number, height: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uOpacity.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uOpacity.value,
        isActive ? 0.6 : 0,
        0.05
      );
    }
    if (meshRef.current && isActive) {
      meshRef.current.rotation.y += 0.005;
    }
  });

  const auraShader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color("#B0C4DE") } // Light Steel Blue for Silver aura
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      uniform float uTime;
      uniform float uOpacity;

      float hash(float n) { return fract(sin(n) * 43758.5453123); }
      float noise(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f*f*(3.0-2.0*f);
        float n = p.x + p.y*57.0 + 113.0*p.z;
        return mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
                       mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
                   mix(mix( hash(n+113.0), hash(n+114.0),f.x),
                       mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
      }

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        
        vec3 pos = position;
        if (uOpacity > 0.01) {
          float displacement = noise(pos * 0.5 + uTime * 2.0) * 0.5 * uOpacity;
          pos += vNormal * displacement;
          pos.y += displacement * 0.5;
        }
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        if (uOpacity < 0.01) discard;
        
        float rim = 1.0 - abs(dot(vNormal, vec3(0,0,1)));
        rim = pow(rim, 3.0);
        
        float streaks = sin(vUv.x * 20.0 + vPosition.y * 2.0 - uTime * 10.0) * 0.5 + 0.5;
        streaks = pow(streaks, 4.0);
        
        float flicker = sin(uTime * 20.0) * 0.1 + 0.9;
        
        vec3 resColor = uColor * (rim * 1.5 + streaks * 2.0);
        gl_FragColor = vec4(resColor, (rim + streaks * 0.5) * uOpacity * flicker);
      }
    `
  }), []);

  return (
    <mesh ref={meshRef} scale={[1.1, 1.1, 1.2]}>
      <boxGeometry args={[width, height, 1.5]} />
      <shaderMaterial
        ref={materialRef}
        {...auraShader}
        transparent
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
};

const ElectricityEffect = ({ level, width, height }: { level: number, width: number, height: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      const targetIntensity = level === 1 ? 0.15 : level === 2 ? 0.45 : level === 3 ? 1.0 : 0;
      materialRef.current.uniforms.uIntensity.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uIntensity.value,
        targetIntensity,
        0.05
      );
    }
  });

  const lightningShader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uColor: { value: new THREE.Color("#ADD8E6") } // Light Blue for Silver electricity
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      uniform float uTime;
      uniform float uIntensity;

      float hash(float n) { return fract(sin(n) * 43758.5453123); }
      float noise(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f*f*(3.0-2.0*f);
        float n = p.x + p.y*57.0 + 113.0*p.z;
        return mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
                       mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
                   mix(mix( hash(n+113.0), hash(n+114.0),f.x),
                       mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
      }

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        
        vec3 pos = position;
        if (uIntensity > 0.01) {
          float jitter = noise(pos * 5.0 + uTime * 25.0);
          if (jitter > 0.8) {
            pos += vNormal * jitter * uIntensity * 0.8;
          }
        }
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vPosition;

      float hash(float n) { return fract(sin(n) * 43758.5453123); }
      float noise(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f*f*(3.0-2.0*f);
        float n = p.x + p.y*57.0 + 113.0*p.z;
        return mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
                       mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
                   mix(mix( hash(n+113.0), hash(n+114.0),f.x),
                       mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
      }

      void main() {
        if (uIntensity < 0.01) discard;
        
      vec3 p = vPosition * 3.5;
      float speed = uTime * 35.0; // Restored original omni-directional flicker
      
      // Multi-layered noise for jagged lines
      float n1 = noise(vec3(p.x * 0.5, p.y * 1.5 - speed, p.z * 0.5));
      float n2 = noise(vec3(p.x * 2.0, p.y * 0.8 + speed * 1.5, p.z * 2.0));
        float combinedNoise = (n1 * 0.6 + n2 * 0.4);
        
        float threshold = mix(0.53, 0.50, uIntensity);
        float width = mix(0.005, 0.02, uIntensity);
        
        float bolt = smoothstep(threshold, threshold + width, combinedNoise) * 
                     smoothstep(threshold + width * 2.0, threshold + width, combinedNoise);
        
        float burstRate = mix(1.0, 5.0, uIntensity);
        float burst = step(0.98, fract(uTime * burstRate + hash(vPosition.x * 100.0)));
        bolt += smoothstep(threshold - 0.02, threshold, combinedNoise) * 
                smoothstep(threshold + 0.02, threshold, combinedNoise) * burst * uIntensity;

        float glow = smoothstep(threshold - 0.1, threshold, combinedNoise) * 
                     smoothstep(threshold + 0.1, threshold, combinedNoise) * 0.3 * uIntensity;
        
        vec3 whiteHot = vec3(1.0, 1.0, 0.9);
        vec3 finalColor = mix(uColor, whiteHot, bolt) * bolt * 12.0 + uColor * glow * 1.5;
        
        float alpha = (bolt * 5.0 + glow) * uIntensity;
        
        gl_FragColor = vec4(finalColor, min(alpha, 1.0));
      }
    `
  }), []);

  return (
    <mesh ref={meshRef} scale={[1.06, 1.06, 1.2]}>
      <boxGeometry args={[width, height, 1.5]} />
      <shaderMaterial
        ref={materialRef}
        {...lightningShader}
        transparent
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
};

export const SilverBullion = forwardRef<THREE.Group, SilverBullionProps>(({ 
  price = 100, 
  basePrice = 25, 
  changePercent = 0, 
  weeklyChangePercent = 0,
  width = 10, 
  isMerged = false, 
  isMorphed = false, 
  isWeekend = false,
  marketSentiment: propSentiment,
  otherBullionRef,
  onClick,
  onPointerOver,
  onPointerOut,
  onIntelHover,
}, ref) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const barMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const dripMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const contentRef = useRef<THREE.Group>(null);
  const [showSectors, setShowSectors] = useState(false);
  const [isIndustryTechExpanded, setIsIndustryTechExpanded] = useState(false);
  const [, setHoveredIntelligence] = useState(false);

  const marketSentiment = propSentiment || {
    marketType: 'bull' as const,
    reasoning: "Silver is outperforming gold as the gold-to-silver ratio collapses toward 60. The combination of a massive short squeeze on the COMEX and unprecedented industrial demand for green energy infrastructure is creating a 'perfect storm' for silver prices.",
    cowenView: "Silver has officially entered the parabolic phase of the cycle. We've cleared the multi-year resistance at $35 and are now using it as support. The velocity of this move suggests a test of the $50 level is imminent.",
    solowayView: "The breakout is confirmed. We are seeing a massive volume spike as institutions rotate into silver. My next target is $48.50, but the real fireworks start once we clear the all-time highs. This is a once-in-a-generation setup.",
    lastUpdated: "APRIL 14, 2026"
  };
  const [isJewelryExpanded, setIsJewelryExpanded] = useState(false);
  const [isPrivateInvestmentExpanded, setIsPrivateInvestmentExpanded] = useState(false);
  const [isUtilityMetalActive, setIsUtilityMetalActive] = useState(false);
  const [chinaFlag, setChinaFlag] = useState<THREE.Texture | null>(null);
  const [indiaFlag, setIndiaFlag] = useState<THREE.Texture | null>(null);
  const [usFlag, setUsFlag] = useState<THREE.Texture | null>(null);
  const [germanyFlag, setGermanyFlag] = useState<THREE.Texture | null>(null);
  const [australiaFlag, setAustraliaFlag] = useState<THREE.Texture | null>(null);
  const [techLogos, setTechLogos] = useState<{ [key: string]: THREE.Texture }>({});
  const prevMorphed = useRef(isMorphed);
  
  // Reset sectors when un-morphing
  React.useEffect(() => {
    if (!isMorphed) {
      if (prevMorphed.current === true) {
        soundManager.playMorphBack();
      }
      setShowSectors(false);
      setIsIndustryTechExpanded(false);
      setIsJewelryExpanded(false);
      setIsPrivateInvestmentExpanded(false);
      setIsUtilityMetalActive(false);
      setHoveredIntelligence(false);
      onIntelHover?.(false);
    } else {
      setHoveredIntelligence(false);
      onIntelHover?.(false);
    }
    prevMorphed.current = isMorphed;
  }, [isMorphed]);

  React.useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    
    // Load China Flag
    loader.load('https://flagcdn.com/w320/cn.png', (texture) => setChinaFlag(texture));
    
    // Load India Flag
    loader.load('https://flagcdn.com/w320/in.png', (texture) => setIndiaFlag(texture));

    // Load US Flag
    loader.load('https://flagcdn.com/w320/us.png', (texture) => setUsFlag(texture));

    // Load Germany Flag
    loader.load('https://flagcdn.com/w320/de.png', (texture) => setGermanyFlag(texture));

    // Load Australia Flag
    loader.load('https://flagcdn.com/w320/au.png', (texture) => setAustraliaFlag(texture));

    // Load Tech Logos
    const logos = [
      { id: 'apple', url: 'https://api.iconify.design/simple-icons:apple.svg?color=white' },
      { id: 'tsmc', url: 'https://api.iconify.design/logos:tsmc.svg' },
      { id: 'samsung', url: 'https://api.iconify.design/simple-icons:samsung.svg?color=white' },
      { id: 'tesla', url: 'https://api.iconify.design/simple-icons:tesla.svg?color=white' },
      { id: 'byd', url: 'https://api.iconify.design/logos:byd.svg' },
      { id: 'vw', url: 'https://api.iconify.design/simple-icons:volkswagen.svg?color=white' }
    ];

    logos.forEach(logo => {
      loader.load(logo.url, (texture) => {
        texture.needsUpdate = true;
        setTechLogos(prev => ({ ...prev, [logo.id]: texture }));
      });
    });
  }, []);

  // Normalize price baseline (full bar by default)
  const p = 1.0; 
  
  // Melting/cracking based on weeklyChangePercent
  const weeklyDamage = useMemo(() => {
    const val = weeklyChangePercent;
    // -0.01% to -1.50%: No Change
    if (val >= -1.5) return 0;
    // <-1.50% to -5.00%: A few cracks
    if (val > -5.0) return 0.35;
    // <-5.00% to -10.00%: Deeper and more cracks
    if (val > -10.0) return 0.7;
    // <-10.00%: Fissures
    return 1.0;
  }, [weeklyChangePercent]);

  const weeklyMelt = useMemo(() => {
    const val = weeklyChangePercent;
    // No melting until <-5.00%
    if (val > -5.0) return 0;
    // <-5.00% to -10.00%: Slightly melts from top
    if (val > -10.0) return 0.35;
    // <-10.00%: More melting from top
    return 1.0;
  }, [weeklyChangePercent]);

  const chargeLevel = useMemo(() => {
    const val = weeklyChangePercent;
    // 0.01% to 1.00%: No Change
    if (val <= 1.00) return 0;
    // >1.00% to 5.00%: Charged up (Electrical charges)
    if (val <= 5.00) return 1;
    // >5.00% to 10.00%: Super-charged
    if (val <= 10.00) return 2;
    // >10.00%: Ultra-charged (More frequent charges + Aura/Chakra)
    return 3;
  }, [weeklyChangePercent]);

  const meltFactor = weeklyMelt;
  const damageLevel = weeklyDamage >= 1.0 ? 3 : weeklyDamage >= 0.6 ? 2 : weeklyDamage >= 0.3 ? 1 : 0;

  // Proportional scaling for the effect
  const shrinkFactor = damageLevel === 3 ? 0.92 : 1.0;

  // Dynamic radius to prevent artifacts on thin bars
  const barRadius = isMorphed ? 0.001 : Math.min(0.2, width / 2.1);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    
    if (meshRef.current) {
      const targetRotX = 0;
      const targetRotY = 0;
      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetRotX, delta * 5);
      meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetRotY, delta * 5);
    }

    if (contentRef.current) {
      const targetZ = isMorphed ? 0.08 : 0.76;
      contentRef.current.position.z = THREE.MathUtils.lerp(contentRef.current.position.z, targetZ, delta * 5);
    }

    if (barMaterialRef.current) {
      const targetEnv = isMorphed ? 4.0 : 5.0;
      const targetRough = isMorphed ? 0.05 : 0.28;
      barMaterialRef.current.envMapIntensity = THREE.MathUtils.lerp(barMaterialRef.current.envMapIntensity, targetEnv, delta * 5);
      barMaterialRef.current.roughness = THREE.MathUtils.lerp(barMaterialRef.current.roughness, targetRough, delta * 5);

      if (barMaterialRef.current.userData.shader) {
        const uniforms = barMaterialRef.current.userData.shader.uniforms;
        if (uniforms.uTime) uniforms.uTime.value = time;
        if (uniforms.uMelt) uniforms.uMelt.value = meltFactor;
        if (uniforms.uDamage) uniforms.uDamage.value = weeklyDamage;
        if (uniforms.uMorph) {
          const currentMorph = uniforms.uMorph.value;
          const targetMorph = isMorphed ? 1 : 0;
          uniforms.uMorph.value = THREE.MathUtils.lerp(currentMorph, targetMorph, delta * 5);
        }
      }
    }
    if (dripMaterialRef.current && dripMaterialRef.current.userData.shader) {
      const uniforms = dripMaterialRef.current.userData.shader.uniforms;
      if (uniforms.uTime) uniforms.uTime.value = time;
      if (uniforms.uMelt) uniforms.uMelt.value = meltFactor;
    }
  });

  const silverMaterial = (
    <meshPhysicalMaterial
      ref={barMaterialRef}
      color="#E0E0E0"
      metalness={1}
      roughness={0.15} // More mirror-like for contrast
      clearcoat={0.6}
      clearcoatRoughness={0.05}
      reflectivity={0.8}
      envMapIntensity={2.5}
      emissive="#000000"
      emissiveIntensity={0.0}
      side={THREE.DoubleSide}
      onBeforeCompile={(shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uMelt = { value: 0 };
        shader.uniforms.uMorph = { value: 0 };
        shader.uniforms.uDamage = { value: 0 };
        shader.vertexShader = `
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vLocalPos;
          uniform float uTime;
          uniform float uMelt;
          uniform float uMorph;
          uniform float uDamage;

          vec3 hash3(vec3 p) {
            p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                     dot(p, vec3(269.5, 183.3, 246.1)),
                     dot(p, vec3(113.5, 271.9, 124.6)));
            return fract(sin(p) * 43758.5453123);
          }

          float voronoi(vec3 x) {
            vec3 p = floor(x);
            vec3 f = fract(x);
            float res = 8.0;
            for(int k=-1; k<=1; k++)
            for(int j=-1; j<=1; j++)
            for(int i=-1; i<=1; i++) {
                vec3 b = vec3(float(i), float(j), float(k));
                vec3 r = b - f + hash3(p + b);
                float d = dot(r, r);
                res = min(res, d);
            }
            return sqrt(res);
          }
          ${shader.vertexShader}
        `.replace(
          '#include <begin_vertex>',
          `
          vUv = uv;
          vLocalPos = position;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          
          vec3 transformed = position;

          if (uDamage > 0.05 && uMorph < 0.5) {
            float v = voronoi(position * 120.0 + 456.0); // Scaled for unit box
            // Widen mask to ensure vertices are affected
            float crackMask = smoothstep(0.15, 0.0, abs(v - 0.2));
            float depth = crackMask * 0.4 * uDamage; // Much deeper
            transformed -= normal * depth;
          }
          
          if (uMorph > 0.01) {
            float wave = sin(transformed.x * 1.5 + uTime) * cos(transformed.y * 1.5 + uTime) * 0.05 * uMorph;
            transformed.z += wave;
          }

          if (uMelt > 0.01 && uMorph < 0.5) {
            // Waxy melting: localized drips that flow down the sides
            // We use vertical noise streaks
            vec3 vPos = position * vec3(10.0, 2.0, 10.0);
            float dripNoise = voronoi(vec3(vPos.x, vPos.y + uTime * 0.5, vPos.z));
            float dripMask = smoothstep(0.5, 0.2, dripNoise);
            
            // Side face mask (normals mostly horizontal)
            float sideMask = smoothstep(0.5, 0.0, abs(normal.y));
            
            // Extrude drips
            float extrusion = dripMask * 0.08 * uMelt * sideMask;
            transformed += normal * extrusion;
            
            // Surface ripples on top
            if (normal.y > 0.5) {
              float ripple = sin(position.x * 15.0 + uTime) * cos(position.z * 15.0 + uTime) * 0.03 * uMelt;
              transformed.y += ripple;
            }
          }
          `
        );
        shader.fragmentShader = `
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vLocalPos;
          uniform float uTime;
          uniform float uMelt;
          uniform float uMorph;
          uniform float uDamage;

          vec3 hash3(vec3 p) {
            p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                     dot(p, vec3(269.5, 183.3, 246.1)),
                     dot(p, vec3(113.5, 271.9, 124.6)));
            return fract(sin(p) * 43758.5453123);
          }

          float voronoi(vec3 x) {
            vec3 p = floor(x);
            vec3 f = fract(x);
            float res = 8.0;
            for(int k=-1; k<=1; k++)
            for(int j=-1; j<=1; j++)
            for(int i=-1; i<=1; i++) {
                vec3 b = vec3(float(i), float(j), float(k));
                vec3 r = b - f + hash3(p + b);
                float d = dot(r, r);
                res = min(res, d);
            }
            return sqrt(res);
          }

          ${shader.fragmentShader}
        `.replace(
          '#include <color_fragment>',
          `
          #include <color_fragment>

          if (uDamage > 0.05 && uMorph < 0.5) {
            vec3 p = vLocalPos * 120.0 + 456.0; // Higher frequency for more cracks
            float v = voronoi(p);
            
            // Much wider mask for visibility
            float crackMask = smoothstep(0.15, 0.0, abs(v - 0.2));
            
            // Deep black base for the crack
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0), crackMask * uDamage);
            
            // Internal "shattered" edge light - subtle cyan/white to contrast silver
            float innerGlow = smoothstep(0.0, 0.1, abs(v - 0.2));
            diffuseColor.rgb += vec3(0.4, 0.6, 1.0) * (1.0 - innerGlow) * uDamage * 0.5;
          }

          if (uMorph > 0.01) {
            float brush = sin(vUv.x * 100.0) * 0.02 * uMorph;
            diffuseColor.rgb += brush;
            float sheen = pow(1.0 - abs(dot(normalize(vNormal), vec3(0,0,1))), 2.5) * 0.3 * uMorph;
            diffuseColor.rgb += sheen;
          }

          if (uMelt > 0.01 && uMorph < 0.5) {
            // Recalculate drip mask for fragment shader highlights
            vec3 vPos = vLocalPos * vec3(10.0, 2.0, 10.0);
            float dripNoise = voronoi(vec3(vPos.x, vPos.y + uTime * 0.5, vPos.z));
            float dripMask = smoothstep(0.5, 0.2, dripNoise);
            
            // Side face mask
            float sideMask = smoothstep(0.5, 0.0, abs(vNormal.y));
            float finalDrip = dripMask * sideMask * uMelt;
            
            // Wet/Waxy highlight: make it shinier/brighter where drips are
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.2 + 0.1, finalDrip);
            
            // Add surface ripples highlight on top
            if (vNormal.y > 0.5) {
              float ripple = sin(vLocalPos.x * 15.0 + uTime) * cos(vLocalPos.z * 15.0 + uTime) * 0.5 + 0.5;
              diffuseColor.rgb += vec3(0.05) * ripple * uMelt;
            }
          }
          `
        ).replace(
          '#include <normal_fragment_begin>',
          `
          #include <normal_fragment_begin>
          if (uDamage > 0.05 && uMorph < 0.5) {
            vec3 p = vLocalPos * 120.0 + 456.0;
            float v = voronoi(p);
            float crackMask = smoothstep(0.15, 0.0, abs(v - 0.2));
            // Modify 'normal' which is declared in normal_fragment_begin
            normal = normalize(normal + (v - 0.2) * 5.0 * crackMask * uDamage);
          }
          `
        ).replace(
          '#include <roughnessmap_fragment>',
          `
          #include <roughnessmap_fragment>
          if (uDamage > 0.05 && uMorph < 0.5) {
            float v = voronoi(vLocalPos * 120.0 + 456.0);
            float crackMask = smoothstep(0.15, 0.0, abs(v - 0.2));
            roughnessFactor = mix(roughnessFactor, 1.0, crackMask * uDamage);
          }
          `
        ).replace(
          '#include <clearcoat_fragment>',
          `
          #include <clearcoat_fragment>
          if (uDamage > 0.05 && uMorph < 0.5) {
            float v = voronoi(vLocalPos * 120.0 + 456.0);
            float crackMask = smoothstep(0.15, 0.0, abs(v - 0.2));
            clearcoatFactor = mix(clearcoatFactor, 0.0, crackMask * uDamage);
          }
          `
        );
        barMaterialRef.current!.userData.shader = shader;
      }}
    />
  );

  const engravingMaterial = (
    <meshPhysicalMaterial
      color="#404040"
      metalness={1}
      roughness={0.4}
      envMapIntensity={0.5}
      side={THREE.DoubleSide}
      transparent
      opacity={Math.max(0, 1.0 - meltFactor * 2.0)}
    />
  );

  const dripMaterial = (
    <meshPhysicalMaterial
      ref={dripMaterialRef}
      color="#C0C0C0"
      metalness={1}
      roughness={0.05}
      transmission={0.1}
      thickness={1}
      clearcoat={1}
      envMapIntensity={2}
      side={THREE.DoubleSide}
      onBeforeCompile={(shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uMelt = { value: 0 };
        shader.vertexShader = `
          uniform float uTime;
          uniform float uMelt;
          ${shader.vertexShader}
        `.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float dripCycle = fract(uTime * 0.5 + position.x * 0.5 + 0.5);
          float dripStretch = pow(dripCycle, 2.0) * 2.0;
          if (position.y < 0.0) {
            transformed.y -= dripStretch;
            transformed.xz *= 1.0 - (dripStretch * 0.2);
          }
          float shimmer = sin(position.y * 50.0 + uTime * 25.0) * 0.02 * uMelt;
          transformed.xz += shimmer;
          `
        );
        dripMaterialRef.current!.userData.shader = shader;
      }}
    />
  );

  // Constant ounces derived from $4.1T market cap at $72.90/oz
  // 4,100,000,000,000 / 72.90 = 56,241,426,612
  const totalOunces = 56241426612; 
  const marketCap = totalOunces * basePrice;
  const marketCapFormatted = `$${(marketCap / 1e12).toFixed(2)}T`;

  const currentHeight = isMorphed ? 12.6 : 3 * shrinkFactor * p;
  const currentWidth = isMorphed ? 9 : width * shrinkFactor;
  const currentDepth = isMorphed ? 0.05 : 1.5 * shrinkFactor;

  return (
    <Float
      speed={isMorphed ? 0 : (price > 50 ? 2 : 0.5)}
      rotationIntensity={isMerged || isMorphed ? 0 : 0.2}
      floatIntensity={isMerged || isMorphed ? 0 : 0.2}
    >
      <group ref={ref}>
        {/* Charge and Aura Effects */}
        {!isMorphed && (
          <>
            <ElectricityEffect level={chargeLevel} width={currentWidth} height={currentHeight} />
            <AuraEffect isActive={chargeLevel === 3} width={currentWidth} height={currentHeight} />
          </>
        )}
        
        <group position={[0, 0, 0]}>
          <mesh
            ref={meshRef}
            scale={[currentWidth, currentHeight, currentDepth]}
            visible={!showSectors}
            raycast={isMorphed ? () => null : (THREE.Mesh.prototype.raycast as any)}
            onPointerOver={!isMorphed ? onPointerOver : undefined}
            onPointerOut={!isMorphed ? onPointerOut : undefined}
            onPointerDown={(e) => {
              e.stopPropagation();
              setHoveredIntelligence(false);
              onIntelHover?.(false);
              soundManager.playMetallicClink(1.2);
              onClick?.();
            }}
          >
            {/* Optimized high-density geometry with fixed args */}
            <boxGeometry args={[1, 1, 1, 64, 64, 32]} />
            {silverMaterial}
          </mesh>

          {!isMorphed && (
            <mesh position={[0, -1.5 + 3 * p, 0]}>
              <boxGeometry args={[width + 0.02, 0.1, 1.52, 32, 1, 16]} />
              <meshPhysicalMaterial
                color="#C0C0C0"
                metalness={1}
                roughness={0.05}
                envMapIntensity={2}
                side={THREE.DoubleSide}
                onBeforeCompile={(shader) => {
                  shader.uniforms.uTime = { value: 0 };
                  shader.uniforms.uMelt = { value: 0 };
                  shader.vertexShader = `
                    uniform float uTime;
                    uniform float uMelt;
                    ${shader.vertexShader}
                  `.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    float noise = sin(position.x * 3.0 + uTime) * cos(position.z * 3.0 + uTime) * 0.1;
                    transformed.y += noise * uMelt;
                    `
                  );
                }}
              />
            </mesh>
          )}

          {(price < 50 || damageLevel === 3) && !isMorphed && (
            <group position={[0, -1.5 * shrinkFactor, 0.75 * shrinkFactor]}>
              {[ -width/2.5, -width/5, 0, width/5, width/2.5 ].map((x, i) => (
                <mesh key={`silver-drip-${i}`} position={[x * shrinkFactor, 0, 0]}>
                  <sphereGeometry args={[0.15 * shrinkFactor, 16, 16]} />
                  {dripMaterial}
                </mesh>
              ))}
            </group>
          )}

          <group ref={contentRef} position={[0, 0, isMorphed ? 0.08 : 0.76]}>
            {isMorphed ? (
              <group>
                {!showSectors && (
                  <Text
                    position={[0, 0, -0.01]}
                    fontSize={2}
                    font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                    color="#404040"
                    anchorX="center"
                    anchorY="middle"
                  >
                    999.9
                    <meshBasicMaterial color="#404040" opacity={0.03} transparent />
                  </Text>
                )}

                <group position={[0, 0, 0]}>
                  {!showSectors && (
                    <>
                       {/* Front Side Market Cap */}
                      <group 
                        position={[4.0, 5.5, 0.2]} // Further increased offset from surface
                        onPointerOver={(e) => {
                          e.stopPropagation();
                          document.body.style.cursor = 'pointer';
                        }}
                        onPointerOut={(e) => {
                          e.stopPropagation();
                          document.body.style.cursor = 'auto';
                        }}
                      >
                        {/* Hit Area - Larger, thicker, and moved forward to ensure it's always the primary target */}
                        <mesh 
                          position={[-1.75, 0, 0.1]} 
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            soundManager.playPlateClank(1.2);
                            console.log('Silver Market Cap Toggled');
                            setShowSectors(!showSectors);
                          }}
                        >
                          <boxGeometry args={[4.0, 1.5, 0.8]} />
                          <meshBasicMaterial color="red" transparent opacity={0} depthTest={false} />
                        </mesh>
                        <Text
                          position={[0, 0.2, 0]}
                          fontSize={0.15}
                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                          color="#111111" // High contrast dark gray
                          anchorX="right"
                          anchorY="middle"
                          letterSpacing={0.1}
                          raycast={() => null}
                        >
                          MARKET CAP (WGC)
                          <meshStandardMaterial color="#111111" emissive="#111111" emissiveIntensity={0.05} depthTest={false} transparent />
                        </Text>
                        <Text
                          position={[0, -0.15, 0]}
                          fontSize={0.35}
                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                          color="#111111" // High contrast dark gray
                          anchorX="right"
                          anchorY="middle"
                          fontWeight="bold"
                          letterSpacing={0.05}
                          raycast={() => null}
                        >
                          {marketCapFormatted}
                          <meshStandardMaterial color="#111111" emissive="#111111" emissiveIntensity={0.05} depthTest={false} transparent />
                        </Text>
                      </group>

                      {/* Front Side Labels */}
                      <Text
                        position={[0, 1.5, 0.05]}
                        fontSize={1.2}
                        font={INTER_FONT}
                        color="#404040"
                        anchorX="center"
                        anchorY="middle"
                        letterSpacing={0.2}
                      >
                        SILVER
                        <meshStandardMaterial color="#404040" emissive="#404040" emissiveIntensity={0.1} />
                      </Text>
                      
                      <Text
                        position={[0, -1.5, 0.05]}
                        fontSize={0.4}
                        font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                        color="#404040"
                        anchorX="center"
                        anchorY="middle"
                        letterSpacing={1.2}
                      >
                        BULLION
                        <meshStandardMaterial color="#404040" emissive="#404040" emissiveIntensity={0.1} />
                      </Text>

                      <group 
                        position={[0, -3.5, 0.1]}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsUtilityMetalActive(!isUtilityMetalActive);
                        }}
                        onPointerOver={() => (document.body.style.cursor = 'pointer')}
                        onPointerOut={() => (document.body.style.cursor = 'auto')}
                      >
                        <Text
                          fontSize={0.3}
                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                          color={isUtilityMetalActive ? "#00ffcc" : "#404040"}
                          anchorX="center"
                          anchorY="middle"
                          letterSpacing={0.1}
                        >
                          UTILITY METAL
                          <meshStandardMaterial color={isUtilityMetalActive ? "#00ffcc" : "#404040"} emissive={isUtilityMetalActive ? "#00ffcc" : "#404040"} emissiveIntensity={0.2} />
                        </Text>
                      </group>

                      {isUtilityMetalActive && (
                        <group position={[0, -5.0, 0.1]}>
                          <UtilityMetalAnimation scale={1.2} />
                        </group>
                      )}
                    </>
                  )}
                </group>

                {/* Market Sectors Division - Split Effect (Broken Pieces) */}
                {showSectors && (
                    <group position={[0, 0, -0.7]}>
                      {[
                        { name: 'INDUSTRIAL / TECH', share: 0.50, value: `$${(marketCap * 0.50 / 1e12).toFixed(2)}T`, color: '#C0C0C0' },
                        { name: 'JEWELRY & SILVERWARE', share: 0.28, value: `$${(marketCap * 0.28 / 1e12).toFixed(2)}T`, color: '#A9A9A9' },
                        { name: 'PRIVATE INVESTMENT', share: 0.22, value: `$${(marketCap * 0.22 / 1e12).toFixed(2)}T`, color: '#808080' },
                      ].reduce((acc: any, sector, i) => {
                        const height = 12 * sector.share;
                        const yPos = acc.currentY - height / 2;
                        
                        acc.elements.push(
                          <group key={sector.name} position={[0, yPos, 0]}>
                            {sector.name === 'INDUSTRIAL / TECH' && isIndustryTechExpanded ? (
                              <group>
                                {/* Vertical Split into 3 parts */}
                                {[0, 1, 2].map((subIdx) => {
                                  const subWidth = width / 3;
                                  const subX = -width / 2 + subWidth / 2 + subIdx * subWidth;
                                  
                                  if (subIdx === 0) {
                                    // Solar Panel Sub-split
                                    return (
                                      <group key="SOLAR_SUB" position={[subX, 0, 0]}>
                                        {/* Base Panel */}
                                        <mesh>
                                          <planeGeometry args={[subWidth - 0.05, height - 0.05]} />
                                          <meshPhysicalMaterial 
                                            color="#1a2a4a" 
                                            metalness={0.8}
                                            roughness={0.2}
                                            clearcoat={1.0}
                                          />
                                        </mesh>
                                        {/* Solar Grid Lines - Horizontal */}
                                        {[...Array(8)].map((_, j) => (
                                          <mesh key={`h-line-${j}`} position={[0, -height/2 + (j+1) * (height/9), 0.01]}>
                                            <planeGeometry args={[subWidth - 0.1, 0.02]} />
                                            <meshBasicMaterial color="#4a90e2" transparent opacity={0.6} />
                                          </mesh>
                                        ))}
                                        {/* Solar Grid Lines - Vertical */}
                                        {[...Array(4)].map((_, j) => (
                                          <mesh key={`v-line-${j}`} position={[-subWidth/2 + (j+1) * (subWidth/5), 0, 0.01]}>
                                            <planeGeometry args={[0.02, height - 0.1]} />
                                            <meshBasicMaterial color="#4a90e2" transparent opacity={0.6} />
                                          </mesh>
                                        ))}
                                        {/* Frame */}
                                        <mesh position={[0, 0, -0.01]}>
                                          <planeGeometry args={[subWidth, height]} />
                                          <meshBasicMaterial color="#333333" />
                                        </mesh>
                                        <Text
                                          position={[0, 0.3, 0.02]}
                                          fontSize={0.22}
                                          color="white"
                                          anchorX="center"
                                          anchorY="middle"
                                          fontWeight="bold"
                                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                        >
                                          SOLAR ENERGY
                                          <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
                                        </Text>
                                        {/* China Flag */}
                                        <group position={[0, -0.3, 0.02]}>
                                          <mesh position={[0, 0, -0.001]}>
                                            <planeGeometry args={[0.42, 0.27]} />
                                            <meshBasicMaterial color="white" />
                                          </mesh>
                                          <mesh>
                                            <planeGeometry args={[0.4, 0.25]} />
                                            {chinaFlag ? (
                                              <meshBasicMaterial map={chinaFlag} transparent={true} />
                                            ) : (
                                              <meshBasicMaterial color="#DE2910" />
                                            )}
                                          </mesh>
                                        </group>
                                        <Text
                                          position={[0, -0.65, 0.02]}
                                          fontSize={0.14}
                                          color="white"
                                          anchorX="center"
                                          anchorY="middle"
                                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                        >
                                          Leading Producer
                                          <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.3} />
                                        </Text>
                                      </group>
                                    );
                                  } else if (subIdx === 1) {
                                    // Semiconductor Sub-split (Reference Image Style)
                                    return (
                                      <group key="SEMI_SUB" position={[subX, 0, 0]}>
                                        {/* Socket / Base */}
                                        <mesh position={[0, 0, -0.01]}>
                                          <planeGeometry args={[subWidth - 0.1, height - 0.1]} />
                                          <meshPhysicalMaterial 
                                            color="#0a0a0a" 
                                            metalness={1.0}
                                            roughness={0.2}
                                          />
                                        </mesh>

                                        {/* Chip Body */}
                                        <mesh position={[0, 0, 0.01]}>
                                          <planeGeometry args={[subWidth - 0.4, height - 0.4]} />
                                          <meshPhysicalMaterial 
                                            color="#001a1a" 
                                            emissive="#00ffff"
                                            emissiveIntensity={0.05}
                                            metalness={0.9}
                                            roughness={0.1}
                                          />
                                        </mesh>

                                        {/* Dense Pin Grid (Cyan Glow) */}
                                        <group position={[0, 0, 0.02]}>
                                          {[...Array(15)].map((_, row) => (
                                            [...Array(8)].map((_, col) => {
                                              // Skip center area for components
                                              const isCenter = Math.abs(row - 7) < 3 && Math.abs(col - 3.5) < 2;
                                              if (isCenter) return null;
                                              
                                              return (
                                                <mesh 
                                                  key={`pin-${row}-${col}`} 
                                                  position={[
                                                    -subWidth/2 + 0.4 + col * (subWidth - 0.8) / 7,
                                                    -height/2 + 0.4 + row * (height - 0.8) / 14,
                                                    0
                                                  ]}
                                                >
                                                  <planeGeometry args={[0.04, 0.04]} />
                                                  <meshBasicMaterial color="#00ffff" transparent opacity={0.6} />
                                                </mesh>
                                              );
                                            })
                                          ))}
                                        </group>

                                        {/* Central Components (Raised Boxes) */}
                                        <group position={[0, 0, 0.03]}>
                                          {[...Array(6)].map((_, i) => (
                                            <mesh 
                                              key={`comp-${i}`} 
                                              position={[
                                                (i % 2 - 0.5) * 0.2,
                                                (Math.floor(i / 2) - 1) * 0.25,
                                                0.01
                                              ]}
                                            >
                                              <boxGeometry args={[0.12, 0.18, 0.05]} />
                                              <meshPhysicalMaterial color="#cccccc" metalness={1.0} roughness={0.1} />
                                            </mesh>
                                          ))}
                                        </group>

                                        {/* Circuit Traces (Subtle) */}
                                        <group position={[0, 0, 0.015]}>
                                          {[...Array(10)].map((_, j) => (
                                            <mesh key={`trace-${j}`} position={[0, -height/2 + (j+1) * (height/11), 0]}>
                                              <planeGeometry args={[subWidth - 0.5, 0.005]} />
                                              <meshBasicMaterial color="#00ffff" transparent opacity={0.2} />
                                            </mesh>
                                          ))}
                                        </group>

                                        {/* Central Label */}
                                        <Text
                                          position={[0, height/2 - 0.5, 0.05]}
                                          fontSize={0.2}
                                          color="#000"
                                          anchorX="center"
                                          anchorY="middle"
                                          fontWeight="bold"
                                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                        >
                                          SEMICONDUCTORS
                                        </Text>

                                        {/* Company Logos (Moved to bottom, horizontal arrangement) */}
                                        <group position={[0, -height/2 + 0.6, 0.05]}>
                                          {[
                                            { id: 'apple', x: -0.45 },
                                            { id: 'tsmc', x: 0 },
                                            { id: 'samsung', x: 0.45 }
                                          ].map((logo) => (
                                            <group key={logo.id} position={[logo.x, 0, 0]}>
                                              <mesh position={[0, 0, -0.001]}>
                                                <circleGeometry args={[0.16, 32]} />
                                                <meshBasicMaterial color="#00ffff" transparent opacity={0.3} />
                                              </mesh>
                                              <mesh>
                                                <circleGeometry args={[0.14, 32]} />
                                                {techLogos[logo.id] ? (
                                                  <meshBasicMaterial map={techLogos[logo.id]} transparent={true} />
                                                ) : (
                                                  <meshBasicMaterial color="#001a1a" />
                                                )}
                                              </mesh>
                                            </group>
                                          ))}
                                        </group>
                                      </group>
                                    );
                                  } else if (subIdx === 2) {
                                    // EV Wireframe Sub-split
                                    return (
                                      <group key="EV_SUB" position={[subX, 0, 0]}>
                                        {/* Chassis Base */}
                                        <mesh position={[0, 0, -0.01]}>
                                          <planeGeometry args={[subWidth - 0.1, height - 0.1]} />
                                          <meshPhysicalMaterial 
                                            color="#050505" 
                                            metalness={1.0}
                                            roughness={0.3}
                                          />
                                        </mesh>

                                        {/* EV Platform (Skateboard) */}
                                        <group position={[0, 0, 0.01]} rotation={[0, 0, 0]}>
                                          {/* Battery Pack */}
                                          <mesh position={[0, 0, 0.01]}>
                                            <boxGeometry args={[subWidth - 0.6, height * 0.4, 0.05]} />
                                            <meshPhysicalMaterial color="#444" metalness={0.8} roughness={0.2} />
                                          </mesh>
                                          {/* Battery Grid Lines */}
                                          {[...Array(6)].map((_, j) => (
                                            <mesh key={`batt-line-${j}`} position={[0, -height * 0.2 + (j+1) * (height * 0.4 / 7), 0.04]}>
                                              <planeGeometry args={[subWidth - 0.7, 0.01]} />
                                              <meshBasicMaterial color="#666" />
                                            </mesh>
                                          ))}

                                          {/* Wheels */}
                                          {[
                                            { x: -subWidth/2 + 0.3, y: height/2 - 1.2 },
                                            { x: subWidth/2 - 0.3, y: height/2 - 1.2 },
                                            { x: -subWidth/2 + 0.3, y: -height/2 + 1.2 },
                                            { x: subWidth/2 - 0.3, y: -height/2 + 1.2 }
                                          ].map((wheel, i) => (
                                            <group key={`wheel-${i}`} position={[wheel.x, wheel.y, 0.05]}>
                                              <mesh rotation={[Math.PI/2, 0, 0]}>
                                                <cylinderGeometry args={[0.25, 0.25, 0.15, 16]} />
                                                <meshPhysicalMaterial color="#111" roughness={0.8} />
                                              </mesh>
                                              {/* Rim Detail */}
                                              <mesh position={[0, 0, 0.08]}>
                                                <circleGeometry args={[0.18, 16]} />
                                                <meshBasicMaterial color="#555" />
                                              </mesh>
                                            </group>
                                          ))}

                                          {/* Axles & Motors */}
                                          <mesh position={[0, height/2 - 1.2, 0.03]}>
                                            <boxGeometry args={[subWidth - 0.6, 0.1, 0.03]} />
                                            <meshBasicMaterial color="#333" />
                                          </mesh>
                                          <mesh position={[0, -height/2 + 1.2, 0.03]}>
                                            <boxGeometry args={[subWidth - 0.6, 0.1, 0.03]} />
                                            <meshBasicMaterial color="#333" />
                                          </mesh>
                                        </group>

                                        {/* Label */}
                                        <group position={[0, 0, 0.15]}>
                                          <Text
                                            position={[0, 0.2, 0]}
                                            fontSize={0.2}
                                            color="#000"
                                            anchorX="center"
                                            anchorY="middle"
                                            fontWeight="bold"
                                            font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                          >
                                            ELECTRIC VEHICLES
                                          </Text>
                                          <Text
                                            position={[0, -0.15, 0]}
                                            fontSize={0.15}
                                            color="#000"
                                            anchorX="center"
                                            anchorY="middle"
                                            fontWeight="bold"
                                            font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                          >
                                            DATA CENTERS & AI INFRASTRUCTURE
                                          </Text>
                                        </group>

                                        {/* Company Logos */}
                                        <group position={[0, -height/2 + 0.6, 0.1]}>
                                          {[
                                            { id: 'tesla', x: -0.45 },
                                            { id: 'byd', x: 0 },
                                            { id: 'vw', x: 0.45 }
                                          ].map((logo) => (
                                            <group key={logo.id} position={[logo.x, 0, 0]}>
                                              <mesh position={[0, 0, -0.001]}>
                                                <circleGeometry args={[0.16, 32]} />
                                                <meshBasicMaterial color="white" transparent opacity={0.1} />
                                              </mesh>
                                              <mesh>
                                                <circleGeometry args={[0.14, 32]} />
                                                {techLogos[logo.id] ? (
                                                  <meshBasicMaterial map={techLogos[logo.id]} transparent={true} />
                                                ) : (
                                                  <meshBasicMaterial color="#222" />
                                                )}
                                              </mesh>
                                            </group>
                                          ))}
                                        </group>
                                      </group>
                                    );
                                  } else {
                                    // Placeholder for third sub-split
                                    return (
                                      <group key={`SUB_${subIdx}`} position={[subX, 0, 0]}>
                                        <mesh>
                                          <planeGeometry args={[subWidth - 0.05, height - 0.05]} />
                                          <meshPhysicalMaterial 
                                            color={sector.color} 
                                            metalness={1.0}
                                            roughness={0.1}
                                            clearcoat={1.0}
                                            emissive={sector.color}
                                            emissiveIntensity={0.1}
                                          />
                                        </mesh>
                                      </group>
                                    );
                                  }
                                })}
                              </group>
                            ) : sector.name === 'JEWELRY & SILVERWARE' && isJewelryExpanded ? (
                              <group>
                                {/* Vertical Split into 2 parts */}
                                {[0, 1].map((subIdx) => {
                                  const subWidth = width / 2;
                                  const subX = -width / 2 + subWidth / 2 + subIdx * subWidth;
                                  
                                  if (subIdx === 0) {
                                    // Luxury Brands Sub-split
                                    return (
                                      <group key="LUXURY_SUB" position={[subX, 0, 0]}>
                                        {/* Silver Background */}
                                        <mesh>
                                          <planeGeometry args={[subWidth - 0.05, height - 0.05]} />
                                          <meshPhysicalMaterial 
                                            color={sector.color} 
                                            metalness={1.0}
                                            roughness={0.1}
                                            clearcoat={1.0}
                                          />
                                        </mesh>
                                        
                                        <Text
                                          position={[0, 0.8, 0.02]}
                                          fontSize={0.22}
                                          color="#333"
                                          anchorX="center"
                                          anchorY="middle"
                                          fontWeight="bold"
                                          depthOffset={-2}
                                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                        >
                                          LUXURY BRANDS
                                        </Text>

                                        <group position={[0, -0.1, 0.02]}>
                                          {[
                                            { name: 'Tiffany & Co.', y: 0.4 },
                                            { name: 'Pandora A/S', y: 0 },
                                            { name: 'Chow Tai Fook', y: -0.4 }
                                          ].map((brand, idx) => (
                                            <Text
                                              key={brand.name}
                                              position={[0, brand.y, 0]}
                                              fontSize={0.18}
                                              color="#404040"
                                              anchorX="center"
                                              anchorY="middle"
                                              depthOffset={-2}
                                              font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                            >
                                              {brand.name}
                                            </Text>
                                          ))}
                                        </group>
                                      </group>
                                    );
                                  } else {
                                    // Contributors Sub-split
                                    return (
                                      <group key="CONTRIB_SUB" position={[subX, 0, 0]}>
                                        {/* Silver Background */}
                                        <mesh>
                                          <planeGeometry args={[subWidth - 0.05, height - 0.05]} />
                                          <meshPhysicalMaterial 
                                            color={sector.color} 
                                            metalness={1.0}
                                            roughness={0.1}
                                            clearcoat={1.0}
                                          />
                                        </mesh>
                                        
                                        <Text
                                          position={[0, 0.8, 0.02]}
                                          fontSize={0.2}
                                          color="#333"
                                          anchorX="center"
                                          anchorY="middle"
                                          fontWeight="bold"
                                          depthOffset={-2}
                                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                        >
                                          MAJOR CONTRIBUTORS
                                        </Text>

                                        <group position={[0, -0.1, 0.02]}>
                                          {/* India */}
                                          <group position={[0, 0.4, 0]}>
                                            <mesh position={[-0.6, 0, 0]}>
                                              <planeGeometry args={[0.4, 0.25]} />
                                              {indiaFlag ? (
                                                <meshBasicMaterial map={indiaFlag} transparent opacity={0.8} />
                                              ) : (
                                                <meshBasicMaterial color="#FF9933" />
                                              )}
                                            </mesh>
                                            <Text
                                              position={[0.1, 0, 0]}
                                              fontSize={0.18}
                                              color="#404040"
                                              anchorX="left"
                                              anchorY="middle"
                                              depthOffset={-2}
                                            >
                                              INDIA
                                            </Text>
                                          </group>

                                          {/* China */}
                                          <group position={[0, -0.2, 0]}>
                                            <mesh position={[-0.6, 0, 0]}>
                                              <planeGeometry args={[0.4, 0.25]} />
                                              {chinaFlag ? (
                                                <meshBasicMaterial map={chinaFlag} transparent opacity={0.8} />
                                              ) : (
                                                <meshBasicMaterial color="#DE2910" />
                                              )}
                                            </mesh>
                                            <Text
                                              position={[0.1, 0, 0]}
                                              fontSize={0.18}
                                              color="#404040"
                                              anchorX="left"
                                              anchorY="middle"
                                              depthOffset={-2}
                                            >
                                              CHINA
                                            </Text>
                                          </group>
                                        </group>
                                      </group>
                                    );
                                  }
                                })}
                              </group>
                            ) : sector.name === 'PRIVATE INVESTMENT' && isPrivateInvestmentExpanded ? (
                              <group>
                                {/* Vertical Split into 2 parts */}
                                {[0, 1].map((subIdx) => {
                                  const subWidth = width / 2;
                                  const subX = -width / 2 + subWidth / 2 + subIdx * subWidth;
                                  
                                  if (subIdx === 0) {
                                    // Investment Entities Sub-split
                                    return (
                                      <group key="INVEST_SUB" position={[subX, 0, 0]}>
                                        {/* Silver Background */}
                                        <mesh>
                                          <planeGeometry args={[subWidth - 0.05, height - 0.05]} />
                                          <meshPhysicalMaterial 
                                            color={sector.color} 
                                            metalness={1.0}
                                            roughness={0.1}
                                            clearcoat={1.0}
                                          />
                                        </mesh>
                                        
                                        <group position={[0, 0, 0.02]}>
                                          {[
                                            { name: 'COMEX 🛒', y: 0.4 },
                                            { name: 'JP MORGAN 🏦', y: 0 },
                                            { name: 'iShares Silver Trust (SLV)', y: -0.4 }
                                          ].map((entity, idx) => (
                                            <Text
                                              key={entity.name}
                                              position={[0, entity.y, 0]}
                                              fontSize={0.18}
                                              color="#404040"
                                              anchorX="center"
                                              anchorY="middle"
                                              depthOffset={-2}
                                              font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                            >
                                              {entity.name}
                                            </Text>
                                          ))}
                                        </group>
                                      </group>
                                    );
                                  } else {
                                    // Country Ranking Sub-split
                                    return (
                                      <group key="RANK_SUB" position={[subX, 0, 0]}>
                                        {/* Silver Background */}
                                        <mesh>
                                          <planeGeometry args={[subWidth - 0.05, height - 0.05]} />
                                          <meshPhysicalMaterial 
                                            color={sector.color} 
                                            metalness={1.0}
                                            roughness={0.1}
                                            clearcoat={1.0}
                                          />
                                        </mesh>
                                        
                                        <group position={[0, 0, 0.02]}>
                                          {[
                                            { name: 'INDIA', flag: indiaFlag, y: 0.5 },
                                            { name: 'USA', flag: usFlag, y: 0.2 },
                                            { name: 'GERMANY', flag: germanyFlag, y: -0.1 },
                                            { name: 'AUSTRALIA', flag: australiaFlag, y: -0.4 }
                                          ].map((item, idx) => (
                                            <group key={item.name} position={[0, item.y, 0]}>
                                              <mesh position={[-0.6, 0, 0]}>
                                                <planeGeometry args={[0.35, 0.22]} />
                                                {item.flag ? (
                                                  <meshBasicMaterial map={item.flag} transparent opacity={0.8} />
                                                ) : (
                                                  <meshBasicMaterial color="#666" />
                                                )}
                                              </mesh>
                                              <Text
                                                position={[0.1, 0, 0]}
                                                fontSize={0.16}
                                                color="#404040"
                                                anchorX="left"
                                                anchorY="middle"
                                                depthOffset={-2}
                                              >
                                                {item.name}
                                              </Text>
                                            </group>
                                          ))}
                                        </group>
                                      </group>
                                    );
                                  }
                                })}
                              </group>
                            ) : (
                              <group 
                                onClick={(e) => {
                                  if (sector.name === 'INDUSTRIAL / TECH') {
                                    e.stopPropagation();
                                    soundManager.playLaserBeam();
                                    setIsIndustryTechExpanded(true);
                                  } else if (sector.name === 'JEWELRY & SILVERWARE') {
                                    e.stopPropagation();
                                    soundManager.playJewelryFall();
                                    setIsJewelryExpanded(true);
                                  } else if (sector.name === 'PRIVATE INVESTMENT') {
                                    e.stopPropagation();
                                    soundManager.playCoinSpin();
                                    setIsPrivateInvestmentExpanded(true);
                                  }
                                }}
                                onPointerOver={(e) => {
                                  if (sector.name === 'INDUSTRIAL / TECH' || sector.name === 'JEWELRY & SILVERWARE' || sector.name === 'PRIVATE INVESTMENT') {
                                    e.stopPropagation();
                                    document.body.style.cursor = 'pointer';
                                  }
                                }}
                                onPointerOut={(e) => {
                                  if (sector.name === 'INDUSTRIAL / TECH' || sector.name === 'JEWELRY & SILVERWARE' || sector.name === 'PRIVATE INVESTMENT') {
                                    e.stopPropagation();
                                    document.body.style.cursor = 'auto';
                                  }
                                }}
                              >
                                <mesh>
                                  <planeGeometry args={[width, height - 0.05]} />
                                  <meshPhysicalMaterial 
                                    color={sector.color} 
                                    metalness={1.0}
                                    roughness={0.1}
                                    clearcoat={1.0}
                                    emissive={sector.color}
                                    emissiveIntensity={0.1}
                                  />
                                </mesh>
                                <Text
                                  position={[0, 0.15, 0.01]}
                                  fontSize={0.25}
                                  color="#000"
                                  anchorX="center"
                                  anchorY="middle"
                                  fontWeight="bold"
                                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                >
                                  {sector.name}
                                </Text>
                                <Text
                                  position={[0, -0.15, 0.01]}
                                  fontSize={0.2}
                                  color="#000"
                                  anchorX="center"
                                  anchorY="middle"
                                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                >
                                  {sector.value} ({Math.round(sector.share * 100)}%)
                                </Text>
                              </group>
                            )}
                          </group>
                        );
                        acc.currentY -= height;
                        return acc;
                      }, { elements: [], currentY: 6 }).elements}
                    </group>
                  )}

                  {/* Bearish USD removed as requested */}
                </group>
            ) : (
              <group scale={width > 5 ? 1 : width / 10 + 0.5}>
                <Text
                  position={[0, 0.6, 0]}
                  fontSize={0.6}
                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                  color="#404040"
                  anchorX="center"
                  anchorY="middle"
                  depthOffset={-2}
                >
                  {width > 3 ? '999.9 FINE SILVER' : ''}
                  {engravingMaterial}
                </Text>

                <Text
                  position={[0, -0.4, 0]}
                  fontSize={1.2}
                  fontWeight="bold"
                  font={INTER_FONT}
                  color="#404040"
                  anchorX="center"
                  anchorY="middle"
                  depthOffset={-2}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    if (marketSentiment.marketType === 'bull') {
                      soundManager.playBullBellow();
                    } else if (marketSentiment.marketType === 'bear') {
                      soundManager.playBearRoar();
                    } else {
                      soundManager.playRuffle();
                    }
                    setHoveredIntelligence(true);
                    onIntelHover?.(true);
                    document.body.style.cursor = 'pointer';
                  }}
                  onPointerOut={(e) => {
                    e.stopPropagation();
                    setHoveredIntelligence(false);
                    onIntelHover?.(false);
                    document.body.style.cursor = 'auto';
                  }}
                >
                  XAG
                  {engravingMaterial}
                </Text>

                <Text
                  position={[0, -1.1, 0]}
                  fontSize={0.25}
                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                  color="#404040"
                  anchorX="center"
                  anchorY="middle"
                  depthOffset={-2}
                >
                  {width > 3 ? 'NET WT 1 OZ' : ''}
                  {engravingMaterial}
                </Text>

                <Text
                  position={[0, -1.35, 0]}
                  fontSize={0.18}
                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                  color={isUtilityMetalActive ? "#00ffcc" : "#404040"}
                  anchorX="center"
                  anchorY="middle"
                  depthOffset={-2}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsUtilityMetalActive(!isUtilityMetalActive);
                  }}
                  onPointerOver={() => (document.body.style.cursor = 'pointer')}
                  onPointerOut={() => (document.body.style.cursor = 'auto')}
                >
                  {width > 3 ? 'UTILITY METAL' : ''}
                  {engravingMaterial}
                </Text>

                {isUtilityMetalActive && (
                  <group position={[0, -0.6, 0.05]}>
                    <UtilityMetalAnimation scale={0.5} />
                  </group>
                )}
              </group>
            )}
          </group>


      <spotLight
        position={[15, 10, 10]}
        angle={0.2}
        penumbra={1}
        intensity={800 * p + 200}
        color="#ffffff"
        castShadow
      />
      <spotLight
        position={[-15, -5, -10]}
        angle={0.2}
        penumbra={1}
        intensity={400 * p + 100}
        color="#ffffff"
      />
      <pointLight position={[0, 5, 5]} intensity={300 * p + 200} color="#ffffff" />
      <pointLight position={[-10, 2, 5]} intensity={isMorphed ? 1000 : 400} color="#ffffff" />
      <pointLight position={[0, 0, 8]} intensity={isMorphed ? 800 : 300} color="#ffffff" />
      <pointLight position={[10, 2, 5]} intensity={isMorphed ? 1000 : 400} color="#ffffff" />

        </group>
      </group>
    </Float>
  );
});
