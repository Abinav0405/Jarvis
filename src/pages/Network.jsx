import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJarvis } from '@/jarvis-bridge.js';
import { SmoothNumber } from '@/components/SmoothNumber.jsx';

const MAX_POINTS = 60;

function pushPoint(arr, y) {
  const n = [...arr, y];
  return n.length > MAX_POINTS ? n.slice(-MAX_POINTS) : n;
}

function pathFor(values, max, height, invert = false) {
  if (!values.length) return '';
  const m = Math.max(max, 1e-6);
  const w = 320;
  const step = w / Math.max(values.length - 1, 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const t = invert ? 1 - v / m : v / m;
      const y = height - t * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function Network({ pushToast }) {
  const [downSeries, setDownSeries] = useState([]);
  const [upSeries, setUpSeries] = useState([]);
  const [cur, setCur] = useState({ down: 0, up: 0 });
  const [ping, setPing] = useState(null);
  const [warn, setWarn] = useState(false);
  const [rows, setRows] = useState([]);
  const [showAllConn, setShowAllConn] = useState(false);

  const tick = useCallback(async () => {
    const sp = await getJarvis().networkSpeed?.().catch(() => null);
    if (sp) {
      const d = Number(sp.mbpsDown) || 0;
      const u = Number(sp.mbpsUp) || 0;
      setCur({ down: d, up: u });
      setDownSeries((s) => pushPoint(s, d));
      setUpSeries((s) => pushPoint(s, u));
    }
  }, []);

  useEffect(() => {
    tick();
    const id = setInterval(tick, 2500);
    return () => clearInterval(id);
  }, [tick]);

  useEffect(() => {
    const p = async () => {
      const r = await getJarvis().networkPing?.().catch(() => ({}));
      setPing(typeof r?.ms === 'number' ? r.ms : null);
    };
    p();
    const id = setInterval(p, 5000);
    return () => clearInterval(id);
  }, []);

  const pollTcp = useCallback(async () => {
    const raw = await getJarvis().networkTcp?.().catch(() => []);
    if (!Array.isArray(raw)) {
      setWarn(true);
      return;
    }
    if (raw.length === 0 && rows.length === 0) setWarn(true);
    const mapped = raw.slice(0, showAllConn ? 80 : 18).map((r, i) => ({
      id: `${r.pid}-${r.remote}-${i}`,
      app: `PID ${r.pid}`,
      remote: r.remote || '—',
      status: r.state || '—',
      usage: '—',
    }));
    setRows(mapped);
  }, [rows.length, showAllConn]);

  useEffect(() => {
    void pollTcp();
    const id = setInterval(pollTcp, 5000);
    return () => clearInterval(id);
  }, [pollTcp]);

  const maxVal = useMemo(() => {
    const a = [...downSeries, ...upSeries, 1];
    return Math.max(...a);
  }, [downSeries, upSeries]);

  return (
    <div className="h-full min-h-0 overflow-y-auto jarvis-scrollbar px-8 py-7">
      <h1 className="text-2xl font-semibold text-[#F0F0F0]">Network</h1>
      <p className="mt-1 text-sm text-[rgba(240,240,240,0.45)]">Live throughput and quick tools.</p>

      {warn && (
        <div className="mt-4 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          Some network data is unavailable — try running JARVIS as administrator.
        </div>
      )}

      <div className="mt-6 grid gap-4 rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 sm:grid-cols-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Download</p>
          <p className="mt-1 font-mono text-2xl text-[#F0F0F0]">
            <SmoothNumber value={cur.down} decimals={1} /> <span className="text-sm text-[rgba(240,240,240,0.45)]">Mbps</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Upload</p>
          <p className="mt-1 font-mono text-2xl text-[#F0F0F0]">
            <SmoothNumber value={cur.up} decimals={1} /> <span className="text-sm text-[rgba(240,240,240,0.45)]">Mbps</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Ping</p>
          <p className="mt-1 font-mono text-2xl text-[#F0F0F0]">{ping == null ? '—' : `${ping} ms`}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Type</p>
          <p className="mt-1 font-mono text-lg text-[#F0F0F0]">LAN / Wi‑Fi</p>
        </div>
      </div>

      <div className="mt-8 rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(8,10,14,0.5)] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Last 60 seconds</p>
        <svg viewBox="0 0 320 120" className="mt-2 h-32 w-full">
          <path
            d={pathFor(upSeries, maxVal, 120, false)}
            fill="none"
            stroke="#60a5fa"
            strokeWidth="2"
            opacity={0.85}
          />
          <path
            d={pathFor(downSeries, maxVal, 120, false)}
            fill="none"
            stroke="#00D4FF"
            strokeWidth="2"
          />
        </svg>
        <div className="mt-1 flex gap-4 text-[10px] text-[rgba(240,240,240,0.45)]">
          <span>
            <span className="text-[var(--accent)]">■</span> Download
          </span>
          <span>
            <span className="text-blue-400">■</span> Upload
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-pill border border-[rgba(255,255,255,0.12)] px-4 py-2 text-xs font-semibold text-[#F0F0F0]"
          onClick={() => getJarvis().openExternal?.('https://fast.com')}
        >
          Run speed test
        </button>
        <button
          type="button"
          className="rounded-pill border border-[rgba(255,255,255,0.12)] px-4 py-2 text-xs font-semibold text-[#F0F0F0]"
          onClick={async () => {
            const r = await getJarvis().networkFlushDns?.();
            if (r?.ok) pushToast?.('DNS cache flushed.', 'success');
            else pushToast?.('Flush DNS failed.', 'error');
          }}
        >
          Flush DNS
        </button>
        <button
          type="button"
          className="rounded-pill border border-[rgba(255,255,255,0.12)] px-4 py-2 text-xs font-semibold text-[#F0F0F0]"
          onClick={() => setShowAllConn((v) => !v)}
        >
          {showAllConn ? 'Hide' : 'View'} active connections
        </button>
      </div>

      <div className="mt-8 overflow-x-auto rounded-card border border-[rgba(255,255,255,0.08)]">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="border-b border-[rgba(255,255,255,0.08)] text-[10px] uppercase tracking-wider text-[rgba(240,240,240,0.4)]">
            <tr>
              <th className="px-3 py-2">App</th>
              <th className="px-3 py-2">Remote</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Est. data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[rgba(255,255,255,0.05)] text-[#F0F0F0]">
                <td className="px-3 py-2">{r.app}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-[rgba(240,240,240,0.65)]">{r.remote}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 text-[rgba(240,240,240,0.45)]">{r.usage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
