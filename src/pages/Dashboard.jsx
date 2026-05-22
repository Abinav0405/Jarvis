import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Battery,
  Bell,
  BellOff,
  Cloud,
  Cpu,
  Flame,
  HardDrive,
  LayoutGrid,
  Monitor,
  Pin,
  Play,
  RotateCcw,
  Sparkles,
  XCircle,
  ListTodo,
} from 'lucide-react';
import { FocusTimer } from '@/components/FocusTimer.jsx';
import { VolumeSlider } from '@/components/VolumeSlider.jsx';
import { CREATOR_ATTRIBUTION } from '@/components/CreatorAttribution.jsx';
import { getJarvis } from '@/jarvis-bridge.js';
import { getTodaysIncompleteTodos } from '@/utils/briefing.js';
import { getGreeting } from '@/utils/greeting.js';
import { formatBytes, formatTime } from '@/utils/format.js';
import { SmoothNumber } from '@/components/SmoothNumber.jsx';
import { publicAsset } from '@/utils/publicAsset.js';
import { AlphaSearchBar } from '@/components/AlphaSearchBar.jsx';
import { VoiceHub } from '@/components/VoiceHub.jsx';
import { useDashboardLive } from '@/hooks/useDashboardLive.js';

const card =
  'rounded-card border border-[rgba(255,255,255,0.1)] bg-[rgba(10,10,12,0.52)] p-4 backdrop-blur-glass';

function ProgressRow({ label, pct, sub }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <motion.div className="space-y-1.5" layout>
      <motion.div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[rgba(240,240,240,0.42)]">
          {label}
        </span>
        {sub && <span className="font-mono text-[10px] text-[rgba(240,240,240,0.55)]">{sub}</span>}
      </motion.div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-[rgba(255,255,255,0.06)]">
        <motion.div
          className="h-full rounded-pill bg-[var(--accent)]"
          style={{ boxShadow: '0 0 12px rgba(0, 212, 255, 0.2)' }}
          animate={{ width: `${clamped}%` }}
          transition={{ type: 'spring', stiffness: 140, damping: 22 }}
        />
      </div>
    </motion.div>
  );
}

