import * as React from 'react';
import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

interface BlockchainNodeProps {
  position: [number, number, number];
  marketCap: number;
  dominance: number;
  visible: boolean;
  totalSupply?: string;
  circulatingSupply?: string;
  volume24h?: string;
  volumeChangePercent?: number;
}

export const BlockchainNode: React.FC<BlockchainNodeProps> = ({ 
  position, 
  marketCap, 
  dominance, 
  visible,
  totalSupply = "21,000,000 BTC",
  circulatingSupply = "19,675,000 BTC",
  volume24h = "$35.2B",
  volumeChangePercent = 0
}) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current || !visible) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y = Math.sin(t * 0.5 + 1) * 0.2;
  });

  if (!visible) return null;

  const formatMarketCap = (val: number) => {
    if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    return `$${val.toLocaleString()}`;
  };

  return (
    <group ref={groupRef} position={position}>
      <RoundedBox
        args={[2.2, 2.2, 2.2]}
        radius={0.05}
        smoothness={10}
      >
        <meshPhysicalMaterial
          color="#050505"
          transmission={0.1}
          thickness={2}
          roughness={0.05}
          metalness={0.8}
          ior={1.5}
          clearcoat={1}
          transparent
          opacity={0.98}
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

        {/* High-Definition Satoshi "Incognito" Logo (Front Face) */}
        <group position={[0, 0.4, 1.11]} scale={0.025}>
          {/* Hat Top */}
          <mesh position={[0, 12, 0]}>
            <boxGeometry args={[18, 10, 0.1]} />
            <meshBasicMaterial color="#C0C0C0" />
          </mesh>
          {/* Hat Brim */}
          <mesh position={[0, 7, 0]}>
            <boxGeometry args={[32, 2, 0.1]} />
            <meshBasicMaterial color="#C0C0C0" />
          </mesh>
          
          {/* Left Lens */}
          <mesh position={[-8, -2, 0.05]}>
            <circleGeometry args={[6, 32]} />
            <meshBasicMaterial color="#C0C0C0" />
          </mesh>
          {/* Right Lens */}
          <mesh position={[8, -2, 0.05]}>
            <circleGeometry args={[6, 32]} />
            <meshBasicMaterial color="#C0C0C0" />
          </mesh>
          {/* Glasses Bridge & Nose */}
          <mesh position={[0, -1.5, 0.06]}>
            <boxGeometry args={[6, 3, 0.1]} />
            <meshBasicMaterial color="#C0C0C0" />
          </mesh>
          {/* Glasses Arms (Stylized) */}
          <mesh position={[-16, 0, 0.06]} rotation={[0, 0, 0.3]}>
            <boxGeometry args={[12, 1.5, 0.1]} />
            <meshBasicMaterial color="#C0C0C0" />
          </mesh>
          <mesh position={[16, 0, 0.06]} rotation={[0, 0, -0.3]}>
            <boxGeometry args={[12, 1.5, 0.1]} />
            <meshBasicMaterial color="#C0C0C0" />
          </mesh>
        </group>

        {/* Market Cap Text (Front Face) */}
        <Text
          position={[0, -0.4, 1.11]}
          fontSize={0.22}
          color="#C0C0C0"
          fontWeight="bold"
        >
          Mkt Cap: {formatMarketCap(marketCap)}
        </Text>

        {/* Dominance Text (Front Face) */}
        <Text
          position={[0, -0.7, 1.11]}
          fontSize={0.22}
          color="#C0C0C0"
          fontWeight="bold"
        >
          Dominance: {dominance.toFixed(1)}%
        </Text>

        {/* Total & Circulating Supply (Left Face) */}
        <group position={[-1.11, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <Text
            position={[0, 0.5, 0]}
            fontSize={0.18}
            color="#C0C0C0"
            fontWeight="bold"
          >
            TOTAL SUPPLY
          </Text>
          <Text
            position={[0, 0.2, 0]}
            fontSize={0.22}
            color="#ffffff"
          >
            {totalSupply}
          </Text>
          <Text
            position={[0, -0.2, 0]}
            fontSize={0.18}
            color="#C0C0C0"
            fontWeight="bold"
          >
            CIRCULATING SUPPLY
          </Text>
          <Text
            position={[0, -0.5, 0]}
            fontSize={0.22}
            color="#ffffff"
          >
            {circulatingSupply}
          </Text>
        </group>

        {/* Volume 24h (Top Face) */}
        <group position={[0, 1.11, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <Text
            position={[0, 0.4, 0]}
            fontSize={0.18}
            color="#C0C0C0"
            fontWeight="bold"
          >
            VOLUME (24H)
          </Text>
          <Text
            position={[0, 0.1, 0]}
            fontSize={0.3}
            color="#ffffff"
            fontWeight="bold"
          >
            {volume24h}
          </Text>
          <Text
            position={[0, -0.3, 0]}
            fontSize={0.22}
            color={volumeChangePercent >= 0 ? "#00ff00" : "#ff0000"}
            fontWeight="bold"
          >
            {volumeChangePercent >= 0 ? '▲' : '▼'} {Math.abs(volumeChangePercent).toFixed(2)}%
          </Text>
        </group>
      </RoundedBox>

      {/* Internal Light Source - Reduced to one */}
      <pointLight color="#C0C0C0" intensity={2} distance={5} />
    </group>
  );
};
