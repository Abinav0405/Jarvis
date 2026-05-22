import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, FolderOpen, Loader2, Mic } from 'lucide-react';
import { getJarvis, isElectron } from '@/jarvis-bridge.js';
import { VoiceApiSetupGuide } from '@/components/VoiceApiSetupGuide.jsx';

export function VoiceSettingsPanel({ pushToast, compact = false }) {
  const inElectron = isElectron();
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!inElectron) return;
    const s = await getJarvis().speechGetStatus?.().catch(() => null);
    if (s) setConfigured(!!s.configured);
    const info = await getJarvis().getRuntimeInfo?.().catch(() => null);
    if (info) setConfigured(!!info.speechKeyConfigured);
  }, [inElectron]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const save = async () => {
    if (!inElectron) {
      pushToast?.('Voice API key is configured in the desktop app.', 'info');
      return;
    }
    const key = apiKey.trim();
    if (!key) {
      pushToast?.('Paste your Google API key first.', 'error');
      return;
    }
    setBusy(true);
    try {
      const r = await getJarvis().speechSaveKey?.(key);
      if (r?.ok) {
        pushToast?.('API key saved. Fully quit and reopen JARVIS so wake word can use it.', 'success');
        setApiKey('');
        await refreshStatus();
      } else {
        pushToast?.(r?.error || 'Could not save key.', 'error');
      }
    } catch (e) {
      pushToast?.(String(e?.message || e), 'error');
    }
    setBusy(false);
  };

  const openFolder = async () => {
    if (!inElectron) return;
    try {
      await getJarvis().speechOpenUserDataFolder?.();
    } catch {
      pushToast?.('Could not open data folder.', 'error');
    }
  };

  if (!inElectron) {
    return (
      <motion.div className="rounded-card border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        <Mic className="mr-2 inline h-4 w-4" />
        Wake word runs in the <strong>desktop app</strong>. Open JARVIS on Windows to add a Google speech API key.
      </motion.div>
    );
  }

  const rootClass = compact ? 'space-y-3' : 'space-y-4';

  return (
    <motion.div className={rootClass}>
      {configured ? (
        <motion.div
          className="flex items-center gap-2 rounded-btn border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100/90"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Check className="h-3.5 w-3.5" />
          Google speech key detected — restart JARVIS if you just added it.
        </motion.div>
      ) : null}

      <VoiceApiSetupGuide layout={compact ? 'tabs' : 'accordion'} defaultOpen={compact} />

      {!compact ? (
        <p className="text-[11px] text-[rgba(240,240,240,0.45)]">
          After the guide, paste your key below or create <strong>GOOGLE_API_KEY.txt</strong> (one line) in your JARVIS
          data folder. Restart is required. You can skip and configure later in Settings → General.
        </p>
      ) : null}

      <label className="block text-xs text-[rgba(240,240,240,0.5)]">
        Google API key (optional)
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          placeholder="AIza…"
          className="jarvis-input mt-1 w-full font-mono text-xs"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <motion.button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-pill bg-[var(--accent)] px-4 py-2 text-xs font-bold text-black disabled:opacity-50"
          whileTap={{ scale: 0.97 }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save key
        </motion.button>
        <motion.button
          type="button"
          onClick={() => void openFolder()}
          className="inline-flex items-center gap-2 rounded-pill border border-[rgba(255,255,255,0.12)] px-4 py-2 text-xs text-[rgba(240,240,240,0.75)]"
          whileTap={{ scale: 0.97 }}
        >
          <FolderOpen className="h-3.5 w-3.5" /> Open data folder
        </motion.button>
      </div>
    </motion.div>
  );
}
