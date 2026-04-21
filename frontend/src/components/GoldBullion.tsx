import * as React from 'react';
import { useRef, useMemo, useState, forwardRef, useEffect, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, RoundedBox, Billboard } from '@react-three/drei';
import * as THREE from 'three';

import { motion } from 'motion/react';

import { soundManager } from '../lib/sounds';

interface GoldBullionProps {
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
}

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
      uColor: { value: new THREE.Color("#FFD700") }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      uniform float uTime;
      uniform float uOpacity;

      // Noise for vertex displacement
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
        
        // Rise and wobble like a flame/aura
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
        
        // Rim glow
        float rim = 1.0 - abs(dot(vNormal, vec3(0,0,1)));
        rim = pow(rim, 3.0);
        
        // Rising energy streaks
        float streaks = sin(vUv.x * 20.0 + vPosition.y * 2.0 - uTime * 10.0) * 0.5 + 0.5;
        streaks = pow(streaks, 4.0);
        
        // Flickering intensity
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

const Bolt = ({ position, rotation, scale, color }: { position: [number, number, number], rotation: [number, number, number], scale: number, color: string }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      // High-speed flickering
      meshRef.current.visible = Math.random() > 0.5;
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={rotation} scale={scale}>
      <cylinderGeometry args={[0.01, 0.01, 1, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} />
    </mesh>
  );
};

const ElectricalCharges = ({ level, width, height, color }: { level: number, width: number, height: number, color: string }) => {
  const boltCount = level === 1 ? 5 : level === 2 ? 15 : 30;
  const bolts = useMemo(() => {
    return Array.from({ length: boltCount }).map((_, i) => ({
      id: i,
      position: [
        (Math.random() - 0.5) * width,
        (Math.random() - 0.5) * height,
        (Math.random() - 0.5) * 0.5
      ] as [number, number, number],
      rotation: [
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      ] as [number, number, number],
      scale: 0.1 + Math.random() * 0.4
    }));
  }, [boltCount, width, height]);

  return (
    <group>
      {bolts.map(bolt => (
        <Bolt key={bolt.id} {...bolt} color={color} />
      ))}
    </group>
  );
};

