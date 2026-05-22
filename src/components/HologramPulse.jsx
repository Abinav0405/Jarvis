import { AnimatePresence, motion } from 'framer-motion';

/** Brief hologram / arc-reactor pulse overlay — non-blocking, pointer-events none. */
export function HologramPulse({ triggerKey = 0, intensity = 'normal' }) {
  if (!triggerKey) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={triggerKey}
        className={`hologram-pulse hologram-pulse--${intensity} pointer-events-none fixed inset-0 z-[8000]`}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: intensity === 'strong' ? 1.4 : 1.1, ease: 'easeInOut' }}
        aria-hidden
      >
        <motion.div
          className="boot-aura absolute left-1/2 top-1/2 h-[min(90vw,90vh)] w-[min(90vw,90vh)] -translate-x-1/2 -translate-y-1/2"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.2, 1.45], opacity: [0, 0.85, 0] }}
          transition={{ duration: intensity === 'strong' ? 1.4 : 1.1, ease: 'easeOut' }}
        />
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            className="boot-ring absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ width: 200 + i * 120, height: 200 + i * 120 }}
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: [0, 0.55, 0], scale: [0.75, 1.2, 1.5] }}
            transition={{
              duration: 1.2,
              delay: i * 0.15,
              ease: 'easeOut',
            }}
          />
        ))}
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(var(--accent-rgb,0,212,255),0.12)_0%,transparent_65%)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{ duration: 1 }}
        />
      </motion.div>
    </AnimatePresence>
  );
}
