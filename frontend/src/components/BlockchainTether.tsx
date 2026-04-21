import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface BlockchainTetherProps {
  start: [number, number, number];
  end: [number, number, number];
  visible: boolean;
}

export const BlockchainTether: React.FC<BlockchainTetherProps> = ({ start, end, visible }) => {
  const groupRef = useRef<THREE.Group>(null);

  const startVec = useMemo(() => new THREE.Vector3(...start), [start]);
  const endVec = useMemo(() => new THREE.Vector3(...end), [end]);
  const distance = useMemo(() => startVec.distanceTo(endVec), [startVec, endVec]);
  
  const linkCount = 8;
  const links = useMemo(() => {
    return Array.from({ length: linkCount }).map((_, i) => ({
      offset: (i + 1) / (linkCount + 1),
    }));
  }, []);

  const pulseCount = 6;
  const pulses = useMemo(() => {
    return Array.from({ length: pulseCount }).map((_, i) => ({
      offset: i / pulseCount,
      speed: 1.2,
    }));
  }, []);

  const pulseRefs = useRef<THREE.Mesh[]>([]);

  useFrame((state) => {
    if (!groupRef.current || !visible) return;
    const t = state.clock.elapsedTime;
    
    // Animate data pulses
    pulseRefs.current.forEach((pulseMesh, i) => {
      if (pulseMesh) {
        const p = pulses[i];
        const progress = (p.offset + t * p.speed * 1.5) % 1;
        pulseMesh.position.lerpVectors(startVec, endVec, progress);
        pulseMesh.scale.setScalar(Math.sin(progress * Math.PI) * 1.5);
      }
    });
  });

  if (!visible) return null;

  return (
    <group ref={groupRef}>
      {/* Sleek Cyan Data Stream */}
      <mesh position={new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5)}>
        <boxGeometry args={[distance, 0.02, 0.02]} />
        <meshStandardMaterial 
          color="#00ffff" 
          emissive="#00ffff"
          emissiveIntensity={15}
          transparent 
          opacity={0.9} 
        />
      </mesh>

      {/* Magenta Energy Aura (Vibrant) */}
      <mesh position={new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5)}>
        <boxGeometry args={[distance, 0.06, 0.06]} />
        <meshStandardMaterial 
          color="#ff00ff" 
          emissive="#ff00ff"
          emissiveIntensity={5}
          transparent 
          opacity={0.2} 
        />
      </mesh>

      {/* Geometric Data Nodes */}
      {links.map((link, i) => {
        const pos = new THREE.Vector3().lerpVectors(startVec, endVec, link.offset);
        return (
          <group key={i} position={pos}>
            <mesh rotation={[Math.PI / 4, Math.PI / 4, 0]}>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshStandardMaterial 
                color="#00ffff" 
                emissive="#00ffff"
                emissiveIntensity={10}
              />
            </mesh>
            <mesh rotation={[Math.PI / 4, Math.PI / 4, 0]}>
              <boxGeometry args={[0.3, 0.3, 0.3]} />
              <meshBasicMaterial color="#ff00ff" wireframe transparent opacity={0.5} />
            </mesh>
          </group>
        );
      })}
      
      {/* Moving Data Packets */}
      {pulses.map((_, i) => (
        <mesh key={`pulse-${i}`} ref={(el) => (pulseRefs.current[i] = el!)}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#00ffff" 
            emissiveIntensity={50} 
          />
        </mesh>
      ))}
    </group>
  );
};
