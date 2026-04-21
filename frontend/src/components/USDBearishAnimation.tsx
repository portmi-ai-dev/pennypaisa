import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line, Text, Sparkles } from '@react-three/drei';

interface USDBearishAnimationProps {
  active: boolean;
  onComplete?: () => void;
}

export function USDBearishAnimation({ active, onComplete }: USDBearishAnimationProps) {
  const billRef = useRef<THREE.Group>(null);
  const sparkRef = useRef<THREE.Group>(null);
  const [progress, setProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Define the path for the bearish fall
  const { curve, points } = useMemo(() => {
    const curvePoints = [
      new THREE.Vector3(-4.2, 6.0, 0.08),  // Start at top left
      new THREE.Vector3(-3.0, 4.5, 0.08),  // Initial drop
      new THREE.Vector3(-2.5, 5.0, 0.08),  // Small bounce (bull trap)
      new THREE.Vector3(-1.0, 2.0, 0.08),  // Sharp fall
      new THREE.Vector3(0.0, 3.0, 0.08),   // Relief rally
      new THREE.Vector3(1.5, -1.0, 0.08),  // Major crash
      new THREE.Vector3(2.5, 0.0, 0.08),   // Final dead cat bounce
      new THREE.Vector3(4.2, -6.0, 0.08),  // Bottom right corner
    ];
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

    // 4 seconds duration to match the coin
    const newProgress = progress + delta / 4.0;
    
    if (newProgress >= 1) {
      setProgress(1);
      setIsAnimating(false);
      if (onComplete) onComplete();
    } else {
      setProgress(newProgress);
    }

    if (billRef.current) {
      const currentPos = curve.getPoint(Math.min(newProgress, 1));
      billRef.current.position.copy(currentPos);
      
      // Fluttering rotation as it falls
      const time = state.clock.elapsedTime;
      billRef.current.rotation.z = Math.sin(time * 10) * 0.2;
      billRef.current.rotation.y = Math.cos(time * 5) * 0.3;

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
          color="#450a0a" // Very dark red for the "bottom" of the cut
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
      
      {/* Engraved Trail Red Line (The "Energy" in the cut) */}
      {trailPoints.length > 1 && (
        <Line
          points={trailPoints.map(p => new THREE.Vector3(p.x, p.y, 0.08))}
          color="#ef4444" // Bright red
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
            color="#f87171" 
            noise={1}
          />
          <pointLight intensity={5} distance={2} color="#ef4444" />
        </group>
      )}

      {/* Falling USD Bill */}
      <group ref={billRef} position={[-4.2, 6.0, 0.09]}>
        {/* Bill Body - Slightly bigger and using meshBasicMaterial to prevent washout */}
        <mesh>
          <planeGeometry args={[0.8, 0.4]} />
          <meshBasicMaterial color="#2d5a27" />
        </mesh>
        
        {/* Bill Details - USD Text */}
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.18}
          color="#000000"
          anchorX="center"
          anchorY="middle"
          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
        >
          USD
        </Text>
        
        {/* Border */}
        <Line
          points={[
            new THREE.Vector3(-0.4, -0.2, 0.005),
            new THREE.Vector3(0.4, -0.2, 0.005),
            new THREE.Vector3(0.4, 0.2, 0.005),
            new THREE.Vector3(-0.4, 0.2, 0.005),
            new THREE.Vector3(-0.4, -0.2, 0.005),
          ]}
          color="#000000"
          lineWidth={1}
        />
      </group>
    </group>
  );
}
