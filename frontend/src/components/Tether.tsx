import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TetherProps {
  startRef: React.RefObject<THREE.Group>;
  endRef: React.RefObject<THREE.Group>;
  visible: boolean;
  onClick?: () => void;
}

const Beam = ({ startRef, endRef, visible }: Omit<TetherProps, 'onClick'>) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  useFrame((state) => {
    if (!visible || !startRef.current || !endRef.current || !meshRef.current) return;
    
    const startPos = new THREE.Vector3(5, 0, 0);
    const endPos = new THREE.Vector3(-5, 0, 0);
    
    startRef.current.localToWorld(startPos);
    endRef.current.localToWorld(endPos);

    const dist = startPos.distanceTo(endPos);
    meshRef.current.scale.set(0.02, 0.02, dist);
    meshRef.current.position.lerpVectors(startPos, endPos, 0.5);
    meshRef.current.lookAt(endPos);
    
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uColor: { value: new THREE.Color('#40e0d0') } // Turquoise/Cyan energy
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float pulse = sin(vUv.y * 50.0 - uTime * 20.0) * 0.5 + 0.5;
            float glow = exp(-abs(vUv.x - 0.5) * 10.0);
            gl_FragColor = vec4(uColor, pulse * glow * 0.6);
          }
        `}
      />
    </mesh>
  );
};

export const Tether: React.FC<TetherProps> = ({ startRef, endRef, visible, onClick }) => {
  const groupRef = useRef<THREE.Group>(null);
  const hitBoxRef = useRef<THREE.Mesh>(null);
  
  const numLinks = 30;
  const links = useMemo(() => Array.from({ length: numLinks }), []);

  useFrame((state) => {
    if (!visible || !startRef.current || !endRef.current || !groupRef.current) {
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;

    const startPos = new THREE.Vector3(5, 0, 0);
    const endPos = new THREE.Vector3(-5, 0, 0);
    
    startRef.current.localToWorld(startPos);
    endRef.current.localToWorld(endPos);

    // Create a curve with a slight sag relative to the start/end points
    const midY = (startPos.y + endPos.y) / 2 - 0.4;
    const curve = new THREE.CatmullRomCurve3([
      startPos,
      new THREE.Vector3((startPos.x + endPos.x) / 2, midY, 0),
      endPos
    ]);

    const time = state.clock.elapsedTime;

    groupRef.current.children.forEach((child, i) => {
      // Skip the beam and hit-box which are the last children
      if (i >= numLinks) return;

      const t = i / (numLinks - 1);
      const pos = curve.getPoint(t);
      child.position.copy(pos);
      
      const nextT = Math.min(1, t + 0.01);
      const nextPos = curve.getPoint(nextT);
      child.lookAt(nextPos);
      
      // Alternate rotation for link feel
      child.rotation.z = (i % 2 === 0 ? time : -time) * 2 + i * 0.5;
      
      // Pulse scale based on energy flow
      const energyPulse = Math.sin(time * 8 - t * 15.0) * 0.5 + 0.5;
      child.scale.setScalar(0.5 + energyPulse * 0.3);
      
      // Update color intensity if possible (using emissiveIntensity)
      if ((child as THREE.Mesh).material instanceof THREE.MeshStandardMaterial) {
        ((child as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + energyPulse * 4;
      }
    });

    // Update hit-box position and size
    if (hitBoxRef.current) {
      const dist = startPos.distanceTo(endPos);
      hitBoxRef.current.scale.set(dist, 1, 1);
      hitBoxRef.current.position.lerpVectors(startPos, endPos, 0.5);
      hitBoxRef.current.lookAt(endPos);
      hitBoxRef.current.rotateY(Math.PI / 2);
    }
  });

  return (
    <group ref={groupRef} visible={visible}>
      {links.map((_, i) => (
        <mesh key={i}>
          <torusGeometry args={[0.15, 0.02, 6, 24]} />
          <meshStandardMaterial 
            color="#ffffff" 
            emissive={i % 2 === 0 ? "#FFD700" : "#C0C0C0"} 
            emissiveIntensity={2}
            metalness={1}
            roughness={0.1}
          />
        </mesh>
      ))}
      <Beam startRef={startRef} endRef={endRef} visible={visible} />
      
      {/* Hitbox for clicking the tether */}
      <mesh 
        ref={hitBoxRef} 
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
};
