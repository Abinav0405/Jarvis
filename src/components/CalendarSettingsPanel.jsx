import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Check, Loader2, Trash2 } from 'lucide-react';
import { getJarvis, isElectron } from '@/jarvis-bridge.js';
import { GoogleCalendarSetupGuide } from '@/components/GoogleCalendarSetupGuide.jsx';

export function CalendarSettingsPanel({ pushToast, onConnectedChange, compact = false }) {
  const inElectron = isElectron();
  const [status, setStatus] = useState({ connected: false, calendarId: '', hasOAuth: false, hasApiKey: false });
  const [apiKey, setApiKey] = useState('');
  const [calendarId, setCalendarId] = useState('primary');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [showOAuth, setShowOAuth] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!inElectron) return;
    const s = await getJarvis().calendarGetStatus?.().catch(() => null);
    if (s) {
      setStatus(s);
      onConnectedChange?.(!!s.connected);
      if (s.calendarId) setCalendarId(s.calendarId);
    }
  }, [inElectron, onConnectedChange]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const save = async () => {
    if (!inElectron) {
      pushToast?.('Connect Google Calendar in the desktop app.', 'info');
      return;
    }
    setBusy(true);
    try {
      await getJarvis().calendarSaveCredentials?.({
        apiKey: apiKey.trim(),
        calendarId: calendarId.trim() || 'primary',
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        refreshToken: refreshToken.trim(),
      });
      const test = await getJarvis().calendarTestConnection?.();
      if (test?.ok) {
        pushToast?.(test.message || 'Calendar connected.', 'success');
        await refreshStatus();
      } else {
        pushToast?.(test?.error || 'Saved, but connection test failed.', 'error');
      }
    } catch (e) {
      pushToast?.(String(e?.message || e), 'error');
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!inElectron) return;
    setBusy(true);
    await getJarvis().calendarRemoveCredentials?.();
    setApiKey('');
    setClientId('');
    setClientSecret('');
    setRefreshToken('');
    await refreshStatus();
    pushToast?.('Calendar disconnected.', 'info');
    setBusy(false);
  };

  if (!inElectron) {
    return (
      <div className="rounded-card border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        <Calendar className="mr-2 inline h-4 w-4" />
        Google Calendar connects in the <strong>desktop app</strong> — open JARVIS on Windows to set it up.
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {status.connected && (
        <motion.div
          className="flex items-center gap-2 rounded-btn border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100/90"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Check className="h-3.5 w-3.5" />
          Connected
          {status.hasOAuth ? ' (OAuth)' : status.hasApiKey ? ' (API key)' : ''}
          {status.calendarId ? ` · ${status.calendarId}` : ''}
        </motion.div>
      )}

      <GoogleCalendarSetupGuide layout={compact ? 'tabs' : 'accordion'} defaultOpen={compact} />

      {!compact && (
        <p className="text-[11px] text-[rgba(240,240,240,0.45)]">
          After you complete the guide, fill in the fields below and click <strong>Save & test</strong>. Your next
          events will appear on the Dashboard under <strong>Schedule</strong>.
        </p>
      )}

      <motion.div className="space-y-3">
        <div>
          <label className="text-xs text-[rgba(240,240,240,0.5)]">Calendar ID</label>
          <input
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            placeholder="primary or your@gmail.com"
            className="jarvis-input mt-1 w-full font-mono text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-[rgba(240,240,240,0.5)]">API key (public calendars)</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
            placeholder="AIza…"
            className="jarvis-input mt-1 w-full font-mono text-xs"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowOAuth((v) => !v)}
          className="text-xs font-medium text-[var(--accent)] underline"
        >
          {showOAuth ? 'Hide' : 'Show'} OAuth fields (Client ID, secret, refresh token)
        </button>
        {!showOAuth && (
          <p className="text-[10px] text-[rgba(240,240,240,0.38)]">
            Private Gmail calendar? Expand OAuth fields — API key alone will not work for a private calendar.
          </p>
        )}
        {showOAuth && (
          <div className="space-y-2 rounded-card border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-3">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="OAuth Client ID"
              className="jarvis-input w-full font-mono text-xs"
            />
            <input
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              type="password"
              placeholder="OAuth Client secret"
              className="jarvis-input w-full font-mono text-xs"
            />
            <input
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              type="password"
              placeholder="Refresh token"
              className="jarvis-input w-full font-mono text-xs"
            />
          </div>
        )}
      </motion.div>

      <div className="flex flex-wrap gap-2">
        <motion.button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-pill bg-[var(--accent)] px-4 py-2 text-xs font-bold text-black disabled:opacity-50"
          whileTap={{ scale: 0.97 }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save & test
        </motion.button>
        {status.connected && (
          <motion.button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="inline-flex items-center gap-2 rounded-pill border border-rose-500/40 px-4 py-2 text-xs text-rose-300/90"
            whileTap={{ scale: 0.97 }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Disconnect
          </motion.button>
        )}
      </div>
    </div>
  );
}
