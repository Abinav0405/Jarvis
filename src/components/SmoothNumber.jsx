import { useEffect, useRef, useState } from 'react';

export function SmoothNumber({ value, decimals = 0, className = '' }) {
  const target = Number(value);
  const settledRef = useRef(Number.isFinite(target) ? target : 0);
  const [display, setDisplay] = useState(settledRef.current);

  useEffect(() => {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    const start = settledRef.current;
    if (Math.abs(next - start) < 1e-6) return;
    let raf;
    const t0 = performance.now();
    const duration = 400;

    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      const v = start + (next - start) * eased;
      setDisplay(v);
      if (p >= 1) settledRef.current = next;
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const text =
    decimals > 0
      ? display.toFixed(decimals)
      : String(Math.round(display));
  return <span className={`font-mono tabular-nums ${className}`}>{text}</span>;
}