function DashCard({ title, accent, children, className = '', action }) {
  return (
    <motion.div
      className={`${card} ${className}`}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && (
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${
                accent ? 'text-[var(--accent)]' : 'text-[rgba(240,240,240,0.4)]'
              }`}
            >
              {title}
            </p>
          )}
          {action}
        </div>
      )}
      {children}
    </motion.div>
  );
}

function StatusLine({ extras, weather, dnd }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const bat = extras?.battery?.percent;

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[rgba(240,240,240,0.45)]">
      <span>{dateStr}</span>
      <span className="font-mono text-[rgba(240,240,240,0.55)]">{timeStr}</span>
      {weather?.ok && (
        <span className="inline-flex items-center gap-1">
          <Cloud className="h-3 w-3 text-[var(--accent)]" />
          {weather.tempC}°C {weather.description} · {weather.city}
        </span>
      )}
      {bat != null && (
        <span className="inline-flex items-center gap-1">
          <Battery className="h-3 w-3" />
          {bat}%{extras.battery?.charging ? ' charging' : ''}
        </span>
      )}
      {dnd && (
        <span className="inline-flex items-center gap-1 text-amber-200/80">
          <BellOff className="h-3 w-3" /> DND
        </span>
      )}
    </p>
  );
}

export function Dashboard({
  data,
  stats,
  onNavigate,
  onClosePreset,
  refresh,
  pushToast,
  onLaunchPreset,
}) {
  const greeting = getGreeting(data.settings?.userName);
  const presets = Array.isArray(data.presets) ? data.presets : [];
  const active = presets.find((p) => p.id === data.activePresetId);
  const log = [...(data.activityLog || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 6);
  const dashPins = Array.isArray(data.dashboardAppPins) ? data.dashboardAppPins : [];
  const pinnedLinks = Array.isArray(data.pinnedLinks) ? data.pinnedLinks : [];
  const weatherCity = data.settings?.weatherCity || 'London';
  const live = useDashboardLive({ weatherCity });
  const { extras, topProcs, suggestion, weather } = live;

  const [scratch, setScratch] = useState(data.settings?.dashboardScratch || '');
  const [dndLocal, setDndLocal] = useState(!!extras.dnd);
  const briefingTodos = useMemo(() => getTodaysIncompleteTodos(data.todos).slice(0, 5), [data.todos]);

  useEffect(() => {
    setDndLocal(!!extras.dnd);
  }, [extras.dnd]);

  useEffect(() => {
    setScratch(data.settings?.dashboardScratch || '');
  }, [data.settings?.dashboardScratch]);

  const ramPct = stats.ramTotal ? (stats.ramUsed / stats.ramTotal) * 100 : 0;
  const storagePct = stats.storageUsedPct ?? 0;
  const storageWarn = storagePct >= 90;
  const lastPreset = presets.find((p) => p.id === data.settings?.lastPresetId);

  const launchPreset = useCallback(
    async (preset) => {
      if (!preset) return;
      try {
        await getJarvis().restorePresetSystem();
        await getJarvis().launchPreset(preset);
        await onLaunchPreset?.(preset);
        pushToast?.(`${preset.name} launched`, 'success');
        refresh?.();
      } catch {
        pushToast?.('Launch failed, Boss.', 'error');
      }
    },
    [onLaunchPreset, pushToast, refresh]
  );

  const resumeLast = () => {
    if (lastPreset) void launchPreset(lastPreset);
    else pushToast?.('No previous preset to resume.', 'info');
  };

  const saveScratch = async () => {
    await getJarvis().writeData({
      ...data,
      settings: { ...data.settings, dashboardScratch: scratch },
    });
    refresh?.();
  };

  const toggleDnd = () => {
    const next = !dndLocal;
    setDndLocal(next);
    getJarvis()
      .toggleDnd?.()
      .then((r) => {
        if (r && typeof r.enabled === 'boolean') setDndLocal(!!r.enabled);
      })
      .catch(() => setDndLocal(!next));
  };

  const toggleSetting = async (key, val) => {
    await getJarvis().writeData({
      ...data,
      settings: { ...data.settings, [key]: val },
    });
    if (key === 'fullscreen') getJarvis().setFullScreen(!!val);
    if (key === 'startupWithWindows') getJarvis().setStartup(!!val);
    refresh?.();
  };

  const presetStrip = useMemo(() => presets.slice(0, 8), [presets]);

  const statPills = [
    { label: 'CPU', value: `${stats.cpu.toFixed(1)}%`, icon: Cpu, warn: stats.cpu >= 90 },
    { label: 'RAM', value: `${ramPct.toFixed(0)}%`, icon: Monitor, warn: ramPct >= 90 },
    { label: 'Disk', value: `${storagePct.toFixed(0)}%`, icon: HardDrive, warn: storageWarn },
  ];

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col overflow-hidden ${active ? 'dashboard-preset-active' : ''}`}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.12]"
        style={{ backgroundImage: `url(${publicAsset('branding/jarvis-1-bg.png')})` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#000B14]/95 via-[#07080c]/92 to-[#050506]/96"
        aria-hidden
      />

      <div className="relative z-[1] flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-[rgba(0,136,170,0.15)] px-4 py-3 lg:px-5">
          <motion.div
            className="flex flex-wrap items-start justify-between gap-3"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="min-w-0">
              <h1 className="text-xl font-light tracking-tight text-[var(--text-primary)] lg:text-2xl">{greeting}</h1>
              <StatusLine extras={extras} weather={weather} dnd={dndLocal} />
              <p className="mt-1 text-[9px] tracking-wide text-[var(--text-muted)] opacity-55">{CREATOR_ATTRIBUTION}</p>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[240px]">
              <AlphaSearchBar refresh={refresh} pushToast={pushToast} />
            </div>
          </motion.div>
          <motion.div
            className="mt-2 flex flex-wrap gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 }}
          >
            {statPills.map(({ label, value, icon: Icon, warn }) => (
              <div
                key={label}
                className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 ${
                  warn ? 'border-amber-500/40 bg-amber-500/10' : 'border-[rgba(0,136,170,0.22)] bg-[rgba(0,11,20,0.6)]'
                }`}
              >
                <Icon className={`h-3 w-3 ${warn ? 'text-amber-400' : 'text-[var(--accent)]'}`} />
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
                <span className="font-mono text-[11px] text-[var(--text-primary)]">{value}</span>
              </div>
            ))}
          </motion.div>
          {presetStrip.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5 jarvis-scrollbar lg:hidden">
              {presetStrip.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void launchPreset(p)}
                  className="shrink-0 rounded-pill border border-[rgba(0,136,170,0.25)] px-3 py-1 text-[11px] text-[var(--text-primary)]"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden px-3 py-3 lg:grid-cols-12 lg:px-4">
          {/* Left — presets */}
          <aside className="hidden min-h-0 flex-col gap-2 overflow-y-auto jarvis-scrollbar lg:col-span-2 lg:flex">
            <DashCard title="Presets" accent className="shrink-0">
          {presetStrip.length === 0 ? (
            <p className="text-sm text-[rgba(240,240,240,0.45)]">
              No presets yet —{' '}
              <button type="button" className="text-[var(--accent)] underline" onClick={() => onNavigate('presets')}>
                create one
              </button>
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 jarvis-scrollbar">
              {presetStrip.map((p) => (
                <motion.button
                  key={p.id}
                  type="button"
                  onClick={() => void launchPreset(p)}
                  className={`shrink-0 rounded-btn border px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                    data.activePresetId === p.id
                      ? 'border-[rgba(0,212,255,0.5)] bg-[rgba(0,212,255,0.12)] text-[var(--accent)]'
                      : 'border-[rgba(255,255,255,0.1)] bg-[rgba(12,12,14,0.45)] text-[#F0F0F0] hover:border-[rgba(0,212,255,0.35)]'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {p.icon && <span className="mr-1.5">{p.icon}</span>}
                  {p.name}
                </motion.button>
              ))}
            </div>
          )}
            </DashCard>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Tasks', icon: ListTodo, panel: 'tasks' },
                { label: 'Apps', icon: LayoutGrid, panel: 'apps' },
              ].map(({ label, icon: Icon, panel }) => (
                <button
                  key={panel}
                  type="button"
                  onClick={() => onNavigate(panel)}
                  className="inline-flex items-center gap-1 rounded-pill border border-[rgba(0,136,170,0.2)] px-2 py-1 text-[10px] text-[var(--text-primary)] hover:border-[var(--accent)]"
                >
                  <Icon className="h-3 w-3 text-[var(--accent)]" />
                  {label}
                </button>
              ))}
            </div>
          </aside>

          {/* Center — voice HUD (~58% width, full remaining height) */}
          <motion.main
            className="flex min-h-[min(52vh,480px)] flex-col lg:col-span-7 lg:min-h-0"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.04 }}
          >
            <VoiceHub
              hasApiKey={!!String(data.settings?.geminiApiKey || '').trim()}
              onNavigate={onNavigate}
            />
          </motion.main>

          {/* Right rail — widgets */}
          <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto jarvis-scrollbar lg:col-span-3">
          <DashCard
            title="Active workspace"
            accent
            className={active ? 'border-[rgba(0,212,255,0.45)] shadow-[0_0_28px_rgba(0,212,255,0.15)]' : ''}
            action={
              active ? (
                <button type="button" onClick={onClosePreset} className="inline-flex items-center gap-1 text-[10px] text-rose-300/90">
                  <XCircle className="h-3 w-3" /> Close all
                </button>
              ) : null
            }
          >
            <p className="text-lg font-semibold text-[#F0F0F0]">{active ? active.name : 'None running'}</p>
            {!active && <p className="mt-1 text-xs text-[rgba(240,240,240,0.42)]">Launch a preset to spin up your workspace.</p>}
            <motion.div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resumeLast}
                className="inline-flex items-center gap-1 rounded-pill border border-[rgba(255,255,255,0.1)] px-3 py-1.5 text-[11px] font-semibold text-[#F0F0F0]"
              >
                <RotateCcw className="h-3 w-3 text-[var(--accent)]" /> Resume last
              </button>
              <button type="button" onClick={() => onNavigate('presets')} className="inline-flex items-center gap-1 rounded-pill border border-[rgba(255,255,255,0.1)] px-3 py-1.5 text-[11px] text-[rgba(240,240,240,0.7)]">
                <Play className="h-3 w-3" /> All presets
              </button>
            </motion.div>
            {suggestion && (
              <div className="mt-4 rounded-btn border border-[rgba(0,212,255,0.25)] bg-[rgba(0,212,255,0.06)] p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                  <Sparkles className="h-3 w-3" /> Smart pick
                </p>
                <p className="mt-1 text-xs text-[rgba(240,240,240,0.75)]">{suggestion.message}</p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-[var(--accent)]"
                  onClick={() => {
                    const p = presets.find((x) => (x.name || '').toLowerCase() === (suggestion.presetName || '').toLowerCase());
                    if (p) void launchPreset(p);
                  }}
                >
                  Launch {suggestion.presetName} →
                </button>
              </div>
            )}
          </DashCard>

          {/* Today's tasks (briefing) */}
          <DashCard
            title="Open tasks"
            accent
            action={
              <button type="button" onClick={() => onNavigate('tasks')} className="text-[10px] text-[var(--accent)]">
                All tasks
              </button>
            }
          >
            {briefingTodos.length === 0 ? (
              <p className="text-xs text-[rgba(240,240,240,0.42)]">
                Nothing pending —{' '}
                <button type="button" className="text-[var(--accent)]" onClick={() => onNavigate('tasks')}>
                  add a task
                </button>
              </p>
            ) : (
              <ul className="space-y-2">
                {briefingTodos.map((todo) => (
                  <li
                    key={todo.id}
                    className="flex items-center gap-2 rounded-btn border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs text-[#F0F0F0]"
                  >
                    <ListTodo className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    <span className="min-w-0 flex-1 truncate">{todo.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>

          <DashCard title="Focus">
            <FocusTimer data={data} refresh={refresh} pushToast={pushToast} />
          </DashCard>

          {/* Pinned apps */}
          <DashCard
            title="Pinned apps"
            action={
              <button type="button" onClick={() => onNavigate('apps')} className="text-[10px] text-[var(--accent)]">
                Manage
              </button>
            }
          >
            {dashPins.length === 0 ? (
              <p className="text-xs text-[rgba(240,240,240,0.42)]">
                Pin apps from the <button type="button" className="text-[var(--accent)]" onClick={() => onNavigate('apps')}>Apps</button> page.
              </p>
            ) : (
              <motion.div className="flex flex-wrap gap-2">
                {dashPins.map((pin) => (
                  <motion.button
                    key={pin.id}
                    type="button"
                    onClick={() => getJarvis().launchAppPath(pin.path).then(() => refresh?.())}
                    className="flex items-center gap-2 rounded-btn border border-[rgba(255,255,255,0.08)] bg-[rgba(12,12,14,0.4)] py-1.5 pl-2 pr-3"
                    whileHover={{ scale: 1.02 }}
                  >
                    {pin.iconPng ? (
                      <img src={pin.iconPng} alt="" className="h-7 w-7 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)] text-[9px]">App</div>
                    )}
                    <span className="max-w-[100px] truncate text-xs">{pin.name}</span>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </DashCard>

          {/* Top processes */}
          <DashCard
            title="Top processes"
            action={
              <button type="button" onClick={() => onNavigate('processes')} className="text-[10px] text-[var(--accent)]">
                View all
              </button>
            }
          >
            {topProcs.length === 0 ? (
              <p className="text-xs text-[rgba(240,240,240,0.42)]">Loading…</p>
            ) : (
              <ul className="space-y-2">
                {topProcs.map((p) => (
                  <li key={p.pid} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-[#F0F0F0]">
                      {Number(p.cpu) > 15 && <Flame className="h-3 w-3 shrink-0 text-orange-400" />}
                      {p.name}
                    </span>
                    <span className="shrink-0 font-mono text-[rgba(240,240,240,0.5)]">
                      {Number(p.cpu).toFixed(1)}% · {p.ram} MB
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>

          <DashCard title="JARVIS">
            <p className="font-mono text-[10px] text-[rgba(240,240,240,0.35)]">v{extras.version || '1.0.0'}</p>
          </DashCard>

          {/* Pinned links */}
          <DashCard title="Pinned links">
            {pinnedLinks.length === 0 ? (
              <p className="text-xs text-[rgba(240,240,240,0.42)]">
                Pin sites in <button type="button" className="text-[var(--accent)]" onClick={() => onNavigate('search')}>Search</button>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pinnedLinks.slice(0, 8).map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => {
                      const u = /^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`;
                      getJarvis().openExternal(u);
                    }}
                    className="inline-flex items-center gap-1 rounded-pill border border-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs text-[#F0F0F0] hover:border-[rgba(0,212,255,0.35)]"
                  >
                    <Pin className="h-3 w-3 text-[var(--accent)]" />
                    {link.name}
                  </button>
                ))}
              </div>
            )}
          </DashCard>

          {/* Quick toggles */}
          <DashCard title="Quick toggles">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Toggle label="Fullscreen" on={!!data.settings?.fullscreen} onChange={(v) => void toggleSetting('fullscreen', v)} />
              <Toggle label="Startup" on={!!data.settings?.startupWithWindows} onChange={(v) => void toggleSetting('startupWithWindows', v)} />
              <button
                type="button"
                onClick={toggleDnd}
                className={`rounded-btn border px-2 py-2 text-[10px] font-semibold ${
                  dndLocal ? 'border-amber-500/40 bg-amber-500/15 text-amber-200' : 'border-[rgba(255,255,255,0.1)] text-[rgba(240,240,240,0.7)]'
                }`}
              >
                {dndLocal ? <BellOff className="mx-auto mb-0.5 h-3.5 w-3.5" /> : <Bell className="mx-auto mb-0.5 h-3.5 w-3.5" />}
                DND {dndLocal ? 'On' : 'Off'}
              </button>
            </div>
            <div className="mt-3">
              <p className="mb-1.5 text-[9px] uppercase tracking-wider text-[rgba(240,240,240,0.35)]">Volume</p>
              <VolumeSlider pushToast={pushToast} />
            </div>
          </DashCard>

          {/* Scratch pad */}
          <DashCard title="Scratch pad">
            <textarea
              value={scratch}
              onChange={(e) => setScratch(e.target.value)}
              onBlur={() => void saveScratch()}
              placeholder="Quick notes for this session…"
              rows={3}
              className="w-full resize-none rounded-btn border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[#F0F0F0] outline-none placeholder:text-[rgba(255,255,255,0.25)]"
            />
          </DashCard>

          {/* Activity */}
          <DashCard title="Recent activity">
            <ul className="max-h-36 space-y-2 overflow-y-auto jarvis-scrollbar">
              {log.length === 0 && <li className="text-xs text-[rgba(240,240,240,0.4)]">No recent actions.</li>}
              {log.map((entry) => (
                <li key={entry.id} className="flex justify-between gap-2 border-b border-[rgba(255,255,255,0.05)] pb-2 text-xs last:border-0">
                  <span className="text-[rgba(240,240,240,0.85)]">{entry.message}</span>
                  <span className="shrink-0 font-mono text-[10px] text-[rgba(240,240,240,0.35)]">{formatTime(entry.timestamp)}</span>
                </li>
              ))}
            </ul>
          </DashCard>

          </aside>
        </div>

        <footer className="shrink-0 border-t border-[rgba(0,136,170,0.12)] px-4 py-2.5 lg:px-5">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-[rgba(0,229,255,0.45)]">
            System health
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <ProgressRow label="CPU" pct={stats.cpu} sub={<SmoothNumber value={stats.cpu} decimals={1} />} />
            <ProgressRow
              label="Memory"
              pct={ramPct}
              sub={
                <span>
                  {formatBytes(stats.ramUsed)} / {formatBytes(stats.ramTotal)}
                </span>
              }
            />
            <ProgressRow
              label="Storage"
              pct={storagePct}
              sub={
                <span>
                  {formatBytes(stats.storageUsed)} / {formatBytes(stats.storageTotal)}
                </span>
              }
            />
          </div>
        </footer>
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`rounded-btn border px-2 py-2 text-[10px] font-semibold transition-colors ${
        on ? 'border-[rgba(0,212,255,0.4)] bg-[rgba(0,212,255,0.12)] text-[var(--accent)]' : 'border-[rgba(255,255,255,0.1)] text-[rgba(240,240,240,0.65)]'
      }`}
    >
      {label}
      <span className="mt-0.5 block text-[9px] opacity-60">{on ? 'On' : 'Off'}</span>
    </button>
  );
}
