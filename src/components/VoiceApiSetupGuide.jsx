import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, Info } from 'lucide-react';
import { getJarvis, isElectron } from '@/jarvis-bridge.js';
import { SetupGuideTabs } from '@/components/SetupGuideTabs.jsx';

function LinkButton({ href, children }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-0.5 font-medium text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-2 hover:decoration-[var(--accent)]"
      onClick={() => getJarvis().openExternal(href)}
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
    </button>
  );
}

function Step({ n, title, children }) {
  return (
    <li className="space-y-1.5">
      <p className="font-medium text-[rgba(240,240,240,0.88)]">
        <span className="mr-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-[rgba(0,212,255,0.12)] px-1 font-mono text-[10px] text-[var(--accent)]">
          {n}
        </span>
        {title}
      </p>
      <div className="pl-0 leading-relaxed text-[rgba(240,240,240,0.58)]">{children}</div>
    </li>
  );
}

function Code({ children }) {
  return (
    <code className="mt-1 block break-all rounded bg-[rgba(0,0,0,0.35)] px-2 py-1 font-mono text-[10px] text-[rgba(240,240,240,0.85)] ring-1 ring-[rgba(255,255,255,0.06)]">
      {children}
    </code>
  );
}

function Note({ children, variant = 'info' }) {
  const styles =
    variant === 'warn'
      ? 'border-amber-500/30 bg-amber-500/8 text-amber-100/85'
      : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[rgba(240,240,240,0.62)]';
  return (
    <p className={`flex gap-2 rounded-btn border px-3 py-2 text-[11px] leading-snug ${styles}`}>
      {variant === 'warn' ? (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
      ) : (
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
      )}
      <span>{children}</span>
    </p>
  );
}

/**
 * How to create a Google API key for wake word / Web Speech in Electron.
 * @param {{ layout?: 'accordion' | 'tabs'; defaultOpen?: boolean; maxHeightClass?: string }} props
 */
