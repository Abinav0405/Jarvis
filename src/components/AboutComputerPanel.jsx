import { useCallback, useEffect, useState } from 'react';
import { Brain, Cpu, HardDrive, MemoryStick, Monitor, RefreshCw, Server, CircuitBoard } from 'lucide-react';
import { motion } from 'framer-motion';
import { getJarvis } from '@/jarvis-bridge.js';

function SpecCard({ icon: Icon, title, children }) {
  return (
    <motion.div
      className="rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4 backdrop-blur-glass"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">{title}</h3>
      </div>
      <motion.div className="mt-3 space-y-2">{children}</motion.div>
    </motion.div>
  );
}

function SpecRow({ label, value, mono = true }) {
  return (
    <motion.div
      className="flex items-start justify-between gap-3 text-sm"
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
    >
      <span className="shrink-0 text-[rgba(240,240,240,0.45)]">{label}</span>
      <span
        className={`min-w-0 text-right ${mono ? 'font-mono text-[11px] leading-snug text-[rgba(240,240,240,0.88)]' : 'text-[#F0F0F0]'}`}
      >
        {value}
      </span>
    </motion.div>
  );
}

export function AboutComputerPanel() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getJarvis().getAboutComputer?.();
      if (!data) throw new Error('unavailable');
      setInfo(data);
    } catch {
      setError('Could not load system information.');
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !info) {
    return <p className="font-mono text-xs text-[rgba(240,240,240,0.4)]">Scanning hardware, Boss…</p>;
  }

  if (error && !info) {
    return (
      <motion.div
        className="rounded-card border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100/90"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {error}
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 block text-xs font-semibold text-[var(--accent)] hover:underline"
        >
          Retry
        </button>
      </motion.div>
    );
  }

  if (!info) return null;

  const osLine = [info.os.distro, info.os.release].filter(Boolean).join(' ');
  const osExtra = [info.os.build, info.os.arch].filter(Boolean).join(' · ');
  const machine =
    info.system.manufacturer !== '—' || info.system.model !== '—'
      ? `${info.system.manufacturer} ${info.system.model}`.trim()
      : '—';
  const board =
    info.baseboard.manufacturer !== '—' || info.baseboard.model !== '—'
      ? `${info.baseboard.manufacturer} ${info.baseboard.model}`.trim()
      : null;

  const npuLabel = info.npu.detected ? info.npu.name || 'Detected' : info.npu.detail || 'Not detected';

  return (
    <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {info.preview && (
        <p className="rounded-btn border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-[11px] leading-snug text-[rgba(240,240,240,0.5)]">
          Demo data — start the JARVIS desktop app on this PC for live hardware details.
        </p>
      )}

      <motion.div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-[rgba(240,240,240,0.45)]">
          {info.hostname}
          {info.os.uptime && info.os.uptime !== '—' ? ` · up ${info.os.uptime}` : ''}
        </p>
        <motion.button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-btn border border-[rgba(255,255,255,0.1)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)] disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </motion.button>
      </motion.div>

      <SpecCard icon={Monitor} title="Operating system">
        <SpecRow label="OS" value={osLine || '—'} />
        {osExtra ? <SpecRow label="Build" value={osExtra} /> : null}
        <SpecRow label="Hostname" value={info.hostname} />
        <SpecRow label="Uptime" value={info.os.uptime || '—'} />
      </SpecCard>

      <SpecCard icon={Server} title="System">
        <SpecRow label="Machine" value={machine} />
        {board ? <SpecRow label="Motherboard" value={board} /> : null}
        {info.system.sku ? <SpecRow label="SKU" value={info.system.sku} /> : null}
      </SpecCard>

      <SpecCard icon={Cpu} title="Processor">
        <SpecRow label="Model" value={info.cpu.brand} />
        <SpecRow
          label="Cores"
          value={
            info.cpu.physicalCores && info.cpu.physicalCores !== info.cpu.cores
              ? `${info.cpu.cores} (${info.cpu.physicalCores} physical)`
              : String(info.cpu.cores || '—')
          }
        />
        {info.cpu.speed ? <SpecRow label="Speed" value={info.cpu.speed} /> : null}
      </SpecCard>

      <SpecCard icon={CircuitBoard} title="Graphics">
        {info.gpus.map((g, i) => (
          <motion.div
            key={`${g.model}-${i}`}
            className={i > 0 ? 'mt-3 border-t border-[rgba(255,255,255,0.06)] pt-3' : ''}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
          >
            <SpecRow label="GPU" value={g.model} />
            {g.vram ? <SpecRow label="VRAM" value={g.vram} /> : null}
            {g.driver ? <SpecRow label="Driver" value={g.driver} /> : null}
          </motion.div>
        ))}
      </SpecCard>

      <SpecCard icon={MemoryStick} title="Memory">
        <SpecRow label="Installed" value={info.ram.total} />
        {info.ram.type ? <SpecRow label="Type" value={info.ram.type} /> : null}
        {info.ram.slots ? <SpecRow label="Layout" value={info.ram.slots} /> : null}
      </SpecCard>

      <SpecCard icon={Brain} title="NPU">
        <SpecRow label="Status" value={npuLabel} />
        {info.npu.detected && info.npu.detail ? (
          <SpecRow label="Note" value={info.npu.detail} mono={false} />
        ) : null}
        {!info.preview && !info.npu.detected ? (
          <p className="text-[10px] leading-snug text-[rgba(240,240,240,0.35)]">
            Windows does not expose a single standard NPU API. JARVIS checks device names (Copilot+ PC, Ryzen AI,
            Intel AI Boost, etc.). Discrete GPUs are not NPUs.
          </p>
        ) : null}
      </SpecCard>

      <SpecCard icon={HardDrive} title="Storage">
        {info.storage.map((vol, i) => (
          <motion.div
            key={`${vol.mount}-${i}`}
            className={i > 0 ? 'mt-3 border-t border-[rgba(255,255,255,0.06)] pt-3' : ''}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
          >
            <SpecRow label="Volume" value={vol.mount} />
            <SpecRow label="Used" value={`${vol.used} / ${vol.size} (${vol.usePct}%)`} />
            <SpecRow label="Filesystem" value={`${vol.fs} · ${vol.type}`} />
            <motion.div
              className="mt-2 h-1 overflow-hidden rounded-pill bg-[rgba(255,255,255,0.06)]"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.35, delay: 0.05 + i * 0.04 }}
              style={{ transformOrigin: 'left' }}
            >
              <div
                className="h-full rounded-pill bg-[var(--accent)]"
                style={{ width: `${Math.min(100, vol.usePct)}%` }}
              />
            </motion.div>
          </motion.div>
        ))}
      </SpecCard>
    </motion.div>
  );
}
