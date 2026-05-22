import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { getJarvis } from '@/jarvis-bridge.js';

function buildSuggestions(live, searchResults) {
  const items = [];
  if (live?.ok && live.city) {
    items.push({
      id: 'live',
      city: live.city,
      label: live.label || live.city,
      hint: live.source === 'windows' ? 'From this PC (GPS)' : 'From this PC (network)',
      live: true,
    });
  } else if (live?.loading) {
    items.push({ id: 'live-loading', loading: true });
  } else if (live?.error) {
    items.push({ id: 'live-error', error: live.error });
  }

  for (const r of searchResults) {
    if (!r?.city) continue;
    items.push({
      id: `city:${r.city}:${r.latitude}:${r.longitude}`,
      city: r.city,
      label: r.label || r.city,
      hint: 'Open-Meteo',
    });
  }
  return items;
}

export function WeatherLocationPicker({ value, onChange, pushToast }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [live, setLive] = useState({ loading: true });
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    setLive({ loading: true });
    getJarvis()
      .detectWeatherLocation?.()
      .then((r) => {
        if (cancelled) return;
        if (r?.ok) setLive(r);
        else setLive({ error: r?.error || 'unavailable' });
      })
      .catch(() => {
        if (!cancelled) setLive({ error: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const r = await getJarvis().searchWeatherCities?.(trimmed).catch(() => ({ results: [] }));
    setSearchResults(Array.isArray(r?.results) ? r.results : []);
    setSearching(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, 180);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  const suggestions = useMemo(() => buildSuggestions(live, searchResults), [live, searchResults]);

  const selectable = useMemo(
    () => suggestions.filter((s) => s.city && !s.loading && !s.error),
    [suggestions]
  );

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = useCallback(
    (item) => {
      if (!item?.city) return;
      setQuery(item.city);
      setOpen(false);
      onChange?.(item.city, item);
      pushToast?.(`Weather location set to ${item.label || item.city}`, 'success');
    },
    [onChange, pushToast]
  );

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || selectable.length === 0) {
      if (e.key === 'Enter' && query.trim()) {
        e.preventDefault();
        pick({ city: query.trim(), label: query.trim() });
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(selectable.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(selectable[activeIdx]);
    }
  };

  const showPanel = open && (selectable.length > 0 || live.loading || live.error || searching);

  return (
    <motion.div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--accent)]" />
        <input
          className="jarvis-input mt-2 w-full pl-9"
          placeholder="Search or pick your location below"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {(searching || live.loading) && (
          <Loader2 className="absolute right-3 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 animate-spin text-[rgba(240,240,240,0.35)]" />
        )}
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute z-50 mt-1 max-h-[220px] w-full overflow-y-auto rounded-card border border-[rgba(255,255,255,0.1)] bg-[#0d1118] py-1 shadow-lg jarvis-scrollbar"
            role="listbox"
          >
            {suggestions.map((item) => {
              if (item.loading) {
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-2.5 text-xs text-[rgba(240,240,240,0.45)]"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
                    Detecting your location…
                  </li>
                );
              }
              if (item.error) {
                return (
                  <li key={item.id} className="px-3 py-2 text-[11px] text-[rgba(240,240,240,0.4)]">
                    Could not detect device location. Type a city name to search.
                  </li>
                );
              }

              const selIdx = selectable.findIndex((s) => s.id === item.id);
              const active = selIdx >= 0 && selIdx === activeIdx;

              return (
                <li key={item.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors ${
                      active ? 'bg-[rgba(0,212,255,0.1)]' : 'hover:bg-[rgba(255,255,255,0.04)]'
                    }`}
                    onMouseEnter={() => {
                      if (selIdx >= 0) setActiveIdx(selIdx);
                    }}
                    onClick={() => pick(item)}
                  >
                    {item.live ? (
                      <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                    ) : (
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[rgba(240,240,240,0.35)]" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm text-[#F0F0F0]">
                        {item.live ? 'Use my location' : item.label}
                      </span>
                      <span className="block text-[11px] text-[rgba(240,240,240,0.4)]">
                        {item.live ? item.label : item.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {!searching && query.trim().length >= 2 && searchResults.length === 0 && !live.loading && (
              <li className="px-3 py-2 text-[11px] text-[rgba(240,240,240,0.4)]">
                No matches — press Enter to try “{query.trim()}” anyway.
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>

      <p className="mt-1 text-[11px] text-[rgba(240,240,240,0.35)]">
        Top suggestion uses this PC’s location (GPS if enabled, otherwise network). Search shows verified cities.
      </p>
    </motion.div>
  );
}
