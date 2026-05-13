import { useRef } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';

/**
 * Like useFrame but skips invocations until `interval` seconds have elapsed,
 * reducing GPU work for decorative/non-critical animations. The accumulated
 * delta is passed to the callback so lerp-based animations stay smooth.
 */
export function useThrottledFrame(
  callback: (state: RootState, delta: number) => void,
  interval = 1 / 30,
) {
  const acc = useRef(0);

  useFrame((state, delta) => {
    acc.current += delta;
    if (acc.current < interval) return;
    callback(state, acc.current);
    acc.current = 0;
  });
}
