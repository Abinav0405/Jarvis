import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { publicAsset } from '@/utils/publicAsset.js';
import { CreatorAttribution } from '@/components/CreatorAttribution.jsx';

const BOOT_DURATION = 2800; // ms before crossfade starts
const PROGRESS_TICK_MS = 120; // avoid 60fps setState during boot (reduces jank in the web version)

const statusLines = [
  'Initializing neural core…',
  'Loading system modules…',
  'Scanning workspace…',
  'Calibrating interface…',
  'Systems online.',
];

/** Gemini-style boot splash — full-bleed branding like Dashboard, not a small centered tile. */
export function BootScreen({ onComplete, onSystemsOnline }) {
  const [progress, setProgress] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [systemsSurge, setSystemsSurge] = useState(false);
  /** Parent passes a new function when `data` hydrates; do not reset the boot timer. */
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onSystemsOnlineRef = useRef(onSystemsOnline);
  onSystemsOnlineRef.current = onSystemsOnline;
  const systemsFiredRef = useRef(false);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / BOOT_DURATION) * 100);
      setProgress(pct);
      const idx = Math.min(statusLines.length - 1, Math.floor((pct / 100) * statusLines.length));
      setLineIdx(idx);
      if (idx >= statusLines.length - 1 && !systemsFiredRef.current) {
        systemsFiredRef.current = true;
        setSystemsSurge(true);
        onSystemsOnlineRef.current?.();
      }
      if (elapsed >= BOOT_DURATION) {
        clearInterval(id);
        setDone(true);
        setTimeout(() => {
          const fn = onCompleteRef.current;
          void Promise.resolve(fn?.());
        }, 600);
      }
    }, PROGRESS_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="boot"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-[#050506]"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        >
          {/* Full-bleed background — same treatment as Dashboard */}
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.22]"
            style={{ backgroundImage: `url(${publicAsset('branding/jarvis-1-bg.png')})` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#070708]/95 via-[#08080a]/93 to-[#050506]/97"
            aria-hidden
          />
          {/* Large watermark logo (atmosphere, not a “square in the middle”) */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[min(120vw,140vh)] w-[min(120vw,140vh)] -translate-x-1/2 -translate-y-1/2 bg-contain bg-center bg-no-repeat opacity-[0.07]"
            style={{ backgroundImage: `url(${publicAsset('branding/jarvis-logo-circle.png')})` }}
            aria-hidden
          />

          {/* Ambient glow */}
          <motion.div className="pointer-events-none absolute inset-0">
            <motion.div
              className={`boot-aura absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 ${systemsSurge ? 'boot-aura--surge' : ''}`}
              animate={systemsSurge ? { scale: [1, 1.18, 1.06], opacity: [0.45, 1, 0.75] } : undefined}
              transition={{ duration: 0.95, ease: 'easeOut' }}
            />
          </motion.div>

          {/* Pulse rings */}
          <div className="relative flex items-center justify-center">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="boot-ring absolute rounded-full"
                style={{
                  width: 160 + i * 70,
                  height: 160 + i * 70,
                }}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{
                  opacity: [0, 0.5, 0],
                  scale: [0.7, 1.15, 1.4],
                }}
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  delay: i * 0.55,
                  ease: 'easeOut',
                }}
              />
            ))}

            <motion.div
              className={`relative z-10 flex flex-col items-center justify-center px-6 text-center ${systemsSurge ? 'boot-title-surge' : ''}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1
                className={`text-4xl font-light tracking-[0.35em] text-[#F0F0F0] drop-shadow-[0_0_28px_rgba(0,212,255,0.25)] ${systemsSurge ? 'text-[var(--accent)]' : ''}`}
              >
                JARVIS
              </h1>
              <p className="mt-2 text-xs tracking-widest text-[rgba(240,240,240,0.45)]">Initializing systems…</p>
            </motion.div>
          </div>

          <CreatorAttribution />

          <motion.div className="relative z-10 mt-8 h-5 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={lineIdx}
                className="text-center text-xs tracking-wider text-[rgba(240,240,240,0.5)]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {statusLines[lineIdx]}
              </motion.p>
            </AnimatePresence>
          </motion.div>

          <div className="relative z-10 mt-6 h-[3px] w-56 overflow-hidden rounded-pill bg-[rgba(255,255,255,0.06)]">
            <div className="boot-progress h-full rounded-pill" style={{ width: `${progress}%` }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
