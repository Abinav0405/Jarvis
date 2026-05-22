import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Github, Globe, Hash, Link2, Plus, Search as SearchIcon, Youtube } from 'lucide-react';
import { getJarvis } from '@/jarvis-bridge.js';
import { PinnedLinkFavicon } from '@/components/PinnedLinkFavicon.jsx';

const ENGINES = [
  { id: 'google', label: 'Google', icon: Globe, url: (q) => `https://google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'youtube', label: 'YouTube', icon: Youtube, url: (q) => `https://youtube.com/search?q=${encodeURIComponent(q)}` },
  { id: 'github', label: 'GitHub', icon: Github, url: (q) => `https://github.com/search?q=${encodeURIComponent(q)}` },
  { id: 'reddit', label: 'Reddit', icon: Hash, url: (q) => `https://reddit.com/search?q=${encodeURIComponent(q)}` },
  { id: 'custom', label: 'Custom URL', icon: Link2, url: null },
];

export function QuickSearch({ data, persist, isActive, burst }) {
  const [query, setQuery] = useState('');
  const [engine, setEngine] = useState('google');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinName, setPinName] = useState('');
  const [pinUrl, setPinUrl] = useState('');
  const [showPinForm, setShowPinForm] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  const pinned = Array.isArray(data.pinnedLinks) ? data.pinnedLinks : [];
  const customBase = (data.settings && data.settings.customSearchUrl) || '';

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    let url = '';
    if (engine === 'custom') {
      const base = customBase.trim();
      if (!base) return;
      if (base.includes('%s')) {
        url = base.replace('%s', encodeURIComponent(q));
      } else {
        url = `${base}${q}`;
      }
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    } else {
      const def = ENGINES.find((e) => e.id === engine);
      url = def.url(q);
    }
    await getJarvis().openExternal(url);
  }, [query, engine, customBase]);

  useEffect(() => {
    if (!isActive) return;
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [isActive]);

  useEffect(() => {
    if (!burst?.char) return;
    setQuery((prev) => `${burst.char}${prev}`);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [burst?.nonce, burst?.char]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runSearch();
    }
  };

  const addPin = async () => {
    const name = pinName.trim();
    const url = pinUrl.trim();
    if (!name || !url) return;
    await persist((d) => ({
      ...d,
      pinnedLinks: [...(d.pinnedLinks || []), { id: crypto.randomUUID(), name, url }],
    }));
    setPinName('');
    setPinUrl('');
    setShowPinForm(false);
  };

  const removePin = async (id) => {
    await persist((d) => ({
      ...d,
      pinnedLinks: (d.pinnedLinks || []).filter((p) => p.id !== id),
    }));
  };

  const openPin = (url) => {
    const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    getJarvis().openExternal(u);
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (e.target.closest?.('[data-engine-menu]')) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const EngineIcon = ENGINES.find((e) => e.id === engine)?.icon || Globe;

  return (
    <div className="flex h-full flex-col overflow-y-auto jarvis-scrollbar px-8 py-8">
      <div className="flex min-h-[45%] flex-col items-center justify-center">
        <div className="relative w-full max-w-[600px]">
          <div
            className={`flex h-14 items-center gap-2 rounded-pill border-2 bg-[rgba(255,255,255,0.04)] px-2 backdrop-blur-glass transition-shadow ${
              isFocused
                ? 'border-[rgba(0,212,255,0.65)] shadow-[0_0_22px_rgba(0,212,255,0.25)]'
                : 'border-[rgba(0,212,255,0.3)]'
            }`}
          >
            <div className="relative" data-engine-menu>
              <motion.button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((m) => !m);
                }}
                className="jarvis-interactive flex items-center gap-2 rounded-pill border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-xs font-semibold text-[#F0F0F0]"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <EngineIcon className="h-4 w-4 text-[var(--accent)]" />
                <span className="hidden sm:inline">{ENGINES.find((e) => e.id === engine)?.label}</span>
              </motion.button>
              {menuOpen && (
                <div
                  className="absolute left-0 top-12 z-30 w-48 overflow-hidden rounded-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(10,10,10,0.96)] py-1 shadow-glow backdrop-blur-glass"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {ENGINES.map((e) => {
                    const Ic = e.icon;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#F0F0F0] hover:bg-[rgba(255,255,255,0.06)]"
                        onClick={() => {
                          setEngine(e.id);
                          setMenuOpen(false);
                        }}
                      >
                        <Ic className="h-4 w-4 text-[var(--accent)]" />
                        {e.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Search the web..."
              className="h-full min-w-0 flex-1 bg-transparent px-2 font-sans text-sm text-[#F0F0F0] outline-none placeholder:text-[rgba(255,255,255,0.3)]"
            />
            <motion.button
              type="button"
              onClick={runSearch}
              className="jarvis-interactive mr-1 flex h-10 w-10 items-center justify-center rounded-pill bg-[var(--accent)] text-black"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <SearchIcon className="h-4 w-4" strokeWidth={2.5} />
            </motion.button>
          </div>
          {engine === 'custom' && !customBase && (
            <p className="mt-2 text-center text-xs text-rose-200/80">Set a custom base URL in Settings first, Boss.</p>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px]">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">Pinned</p>
        {pinned.length === 0 && !showPinForm && (
          <p className="mb-4 text-sm text-[rgba(240,240,240,0.45)]">Pin your favourite sites for quick access</p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {pinned.map((p) => (
              <motion.button
                key={p.id}
                type="button"
                onClick={() => openPin(p.url)}
                className="group relative rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-3 text-left backdrop-blur-glass transition-shadow hover:shadow-glow"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <button
                  type="button"
                  className="absolute right-2 top-2 hidden rounded-btn bg-[rgba(0,0,0,0.35)] px-1.5 py-0.5 text-xs text-white group-hover:block"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePin(p.id);
                  }}
                >
                  ×
                </button>
                <PinnedLinkFavicon url={p.url} name={p.name} />
                <p className="mt-2 line-clamp-1 text-sm font-semibold text-[#F0F0F0]">{p.name}</p>
                <p className="mt-0.5 line-clamp-2 break-all font-mono text-[10px] text-[rgba(240,240,240,0.4)]">{p.url}</p>
              </motion.button>
          ))}

          {!showPinForm ? (
            <motion.button
              type="button"
              onClick={() => setShowPinForm(true)}
              className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-[rgba(0,212,255,0.45)] bg-[rgba(255,255,255,0.02)] text-[var(--accent)]"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus className="h-6 w-6" />
              <span className="text-xs font-semibold">Pin a site</span>
            </motion.button>
          ) : (
            <div className="col-span-2 rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-4 backdrop-blur-glass">
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="jarvis-input" placeholder="Name" value={pinName} onChange={(e) => setPinName(e.target.value)} />
                <input className="jarvis-input" placeholder="https://..." value={pinUrl} onChange={(e) => setPinUrl(e.target.value)} />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <motion.button
                  type="button"
                  className="rounded-btn border border-[rgba(255,255,255,0.1)] px-3 py-1.5 text-xs font-semibold text-[rgba(240,240,240,0.75)]"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setShowPinForm(false);
                    setPinName('');
                    setPinUrl('');
                  }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="button"
                  className="rounded-btn bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-black"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={addPin}
                >
                  Add
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
