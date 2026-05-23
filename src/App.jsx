import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getJarvis, isElectron, isJarvisBackendLive } from '@/jarvis-bridge.js';
import { WindowChrome } from '@/components/WindowChrome.jsx';
import { Sidebar } from '@/components/Sidebar.jsx';
import { VoiceJarvis } from '@/components/VoiceJarvis.jsx';
import { Dashboard } from '@/pages/Dashboard.jsx';
import { Presets } from '@/pages/Presets.jsx';
import { QuickSearch } from '@/pages/QuickSearch.jsx';
import { Settings } from '@/pages/Settings.jsx';
import { Apps } from '@/pages/Apps.jsx';
import { Processes } from '@/pages/Processes.jsx';
import { useJarvisData } from '@/hooks/useJarvisData.js';
import { useSystemStats } from '@/hooks/useSystemStats.js';
import { ToastProvider, useToast } from '@/context/ToastContext.jsx';
import { JarvisSessionProvider, useJarvisSession } from '@/context/JarvisSessionContext.jsx';
import { BootScreen } from '@/components/BootScreen.jsx';
import { SetupWizard } from '@/components/SetupWizard.jsx';
import { HologramPulse } from '@/components/HologramPulse.jsx';
import { Tasks } from '@/pages/Tasks.jsx';
import { applyThemeToDocument } from '@/utils/themes.js';
import { applyAppearanceToDocument } from '@/utils/appearance.js';
import { applyColorModeToDocument } from '@/utils/colorMode.js';

/** App lifecycle phases: boot → setup (if first launch) → ready */
const PHASE_BOOT = 'boot';
const PHASE_SETUP = 'setup';
const PHASE_READY = 'ready';

