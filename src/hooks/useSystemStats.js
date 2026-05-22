import { useCallback, useEffect, useState } from 'react';
import { getJarvis, isJarvisBackendLive } from '@/jarvis-bridge.js';

const idle = {
  cpu: 0,
  ramUsed: 0,
  ramTotal: 1,
  storageUsed: 0,
  storageTotal: 1,
  storageUsedPct: 0,
};

export function useSystemStats(intervalMs = 5000) {
  const [stats, setStats] = useState(idle);
  const [docVisible, setDocVisible] = useState(() => document.visibilityState === 'visible');
  const [winVisible, setWinVisible] = useState(true);

  useEffect(() => {
    const onVis = () => setDocVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const j = getJarvis();
    const offShow = j.onWindowShown(() => setWinVisible(true));
    const offHide = j.onWindowHidden(() => setWinVisible(false));
    return () => {
      offShow();
      offHide();
    };
  }, []);

  const visible = docVisible && winVisible;
  const liveBackend = isJarvisBackendLive();

  const tick = useCallback(async () => {
    if (!visible) return;
    try {
      const next = await getJarvis().getSystemStats();
      setStats(next);
    } catch {
      /* ignore */
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    // Offline stub: only fetch once
    if (!liveBackend) {
      tick();
      return undefined;
    }
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [visible, tick, intervalMs, liveBackend]);

  return stats;
}
