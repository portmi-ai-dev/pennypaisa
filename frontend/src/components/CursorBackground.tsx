import * as React from 'react';

/**
 * Mouse-reactive silvery/gold radial-gradient background.
 *
 * Renders a `position: fixed` overlay that lerps two radial gradients toward
 * the cursor (silver shimmer follows, gold counter-orbits) plus a static top
 * highlight. Same visual language as the marketing landing's HeroSpotlight,
 * extracted so it can be reused across pages without dragging the 3D
 * glass-logo tilt machinery along.
 *
 * The component owns its own rAF loop + mousemove listener; mount it once per
 * surface that wants the effect.
 */
export const CursorBackground: React.FC = () => {
  const bgRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let tBgX = 30;
    let tBgY = 50;
    let bgX = 30;
    let bgY = 50;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      tBgX = (e.clientX / window.innerWidth) * 100;
      tBgY = (e.clientY / window.innerHeight) * 100;
    };

    const loop = () => {
      bgX += (tBgX - bgX) * 0.04;
      bgY += (tBgY - bgY) * 0.04;
      if (bgRef.current) {
        bgRef.current.style.setProperty('--mx', bgX + '%');
        bgRef.current.style.setProperty('--my', bgY + '%');
      }
      raf = requestAnimationFrame(loop);
    };

    document.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);
    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={bgRef}
      style={
        {
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 70% 60% at var(--mx, 30%) var(--my, 50%),
              rgba(210,215,240,0.22) 0%,
              rgba(180,185,215,0.08) 35%,
              transparent 65%),
            radial-gradient(ellipse 65% 55% at calc(100% - var(--mx, 30%)) calc(100% - var(--my, 50%)),
              rgba(220,180,90,0.13) 0%,
              rgba(201,168,76,0.04) 40%,
              transparent 70%),
            radial-gradient(ellipse 100% 60% at 50% 0%,
              rgba(210,215,235,0.06) 0%,
              transparent 55%)
          `,
        } as React.CSSProperties
      }
    />
  );
};
