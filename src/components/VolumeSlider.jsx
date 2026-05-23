import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { getJarvis } from '@/jarvis-bridge.js';

/** Windows 11–style master volume slider with debounced IPC. */
export function VolumeSlider({ pushToast }) {
  const [vol, setVol] = useState(50);
  const [muted, setMuted] = useState(false);
  const debounceRef = useRef(null);
  const lastSent = useRef(50);

  const syncFromSystem = useCallback(() => {
    getJarvis()
      .getSystemVolume?.()
      .then((r) => {
        if (r?.percent != null) {
          setVol(r.percent);
          lastSent.current = r.percent;
          setMuted(r.percent === 0);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    syncFromSystem();
    const off = getJarvis().onDataChanged?.(() => syncFromSystem());
    return typeof off === 'function' ? off : undefined;
  }, [syncFromSystem]);

  const applyVolume = useCallback(
    (percent, quiet) => {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      lastSent.current = p;
      getJarvis()
        .setSystemVolume?.(p)
        .then((r) => {
          if (!r?.ok && !quiet) pushToast?.(String(r?.error || 'Could not change volume.'), 'error');
        })
        .catch(() => {
          if (!quiet) pushToast?.('Could not change volume.', 'error');
        });
    },
    [pushToast]
  );

  const scheduleApply = useCallback(
    (percent) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => applyVolume(percent, true), 60);
    },
    [applyVolume]
  );

  const onChange = (e) => {
    const p = Number(e.target.value);
    setVol(p);
    setMuted(p === 0);
    scheduleApply(p);
  };

  const onMute = () => {
    if (muted || vol === 0) {
      const restore = lastSent.current > 0 ? lastSent.current : 50;
      setVol(restore);
      setMuted(false);
      applyVolume(restore, false);
    } else {
      setMuted(true);
      setVol(0);
      applyVolume(0, false);
    }
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onMute}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn border border-[rgba(255,255,255,0.08)] text-[rgba(240,240,240,0.75)] hover:border-[var(--accent)]"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted || vol === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={vol}
        onChange={onChange}
        className="jarvis-volume-slider min-w-0 flex-1"
        style={{ '--vol-pct': `${vol}%` }}
        aria-label="System volume"
      />
      <span className="w-9 shrink-0 text-right font-mono text-[10px] text-[rgba(240,240,240,0.5)]">{vol}%</span>
    </div>
  );
}
