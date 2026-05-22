import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Layers,
  ListTodo,
  Search,
  Settings,
  LayoutGrid,
  Cpu,
  Globe,
  Monitor,
} from 'lucide-react';
import { formatBytes } from '@/utils/format.js';
import { publicAsset } from '@/utils/publicAsset.js';
import { getJarvis, isElectron } from '@/jarvis-bridge.js';
import { useJarvisSession } from '@/context/JarvisSessionContext.jsx';
import { CreatorAttribution } from '@/components/CreatorAttribution.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'presets', label: 'Presets', icon: Layers },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'apps', label: 'Apps', icon: LayoutGrid },
  { id: 'processes', label: 'Processes', icon: Cpu },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ active, onSelect, stats, data, pushToast }) {
  const [clock, setClock] = useState(() => new Date());
  const [runtime, setRuntime] = useState({ webVersionSupported: false, isDev: false });
  const { voiceListeningMode } = useJarvisSession();
  const sidebarCompact = !!data?.settings?.sidebarCompact;
  const inElectron = isElectron();

  useEffect(() => {
    getJarvis()
      .getRuntimeInfo?.()
      .then((r) =>
        setRuntime({
          webVersionSupported: !!(r?.webVersionSupported ?? r?.browserPreviewSupported),
          isDev: !!r?.isDev,
        }),
      )
      .catch(() => setRuntime({ webVersionSupported: false, isDev: false }));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const ramPct = stats.ramTotal ? (stats.ramUsed / stats.ramTotal) * 100 : 0;
  const timeStr = clock.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const handleSwitchToDesktop = async () => {
    const r = await getJarvis().switchToDesktopApp?.().catch(() => ({ ok: false }));
    if (r?.ok) pushToast?.('Focused the desktop app.', 'success');
    else pushToast?.(String(r?.error || 'Could not reach the desktop app.'), 'error');
  };

  const handleOpenWebVersion = async () => {
    const info = await getJarvis().getRuntimeInfo?.().catch(() => null);
    const webOk = !!(info?.webVersionSupported ?? info?.browserPreviewSupported);
    if (!webOk) {
      pushToast?.(
        'Web version is unavailable. Keep JARVIS running, free ports 47843–47846 if needed, then restart and try again.',
        'info',
      );
      return;
    }
    const r = await getJarvis().openInBrowser?.().catch(() => ({ ok: false }));
    if (r?.ok) {
      pushToast?.(
        info?.isDev ? 'Opening the dev web UI in your browser…' : 'Opening the web version in your browser…',
        'success',
      );
    } else pushToast?.(String(r?.error || 'Could not open the web version.'), 'error');
  };

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-[rgba(255,255,255,0.07)] bg-[#080808] pb-4 pt-5 transition-[width,padding] duration-200 ${
        sidebarCompact ? 'w-[68px] px-2' : 'w-[220px] px-4'
      }`}
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <motion.div className={`mb-8 flex items-center px-1 ${sidebarCompact ? 'justify-center' : 'gap-2.5'}`}>
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl shadow-[0_0_20px_rgba(0,212,255,0.15)] ring-1 ring-[rgba(255,255,255,0.08)]">
          <img
            src={publicAsset('branding/jarvis-app-square.jpg')}
            alt=""
            className="h-full w-full object-cover object-center"
          />
        </div>
        <motion.div className={`flex min-w-0 items-center gap-2 ${sidebarCompact ? 'hidden' : 'flex-1'}`}>
          <span className="truncate text-lg font-bold tracking-tight text-[var(--accent)]">JARVIS</span>
          <motion.span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${voiceListeningMode ? 'bg-white' : 'bg-[var(--accent)]'}`}
            animate={
              voiceListeningMode
                ? { opacity: [0.55, 1, 0.55], scale: [1, 1.35, 1] }
                : { opacity: [0.45, 1, 0.45], scale: [1, 1.15, 1] }
            }
            transition={
              voiceListeningMode
                ? { duration: 0.85, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
            }
          />
        </motion.div>
      </motion.div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto jarvis-scrollbar">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <motion.button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              title={sidebarCompact ? item.label : undefined}
              className={`jarvis-interactive group relative flex items-center rounded-btn text-left text-sm font-medium transition-colors ${
                sidebarCompact ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                isActive
                  ? 'text-[var(--accent)]'
                  : 'text-[rgba(240,240,240,0.72)] hover:text-[#F0F0F0]'
              }`}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_14px_rgba(0,212,255,0.55)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <Icon
                className="relative z-[1] h-[18px] w-[18px]"
                strokeWidth={isActive ? 2.25 : 1.75}
              />
              {!sidebarCompact ? <span className="relative z-[1]">{item.label}</span> : null}
            </motion.button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-[rgba(255,255,255,0.07)] pt-4">
        {!inElectron && (
          <motion.button
            type="button"
            onClick={() => void handleSwitchToDesktop()}
            className="flex w-full items-center justify-center gap-2 rounded-btn border border-[var(--accent)]/40 bg-[rgba(0,212,255,0.08)] px-3 py-2.5 text-xs font-semibold text-[var(--accent)] shadow-[0_0_20px_rgba(0,212,255,0.12)] transition-colors hover:bg-[rgba(0,212,255,0.14)]"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Monitor className="h-4 w-4 shrink-0" />
            Switch to desktop app
          </motion.button>
        )}
        <button
          type="button"
          className="flex w-full cursor-default items-center gap-2 rounded-btn border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-3 py-2 text-left text-[10px] text-[rgba(240,240,240,0.4)]"
          title={
            inElectron
              ? 'Native desktop shell (tray, hotkeys, file dialogs).'
              : 'Web version — same JARVIS UI in your browser, connected to the desktop app on this PC.'
          }
        >
          {inElectron ? (
            <Monitor className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          ) : (
            <Globe className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          )}
          <span className={`font-semibold uppercase tracking-wider ${inElectron ? 'text-[var(--accent)]' : 'text-amber-400'}`}>
            {inElectron ? 'Desktop app' : 'Web version'}
          </span>
        </button>

        <div className="rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 backdrop-blur-glass">
          <p className="font-mono text-xs text-[rgba(240,240,240,0.45)]">Local time</p>
          <p className="font-mono text-sm font-medium tracking-wide text-[#F0F0F0]">{timeStr}</p>
        </div>
        <div className="rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 backdrop-blur-glass">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[rgba(240,240,240,0.4)]">
            <span>CPU</span>
            <span className="text-[var(--accent)]">{stats.cpu.toFixed(0)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-pill bg-[rgba(255,255,255,0.06)]">
            <motion.div
              className="h-full rounded-pill bg-[var(--accent)]"
              style={{ boxShadow: '0 0 10px rgba(0, 212, 255, 0.35)' }}
              animate={{ width: `${Math.min(100, stats.cpu)}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[rgba(240,240,240,0.4)]">
            <span>RAM</span>
            <span className="text-[rgba(240,240,240,0.75)]">
              {formatBytes(stats.ramUsed)} / {formatBytes(stats.ramTotal)}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-pill bg-[rgba(255,255,255,0.06)]">
            <motion.div
              className="h-full rounded-pill bg-[var(--accent)]"
              style={{ boxShadow: '0 0 10px rgba(0, 212, 255, 0.35)' }}
              animate={{ width: `${Math.min(100, ramPct)}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
            />
          </div>
        </div>
        {!sidebarCompact ? <CreatorAttribution inline className="pt-1 opacity-60" /> : null}
      </div>
    </aside>
  );
}
