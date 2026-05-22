import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { getJarvis } from '@/jarvis-bridge.js';
import { GeminiApiSetupGuide } from '@/components/GeminiApiSetupGuide.jsx';

export function GeminiSettingsPanel({ compact = false, initialKey = '', onSaved, pushToast }) {
  const [key, setKey] = useState(initialKey);
  const [status, setStatus] = useState('idle');
  const [hint, setHint] = useState('');

  const saveAndTest = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      pushToast?.('Paste your Gemini API key first.', 'error');
      return;
    }
    setStatus('testing');
    setHint('');
    await getJarvis().geminiSaveApiKey?.(trimmed);
    const r = await getJarvis().geminiTestApiKey?.(trimmed);
    if (r?.ok) {
      setStatus('ok');
      setHint('Key works. Restarting voice core…');
      pushToast?.('Gemini API key saved.', 'success');
      await getJarvis().liveStop?.();
      await getJarvis().liveStart?.();
      onSaved?.(trimmed);
    } else {
      setStatus('err');
      setHint(r?.error || 'Test failed');
      pushToast?.(r?.error || 'Invalid key or API not enabled.', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <GeminiApiSetupGuide compact={compact} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIza…"
          className="jarvis-input flex-1 font-mono text-xs"
        />
        <motion.button
          type="button"
          onClick={() => void saveAndTest()}
          disabled={status === 'testing'}
          className="inline-flex items-center justify-center gap-1 rounded-pill bg-[var(--accent)] px-4 py-2 text-xs font-bold text-black disabled:opacity-50"
          whileTap={{ scale: 0.97 }}
        >
          {status === 'testing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save & test
        </motion.button>
      </div>
      {status === 'ok' && (
        <p className="flex items-center gap-1 text-xs text-emerald-400">
          <Check className="h-3.5 w-3.5" /> {hint || 'Connected'}
        </p>
      )}
      {status === 'err' && hint ? <p className="text-xs text-amber-300/90">{hint}</p> : null}
    </div>
  );
}
