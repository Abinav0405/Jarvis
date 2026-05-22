import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJarvis } from '@/jarvis-bridge.js';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Grid3x3,
  List,
  MoreHorizontal,
  Pin,
  PinOff,
  Rocket,
  FolderOpen,
} from 'lucide-react';
import { AppIconTile } from '@/components/AppIconTile.jsx';
import { SearchField } from '@/components/SearchField.jsx';

function SortablePin({ app, onLaunch, onUnpinContext }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };
  return (
    <motion.button
      ref={setNodeRef}
      type="button"
      style={style}
      {...attributes}
      {...listeners}
      title={app.name}
      onClick={() => onLaunch(app)}
      onContextMenu={(e) => {
        e.preventDefault();
        onUnpinContext(e, app);
      }}
      className="jarvis-interactive relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)]"
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
    >
      <AppIconTile name={app.name} iconPng={app.iconPng} className="h-8 w-8" rounded="rounded-lg" textClass="text-[10px]" />
    </motion.button>
  );
}

function sortApps(list, mode) {
  const arr = [...list];
  if (mode === 'recent') {
    return arr.sort((a, b) => (b.lastLaunched || 0) - (a.lastLaunched || 0));
  }
  if (mode === 'most') {
    return arr.sort((a, b) => (b.launchCount || 0) - (a.launchCount || 0));
  }
  return arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function Apps({ data, pushToast, isActive }) {
  const presets = Array.isArray(data.presets) ? data.presets : [];
  const [store, setStore] = useState({ version: 1, apps: [], pinnedIds: [], lastScan: 0 });
  const [scanning, setScanning] = useState(false);
  const [slowBanner, setSlowBanner] = useState(false);
  const [view, setView] = useState('grid');
  const [sort, setSort] = useState('alpha');
  const [query, setQuery] = useState('');
  const [ctx, setCtx] = useState(null);
  const [ctxPin, setCtxPin] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(72);
  const searchRef = useRef(null);
  const scrollRef = useRef(null);
  const menuRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const loadStore = useCallback(async () => {
    const s = await getJarvis().getAppsStore();
    setStore(s);
    return s;
  }, []);

  const rescan = useCallback(async (full = true) => {
    setScanning(true);
    setSlowBanner(false);
    try {
      const next = await getJarvis().scanApps({ full });
      setStore(next);
      const n = (next.apps || []).length;
      pushToast(n ? `Indexed ${n} apps.` : 'Still no entries — check Start Menu shortcuts exist.', n ? 'success' : 'info');
    } catch (e) {
      pushToast(String(e?.message || e || 'Rescan failed'), 'error');
    } finally {
      setScanning(false);
    }
  }, [pushToast]);

  useEffect(() => {
    const off = getJarvis().onAppsProgress((payload) => {
      setStore((prev) => ({
        ...prev,
        apps: payload.apps || prev.apps,
        pinnedIds: payload.pinnedIds ?? prev.pinnedIds,
        lastScan: payload.lastScan ?? prev.lastScan,
      }));
    });
    return off;
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;
    searchRef.current?.focus();
    let alive = true;
    let bannerTimer;

    (async () => {
      const cached = await loadStore();
      if (!alive) return;

      const apps = cached.apps || [];
      const age = cached.lastScan ? Date.now() - cached.lastScan : Infinity;
      const nameKeys = new Set(apps.map((a) => (a.name || '').toLowerCase().trim()));
      const dupRatio = apps.length > 0 && nameKeys.size / apps.length < 0.72;
      const needsScan = apps.length === 0 || age > 6 * 60 * 60 * 1000 || dupRatio;

      if (!needsScan) return;

      setScanning(true);
      const t0 = Date.now();
      bannerTimer = window.setInterval(() => {
        if (Date.now() - t0 > 2500) setSlowBanner(true);
      }, 400);

      try {
        const next = await getJarvis().scanApps({ full: dupRatio || apps.length === 0 });
        if (alive) setStore(next);
      } catch (e) {
        pushToast(String(e?.message || e || 'Scan failed'), 'error');
      } finally {
        window.clearInterval(bannerTimer);
        if (alive) {
          setScanning(false);
          setSlowBanner(false);
        }
      }
    })();

    return () => {
      alive = false;
      window.clearInterval(bannerTimer);
    };
  }, [isActive, loadStore, pushToast]);

  useEffect(() => {
    if (!ctx) return undefined;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setCtx(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctx]);

  useEffect(() => {
    if (!isActive) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (query) setQuery('');
        setCtx(null);
        setCtxPin(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, query]);

  const sorted = useMemo(() => sortApps(store.apps || [], sort), [store.apps, sort]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((a) => (a.name || '').toLowerCase().includes(q));
  }, [sorted, query]);

  const pinnedApps = useMemo(() => {
    const ids = store.pinnedIds || [];
    const map = new Map((store.apps || []).map((a) => [a.id, a]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  }, [store.apps, store.pinnedIds]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) {
      setVisibleCount((c) => Math.min(c + 48, filtered.length + 48));
    }
  }, [filtered.length]);

  useEffect(() => {
    setVisibleCount(72);
  }, [query, sort, store.apps?.length]);

  const slice = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const launch = async (app) => {
    setFlashId(app.id);
    window.setTimeout(() => setFlashId(null), 320);
    try {
      await getJarvis().launchAppPath(app.launchPath);
    } catch (e) {
      pushToast(String(e?.message || e || 'Launch failed'), 'error');
    }
    await loadStore();
  };

  const firstHit = filtered[0];

  const onSearchEnter = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    if (firstHit) launch(firstHit);
  };

  const toggleDockPin = async (app) => {
    const r = await getJarvis().toggleAppPin(app.id);
    if (r?.ok === false && r?.error === 'full') {
      pushToast('Pinned apps are full, Boss. Remove one first.', 'error');
      return;
    }
    if (r?.store) setStore(r.store);
    else await loadStore();
  };

  const onDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = [...(store.pinnedIds || [])];
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    const s = await getJarvis().setAppPins(next);
    setStore(s);
  };

  const pinDashboard = async (app) => {
    const r = await getJarvis().pinAppToDashboard({
      id: app.id,
      name: app.name,
      path: app.launchPath,
      iconPng: app.iconPng,
    });
    if (r?.ok === false && r?.error === 'full') {
      pushToast('Dashboard pins are full, Boss. Remove one first.', 'error');
      return;
    }
    pushToast(`Pinned ${app.name} to Dashboard.`, 'success');
  };

  const showExplorer = (app) => {
    getJarvis().showItemInFolder(app.launchPath);
  };

  const addToPreset = async (presetId, app) => {
    const r = await getJarvis().addAppToPreset(presetId, app.launchPath);
    if (!r?.ok) {
      pushToast('Could not add to preset.', 'error');
      return;
    }
    pushToast(`Added to preset.`, 'success');
    setCtx(null);
  };

  const qLower = query.trim().toLowerCase();
  const dim = (app) => qLower && !(app.name || '').toLowerCase().includes(qLower);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {slowBanner && scanning && (
        <div className="shrink-0 border-b border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.08)] px-4 py-2 text-center text-xs text-[var(--accent)]">
          Still scanning… showing what we have so far, Boss.
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[rgba(255,255,255,0.07)] px-6 py-4">
        <SearchField
          inputRef={searchRef}
          className="min-w-[200px] flex-1"
          placeholder="Search apps..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchEnter}
        />
        <select
          className="jarvis-input min-w-[160px] text-xs"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="alpha">Sort: Alphabetical</option>
          <option value="recent">Sort: Recently launched</option>
          <option value="most">Sort: Most launched</option>
        </select>
        <div className="flex rounded-btn border border-[rgba(255,255,255,0.1)] p-0.5">
          <motion.button
            type="button"
            title="Grid"
            onClick={() => setView('grid')}
            className={`rounded-btn p-2 ${view === 'grid' ? 'bg-[rgba(0,212,255,0.15)] text-[var(--accent)]' : 'text-[rgba(240,240,240,0.5)]'}`}
            whileTap={{ scale: 0.95 }}
          >
            <Grid3x3 className="h-4 w-4" />
          </motion.button>
          <motion.button
            type="button"
            title="List"
            onClick={() => setView('list')}
            className={`rounded-btn p-2 ${view === 'list' ? 'bg-[rgba(0,212,255,0.15)] text-[var(--accent)]' : 'text-[rgba(240,240,240,0.5)]'}`}
            whileTap={{ scale: 0.95 }}
          >
            <List className="h-4 w-4" />
          </motion.button>
        </div>
        {scanning && (
          <div className="flex items-center gap-2 text-xs text-[rgba(240,240,240,0.45)]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[rgba(255,255,255,0.12)] border-t-[var(--accent)]" />
            Scanning…
          </div>
        )}
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto jarvis-scrollbar px-6 py-4">
        {pinnedApps.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">Pinned</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={pinnedApps.map((a) => a.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {pinnedApps.map((app) => (
                    <SortablePin
                      key={app.id}
                      app={app}
                      onLaunch={launch}
                      onUnpinContext={(e, a) => {
                        setCtxPin({ x: e.clientX, y: e.clientY, app: a });
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {store.apps.length === 0 && scanning && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-2 border-[rgba(255,255,255,0.1)] border-t-[var(--accent)]" />
            <p className="text-sm text-[rgba(240,240,240,0.55)]">Scanning your apps, Boss…</p>
          </div>
        )}

        {!(store.apps.length === 0 && scanning) && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            {query.trim() ? (
              <p className="max-w-md text-sm leading-relaxed text-[rgba(240,240,240,0.45)]">
                No apps match{' '}
                <span className="font-mono text-[rgba(240,240,240,0.7)]">&quot;{query.trim()}&quot;</span>, Boss.
                <br />
                <span className="text-xs text-[rgba(240,240,240,0.35)]">Clear the search or try fewer characters.</span>
              </p>
            ) : (
              <>
                <p className="max-w-sm text-sm leading-relaxed text-[rgba(240,240,240,0.5)]">
                  No apps in the list yet — the last scan didn&apos;t find Start Menu shortcuts or uninstall entries
                  with a usable icon path, Boss.
                </p>
                <motion.button
                  type="button"
                  onClick={() => void rescan(true)}
                  disabled={scanning}
                  className="rounded-btn border border-[rgba(0,212,255,0.35)] bg-[rgba(0,212,255,0.1)] px-4 py-2 text-xs font-semibold text-[var(--accent)] disabled:opacity-40"
                  whileHover={{ scale: scanning ? 1 : 1.02 }}
                  whileTap={{ scale: scanning ? 1 : 0.98 }}
                >
                  {scanning ? 'Scanning…' : 'Rescan now'}
                </motion.button>
              </>
            )}
          </div>
        )}

        {view === 'grid' && filtered.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {slice.map((app) => (
              <motion.button
                key={app.id}
                type="button"
                onClick={() => launch(app)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtx({ x: e.clientX, y: e.clientY, app, sub: false });
                }}
                className={`group flex flex-col items-center rounded-[14px] border border-transparent px-2 pb-3 pt-4 transition-all duration-150 ease-out hover:border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.07)] ${
                  dim(app) ? 'scale-95 opacity-[0.15]' : 'opacity-100'
                } ${flashId === app.id ? 'shadow-[0_0_24px_rgba(0,212,255,0.55)]' : ''}`}
                whileHover={{ scale: dim(app) ? 0.95 : 1.02 }}
                whileTap={{ scale: 0.92 }}
              >
                <div className="transition-transform duration-150 ease-out group-hover:scale-[1.12]">
                  <AppIconTile name={app.name} iconPng={app.iconPng} className="h-12 w-12" rounded="rounded-[10px]" />
                </div>
                <p className="mt-2 line-clamp-2 min-h-[2.5rem] max-w-full px-1 text-center text-[11px] font-medium leading-snug text-[#F0F0F0] transition-colors group-hover:text-[var(--accent)]">
                  {app.name}
                </p>
              </motion.button>
            ))}
          </div>
        )}

        {view === 'list' && filtered.length > 0 && (
          <div className="space-y-1">
            {slice.map((app) => (
              <motion.div
                key={app.id}
                layout
                className={`flex items-center gap-3 rounded-btn border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-2 transition-opacity ${
                  dim(app) ? 'opacity-[0.15]' : ''
                }`}
              >
                <button
                  type="button"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtx({ x: e.clientX, y: e.clientY, app, sub: false });
                  }}
                  onClick={() => launch(app)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <AppIconTile name={app.name} iconPng={app.iconPng} className="h-9 w-9" rounded="rounded-lg" textClass="text-[11px]" />
                  <span className="truncate text-sm text-[#F0F0F0]">{app.name}</span>
                </button>
                <motion.button
                  type="button"
                  onClick={() => launch(app)}
                  className="shrink-0 rounded-btn border border-[rgba(0,212,255,0.35)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  Launch
                </motion.button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {ctx && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 min-w-[200px] rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-[rgba(16,16,18,0.95)] p-1.5 shadow-2xl backdrop-blur-glass"
            style={{
              left: Math.min(ctx.x, typeof window !== 'undefined' ? window.innerWidth - 220 : ctx.x),
              top: Math.min(ctx.y, typeof window !== 'undefined' ? window.innerHeight - 280 : ctx.y),
            }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm text-[#F0F0F0] hover:bg-[rgba(255,255,255,0.08)]"
              onClick={() => {
                launch(ctx.app);
                setCtx(null);
              }}
            >
              <Rocket className="h-4 w-4 text-[var(--accent)]" />
              Open
            </button>
            <div className="relative">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm text-[#F0F0F0] hover:bg-[rgba(255,255,255,0.08)]"
                onClick={() => setCtx((c) => (c ? { ...c, sub: !c.sub } : null))}
              >
                <MoreHorizontal className="h-4 w-4 text-[var(--accent)]" />
                Add to Preset
                <span className="ml-auto text-[10px] text-[rgba(240,240,240,0.35)]">▸</span>
              </button>
              {ctx.sub && presets.length > 0 && (
                <div className="absolute left-full top-0 z-[60] ml-1 min-w-[180px] rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-[rgba(16,16,18,0.98)] p-1 shadow-xl">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="block w-full truncate rounded-btn px-3 py-2 text-left text-xs text-[#F0F0F0] hover:bg-[rgba(255,255,255,0.08)]"
                      onClick={() => addToPreset(p.id, ctx.app)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm text-[#F0F0F0] hover:bg-[rgba(255,255,255,0.08)]"
              onClick={() => {
                pinDashboard(ctx.app);
                setCtx(null);
              }}
            >
              <Pin className="h-4 w-4 text-[var(--accent)]" />
              Pin to Dashboard
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm text-[#F0F0F0] hover:bg-[rgba(255,255,255,0.08)]"
              onClick={() => {
                toggleDockPin(ctx.app);
                setCtx(null);
              }}
            >
              {(store.pinnedIds || []).includes(ctx.app.id) ? (
                <>
                  <PinOff className="h-4 w-4 text-[var(--accent)]" />
                  Unpin from dock
                </>
              ) : (
                <>
                  <Pin className="h-4 w-4 text-[var(--accent)]" />
                  Pin to dock
                </>
              )}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm text-[#F0F0F0] hover:bg-[rgba(255,255,255,0.08)]"
              onClick={() => {
                showExplorer(ctx.app);
                setCtx(null);
              }}
            >
              <FolderOpen className="h-4 w-4 text-[var(--accent)]" />
              Show in Explorer
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ctxPin && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-[55] min-w-[160px] rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-[rgba(16,16,18,0.96)] p-1 shadow-xl backdrop-blur-glass"
            style={{ left: ctxPin.x, top: ctxPin.y }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm text-[#F0F0F0] hover:bg-[rgba(255,255,255,0.08)]"
              onClick={async () => {
                await toggleDockPin(ctxPin.app);
                setCtxPin(null);
              }}
            >
              <PinOff className="h-4 w-4 text-[var(--accent)]" />
              Unpin from dock
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
