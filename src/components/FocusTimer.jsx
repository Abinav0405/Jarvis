import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import { getJarvis } from '@/jarvis-bridge.js';

const R = 52;
const C = 2 * Math.PI * R;
const TRACK = 'rgba(255, 255, 255, 0.07)';
const RING = 'rgba(110, 125, 138, 0.72)';

function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Apple-style focus timer — muted ring shrinks as time runs out.
 */
export function FocusTimer({ data, refresh, pushToast }) {
  const end = Number(data.settings?.focusTimerEnd) || 0;
  const totalSec = Math.max(0, Number(data.settings?.focusTimerTotalSec) || 0);
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
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [end, isPaused, pausedRemaining, patchTimer, pushToast]);

  const running = isPaused || (end > Date.now() && remaining > 0);
  const leftSec = running ? (isPaused ? pausedRemaining : remaining) : 0;

  const remainingFrac = useMemo(() => {
    if (!running || totalSec <= 0) return 1;
    return Math.min(1, Math.max(0, leftSec / totalSec));
  }, [running, totalSec, leftSec]);

  const ringOffset = C * (1 - remainingFrac);

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

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[140px] w-[140px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" stroke={TRACK} strokeWidth="5" />
          {running && (
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={RING}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={ringOffset}
              style={{ transition: 'stroke-dashoffset 0.2s linear' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-mono text-2xl font-light tracking-tight text-[rgba(220,225,230,0.88)]">
            {running ? formatClock(leftSec) : '0:00'}
          </p>
          {running && (
            <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[rgba(240,240,240,0.32)]">
              {isPaused ? 'Paused' : 'Focus'}
            </p>
          )}
        </div>
      </div>

      {running ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void (isPaused ? resume() : pause())}
            className="inline-flex items-center gap-1 rounded-pill border border-[rgba(255,255,255,0.1)] px-3 py-1.5 text-[10px] font-semibold text-[rgba(240,240,240,0.7)] hover:border-[rgba(255,255,255,0.22)]"
          >
            {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => void stop()}
            className="inline-flex items-center gap-1 rounded-pill border border-[rgba(255,255,255,0.1)] px-3 py-1.5 text-[10px] font-semibold text-[rgba(240,240,240,0.7)] hover:border-[rgba(255,255,255,0.22)]"
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
              className="w-16 rounded-btn border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-2 py-1.5 text-center font-mono text-sm text-[rgba(240,240,240,0.75)] outline-none focus:border-[rgba(255,255,255,0.2)]"
              aria-label="Minutes"
            />
            <span className="text-[10px] text-[rgba(240,240,240,0.38)]">min</span>
            <button
              type="button"
              onClick={() => void start(customMin)}
              className="ml-auto inline-flex items-center gap-1 rounded-pill border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-[10px] font-semibold text-[rgba(240,240,240,0.75)] hover:bg-[rgba(255,255,255,0.07)]"
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
                className="rounded-pill border border-[rgba(255,255,255,0.08)] px-2.5 py-1 text-[10px] font-semibold text-[rgba(240,240,240,0.6)] hover:border-[rgba(255,255,255,0.18)]"
              >
                {m}m
              </button>
            ))}
          </div>
        </>
      )}

      {running && (
        <button
          type="button"
          onClick={() => void stop()}
          className="mt-2 inline-flex items-center gap-1 text-[9px] text-[rgba(240,240,240,0.35)] hover:text-[rgba(240,240,240,0.55)]"
        >
          <RotateCcw className="h-3 w-3" /> Clear timer
        </button>
      )}
    </div>
  );
}
