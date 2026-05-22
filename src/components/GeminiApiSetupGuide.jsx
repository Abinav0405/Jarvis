import { ExternalLink } from 'lucide-react';
import { getJarvis } from '@/jarvis-bridge.js';

/** Setup copy for Gemini API key from Google AI Studio. */
export function GeminiApiSetupGuide({ compact = false }) {
  return (
    <div className={`space-y-3 text-[11px] leading-relaxed text-[var(--text-muted)] ${compact ? '' : 'max-w-lg'}`}>
      <ol className="list-decimal space-y-2 pl-4">
        <li>
          Open{' '}
          <button
            type="button"
            className="font-medium text-[var(--accent)] underline"
            onClick={() => getJarvis().openExternal('https://aistudio.google.com/apikey')}
          >
            Google AI Studio — API keys
            <ExternalLink className="ml-0.5 inline h-3 w-3" />
          </button>
        </li>
        <li>Sign in with your Google account.</li>
        <li>
          Click <strong>Create API key</strong> → choose a project (or create one) → copy the key (starts with{' '}
          <code className="text-[10px]">AIza</code>).
        </li>
        <li>Paste it below and click <strong>Save & test</strong>.</li>
        <li>
          Enable the <strong>Gemini API</strong> on that project if prompted (Cloud Console → APIs & Services →
          Library).
        </li>
      </ol>
      <p className="rounded-btn border border-[var(--border-subtle)] bg-[var(--glass-bg)] px-3 py-2">
        This key powers the <strong>live voice core</strong> (hear + speak). It stays on this PC in your JARVIS settings
        file — never commit it to Git.
      </p>
    </div>
  );
}
