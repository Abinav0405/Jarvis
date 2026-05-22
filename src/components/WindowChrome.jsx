import { useCallback, useEffect, useState } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { getJarvis } from '@/jarvis-bridge.js';

/** Frameless window controls — drag region, hide, fullscreen. */
export function WindowChrome() {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    getJarvis()
      .readData()
      .then((d) => setFullscreen(!!d?.settings?.fullscreen))
      .catch(() => {});
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const next = !fullscreen;
    try {
      await getJarvis().setFullScreen(next);
      setFullscreen(next);
      const data = await getJarvis().readData();
      await getJarvis().writeData({
        ...data,
        settings: { ...data.settings, fullscreen: next },
      });
    } catch {
      /* */
    }
  }, [fullscreen]);

  return (
    <header
      className="relative z-20 flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <span
        className="pointer-events-none select-none pl-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]"
        aria-hidden
      >
        JARVIS
      </span>
      <motion.div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
        <motion.button
          type="button"
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className="jarvis-interactive flex h-8 w-8 items-center justify-center rounded-btn border border-[var(--border-subtle)] bg-[var(--glass-bg)] text-[var(--text-primary)] opacity-80 hover:opacity-100"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => void toggleFullscreen()}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </motion.button>
        <motion.button
          type="button"
          aria-label="Hide JARVIS"
          title="Hide to tray"
          className="jarvis-interactive flex h-8 w-8 items-center justify-center rounded-btn border border-[var(--border-subtle)] bg-[var(--glass-bg)] text-[var(--text-primary)] opacity-80 hover:opacity-100"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => getJarvis().hideWindow()}
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </motion.button>
      </motion.div>
    </header>
  );
}
