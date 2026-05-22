import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Shield } from 'lucide-react';
import { getJarvis } from '@/jarvis-bridge.js';
import { SmoothNumber } from '@/components/SmoothNumber.jsx';
import { SearchField } from '@/components/SearchField.jsx';

const BLOCKED = new Set(
  ['system', 'svchost', 'lsass', 'csrss', 'winlogon', 'explorer', 'services', 'smss', 'registry'].map((s) =>
    s.toLowerCase()
  )
);

function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\.exe$/i, '');
}

function isBlocked(name) {
  return BLOCKED.has(normName(name));
}

export function Processes({ pushToast }) {
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [confirmPid, setConfirmPid] = useState(null);

  const tick = useCallback(async () => {
    const res = await getJarvis().listProcesses?.().catch(() => null);
    const list = Array.isArray(res) ? res : res?.processes;
    if (!Array.isArray(list)) {
      setLoading(false);
      return;
    }
    const sorted = [...list].sort((a, b) => (Number(b.cpu) || 0) - (Number(a.cpu) || 0));
    setRows(sorted);
    setTotalCount(Number(Array.isArray(res) ? list.length : res?.totalCount) || sorted.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    void tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [tick]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.name || '').toLowerCase().includes(q));
  }, [rows, query]);

  const summary = useMemo(() => {
    const topRam = rows.reduce((s, r) => s + (Number(r.ram) || 0), 0);
    const peakCpu = rows.length ? Math.max(...rows.map((r) => Number(r.cpu) || 0)) : 0;
    return { shown: rows.length, totalCount, topRam, peakCpu };
  }, [rows, totalCount]);

  const topPids = useMemo(() => {
    const t = [...rows].sort((a, b) => (Number(b.cpu) || 0) - (Number(a.cpu) || 0)).slice(0, 3);
    return new Set(t.map((r) => r.pid));
  }, [rows]);

  const kill = async (row) => {
    if (isBlocked(row.name)) {
      pushToast?.("Can't kill that one, Boss — it's a system process.", 'info');
      return;
    }
    const r = await getJarvis().killProcess?.(row.pid, row.name).catch(() => ({ ok: false }));
    if (r?.ok === false && r?.error === 'blocked') {
      pushToast?.("Can't kill that one, Boss — it's a system process.", 'info');
      return;
    }
    if (r?.ok) {
      pushToast?.(`${row.name} terminated, Boss.`, 'success');
      setRows((prev) => prev.filter((x) => x.pid !== row.pid));
    } else {
      pushToast?.(String(r?.error || 'Could not terminate process.'), 'error');
    }
    setConfirmPid(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto jarvis-scrollbar px-8 py-7">
      <div>
        <h1 className="text-2xl font-light tracking-tight text-[#F0F0F0]">Processes</h1>
        <p className="mt-1 text-sm text-[rgba(240,240,240,0.4)]">
          Live CPU % and RAM (MB) from Windows perf counters — top 50 by CPU, polled every 3s. Values above 100% are
          normal on multi-core CPUs (same as Task Manager). Each process has its own PID; multiple JARVIS rows are
          separate Electron processes.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 backdrop-blur-glass">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgba(240,240,240,0.38)]">System total</p>
          <p className="font-mono text-lg text-[#F0F0F0]">
            <SmoothNumber value={summary.totalCount} decimals={0} />
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgba(240,240,240,0.38)]">Shown</p>
          <p className="font-mono text-lg text-[#F0F0F0]">
            <SmoothNumber value={summary.shown} decimals={0} />
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgba(240,240,240,0.38)]">Peak CPU</p>
          <p className="font-mono text-lg text-[var(--accent)]">
            <SmoothNumber value={summary.peakCpu} decimals={1} />%
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgba(240,240,240,0.38)]">Top 50 RAM</p>
          <p className="font-mono text-lg text-[#F0F0F0]">
            <SmoothNumber value={summary.topRam} decimals={0} /> MB
          </p>
        </div>
      </div>

      <SearchField
        className="w-full max-w-md"
        placeholder="Filter by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="min-h-0 flex-1 overflow-x-auto rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] backdrop-blur-glass">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.08)] text-[10px] font-semibold uppercase tracking-wider text-[rgba(240,240,240,0.4)]">
              <th className="px-4 py-3">App</th>
              <th className="px-3 py-3 font-mono">PID</th>
              <th className="px-3 py-3">CPU</th>
              <th className="px-3 py-3">RAM (MB)</th>
              <th className="px-4 py-3 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {filtered.map((row) => {
                const blocked = isBlocked(row.name);
                const hot = topPids.has(row.pid) && !blocked;
                const cpuPct = Math.min(100, Number(row.cpu) || 0);
                return (
                  <motion.tr
                    key={row.pid}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className={`border-b border-[rgba(255,255,255,0.05)] ${
                      hot ? 'bg-[rgba(255,80,80,0.06)]' : 'hover:bg-[rgba(255,255,255,0.03)]'
                    }`}
                  >
                    <td className="px-4 py-2.5 font-medium text-[#F0F0F0]">
                      <span className="inline-flex items-center gap-2">
                        {hot && <Flame className="h-3.5 w-3.5 text-orange-400/90" aria-hidden />}
                        {row.name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[rgba(240,240,240,0.65)]">{row.pid}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-pill bg-[rgba(255,255,255,0.08)]">
                          <motion.div
                            className="h-full rounded-pill bg-[var(--accent)]"
                            animate={{ width: `${cpuPct}%` }}
                            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                          />
                        </div>
                        <span className="font-mono text-xs text-[rgba(240,240,240,0.55)]">
                          <SmoothNumber value={Number(row.cpu) || 0} decimals={1} />%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[rgba(240,240,240,0.65)]">
                      <SmoothNumber value={Number(row.ram) || 0} decimals={0} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {blocked ? (
                        <span title="Protected system process" className="inline-flex text-[rgba(240,240,240,0.35)]">
                          <Shield className="h-4 w-4" />
                        </span>
                      ) : confirmPid === row.pid ? (
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className="text-[rgba(240,240,240,0.55)]">Kill {row.name}?</span>
                          <button
                            type="button"
                            className="rounded-pill bg-rose-600/90 px-2 py-1 font-semibold text-white hover:bg-rose-500"
                            onClick={() => void kill(row)}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className="rounded-pill border border-[rgba(255,255,255,0.12)] px-2 py-1 text-[rgba(240,240,240,0.75)]"
                            onClick={() => setConfirmPid(null)}
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="rounded-pill border border-rose-500/35 px-3 py-1 text-xs font-semibold text-rose-300/90 hover:border-rose-500 hover:bg-rose-600/25"
                          onClick={() => setConfirmPid(row.pid)}
                        >
                          Kill
                        </button>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
        {loading && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-[rgba(240,240,240,0.45)]">Loading processes…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-[rgba(240,240,240,0.4)]">
            {query.trim() ? 'No processes match your filter.' : 'No processes returned — try refreshing, Boss.'}
          </p>
        )}
      </div>
    </div>
  );
}
