import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { getJarvis } from '@/jarvis-bridge.js';

export function TopDragBar() {
  return (
    <header
      className="relative flex h-10 shrink-0 items-center justify-end border-b border-[rgba(255,255,255,0.07)] px-3"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <motion.button
        type="button"
        aria-label="Hide JARVIS"
        className="jarvis-interactive flex h-8 w-8 items-center justify-center rounded-btn border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)] text-[rgba(240,240,240,0.75)] backdrop-blur-glass transition-shadow hover:shadow-glow"
        style={{ WebkitAppRegion: 'no-drag' }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => getJarvis().hideWindow()}
      >
        <X className="h-4 w-4" strokeWidth={1.75} />
      </motion.button>
    </header>
  );
}
