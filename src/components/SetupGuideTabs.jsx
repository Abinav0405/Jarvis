import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Tabbed layout for long setup instructions (voice / calendar) instead of one long scroll.
 * @param {{ title: string; subtitle?: string; sections: { id: string; label: string; content: import('react').ReactNode }[] }} props
 */
export function SetupGuideTabs({ title, subtitle, sections }) {
  const [active, setActive] = useState(sections[0]?.id || '');
  const current = sections.find((s) => s.id === active) || sections[0];

  return (
    <motion.div className="flex w-full max-w-2xl flex-col gap-3">
      <motion.div className="shrink-0 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--accent)]">{title}</p>
        {subtitle ? (
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
      </motion.div>

      <motion.div
        className="flex flex-wrap justify-center gap-1.5 rounded-card border border-[var(--border-subtle)] bg-[var(--glass-bg)] p-1.5"
        role="tablist"
      >
        {sections.map((s) => (
          <motion.button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active === s.id}
            onClick={() => setActive(s.id)}
            className={`rounded-btn px-3 py-1.5 text-[11px] font-medium transition-colors ${
              active === s.id
                ? 'bg-[var(--accent)] text-black shadow-glow'
                : 'text-[var(--text-muted)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]'
            }`}
            whileTap={{ scale: 0.97 }}
          >
            {s.label}
          </motion.button>
        ))}
      </motion.div>

      <motion.div
        className="min-h-[200px] max-h-[min(42vh,380px)] overflow-y-auto rounded-card border border-[var(--border-subtle)] bg-[var(--glass-bg)] p-4 jarvis-scrollbar text-left"
        role="tabpanel"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={current?.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {current?.content}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
