import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line, Sparkles } from '@react-three/drei';

interface SafeHavenCoinProps {
  active: boolean;
  onComplete?: () => void;
}

export function SafeHavenCoin({ active, onComplete }: SafeHavenCoinProps) {
  const coinRef = useRef<THREE.Group>(null);
  const sparkRef = useRef<THREE.Group>(null);
  const [progress, setProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Define the path for the bull run
  const { curve, points } = useMemo(() => {
    const curvePoints = [
      new THREE.Vector3(-4.2, -6.0, 0.08), // Start at bottom left (with slight margin)
      new THREE.Vector3(-3.0, -3.5, 0.08), // Big jump
      new THREE.Vector3(-2.0, -4.5, 0.08), // Correction
      new THREE.Vector3(-0.5, -1.0, 0.08), // Steady rise
      new THREE.Vector3(0.5, -2.0, 0.08),  // Small dip
      new THREE.Vector3(1.5, 2.0, 0.08),   // Big jump
      new THREE.Vector3(2.0, 1.0, 0.08),   // Correction
      new THREE.Vector3(2.5, 4.5, 0.08),   // Final peak (stops right before market cap)
    ];
    // Use CatmullRomCurve3 for smooth interpolation
    const catmullCurve = new THREE.CatmullRomCurve3(curvePoints);
    const sampledPoints = catmullCurve.getPoints(200);
    return { curve: catmullCurve, points: sampledPoints };
  }, []);

  useEffect(() => {
    if (active && !isAnimating && progress === 0) {
      setProgress(0);
      setIsAnimating(true);
    } else if (!active) {
      setProgress(0);
      setIsAnimating(false);
    }
  }, [active, isAnimating, progress]);

  useFrame((state, delta) => {
    if (!isAnimating) return;

    // 4 seconds duration for a steady, un-rushed rise
    const newProgress = progress + delta / 4.0;
    
    if (newProgress >= 1) {
      setProgress(1);
      setIsAnimating(false);
      if (onComplete) onComplete();
    } else {
      setProgress(newProgress);
    }

    if (coinRef.current) {
      const currentPos = curve.getPoint(Math.min(newProgress, 1));
      coinRef.current.position.copy(currentPos);
      // Spin the coin around its Z axis
      coinRef.current.rotation.z -= delta * 5;
      
      if (sparkRef.current) {
        sparkRef.current.position.copy(currentPos);
      }
    }
  });

  // Calculate trail points
  const trailPoints = useMemo(() => {
    if (progress === 0) return [];
    const count = Math.max(2, Math.floor(progress * points.length));
    return points.slice(0, count);
  }, [progress, points]);

  if (!active && progress === 0) return null;

  return (
    <group>
      {/* Engraved Trail Shadow (The "Cut" into the gold) */}
      {trailPoints.length > 1 && (
        <Line
          points={trailPoints.map(p => new THREE.Vector3(p.x + 0.005, p.y - 0.005, 0.082))}
          color="#1a2e05" // Deep dark green for the "bottom" of the cut
          lineWidth={12}
          transparent
          opacity={0.9}
          depthTest={true}
          depthWrite={false}
        />
      )}

      {/* Engraved Trail Highlight (The "Edge" of the cut) */}
      {trailPoints.length > 1 && (
        <Line
          points={trailPoints.map(p => new THREE.Vector3(p.x - 0.005, p.y + 0.005, 0.083))}
          color="#ffffff" // Brighter highlight for the edge
          lineWidth={3}
          transparent
          opacity={0.6}
          depthTest={true}
          depthWrite={false}
        />
      )}
      
      {/* Engraved Trail Glow (The "Energy" in the cut) */}
      {trailPoints.length > 1 && (
        <Line
          points={trailPoints.map(p => new THREE.Vector3(p.x, p.y, 0.08))}
          color="#4ade80" // Brighter green
          lineWidth={6}
          transparent
          opacity={1}
          depthTest={true}
          depthWrite={false}
        />
      )}

      {/* Welding Effect (Sparks and Glow) */}
      {isAnimating && (
        <group ref={sparkRef}>
          <Sparkles 
            count={40} // Increased count
            scale={0.8} 
            size={4} // Increased size
            speed={4} 
            color="#4ade80" 
            noise={1}
          />
          <pointLight intensity={5} distance={2} color="#22c55e" />
        </group>
      )}

      {/* Super-charged Coin */}
      <group ref={coinRef} position={[-4.2, -6.0, 0.09]}>
        {/* Coin Body */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.04, 32]} />
          <meshStandardMaterial 
            color="#FFD700" 
            metalness={1} 
            roughness={0.2} 
            emissive="#F59E0B"
            emissiveIntensity={0.4}
          />
        </mesh>
        {/* Coin Inner Ridge */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.021]}>
          <cylinderGeometry args={[0.12, 0.12, 0.04, 32]} />
          <meshStandardMaterial 
            color="#FBBF24" 
            metalness={0.8} 
            roughness={0.4} 
          />
        </mesh>
        {/* Glow Halo */}
        <mesh position={[0, 0, -0.01]}>
          <circleGeometry args={[0.3, 32]} />
          <meshBasicMaterial color="#34D399" transparent opacity={0.4} />
        </mesh>
      </group>
    </group>
  );
}
