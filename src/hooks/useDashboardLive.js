import { useCallback, useEffect, useState } from 'react';
import { getJarvis, isJarvisBackendLive } from '@/jarvis-bridge.js';

export function useDashboardLive({ enabled = true, weatherCity = 'London' } = {}) {
  const [extras, setExtras] = useState({ version: '1.0.0', battery: { percent: null }, dnd: false });
  const [topProcs, setTopProcs] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [weather, setWeather] = useState(null);

  const liveBackend = isJarvisBackendLive();

  const tick = useCallback(async () => {
    if (!enabled) return;
    const j = getJarvis();
    const [ex, procR, sugR, wR] = await Promise.all([
      j.getDashboardExtras?.().catch(() => null),
      j.listProcesses?.().catch(() => null),
      j.getSuggestion?.().catch(() => null),
      j.fetchWeather?.(weatherCity).catch(() => null),
    ]);

    if (ex) setExtras(ex);

    const plist = Array.isArray(procR) ? procR : procR?.processes;
    if (Array.isArray(plist)) setTopProcs(plist.slice(0, 5));

    if (sugR?.presetName) setSuggestion(sugR);
    else setSuggestion(null);

    if (wR?.ok) setWeather(wR);
  }, [enabled, weatherCity]);

  useEffect(() => {
    void tick();
    // Offline stub: only tick once (avoids jank)
    if (!liveBackend) return undefined;
    const id = setInterval(tick, 8000);
    return () => clearInterval(id);
  }, [tick, liveBackend]);

  return { extras, topProcs, suggestion, weather, refresh: tick };
}