export const GoldBullion = forwardRef<THREE.Group, GoldBullionProps>(({ 
  price = 100, 
  basePrice = 2150, 
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
  onPointerOut 
}, ref) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const barMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const dripMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const contentRef = useRef<THREE.Group>(null);

  const [showSectors, setShowSectors] = useState(false);
  const [isJewelleryExpanded, setIsJewelleryExpanded] = useState(false);
  const [isPrivateInvestmentExpanded, setIsPrivateInvestmentExpanded] = useState(false);
  const [isCentralBanksExpanded, setIsCentralBanksExpanded] = useState(false);
  const [isIndustryTechExpanded, setIsIndustryTechExpanded] = useState(false);
  const [hoveredIntelligence, setHoveredIntelligence] = useState(false);

  const marketSentiment = propSentiment || {
    marketType: 'bull' as const,
    reasoning: "Gold has surged past the $2,700 psychological barrier, driven by a significant uptick in global liquidity and continued central bank front-running of currency debasement. The technical structure remains one of the strongest in decades.",
    cowenView: "The 20-week SMA is now trending toward $2,600. As long as we hold this support on the weekly close, the macro bull market is essentially 'locked in'. I'm looking for a period of consolidation before the next leg higher.",
    solowayView: "We've cleared the bull flag target. My next major pivot is $3,350. The DXY is showing a 'death cross' on the daily, which is the ultimate green light for precious metals. Don't fight the trend.",
    lastUpdated: "APRIL 14, 2026"
  };
  
  // Flag textures state
  const [flagTextures, setFlagTextures] = useState<Record<string, THREE.Texture | null>>({
    india: null,
    china: null,
    us: null,
    russia: null,
    germany: null,
    italy: null
  });

  // Logo textures state
  const [logoTextures, setLogoTextures] = useState<Record<string, THREE.Texture | null>>({
    apple: null,
    tsmc: null,
    nvidia: null,
    samsung: null
  });

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const flagUrls = {
      india: 'https://flagcdn.com/w320/in.png',
      china: 'https://flagcdn.com/w320/cn.png',
      us: 'https://flagcdn.com/w320/us.png',
      russia: 'https://flagcdn.com/w320/ru.png',
      germany: 'https://flagcdn.com/w320/de.png',
      italy: 'https://flagcdn.com/w320/it.png'
    };

    const logoUrls = {
      apple: 'https://api.iconify.design/simple-icons:apple.svg?color=white',
      tsmc: 'https://api.iconify.design/logos:tsmc.svg',
      nvidia: 'https://api.iconify.design/simple-icons:nvidia.svg?color=white',
      samsung: 'https://api.iconify.design/simple-icons:samsung.svg?color=white'
    };

    Object.entries(flagUrls).forEach(([key, url]) => {
      loader.load(
        url,
        (texture) => {
          setFlagTextures(prev => ({ ...prev, [key]: texture }));
        },
        undefined,
        (err) => {
          console.warn(`Failed to load flag: ${key}`, err);
        }
      );
    });

    Object.entries(logoUrls).forEach(([key, url]) => {
      loader.load(
        url,
        (texture) => {
          texture.needsUpdate = true;
          setLogoTextures(prev => ({ ...prev, [key]: texture }));
        },
        undefined,
        (err) => {
          console.warn(`Failed to load logo: ${key}`, err);
        }
      );
    });
  }, []);

  // Safe Haven Animation State
  const [safeHavenStage, setSafeHavenStage] = useState<'idle' | 'missile' | 'explosion' | 'debris' | 'inflation' | 'pop' | 'debris2'>('idle');
  const missileRef = useRef<THREE.Group>(null);
  const interceptorRef = useRef<THREE.Group>(null);
  const explosionRef = useRef<THREE.Mesh>(null);
  const debrisRef = useRef<THREE.Group>(null);
  const usdNoteRef = useRef<THREE.Group>(null);
  const debrisData = useRef<{pos: THREE.Vector3, vel: THREE.Vector3, rot: THREE.Vector3, landed: boolean, active: boolean}[]>([]);
  const animationStartTime = useRef<number>(0);
  const inflationScale = useRef<number>(1);
  const prevMorphed = useRef(isMorphed);

  // Reset sectors when un-morphing
  React.useEffect(() => {
    if (!isMorphed) {
      if (prevMorphed.current === true) {
        soundManager.playMorphBack();
      }
      setShowSectors(false);
      setIsJewelleryExpanded(false);
      setIsPrivateInvestmentExpanded(false);
      setIsCentralBanksExpanded(false);
      setIsIndustryTechExpanded(false);
      setSafeHavenStage('idle');
      debrisData.current = [];
      animationStartTime.current = 0;
      setHoveredIntelligence(false);
    } else {
      setHoveredIntelligence(false);
    }
    prevMorphed.current = isMorphed;
  }, [isMorphed]);

  // Animation Logic
  useFrame((state, delta) => {
    if (safeHavenStage === 'missile') {
      if (missileRef.current && interceptorRef.current) {
        if (animationStartTime.current === 0) animationStartTime.current = state.clock.elapsedTime;
        const elapsed = state.clock.elapsedTime - animationStartTime.current;
        
        // Missile: -5 to 0.5 in 2.2s (Speed 2.5)
        missileRef.current.position.x = -5 + elapsed * 2.5;
        
        // Interceptor: -6 to 0 in 2.2s (Speed 6 / 2.2 ≈ 2.727)
        interceptorRef.current.position.y = -6 + elapsed * (6 / 2.2);

        // Check for interception (at t = 2.2)
        if (elapsed >= 2.2) {
          setSafeHavenStage('explosion');
          animationStartTime.current = 0; // Reset for next stage if needed
          // Generate first burst of debris
          const newDebris = [];
          for (let i = 0; i < 40; i++) {
            newDebris.push({
              pos: new THREE.Vector3(0.5, 0, 0.1),
              vel: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() * 3) + 1, (Math.random() - 0.5) * 2),
              rot: new THREE.Vector3(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
              landed: false,
              active: true
            });
          }
          debrisData.current = newDebris;
        }
      }
    } else if (safeHavenStage === 'explosion') {
      if (explosionRef.current) {
        explosionRef.current.scale.addScalar(delta * 15);
        const mat = explosionRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity -= delta * 1.5;
        if (mat.opacity <= 0) {
          setSafeHavenStage('debris');
          animationStartTime.current = 0;
        }
      }
    } else if (safeHavenStage === 'debris' || safeHavenStage === 'debris2') {
      let allLanded = true;
      debrisData.current.forEach((d, i) => {
        if (d.active && !d.landed) {
          allLanded = false;
          d.vel.y -= delta * 9.8; // Gravity
          d.pos.add(d.vel.clone().multiplyScalar(delta));
          d.rot.addScalar(delta * 5);

          // Floor collision (bottom of plate)
          if (d.pos.y < -5.5) {
            d.pos.y = -5.5;
            d.landed = true;
            d.vel.set(0, 0, 0);
          }
        }
      });
      
      if (debrisRef.current) {
        debrisRef.current.children.forEach((child, i) => {
          const data = debrisData.current[i];
          if (data && data.active) {
            child.position.copy(data.pos);
            child.rotation.set(data.rot.x, data.rot.y, data.rot.z);
            child.visible = true;
          } else {
            child.visible = false;
          }
        });
      }

      if (safeHavenStage === 'debris' && allLanded && debrisData.current.length > 0) {
        if (animationStartTime.current === 0) animationStartTime.current = state.clock.elapsedTime;
        if (state.clock.elapsedTime - animationStartTime.current > 1.0) {
          setSafeHavenStage('inflation');
          animationStartTime.current = 0;
          inflationScale.current = 0.1;
        }
      }
    } else if (safeHavenStage === 'inflation') {
      if (usdNoteRef.current) {
        inflationScale.current += delta * 1.2;
        
        // Add a pulsing "pumping" effect
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 15) * 0.05;
        usdNoteRef.current.scale.setScalar(inflationScale.current * pulse);
        
        usdNoteRef.current.position.y = Math.sin(state.clock.elapsedTime * 10) * 0.05;
        
        if (inflationScale.current > 4.5) {
          setSafeHavenStage('pop');
          animationStartTime.current = 0;
          // Generate second burst of debris (gold flakes)
          const newDebris = [];
          for (let i = 0; i < 60; i++) {
            newDebris.push({
              pos: new THREE.Vector3(0, 0, 0.1),
              vel: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() * 5) + 2, (Math.random() - 0.5) * 4),
              rot: new THREE.Vector3(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
              landed: false,
              active: true
            });
          }
          debrisData.current = [...debrisData.current, ...newDebris];
        }
      }
    } else if (safeHavenStage === 'pop') {
      if (animationStartTime.current === 0) animationStartTime.current = state.clock.elapsedTime;
      if (state.clock.elapsedTime - animationStartTime.current > 0.1) {
        setSafeHavenStage('debris2');
        animationStartTime.current = 0;
      }
    }
  });

  // Normalize price baseline (full bar by default)
  const p = 1.0; 
  
  // Melting/cracking based on weeklyChangePercent
  const weeklyDamage = useMemo(() => {
    const val = weeklyChangePercent;
    // -0.01% to -0.50%: No Change
    if (val >= -0.5) return 0;
    // <-0.50% to -1.50%: A few cracks
    if (val > -1.5) return 0.35;
    // <-1.50% to -3.00%: Deeper and more cracks
    if (val > -3.0) return 0.7;
    // <-3.00%: Fissures
    return 1.0;
  }, [weeklyChangePercent]);

  const weeklyMelt = useMemo(() => {
    const val = weeklyChangePercent;
    // No melting until <-1.50%
    if (val > -1.5) return 0;
    // <-1.50% to -3.00%: Slightly melts from top
    if (val > -3.0) return 0.35;
    // <-3.00%: More melting from top
    return 1.0;
  }, [weeklyChangePercent]);

  const chargeLevel = useMemo(() => {
    const val = weeklyChangePercent;
    // 0.01-0.50%: No Change
    if (val <= 0.50) return 0;
    // >0.50% to 1.50%: Charged up (Electrical charges)
    if (val <= 1.50) return 1;
    // >1.50% to 3.00%: Super-charged
    if (val <= 3.00) return 2;
    // >3.00%: Ultra-charged (More frequent charges + Aura/Chakra)
    return 3;
  }, [weeklyChangePercent]);

  const meltFactor = weeklyMelt;
  const damageLevel = weeklyDamage > 0.75 ? 3 : weeklyDamage > 0.5 ? 2 : weeklyDamage > 0.25 ? 1 : 0;

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

  const goldMaterial = (
    <meshPhysicalMaterial
      ref={barMaterialRef}
      color="#FFD700"
      metalness={1}
      roughness={0.2} // Lowered slightly for better reflection contrast
      clearcoat={0.5}
      clearcoatRoughness={0.1}
      reflectivity={0.8}
      envMapIntensity={2.5}
      emissive="#221100"
      emissiveIntensity={0.05}
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
            float v = voronoi(position * 120.0 + 123.0); // Scaled for unit box
            // Wide mask for vertex displacement
            float crackMask = smoothstep(0.15, 0.0, abs(v - 0.2));
            float depth = crackMask * 0.4 * uDamage;
            transformed -= normal * depth;
          }
          
          if (uMorph > 0.01) {
            float wave = sin(transformed.x * 1.5 + uTime) * cos(transformed.y * 1.5 + uTime) * 0.05 * uMorph;
            transformed.z += wave;
          }

          if (uMelt > 0.01 && uMorph < 0.5) {
            // Waxy surface ripples instead of global collapse
            float wave = sin(position.x * 20.0 + uTime) * cos(position.z * 20.0 + uTime) * 0.02 * uMelt;
            if (normal.y > 0.5) {
              transformed.y += wave;
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
            vec3 p = vLocalPos * 120.0 + 123.0; // Scaled for unit box
            float v = voronoi(p);
            
            // Much wider mask for visibility
            float crackMask = smoothstep(0.15, 0.0, abs(v - 0.2));
            
            // Deep obsidian base
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.01, 0.0, 0.0), crackMask * uDamage);
            
            // Molten core look - orange/red glow
            float innerGlow = smoothstep(0.0, 0.1, abs(v - 0.2));
            diffuseColor.rgb += vec3(1.0, 0.3, 0.0) * (1.0 - innerGlow) * uDamage * 0.7;
          }

          if (uMorph > 0.01) {
            float shimmer = sin(vUv.x * 10.0 + uTime) * cos(vUv.y * 10.0 + uTime) * 0.05 * uMorph;
            diffuseColor.rgb += shimmer;
            // Removed grain and edge darkening which caused the 'blackish film' look
            float sheen = pow(1.0 - abs(dot(normalize(vNormal), vec3(0,0,1))), 2.5) * 0.3 * uMorph;
            diffuseColor.rgb += sheen;
          }
          `
        ).replace(
          '#include <normal_fragment_begin>',
          `
          #include <normal_fragment_begin>
          if (uDamage > 0.05 && uMorph < 0.5) {
            vec3 p = vLocalPos * 120.0 + 123.0;
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
            float v = voronoi(vLocalPos * 120.0 + 123.0);
            float crackMask = smoothstep(0.15, 0.0, abs(v - 0.2));
            roughnessFactor = mix(roughnessFactor, 1.0, crackMask * uDamage);
          }
          `
        ).replace(
          '#include <clearcoat_fragment>',
          `
          #include <clearcoat_fragment>
          if (uDamage > 0.05 && uMorph < 0.5) {
            float v = voronoi(vLocalPos * 120.0 + 123.0);
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
      color="#4a3728"
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
      color="#FFD700"
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
          float dripCycle = fract(uTime * 0.5 + position.x * 0.5);
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

  // Constant ounces derived from $31T market cap at $4,646/oz
  // 31,000,000,000,000 / 4,646 = 6,672,406,371
  const totalOunces = 6672406371; 
  const marketCap = totalOunces * basePrice;
  const marketCapFormatted = `$${(marketCap / 1e12).toFixed(2)}T`;

  const currentHeight = isMorphed ? 12.6 : 3 * shrinkFactor * p;
  const currentWidth = isMorphed ? 9 : width * shrinkFactor;
  const currentDepth = isMorphed ? 0.05 : 1.5 * shrinkFactor;

  return (
    <Float
      speed={price > 50 && !isMorphed ? 2 : 0.5}
      rotationIntensity={isMerged || isMorphed ? 0 : 0.2}
      floatIntensity={isMerged || isMorphed ? 0 : 0.2}
    >
      <group ref={ref}>
        {/* Charge and Aura Effects */}
        {!isMorphed && (
          <>
            {chargeLevel >= 1 && (
              <ElectricalCharges level={chargeLevel} width={currentWidth} height={currentHeight} color="#FFD700" />
            )}
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
              soundManager.playMetallicClink(1);
              onClick?.();
            }}
          >
            {/* Optimized high-density geometry with fixed args */}
            <boxGeometry args={[1, 1, 1, 64, 64, 32]} />
            {goldMaterial}
          </mesh>

          {!isMorphed && (
            <mesh position={[0, -1.5 + 3 * p, 0]}>
              <boxGeometry args={[width + 0.02, 0.1, 1.52, 32, 1, 16]} />
              <meshPhysicalMaterial
                color="#FFD700"
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
                <mesh key={`gold-drip-${i}`} position={[x * shrinkFactor, 0, 0]}>
                  <sphereGeometry args={[0.15 * shrinkFactor, 16, 16]} />
                  {dripMaterial}
                </mesh>
              ))}
            </group>
          )}

          <group ref={contentRef} position={[0, 0, isMorphed ? 0.026 : 0.76]}>
            {isMorphed ? (
              <group>
                {!showSectors && (
                  <Text
                    position={[0, 0, -0.01]}
                    fontSize={2}
                    font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                    color="#4a3728"
                    anchorX="center"
                    anchorY="middle"
                  >
                    999.9
                    <meshBasicMaterial color="#4a3728" opacity={0.03} transparent />
                  </Text>
                )}

                <group position={[0, 0, 0]}>
                  {!showSectors && (
                    <>
                      {/* Front Side Market Cap */}
                      <group 
                        position={[4.0, 5.5, 0.1]} // Increased offset from surface
                        onPointerOver={(e) => {
                          e.stopPropagation();
                          document.body.style.cursor = 'pointer';
                        }}
                        onPointerOut={(e) => {
                          e.stopPropagation();
                          document.body.style.cursor = 'auto';
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          soundManager.playPlateClank(1.0);
                          console.log('Gold Market Cap Toggled');
                          setShowSectors(!showSectors);
                        }}
                      >
                        {/* Hit Area - Thicker and depthTest disabled to ensure clickability from all angles */}
                        <mesh position={[-1.75, 0, 0]}>
                          <boxGeometry args={[3.5, 1.2, 0.5]} />
                          <meshBasicMaterial color="red" transparent opacity={0} depthTest={false} />
                        </mesh>
                        <Text
                          position={[0, 0.2, 0]}
                          fontSize={0.15}
                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                          color="#FFD700"
                          anchorX="right"
                          anchorY="middle"
                          letterSpacing={0.1}
                          raycast={() => null}
                        >
                          MARKET CAP (WGC)
                          <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.1} depthTest={false} transparent />
                        </Text>
                        <Text
                          position={[0, -0.15, 0]}
                          fontSize={0.35}
                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                          color="#FFD700"
                          anchorX="right"
                          anchorY="middle"
                          fontWeight="bold"
                          letterSpacing={0.05}
                          raycast={() => null}
                        >
                          {marketCapFormatted}
                          <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.1} depthTest={false} transparent />
                        </Text>
                      </group>

                      {/* Front Side Labels */}
                      <Text
                        position={[0, 1.5, 0.05]}
                        fontSize={1.2}
                        font={INTER_FONT}
                        color="#4a3728"
                        anchorX="center"
                        anchorY="middle"
                        letterSpacing={0.2}
                      >
                        GOLD
                        <meshStandardMaterial color="#4a3728" emissive="#4a3728" emissiveIntensity={0.1} />
                      </Text>
                      
                      <Text
                        position={[0, -1.5, 0.05]}
                        fontSize={0.4}
                        font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                        color="#4a3728"
                        anchorX="center"
                        anchorY="middle"
                        letterSpacing={1.2}
                      >
                        BULLION
                        <meshStandardMaterial color="#4a3728" emissive="#4a3728" emissiveIntensity={0.1} />
                      </Text>
                    </>
                  )}
                </group>

                {/* Market Sectors Division - Split Effect (Broken Pieces) */}
                {showSectors && (
                    <group position={[0, 0, -0.7]}>
                      {[
                        { name: 'JEWELLERY', share: 0.45, color: '#FFD700' },
                        { name: 'PRIVATE INVESTMENT', share: 0.225, color: '#DAA520' },
                        { name: 'CENTRAL BANKS', share: 0.175, color: '#B8860B' },
                        { name: 'INDUSTRY & TECH', share: 0.15, color: '#9ACD32' },
                      ].reduce((acc: any, sector) => {
                        const height = 12 * sector.share;
                        const yPos = acc.currentY - height / 2;
                        
                        if (sector.name === 'JEWELLERY' && isJewelleryExpanded) {
                          // Split Jewellery into two sub-plates
                          const sub1Share = 0.55; // India & China
                          const sub2Share = 0.45; // US & EU
                          const sub1Height = height * sub1Share;
                          const sub2Height = height * sub2Share;
                          
                          // Sub-plate 1: India & China
                          acc.elements.push(
                            <group key="JEWELLERY_SUB_1" position={[0, acc.currentY - sub1Height / 2, 0]}>
                              <mesh>
                                <planeGeometry args={[8.5, sub1Height - 0.05]} />
                                <meshPhysicalMaterial 
                                  color="#FFD700" 
                                  metalness={1.0}
                                  roughness={0.1}
                                  clearcoat={1.0}
                                  emissive="#FFD700"
                                  emissiveIntensity={0.1}
                                />
                              </mesh>
                              <group position={[-2.5, 0, 0.01]}>
                                <group position={[-0.6, 0, 0]}>
                                  <mesh position={[0, 0, -0.001]}>
                                    <planeGeometry args={[0.82, 0.52]} />
                                    <meshBasicMaterial color="white" />
                                  </mesh>
                                  <mesh>
                                    <planeGeometry args={[0.8, 0.5]} />
                                    {flagTextures.india ? (
                                      <meshBasicMaterial map={flagTextures.india} transparent={true} />
                                    ) : (
                                      <meshBasicMaterial color="#FF9933" />
                                    )}
                                  </mesh>
                                </group>
                                <group position={[0.6, 0, 0]}>
                                  <mesh position={[0, 0, -0.001]}>
                                    <planeGeometry args={[0.82, 0.52]} />
                                    <meshBasicMaterial color="white" />
                                  </mesh>
                                  <mesh>
                                    <planeGeometry args={[0.8, 0.5]} />
                                    {flagTextures.china ? (
                                      <meshBasicMaterial map={flagTextures.china} transparent={true} />
                                    ) : (
                                      <meshBasicMaterial color="#EE1C25" />
                                    )}
                                  </mesh>
                                </group>
                              </group>
                              <Text
                                position={[1, 0.25, 0.01]}
                                fontSize={0.15}
                                color="#000"
                                anchorX="left"
                                anchorY="middle"
                                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                              >
                                JEWELLERY SHARES
                              </Text>
                              <Text
                                position={[1, 0.05, 0.01]}
                                fontSize={0.22}
                                color="#000"
                                anchorX="left"
                                anchorY="middle"
                                fontWeight="bold"
                                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                              >
                                INDIA & CHINA (55%)
                              </Text>
                              <Text
                                position={[1, -0.15, 0.01]}
                                fontSize={0.18}
                                color="#000"
                                anchorX="left"
                                anchorY="middle"
                                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                              >
                                $7.68T
                              </Text>
                            </group>
                          );
                          
                          // Sub-plate 2: US, Russia & others
                          acc.elements.push(
                            <group key="JEWELLERY_SUB_2" position={[0, acc.currentY - sub1Height - sub2Height / 2, 0]}>
                              <mesh>
                                <planeGeometry args={[8.5, sub2Height - 0.05]} />
                                <meshPhysicalMaterial 
                                  color="#F0C05A" 
                                  metalness={1.0}
                                  roughness={0.1}
                                  clearcoat={1.0}
                                  emissive="#F0C05A"
                                  emissiveIntensity={0.1}
                                />
                              </mesh>
                              <group position={[-2.5, 0, 0.01]}>
                                <group position={[-0.6, 0, 0]}>
                                  <mesh position={[0, 0, -0.001]}>
                                    <planeGeometry args={[0.82, 0.52]} />
                                    <meshBasicMaterial color="white" />
                                  </mesh>
                                  <mesh>
                                    <planeGeometry args={[0.8, 0.5]} />
                                    {flagTextures.us ? (
                                      <meshBasicMaterial map={flagTextures.us} transparent={true} />
                                    ) : (
                                      <meshBasicMaterial color="#3C3B6E" />
                                    )}
                                  </mesh>
                                </group>
                                <group position={[0.6, 0, 0]}>
                                  <mesh position={[0, 0, -0.001]}>
                                    <planeGeometry args={[0.82, 0.52]} />
                                    <meshBasicMaterial color="white" />
                                  </mesh>
                                  <mesh>
                                    <planeGeometry args={[0.8, 0.5]} />
                                    {flagTextures.russia ? (
                                      <meshBasicMaterial map={flagTextures.russia} transparent={true} />
                                    ) : (
                                      <meshBasicMaterial color="#D52B1E" />
                                    )}
                                  </mesh>
                                </group>
                              </group>
                              <Text
                                position={[1, 0.25, 0.01]}
                                fontSize={0.15}
                                color="#000"
                                anchorX="left"
                                anchorY="middle"
                                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                              >
                                JEWELLERY SHARES
                              </Text>
                              <Text
                                position={[1, 0.05, 0.01]}
                                fontSize={0.22}
                                color="#000"
                                anchorX="left"
                                anchorY="middle"
                                fontWeight="bold"
                                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                              >
                                US, Russia & others (45%)
                              </Text>
                              <Text
                                position={[1, -0.15, 0.01]}
                                fontSize={0.18}
                                color="#000"
                                anchorX="left"
                                anchorY="middle"
                                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                              >
                                $6.29T
                              </Text>
                            </group>
                          );
                          
                          acc.currentY -= height;
                        } else if (sector.name === 'PRIVATE INVESTMENT' && isPrivateInvestmentExpanded) {
                          // Split Private Investment into three equal parts
                          const subHeight = height / 3;
                          
                          const subSectors = [
                            { name: 'Newmont Corporation', sign: '⛏️', color: '#DAA520' },
                            { name: 'APMEX', sign: '🛒', color: '#C5941A' },
                            { name: 'JM BULLION', sign: '🪙', color: '#B08314' }
                          ];
                          
                          subSectors.forEach((sub, idx) => {
                            const subY = acc.currentY - subHeight / 2 - (idx * subHeight);
                            acc.elements.push(
                              <group key={`PRIVATE_INVESTMENT_SUB_${idx}`} position={[0, subY, 0]}>
                                <mesh>
                                  <planeGeometry args={[8.5, subHeight - 0.05]} />
                                  <meshPhysicalMaterial 
                                    color={sub.color} 
                                    metalness={1.0}
                                    roughness={0.1}
                                    clearcoat={1.0}
                                    emissive={sub.color}
                                    emissiveIntensity={0.1}
                                  />
                                </mesh>
                                <group position={[-3, 0, 0.01]}>
                                  <Text
                                    fontSize={0.4}
                                    color="#000"
                                    anchorX="center"
                                    anchorY="middle"
                                  >
                                    {sub.sign}
                                  </Text>
                                </group>
                                <Text
                                  position={[-2, 0, 0.01]}
                                  fontSize={0.22}
                                  color="#000"
                                  anchorX="left"
                                  anchorY="middle"
                                  fontWeight="bold"
                                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                >
                                  {sub.name}
                                </Text>
                              </group>
                            );
                          });
                          
                          acc.currentY -= height;
                        } else if (sector.name === 'CENTRAL BANKS' && isCentralBanksExpanded) {
                          // Split Central Banks into three sub-sectors
                          const subHeight = height / 3;
                          const subSectors = [
                            { rank: '1', name: 'USA', tonnes: '8,133 Tonnes', flag: flagTextures.us, color: '#B8860B', fallback: '#002868' },
                            { rank: '2', name: 'Germany', tonnes: '3,350 Tonnes', flag: flagTextures.germany, color: '#A6790A', fallback: '#000000' },
                            { rank: '3', name: 'Italy', tonnes: '2,452 Tonnes', flag: flagTextures.italy, color: '#946C09', fallback: '#008C45' }
                          ];

                          subSectors.forEach((sub, idx) => {
                            const subY = acc.currentY - subHeight / 2 - (idx * subHeight);
                            acc.elements.push(
                              <group key={`CENTRAL_BANKS_SUB_${idx}`} position={[0, subY, 0]}>
                                <mesh>
                                  <planeGeometry args={[8.5, subHeight - 0.05]} />
                                  <meshPhysicalMaterial 
                                    color={sub.color} 
                                    metalness={1.0}
                                    roughness={0.1}
                                    clearcoat={1.0}
                                    emissive={sub.color}
                                    emissiveIntensity={0.1}
                                  />
                                </mesh>
                                <group position={[-3.5, 0, 0.01]}>
                                  <mesh position={[0, 0, -0.001]}>
                                    <planeGeometry args={[0.62, 0.42]} />
                                    <meshBasicMaterial color="white" />
                                  </mesh>
                                  <mesh>
                                    <planeGeometry args={[0.6, 0.4]} />
                                    {sub.flag ? (
                                      <meshBasicMaterial map={sub.flag} transparent={true} />
                                    ) : (
                                      <meshBasicMaterial color={sub.fallback} />
                                    )}
                                  </mesh>
                                </group>
                                <Text
                                  position={[-2.8, 0, 0.01]}
                                  fontSize={0.22}
                                  color="#000"
                                  anchorX="left"
                                  anchorY="middle"
                                  fontWeight="bold"
                                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                >
                                  {`${sub.rank}. ${sub.name}`}
                                </Text>
                                <Text
                                  position={[3.8, 0, 0.01]}
                                  fontSize={0.2}
                                  color="#000"
                                  anchorX="right"
                                  anchorY="middle"
                                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                >
                                  {sub.tonnes}
                                </Text>
                              </group>
                            );
                          });
                          acc.currentY -= height;
                        } else if (sector.name === 'INDUSTRY & TECH' && isIndustryTechExpanded) {
                          // Split Industry & Tech into four sub-sectors
                          const subHeight = height / 4;
                          const subSectors = [
                            { name: 'Apple', logo: logoTextures.apple, color: '#F0C05A', fallback: '#555555' },
                            { name: 'TSMC', logo: logoTextures.tsmc, color: '#E8B850', fallback: '#003399' },
                            { name: 'NVIDIA', logo: logoTextures.nvidia, color: '#E0B046', fallback: '#76B900' },
                            { name: 'Samsung', logo: logoTextures.samsung, color: '#D8A83C', fallback: '#1428A0' }
                          ];

                          subSectors.forEach((sub, idx) => {
                            const subY = acc.currentY - subHeight / 2 - (idx * subHeight);
                            acc.elements.push(
                              <group key={`INDUSTRY_TECH_SUB_${idx}`} position={[0, subY, 0]}>
                                <mesh>
                                  <planeGeometry args={[8.5, subHeight - 0.05]} />
                                  <meshPhysicalMaterial 
                                    color={sub.color} 
                                    metalness={1.0}
                                    roughness={0.1}
                                    clearcoat={1.0}
                                    emissive={sub.color}
                                    emissiveIntensity={0.1}
                                  />
                                </mesh>
                                <group position={[-1.2, 0, 0.01]}>
                                  <mesh position={[0, 0, -0.001]}>
                                    <planeGeometry args={[0.42, 0.42]} />
                                    <meshBasicMaterial color="#222222" />
                                  </mesh>
                                  <mesh>
                                    <planeGeometry args={[0.4, 0.4]} />
                                    {sub.logo ? (
                                      <meshBasicMaterial map={sub.logo} transparent={true} />
                                    ) : (
                                      <meshBasicMaterial color={sub.fallback} />
                                    )}
                                  </mesh>
                                </group>
                                <Text
                                  position={[0, 0, 0.01]}
                                  fontSize={0.22}
                                  color="#000"
                                  anchorX="center"
                                  anchorY="middle"
                                  fontWeight="bold"
                                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                                >
                                  {sub.name}
                                </Text>
                              </group>
                            );
                          });
                          acc.currentY -= height;
                        } else {
                          acc.elements.push(
                            <group 
                              key={sector.name} 
                              position={[0, yPos, 0]}
                              onClick={(e) => {
                                if (sector.name === 'JEWELLERY') {
                                  e.stopPropagation();
                                  soundManager.playJewelryFall();
                                  setIsJewelleryExpanded(true);
                                } else if (sector.name === 'PRIVATE INVESTMENT') {
                                  e.stopPropagation();
                                  soundManager.playCoinSpin();
                                  setIsPrivateInvestmentExpanded(true);
                                } else if (sector.name === 'CENTRAL BANKS') {
                                  e.stopPropagation();
                                  soundManager.playEagleScreech();
                                  setIsCentralBanksExpanded(true);
                                } else if (sector.name === 'INDUSTRY & TECH') {
                                  e.stopPropagation();
                                  soundManager.playLaserBeam();
                                  setIsIndustryTechExpanded(true);
                                }
                              }}
                              onPointerOver={(e) => {
                                if (sector.name === 'JEWELLERY' || sector.name === 'PRIVATE INVESTMENT' || sector.name === 'CENTRAL BANKS' || sector.name === 'INDUSTRY & TECH') {
                                  e.stopPropagation();
                                  document.body.style.cursor = 'pointer';
                                }
                              }}
                              onPointerOut={(e) => {
                                if (sector.name === 'JEWELLERY' || sector.name === 'PRIVATE INVESTMENT' || sector.name === 'CENTRAL BANKS' || sector.name === 'INDUSTRY & TECH') {
                                  e.stopPropagation();
                                  document.body.style.cursor = 'auto';
                                }
                              }}
                            >
                              <mesh>
                                <planeGeometry args={[8.5, height - 0.05]} />
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
                                {`$${(marketCap * sector.share / 1e12).toFixed(2)}T`} ({Math.round(sector.share * 1000) / 10}%)
                              </Text>
                            </group>
                          );
                          acc.currentY -= height;
                        }
                        return acc;
                      }, { elements: [], currentY: 6 }).elements}
                    </group>
                  )}

                  {!showSectors && (
                    <group 
                      position={[0, -2.2, 0.05]}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (safeHavenStage === 'idle') {
                          setSafeHavenStage('missile');
                        }
                      }}
                      onPointerOver={(e) => {
                        e.stopPropagation();
                        document.body.style.cursor = 'pointer';
                      }}
                      onPointerOut={(e) => {
                        e.stopPropagation();
                        document.body.style.cursor = 'auto';
                      }}
                    >
                      <mesh position={[0, 0, 0]}>
                        <planeGeometry args={[2.5, 0.8]} />
                        <meshBasicMaterial color="blue" transparent opacity={0} />
                      </mesh>
                      
                      <Text
                        position={[0, 0, 0.02]}
                        fontSize={0.25}
                        font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                        color="#FFD700"
                        anchorX="center"
                        anchorY="middle"
                        letterSpacing={0.1}
                      >
                        SAFE HAVEN
                        <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.1} />
                      </Text>
                      
                      <mesh position={[0, -0.25, 0.01]}>
                        <planeGeometry args={[2.0, 0.02]} />
                        <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.1} />
                      </mesh>
                    </group>
                  )}

                  {/* Animation Components */}
                  {safeHavenStage === 'missile' && (
                    <>
                      {/* Attacking Missile (Left to Right) */}
                      <group ref={missileRef} position={[-5, 0, 0.1]}>
                        {/* Main Body */}
                        <mesh rotation={[0, 0, -Math.PI / 2]}>
                          <cylinderGeometry args={[0.06, 0.06, 0.5, 12]} />
                          <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
                        </mesh>
                        {/* Nose Cone */}
                        <mesh position={[0.25, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                          <coneGeometry args={[0.06, 0.15, 12]} />
                          <meshStandardMaterial color="#cc0000" emissive="#ff0000" emissiveIntensity={0.5} />
                        </mesh>
                        {/* Fins */}
                        {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
                          <mesh key={i} position={[-0.2, 0, 0]} rotation={[angle, 0, 0]}>
                            <boxGeometry args={[0.1, 0.15, 0.01]} />
                            <meshStandardMaterial color="#444" />
                          </mesh>
                        ))}
                        {/* Booster / Exhaust Flame */}
                        <mesh position={[-0.35, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                          <coneGeometry args={[0.05, 0.2, 8]} />
                          <meshBasicMaterial color="#ffaa00" transparent opacity={0.8} />
                        </mesh>
                        <mesh position={[-0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                          <cylinderGeometry args={[0.07, 0.07, 0.1, 12]} />
                          <meshStandardMaterial color="#111" />
                        </mesh>
                      </group>

                      {/* Interceptor Missile (Bottom to Top) */}
                      <group ref={interceptorRef} position={[0.5, -6, 0.1]}>
                        {/* Main Body */}
                        <mesh rotation={[0, 0, 0]}>
                          <cylinderGeometry args={[0.04, 0.04, 0.4, 12]} />
                          <meshStandardMaterial color="#444" metalness={0.9} roughness={0.1} />
                        </mesh>
                        {/* Nose Cone */}
                        <mesh position={[0, 0.2, 0]}>
                          <coneGeometry args={[0.04, 0.12, 12]} />
                          <meshStandardMaterial color="#ff8800" emissive="#ffaa00" emissiveIntensity={0.5} />
                        </mesh>
                        {/* Fins */}
                        {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
                          <mesh key={i} position={[0, -0.15, 0]} rotation={[0, angle, 0]}>
                            <boxGeometry args={[0.12, 0.08, 0.01]} />
                            <meshStandardMaterial color="#333" />
                          </mesh>
                        ))}
                        {/* Booster / Exhaust Flame */}
                        <mesh position={[0, -0.3, 0]} rotation={[Math.PI, 0, 0]}>
                          <coneGeometry args={[0.04, 0.25, 8]} />
                          <meshBasicMaterial color="#00ffff" transparent opacity={0.7} />
                        </mesh>
                        <mesh position={[0, -0.2, 0]}>
                          <cylinderGeometry args={[0.05, 0.05, 0.08, 12]} />
                          <meshStandardMaterial color="#222" />
                        </mesh>
                      </group>
                    </>
                  )}

                  {safeHavenStage === 'explosion' && (
                    <mesh ref={explosionRef} position={[0.5, 0, 0.2]}>
                      <sphereGeometry args={[0.1, 16, 16]} />
                      <meshBasicMaterial color="#ffaa00" transparent opacity={1} />
                    </mesh>
                  )}

                  {safeHavenStage === 'pop' && (
                    <mesh position={[0, 0, 0.3]}>
                      <sphereGeometry args={[2, 32, 32]} />
                      <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
                    </mesh>
                  )}

                  {safeHavenStage === 'inflation' && (
                    <group ref={usdNoteRef} position={[0, 0, 0.2]}>
                      {/* Main Note Body - Classic US Bill Green */}
                      <mesh>
                        <planeGeometry args={[1.5, 0.7]} />
                        <meshStandardMaterial 
                          color="#2d5a27" 
                          emissive="#1a3317" 
                          emissiveIntensity={0.2} 
                        />
                      </mesh>
                      
                      {/* Intricate Border */}
                      <mesh position={[0, 0, -0.005]}>
                        <planeGeometry args={[1.58, 0.78]} />
                        <meshBasicMaterial color="#2d5a27" />
                      </mesh>
                      <mesh position={[0, 0, -0.004]}>
                        <planeGeometry args={[1.54, 0.74]} />
                        <meshBasicMaterial color="#e0e0d0" />
                      </mesh>

                      {/* Central Portrait Oval (George Washington placeholder) */}
                      <mesh position={[0, 0, 0.005]}>
                        <circleGeometry args={[0.25, 32]} />
                        <meshStandardMaterial color="#e0e0d0" />
                      </mesh>
                      <mesh position={[0, 0, 0.006]}>
                        <circleGeometry args={[0.22, 32]} />
                        <meshStandardMaterial color="#2d5a27" opacity={0.3} transparent />
                      </mesh>

                      {/* Corner "1" Symbols */}
                      {[[-0.65, 0.25], [0.65, 0.25], [-0.65, -0.25], [0.65, -0.25]].map(([x, y], i) => (
                        <group key={i} position={[x, y, 0.01]}>
                          <mesh>
                            <circleGeometry args={[0.08, 16]} />
                            <meshBasicMaterial color="#2d5a27" />
                          </mesh>
                          <Text
                            position={[0, 0, 0.001]}
                            fontSize={0.08}
                            color="#000000"
                            font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                            fontWeight="bold"
                          >
                            1
                          </Text>
                        </group>
                      ))}

                      {/* Paper Promises Text */}
                      <group position={[0, 0.22, 0.01]}>
                        <Text
                          fontSize={0.07}
                          color="#000000"
                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                          fontWeight="bold"
                          letterSpacing={0.05}
                        >
                          THE UNITED STATES OF DEBT
                        </Text>
                      </group>

                      <group position={[0, -0.22, 0.01]}>
                        <Text
                          fontSize={0.12}
                          color="#000000"
                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                          fontWeight="bold"
                        >
                          PAPER PROMISES
                        </Text>
                      </group>

                      {/* Inflation Indicator */}
                      <group position={[0, 0.55, 0]}>
                        <Text
                          fontSize={0.15}
                          color="#ff0000"
                          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                          fontWeight="bold"
                        >
                          INFLATION
                        </Text>
                        <mesh position={[0, -0.15, 0]} rotation={[0, 0, Math.PI]}>
                          <coneGeometry args={[0.05, 0.1, 4]} />
                          <meshBasicMaterial color="#ff0000" />
                        </mesh>
                      </group>

                      {/* Decorative elements for the note */}
                      <mesh position={[0, 0, -0.02]}>
                        <planeGeometry args={[1.6, 0.8]} />
                        <meshBasicMaterial color="#ffffff" transparent opacity={0.2} />
                      </mesh>
                    </group>
                  )}

                  {(safeHavenStage === 'debris' || safeHavenStage === 'debris2' || safeHavenStage === 'explosion' || safeHavenStage === 'inflation' || safeHavenStage === 'pop') && (
                    <group ref={debrisRef}>
                      {Array.from({ length: 100 }).map((_, i) => (
                        <mesh key={i} position={[0, 10, 0]} visible={false}>
                          <boxGeometry args={[0.08, 0.08, 0.08]} />
                          <meshStandardMaterial 
                            color="#FFD700" 
                            metalness={1} 
                            roughness={0.1}
                            emissive="#FFD700"
                            emissiveIntensity={0.2}
                          />
                        </mesh>
                      ))}
                    </group>
                  )}

                  <Text
                    position={[0, -6.1, 0.01]}
                    fontSize={0.08}
                    color="#4a3728"
                    font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                  >
                    V2.2 - MATURE CRACKING
                    <meshBasicMaterial color="#4a3728" opacity={0.2} transparent />
                  </Text>

                  <mesh position={[0, 0, 0.01]}>
                    <planeGeometry args={[4, 0.01]} />
                    <meshBasicMaterial color="#FFD700" opacity={0.05} transparent />
                  </mesh>
                </group>
            ) : (
              <group scale={width > 5 ? 1 : width / 10 + 0.5}>
                <Text
                  position={[0, 0.6, 0]}
                  fontSize={0.6}
                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                  color="#4a3728"
                  anchorX="center"
                  anchorY="middle"
                  depthOffset={-2}
                >
                  {width > 3 ? '999.9 FINE GOLD' : ''}
                  {engravingMaterial}
                </Text>

                <Text
                  position={[0, -0.4, 0]}
                  fontSize={1.2}
                  fontWeight="bold"
                  font={INTER_FONT}
                  color="#4a3728"
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
                    document.body.style.cursor = 'pointer';
                  }}
                  onPointerOut={(e) => {
                    e.stopPropagation();
                    setHoveredIntelligence(false);
                    document.body.style.cursor = 'auto';
                  }}
                >
                  XAU
                  {engravingMaterial}
                </Text>

                <Text
                  position={[0, -1.1, 0]}
                  fontSize={0.3}
                  font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                  color="#4a3728"
                  anchorX="center"
                  anchorY="middle"
                  depthOffset={-2}
                >
                  {width > 3 ? 'NET WT 1 OZ' : ''}
                  {engravingMaterial}
                </Text>
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

      {hoveredIntelligence && !isMorphed && !showSectors && (
        <group position={[-2, 6, 0]}>
          <Billboard follow={true}>
            {/* Main Background Panel */}
            <mesh position={[0, 0, -0.05]} frustumCulled={false}>
              <planeGeometry args={[15, 8.5]} />
              <meshPhysicalMaterial 
                color="#000000" 
                emissive="#100800"
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
            
            {/* Accent Border Glow */}
            <mesh position={[0, 0, -0.06]} frustumCulled={false}>
              <planeGeometry args={[15.1, 8.6]} />
              <meshBasicMaterial 
                color="#FFD700" 
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
                GOLD MARKET INTELLIGENCE
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
                  color="#FFD700" 
                  transparent 
                  opacity={0.2} 
                />
              </mesh>
              <Text
                fontSize={0.5}
                color="#FFD700"
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
                  color="#FFD700"
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
                  color="#DAA520"
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
      </group>
    </Float>
  );
});
