import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppWindow, Globe, Layers, Link2, Monitor, Search } from 'lucide-react';
import { getJarvis } from '@/jarvis-bridge.js';

const TYPE_ICON = {
  app: AppWindow,
  preset: Layers,
  link: Link2,
  start: Monitor,
  web: Globe,
};

export function AlphaSearchBar({ refresh, pushToast }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const runQuery = useCallback(async (q) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setOpen(false);
      return;
    }
    const list = await getJarvis().unifiedSearch?.(trimmed).catch(() => []);
    const arr = Array.isArray(list) ? list : [];
    setResults(arr);
    setActiveIdx(0);
    setOpen(arr.length > 0);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runQuery(query);
    }, 140);
    return () => clearTimeout(debounceRef.current);
  }, [query, runQuery]);

  const activate = useCallback(
    async (item) => {
      if (!item) return;
      const r = await getJarvis().openSearchResult?.(item).catch(() => ({ ok: false }));
      if (r?.ok === false) {
        pushToast?.(String(r?.error || 'Could not open that result.'), 'error');
        return;
      }
      setQuery('');
      setResults([]);
      setOpen(false);
      refresh?.();
    },
    [refresh, pushToast]
  );

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) {
      if (e.key === 'Enter' && query.trim()) {
        e.preventDefault();
        void activate({
          type: 'web',
          url: `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`,
        });
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void activate(results[activeIdx]);
    }
  };

  const lit = focused || open || query.length > 0;

  return (
    <motion.div
      className="relative mx-auto w-full max-w-xl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className={`alpha-search-aura pointer-events-none absolute -inset-3 rounded-[999px] ${lit ? 'alpha-search-aura--on' : ''}`}
        animate={{ opacity: lit ? 1 : 0.55, scale: lit ? 1.02 : 1 }}
        transition={{ duration: 0.35 }}
        aria-hidden
      />

      <div className={`alpha-search-ring relative rounded-[999px] p-[2px] ${lit ? 'alpha-search-ring--on' : ''}`}>
        <motion.div
          className="alpha-search-inner flex h-14 items-center gap-3 rounded-[999px] px-2"
          animate={{
            boxShadow: lit
              ? '0 0 40px rgba(0, 212, 255, 0.18), 0 0 80px rgba(124, 58, 237, 0.12), inset 0 1px 0 rgba(255,255,255,0.06)'
              : '0 0 24px rgba(0, 212, 255, 0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
          transition={{ duration: 0.3 }}
        >
          <Search
            className={`ml-3 shrink-0 transition-colors ${lit ? 'text-[var(--accent)]' : 'text-[rgba(240,240,240,0.4)]'}`}
            size={20}
            strokeWidth={2}
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true);
              if (results.length) setOpen(true);
            }}
            onBlur={() => {
              setFocused(false);
              setTimeout(() => setOpen(false), 160);
            }}
            placeholder="Search apps, presets, or the web…"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 border-0 bg-transparent py-0 pr-4 text-base text-[#F0F0F0] outline-none placeholder:text-[rgba(255,255,255,0.32)]"
          />
        </motion.div>
      </div>

      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(8,8,10,0.97)] shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
            role="listbox"
          >
            {results.map((row, i) => {
              const Icon = TYPE_ICON[row.type] || Globe;
              const active = i === activeIdx;
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    active ? 'bg-[rgba(0,212,255,0.12)]' : 'hover:bg-[rgba(255,255,255,0.04)]'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void activate(row);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  {row.iconPng ? (
                    <img src={row.iconPng} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
                      <Icon className="h-4 w-4 text-[var(--accent)]" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#F0F0F0]">{row.label}</span>
                    <span className="block truncate text-[11px] text-[rgba(240,240,240,0.42)]">{row.sub}</span>
                  </span>
                </button>
              );
            })}
            <p className="border-t border-[rgba(255,255,255,0.06)] px-4 py-2 text-center text-[10px] text-[rgba(240,240,240,0.35)]">
              ↑↓ navigate · Enter open · Esc close
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