export function VoiceApiSetupGuide({
  layout = 'accordion',
  defaultOpen = false,
  maxHeightClass = 'max-h-[min(52vh,420px)]',
}) {
  const [userDataPath, setUserDataPath] = useState('');
  const inElectron = isElectron();

  useEffect(() => {
    if (!inElectron) return;
    getJarvis()
      .getRuntimeInfo?.()
      .then((r) => setUserDataPath(String(r?.userDataPath || '').trim()))
      .catch(() => {});
  }, [inElectron]);

  const keyFileHint = userDataPath
    ? `${userDataPath}\\GOOGLE_API_KEY.txt`
    : '%AppData%\\JARVIS\\GOOGLE_API_KEY.txt (installed build; dev uses %LOCALAPPDATA%\\Jarvis-Electron-Dev\\)';

  if (layout === 'tabs') {
    return (
      <SetupGuideTabs
        title="Google voice API"
        subtitle="Required for “Hey Jarvis” in the desktop app — about 5–10 minutes the first time."
        sections={[
          {
            id: 'overview',
            label: 'Overview',
            content: (
              <Note>
                The desktop app does <strong>not</strong> include Google&apos;s built-in speech key (unlike Chrome).
                Chromium reads <code className="text-[10px]">GOOGLE_API_KEY</code> from the environment at startup —
                JARVIS loads it from a <strong>single-line file</strong> next to your other data. Typed AI Chat works
                without this; &quot;Hey Jarvis&quot; does not.
              </Note>
            ),
          },
          {
            id: 'cloud',
            label: 'Cloud project',
            content: (
              <ol className="list-none space-y-4">
                <Step n="1" title="Open Google Cloud Console">
                  Go to{' '}
                  <LinkButton href="https://console.cloud.google.com/">console.cloud.google.com</LinkButton> and sign in
                  with your Google account.
                </Step>
                <Step n="2" title="Create or select a project">
                  Top bar → project dropdown → <strong>New Project</strong> (e.g. <em>JARVIS Voice</em>) →{' '}
                  <strong>Create</strong>. Select that project when it is ready.
                </Step>
                <Step n="3" title="Enable billing (if prompted)">
                  Google may ask you to enable billing before API keys work. Speech has a free tier; set budget alerts
                  under <strong>Billing</strong> → <strong>Budgets &amp; alerts</strong> if you want caps.
                </Step>
                <Step n="4" title="Enable the Speech API">
                  Menu ☰ → <strong>APIs &amp; Services</strong> → <strong>Library</strong>. Search for{' '}
                  <strong>Cloud Speech-to-Text API</strong> → open it → <strong>Enable</strong>.
                </Step>
              </ol>
            ),
          },
          {
            id: 'key',
            label: 'API key',
            content: (
              <ol className="list-none space-y-4">
                <Step n="5" title="Create credentials">
                  <strong>APIs &amp; Services</strong> → <strong>Credentials</strong> →{' '}
                  <strong>Create credentials</strong> → <strong>API key</strong>. Copy the key (starts with{' '}
                  <code className="text-[10px]">AIza</code>).
                </Step>
                <Step n="6" title="Restrict the key (recommended)">
                  Click <strong>Edit API key</strong> → <strong>API restrictions</strong> → Restrict key → select{' '}
                  <strong>Cloud Speech-to-Text API</strong> → Save.
                </Step>
                <Step n="7" title="Save in JARVIS">
                  Paste the key below and click <strong>Save key</strong>, or create a text file with{' '}
                  <strong>only the key on one line</strong> (no quotes) at:
                  <Code>{keyFileHint}</Code>
                  The file name must be exactly <code className="text-[10px]">GOOGLE_API_KEY.txt</code>.
                </Step>
                <Step n="8" title="Restart JARVIS (required)">
                  Fully quit JARVIS (tray → Exit), then open it again. The key is loaded only at startup.
                </Step>
              </ol>
            ),
          },
          {
            id: 'help',
            label: 'Mic & help',
            content: (
              <div className="space-y-4">
                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                    Where is my data folder?
                  </h4>
                  <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    <li>
                      <strong>Installed JARVIS</strong> — <code className="text-[10px]">%AppData%\JARVIS\</code>
                    </li>
                    <li>
                      <strong>Development</strong> — <code className="text-[10px]">%LOCALAPPDATA%\Jarvis-Electron-Dev\</code>
                    </li>
                  </ul>
                </section>
                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                    Microphone (Windows)
                  </h4>
                  <ol className="list-none space-y-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    <li>
                      <strong>Settings → Privacy → Microphone</strong> — access <strong>On</strong>.
                    </li>
                    <li>Allow <strong>desktop apps</strong> to use the microphone.</li>
                    <li>When JARVIS asks, click <strong>Allow</strong>.</li>
                  </ol>
                </section>
                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                    Troubleshooting
                  </h4>
                  <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    <li>
                      <strong>Speech service / network error</strong> — Key missing, API not enabled, or firewall.
                      Restart after adding the file.
                    </li>
                    <li>
                      <strong>Microphone blocked</strong> — Fix Windows privacy; toggle wake word in Settings.
                    </li>
                  </ul>
                </section>
                <Note variant="warn">
                  Never commit your API key to Git. The key stays only on this PC in your JARVIS data folder.
                </Note>
              </div>
            ),
          },
        ]}
      />
    );
  }

  return (
    <details
      open={defaultOpen}
      className="rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] text-xs text-[rgba(240,240,240,0.55)]"
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-[#F0F0F0] hover:bg-[rgba(255,255,255,0.02)]">
        Full guide — Google voice API key (wake word &amp; speech)
      </summary>

      <div className={`jarvis-scrollbar space-y-5 overflow-y-auto px-4 pb-4 ${maxHeightClass}`}>
        <Note>
          The desktop app does <strong>not</strong> include Google&apos;s built-in speech key (unlike Chrome).
          Chromium reads <code className="text-[10px]">GOOGLE_API_KEY</code> from the environment at startup — JARVIS
          loads it from a <strong>single-line file</strong> next to your other data. Typed AI Chat works without this;
          &quot;Hey Jarvis&quot; does not.
        </Note>

        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Part A — Google Cloud project
          </h4>
          <ol className="list-none space-y-4">
            <Step n="1" title="Open Google Cloud Console">
              Go to{' '}
              <LinkButton href="https://console.cloud.google.com/">console.cloud.google.com</LinkButton> and sign in
              with your Google account.
            </Step>
            <Step n="2" title="Create or select a project">
              Top bar → project dropdown → <strong>New Project</strong> (e.g. <em>JARVIS Voice</em>) →{' '}
              <strong>Create</strong>. Select that project when it is ready.
            </Step>
            <Step n="3" title="Enable billing (if prompted)">
              Google may ask you to enable billing before API keys work. Speech has a free tier; set budget alerts under{' '}
              <strong>Billing</strong> → <strong>Budgets &amp; alerts</strong> if you want caps.
            </Step>
            <Step n="4" title="Enable the Speech API">
              Menu ☰ → <strong>APIs &amp; Services</strong> → <strong>Library</strong>. Search for{' '}
              <strong>Cloud Speech-to-Text API</strong> → open it → <strong>Enable</strong>. This covers Google&apos;s
              speech-related services Chromium may call for Web Speech.
            </Step>
          </ol>
        </section>

        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Part B — Create an API key
          </h4>
          <ol className="list-none space-y-4">
            <Step n="5" title="Create credentials">
              <strong>APIs &amp; Services</strong> → <strong>Credentials</strong> → <strong>Create credentials</strong>{' '}
              → <strong>API key</strong>. Copy the key (starts with <code className="text-[10px]">AIza</code>).
            </Step>
            <Step n="6" title="Restrict the key (recommended)">
              Click <strong>Edit API key</strong> → <strong>API restrictions</strong> → Restrict key → select{' '}
              <strong>Cloud Speech-to-Text API</strong> → Save. This limits abuse if the key is ever exposed.
            </Step>
            <Step n="7" title="Save in JARVIS">
              Either paste the key below and click <strong>Save key</strong>, or create a text file with{' '}
              <strong>only the key on one line</strong> (no quotes) at:
              <Code>{keyFileHint}</Code>
              The file name must be exactly <code className="text-[10px]">GOOGLE_API_KEY.txt</code>.
            </Step>
            <Step n="8" title="Restart JARVIS (required)">
              Fully quit JARVIS (tray → Exit, or close all windows), then open it again. The key is loaded only at
              startup. Turn wake word off and on in Settings → General if you already had errors.
            </Step>
          </ol>
        </section>

        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Where is my data folder?
          </h4>
          <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed">
            <li>
              <strong>Installed JARVIS</strong> — <code className="text-[10px]">%AppData%\JARVIS\</code> (same folder as{' '}
              <code className="text-[10px]">presets.json</code>)
            </li>
            <li>
              <strong>Development</strong> (<code className="text-[10px]">npm run dev</code>) —{' '}
              <code className="text-[10px]">%LOCALAPPDATA%\Jarvis-Electron-Dev\</code>
            </li>
          </ul>
        </section>

        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Microphone (Windows)
          </h4>
          <ol className="list-none space-y-3 text-[11px] leading-relaxed text-[rgba(240,240,240,0.55)]">
            <li>
              <strong>Settings → Privacy &amp; security → Microphone</strong> → Microphone access <strong>On</strong>.
            </li>
            <li>
              Allow <strong>desktop apps</strong> to access your microphone.
            </li>
            <li>When JARVIS asks, click <strong>Allow</strong>.</li>
          </ol>
        </section>

        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Troubleshooting
          </h4>
          <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed">
            <li>
              <strong>Speech service / network error</strong> — Key missing, wrong project, API not enabled, or
              firewall blocking Google. Confirm the file exists and restart JARVIS.
            </li>
            <li>
              <strong>Microphone blocked</strong> — Fix Windows privacy settings; toggle wake word in Settings →
              General.
            </li>
            <li>
              <strong>Key works in browser but not JARVIS</strong> — Use the desktop data folder path above, not only
              a browser extension key.
            </li>
          </ul>
        </section>

        <Note variant="warn">
          Never commit your API key to Git or share screenshots of it. The key stays only on this PC in your JARVIS
          data folder.
        </Note>
      </div>
    </details>
  );
}
