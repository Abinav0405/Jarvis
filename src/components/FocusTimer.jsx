import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import { getJarvis } from '@/jarvis-bridge.js';

const R = 52;
const C = 2 * Math.PI * R;

function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Apple-style focus timer with circular progress ring, custom duration, pause/stop/clear.
 */
export function FocusTimer({ data, refresh, pushToast }) {
  const end = Number(data.settings?.focusTimerEnd) || 0;
  const totalSec = Math.max(1, Number(data.settings?.focusTimerTotalSec) || 0);
  const pausedRemaining = Number(data.settings?.focusTimerPausedRemaining) || 0;
  const isPaused = pausedRemaining > 0 && !end;

  const [remaining, setRemaining] = useState(0);
  const [customMin, setCustomMin] = useState('25');

  const patchTimer = useCallback(
    async (patch) => {
      await getJarvis().writeData({
        ...data,
        settings: { ...data.settings, ...patch },
      });
      refresh?.();
    },
    [data, refresh]
  );

  useEffect(() => {
    if (isPaused) {
      setRemaining(pausedRemaining);
      return undefined;
    }
    if (!end || end <= Date.now()) {
      setRemaining(0);
      return undefined;
    }
    const tick = () => {
      const left = Math.max(0, (end - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        pushToast?.('Focus session complete.', 'success');
        void patchTimer({
          focusTimerEnd: null,
          focusTimerTotalSec: null,
          focusTimerPausedRemaining: null,
        });
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [end, isPaused, pausedRemaining, patchTimer, pushToast]);

  const active = isPaused || (end > Date.now() && remaining > 0);
  const progress = useMemo(() => {
    if (!totalSec) return 0;
    const left = isPaused ? pausedRemaining : remaining;
    return Math.min(1, Math.max(0, 1 - left / totalSec));
  }, [totalSec, remaining, pausedRemaining, isPaused]);

  const ringOffset = C * (1 - progress);
  const hue = Math.round(200 - progress * 140);

  const start = async (mins) => {
    const m = Math.max(1, Math.min(480, Number(mins) || 25));
    const sec = m * 60;
    await patchTimer({
      focusTimerEnd: Date.now() + sec * 1000,
      focusTimerTotalSec: sec,
      focusTimerPausedRemaining: null,
    });
    pushToast?.(`${m} min focus started.`, 'success');
  };

  const pause = async () => {
    if (isPaused) return;
    const left = Math.max(1, Math.ceil((end - Date.now()) / 1000));
    await patchTimer({ focusTimerEnd: null, focusTimerPausedRemaining: left });
  };

  const resume = async () => {
    if (!isPaused) return;
    await patchTimer({
      focusTimerEnd: Date.now() + pausedRemaining * 1000,
      focusTimerPausedRemaining: null,
    });
  };

  const stop = async () => {
    await patchTimer({
      focusTimerEnd: null,
      focusTimerTotalSec: null,
      focusTimerPausedRemaining: null,
    });
    setRemaining(0);
    pushToast?.('Focus timer cleared.', 'info');
  };

  const displaySec = isPaused ? pausedRemaining : remaining;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[140px] w-[140px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={`hsl(${hue} 85% 55%)`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={ringOffset}
            style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.4s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-mono text-2xl font-light tracking-tight text-[var(--accent)]">
            {active ? formatClock(displaySec) : '0:00'}
          </p>
          {active && (
            <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[rgba(240,240,240,0.35)]">
              {isPaused ? 'Paused' : 'Focus'}
            </p>
          )}
        </div>
      </div>

      {active ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void (isPaused ? resume() : pause())}
            className="inline-flex items-center gap-1 rounded-pill border border-[rgba(255,255,255,0.12)] px-3 py-1.5 text-[10px] font-semibold text-[#F0F0F0] hover:border-[var(--accent)]"
          >
            {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => void stop()}
            className="inline-flex items-center gap-1 rounded-pill border border-[rgba(255,255,255,0.12)] px-3 py-1.5 text-[10px] font-semibold text-[#F0F0F0] hover:border-rose-400/50"
          >
            <Square className="h-3 w-3" /> Stop
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex w-full max-w-[200px] items-center gap-2">
            <input
              type="number"
              min={1}
              max={480}
              value={customMin}
              onChange={(e) => setCustomMin(e.target.value)}
              className="w-16 rounded-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-2 py-1.5 text-center font-mono text-sm text-[#F0F0F0] outline-none focus:border-[var(--accent)]"
              aria-label="Minutes"
            />
            <span className="text-[10px] text-[rgba(240,240,240,0.45)]">min</span>
            <button
              type="button"
              onClick={() => void start(customMin)}
              className="ml-auto inline-flex items-center gap-1 rounded-pill border border-[var(--accent)]/40 bg-[rgba(0,212,255,0.12)] px-3 py-1.5 text-[10px] font-semibold text-[var(--accent)]"
            >
              <Play className="h-3 w-3" /> Start
            </button>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {[15, 25, 45, 60].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void start(m)}
                className="rounded-pill border border-[rgba(255,255,255,0.1)] px-2.5 py-1 text-[10px] font-semibold text-[#F0F0F0] hover:border-[var(--accent)]"
              >
                {m}m
              </button>
            ))}
          </div>
        </>
      )}

      {active && (
        <button
          type="button"
          onClick={() => void stop()}
          className="mt-2 inline-flex items-center gap-1 text-[9px] text-[rgba(240,240,240,0.4)] hover:text-[var(--accent)]"
        >
          <RotateCcw className="h-3 w-3" /> Clear timer
        </button>
      )}
    </div>
  );
}