function AppShell() {
  const { data, persist, refresh } = useJarvisData();
  const stats = useSystemStats(5000);
  const { pushToast } = useToast();
  const [active, setActive] = useState('dashboard');
  const [burst, setBurst] = useState({ nonce: 0, char: '' });
  const [burstListen, setBurstListen] = useState(false);
  const [phase, setPhase] = useState(PHASE_BOOT);
  const [shellReady, setShellReady] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [pulseIntensity, setPulseIntensity] = useState('normal');
  const [systemsOnlineShown, setSystemsOnlineShown] = useState(false);

  const triggerPulse = useCallback((intensity = 'normal') => {
    setPulseIntensity(intensity);
    setPulseKey((k) => k + 1);
  }, []);

  const handleBootComplete = useCallback(async () => {
    // Read disk after splash so we never route to setup/ready from stale default data.
    let snap = data;
    try {
      snap = await getJarvis().readData();
    } catch {
      /* keep in-memory data */
    }
    if (!snap?.settings?.setupComplete) setPhase(PHASE_SETUP);
    else setPhase(PHASE_READY);
  }, [data]);

  const handleSetupComplete = useCallback(() => {
    window.requestAnimationFrame(() => {
      setPhase(PHASE_READY);
      refresh?.();
    });
  }, [refresh]);

  // Stagger the shell entrance when phase becomes ready
  useEffect(() => {
    if (phase === PHASE_READY) {
      const timer = setTimeout(() => setShellReady(true), 50);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE_READY || !shellReady || systemsOnlineShown) return;
    setSystemsOnlineShown(true);
    triggerPulse('strong');
    pushToast('Systems online.', 'success');
  }, [phase, shellReady, systemsOnlineShown, triggerPulse, pushToast]);

  useEffect(() => {
    const offNav = getJarvis().onNavigate((panel) => setActive(panel));
    return offNav;
  }, []);

  useEffect(() => {
    return getJarvis().onWindowShown(() => {
      setBurstListen(true);
    });
  }, []);

  useEffect(() => {
    if (!burstListen) return undefined;
    let cleared = false;
    function end() {
      if (cleared) return;
      cleared = true;
      window.removeEventListener('keydown', onKey, true);
      setBurstListen(false);
    }
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setBurst({ nonce: Date.now(), char: e.key });
      setActive('search');
      end();
    }
    window.addEventListener('keydown', onKey, true);
    const timer = setTimeout(end, 900);
    return () => {
      clearTimeout(timer);
      end();
    };
  }, [burstListen]);

  useEffect(() => {
    const themeId = data.settings?.theme;
    const customAccent = data.settings?.accentColor;
    applyThemeToDocument(themeId || null, customAccent);
  }, [data.settings?.theme, data.settings?.accentColor]);

  useEffect(() => {
    applyColorModeToDocument(data.settings?.colorMode || 'dark');
  }, [data.settings?.colorMode]);

  useEffect(() => {
    applyAppearanceToDocument(data.settings || {});
  }, [
    data.settings?.uiDensity,
    data.settings?.panelOpacity,
    data.settings?.accentGlow,
    data.settings?.cornerStyle,
    data.settings?.reduceMotion,
    data.settings?.sidebarCompact,
    data.settings?.bootAnimationEnabled,
    data.settings?.hologramEffects,
  ]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => applyAppearanceToDocument(data.settings || {});
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [
    data.settings?.uiDensity,
    data.settings?.panelOpacity,
    data.settings?.accentGlow,
    data.settings?.cornerStyle,
    data.settings?.reduceMotion,
    data.settings?.sidebarCompact,
    data.settings?.bootAnimationEnabled,
    data.settings?.hologramEffects,
  ]);

  useEffect(() => {
    const scale = data.settings?.fontScale ?? 1;
    document.documentElement.style.setProperty('--font-scale', String(scale));
  }, [data.settings?.fontScale]);

  useEffect(() => {
    if (phase !== PHASE_BOOT || data.settings?.bootAnimationEnabled !== false) return undefined;
    let cancelled = false;
    (async () => {
      let snap = data;
      try {
        snap = await getJarvis().readData();
      } catch {
        /* keep in-memory */
      }
      if (cancelled) return;
      if (!snap?.settings?.setupComplete) setPhase(PHASE_SETUP);
      else setPhase(PHASE_READY);
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, data]);

  useEffect(() => {
    const op = data.settings?.windowOpacity ?? 1;
    getJarvis().setWindowOpacity(op);
  }, [data.settings?.windowOpacity]);

  useEffect(() => {
    getJarvis().setFullScreen(!!data.settings?.fullscreen);
  }, [data.settings?.fullscreen]);

  const onClosePreset = useCallback(async () => {
    const r = await getJarvis().restorePresetSystem().catch(() => ({ ok: false, killed: 0 }));
    await persist((d) => {
      const next = { ...d, activePresetId: null };
      if (next.settings?.logActivity !== false) {
        next.activityLog = [...(next.activityLog || [])];
        next.activityLog.unshift({
          id: crypto.randomUUID(),
          message: 'Closed active preset',
          timestamp: Date.now(),
        });
      }
      return next;
    });
    const n = Number(r?.killed) || 0;
    if (n > 0) pushToast(`Closed preset — terminated ${n} process${n === 1 ? '' : 'es'}.`, 'success');
    else pushToast('Preset closed — apps and system settings restored.', 'success');
  }, [persist, pushToast]);

  const renderPanel = () => {
    switch (active) {
      case 'dashboard':
        return (
          <Dashboard
            data={data}
            stats={stats}
            onNavigate={setActive}
            onClosePreset={onClosePreset}
            refresh={refresh}
            pushToast={pushToast}
            onLaunchPreset={async (preset) => {
              triggerPulse('normal');
              pushToast(`"${preset.name}" preset launched.`, 'success');
              await persist((d) => {
                const next = { ...d, activePresetId: preset.id };
                next.settings = { ...(next.settings || {}), lastPresetId: preset.id };
                if (next.settings.logActivity !== false) {
                  next.activityLog = [...(next.activityLog || [])];
                  next.activityLog.unshift({
                    id: crypto.randomUUID(),
                    message: `Launched "${preset.name}" preset`,
                    timestamp: Date.now(),
                  });
                }
                return next;
              });
            }}
          />
        );
      case 'presets':
        return (
          <Presets
            data={data}
            persist={persist}
            pushToast={pushToast}
            isActive={active === 'presets'}
            onPresetLaunched={(preset) => {
              triggerPulse('normal');
              const name = preset?.name ? `"${preset.name}"` : 'Preset';
              pushToast(`${name} launched.`, 'success');
            }}
          />
        );
      case 'processes':
        return <Processes pushToast={pushToast} />;
      case 'apps':
        return <Apps data={data} pushToast={pushToast} isActive={active === 'apps'} />;
      case 'search':
        return <QuickSearch data={data} persist={persist} isActive={active === 'search'} burst={burst} />;
      case 'tasks':
        return <Tasks data={data} persist={persist} pushToast={pushToast} />;
      case 'settings':
        return (
          <Settings
            data={data}
            persist={persist}
            refresh={refresh}
            pushToast={pushToast}
          />
        );
      default:
        return null;
    }
  };

  const useLegacyWake =
    data?.settings?.voiceMode === 'legacy' && data?.settings?.wakeWordEnabled !== false;
  const speechOk =
    typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const voiceWakeActive = useLegacyWake && speechOk && isElectron();

  // ——— Boot screen ———
  if (phase === PHASE_BOOT) {
    return <BootScreen onComplete={handleBootComplete} onSystemsOnline={() => triggerPulse('strong')} />;
  }

  // ——— Setup wizard ———
  if (phase === PHASE_SETUP) {
    return (
      <motion.div className="flex h-screen min-h-0 flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
        <WindowChrome />
        <SetupWizard onComplete={handleSetupComplete} />
      </motion.div>
    );
  }

  // ——— Main app with startup animation ———
  return (
    <motion.div
      className="flex h-screen min-h-0 flex-col bg-[var(--bg-app)] text-[var(--text-primary)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: shellReady ? 1 : 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {data.settings?.hologramEffects !== false ? (
        <HologramPulse triggerKey={pulseKey} intensity={pulseIntensity} />
      ) : null}
      <WindowChrome />
      {voiceWakeActive ? <VoiceJarvis data={data} persist={persist} pushToast={pushToast} /> : null}
      <div className="flex min-h-0 flex-1">
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: shellReady ? 0 : -20, opacity: shellReady ? 1 : 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <Sidebar active={active} onSelect={setActive} stats={stats} data={data} pushToast={pushToast} />
        </motion.div>
        <main className="relative min-w-0 flex-1 overflow-hidden bg-[var(--bg-app)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              className="absolute inset-0 overflow-hidden"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderPanel()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </motion.div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <JarvisSessionProvider>
        <AppShell />
      </JarvisSessionProvider>
    </ToastProvider>
  );
}
