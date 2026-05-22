import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, Info } from 'lucide-react';
import { getJarvis, isElectron } from '@/jarvis-bridge.js';
import { SetupGuideTabs } from '@/components/SetupGuideTabs.jsx';

const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

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
    <code className="block break-all rounded bg-[rgba(0,0,0,0.35)] px-2 py-1 font-mono text-[10px] text-[rgba(240,240,240,0.85)] ring-1 ring-[rgba(255,255,255,0.06)]">
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
 * Step-by-step Google Calendar API setup for JARVIS (OAuth recommended).
 * @param {{ layout?: 'accordion' | 'tabs'; defaultOpen?: boolean; maxHeightClass?: string }} props
 */
export function GoogleCalendarSetupGuide({
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

  const credFileHint = userDataPath
    ? `${userDataPath}\\google-calendar.json`
    : '%AppData%\\JARVIS\\google-calendar.json (or %LOCALAPPDATA%\\Jarvis-Electron-Dev\\ when running npm run dev)';

  const methodTable = (
    <div className="overflow-hidden rounded-btn border border-[var(--border-subtle)]">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--glass-bg)]">
            <th className="px-2 py-1.5 font-medium text-[var(--text-primary)]">Method</th>
            <th className="px-2 py-1.5 font-medium text-[var(--text-primary)]">Best for</th>
            <th className="px-2 py-1.5 font-medium text-[var(--text-primary)]">Difficulty</th>
          </tr>
        </thead>
        <tbody className="text-[var(--text-muted)]">
          <tr className="border-b border-[var(--border-subtle)]">
            <td className="px-2 py-1.5 font-medium text-emerald-600 dark:text-emerald-200/90">OAuth (recommended)</td>
            <td className="px-2 py-1.5">Private Gmail / Google Calendar</td>
            <td className="px-2 py-1.5">Medium — Cloud + OAuth tabs</td>
          </tr>
          <tr>
            <td className="px-2 py-1.5">API key only</td>
            <td className="px-2 py-1.5">A calendar set to <strong>public</strong></td>
            <td className="px-2 py-1.5">Easier — Cloud + API key tabs</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  if (layout === 'tabs') {
    return (
      <SetupGuideTabs
        title="Google Calendar"
        subtitle="Read-only access for Dashboard events — about 10–15 minutes the first time."
        sections={[
          {
            id: 'overview',
            label: 'Overview',
            content: (
              <div className="space-y-4">
                <Note>
                  JARVIS only <strong>reads</strong> your calendar (upcoming events). It never creates or edits events.
                  You need a free Google account.
                </Note>
                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                    Which method?
                  </h4>
                  {methodTable}
                </section>
              </div>
            ),
          },
          {
            id: 'cloud',
            label: 'Cloud',
            content: (
              <ol className="list-none space-y-4">
                <Step n="1" title="Open Google Cloud Console">
                  Go to{' '}
                  <LinkButton href="https://console.cloud.google.com/">console.cloud.google.com</LinkButton> and sign in
                  with the <strong>same Google account</strong> as your calendar.
                </Step>
                <Step n="2" title="Create a project">
                  Top bar → <strong>New Project</strong> (e.g. <em>JARVIS Calendar</em>) → <strong>Create</strong> →
                  select it.
                </Step>
                <Step n="3" title="Enable the Calendar API">
                  <strong>APIs & Services</strong> → <strong>Library</strong> → <strong>Google Calendar API</strong> →{' '}
                  <strong>Enable</strong>.
                </Step>
                <Step n="4" title="OAuth consent screen (OAuth only)">
                  <strong>OAuth consent screen</strong> → External → app name <em>JARVIS</em> → add scope{' '}
                  <code className="text-[10px]">calendar.readonly</code> → add your Gmail under <strong>Test users</strong>.
                </Step>
              </ol>
            ),
          },
          {
            id: 'oauth',
            label: 'OAuth',
            content: (
              <ol className="list-none space-y-4">
                <Step n="5" title="Create OAuth client ID">
                  <strong>Credentials</strong> → <strong>OAuth client ID</strong> → <strong>Desktop app</strong> → copy
                  Client ID and secret.
                </Step>
                <Step n="6" title="OAuth Playground">
                  Open{' '}
                  <LinkButton href="https://developers.google.com/oauthplayground/">OAuth 2.0 Playground</LinkButton> →
                  gear icon → use your credentials.
                </Step>
                <Step n="7" title="Authorize read-only scope">
                  Select scope:
                  <Code>{CALENDAR_READONLY_SCOPE}</Code>
                  → <strong>Authorize APIs</strong> → allow access.
                </Step>
                <Step n="8" title="Refresh token">
                  <strong>Exchange authorization code for tokens</strong> → copy <strong>Refresh token</strong>.
                </Step>
                <Step n="9" title="Paste into JARVIS">
                  Calendar ID = <code className="text-[10px]">primary</code> → expand OAuth fields → paste tokens →{' '}
                  <strong>Save & test</strong>.
                </Step>
              </ol>
            ),
          },
          {
            id: 'apikey',
            label: 'API key',
            content: (
              <ol className="list-none space-y-4">
                <Step n="A" title="Make calendar public">
                  <LinkButton href="https://calendar.google.com/">Google Calendar</LinkButton> → Settings → your
                  calendar → <strong>Make available to public</strong> (see all event details).
                </Step>
                <Step n="B" title="Create API key">
                  Cloud Console → <strong>API key</strong> → restrict to <strong>Google Calendar API</strong>.
                </Step>
                <Step n="C" title="Calendar ID">
                  Settings → <strong>Integrate calendar</strong> → copy Calendar ID → paste in JARVIS with API key.
                </Step>
              </ol>
            ),
          },
          {
            id: 'help',
            label: 'Help',
            content: (
              <div className="space-y-4">
                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                    Troubleshooting
                  </h4>
                  <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    <li>
                      <strong>403</strong> — Calendar API not enabled or wrong account.
                    </li>
                    <li>
                      <strong>404</strong> — Wrong Calendar ID; try <code className="text-[10px]">primary</code>.
                    </li>
                    <li>
                      <strong>401</strong> — Regenerate refresh token in OAuth Playground.
                    </li>
                  </ul>
                </section>
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                  Credentials stay on this PC only:
                  <Code>{credFileHint}</Code>
                </p>
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
        Full setup guide — Google Calendar (read-only)
      </summary>

      <div className={`jarvis-scrollbar space-y-5 overflow-y-auto px-4 pb-4 ${maxHeightClass}`}>
        <Note>
          JARVIS only <strong>reads</strong> your calendar (upcoming events on the Dashboard). It never creates or
          edits events. You need a free Google account and about 10–15 minutes the first time.
        </Note>

        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Which method should I use?
          </h4>
          <div className="overflow-hidden rounded-btn border border-[rgba(255,255,255,0.06)]">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)]">
                  <th className="px-2 py-1.5 font-medium text-[rgba(240,240,240,0.7)]">Method</th>
                  <th className="px-2 py-1.5 font-medium text-[rgba(240,240,240,0.7)]">Best for</th>
                  <th className="px-2 py-1.5 font-medium text-[rgba(240,240,240,0.7)]">Difficulty</th>
                </tr>
              </thead>
              <tbody className="text-[rgba(240,240,240,0.55)]">
                <tr className="border-b border-[rgba(255,255,255,0.04)]">
                  <td className="px-2 py-1.5 font-medium text-emerald-200/90">OAuth (recommended)</td>
                  <td className="px-2 py-1.5">Your normal Gmail / Google Calendar (private)</td>
                  <td className="px-2 py-1.5">Medium — follow Part A + B below</td>
                </tr>
                <tr>
                  <td className="px-2 py-1.5">API key only</td>
                  <td className="px-2 py-1.5">A calendar you set to <strong>public</strong> on the web</td>
                  <td className="px-2 py-1.5">Easier — Part A + C only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* —— Part A: Google Cloud —— */}
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Part A — Google Cloud project (both methods)
          </h4>
          <ol className="list-none space-y-4">
            <Step n="1" title="Open Google Cloud Console">
              Go to{' '}
              <LinkButton href="https://console.cloud.google.com/">console.cloud.google.com</LinkButton> and sign in
              with the <strong>same Google account</strong> whose calendar you want in JARVIS.
            </Step>
            <Step n="2" title="Create a project">
              Top bar → project dropdown → <strong>New Project</strong>. Name it e.g.{' '}
              <em>JARVIS Calendar</em> → <strong>Create</strong>. Wait until it finishes, then select that project in
              the dropdown.
            </Step>
            <Step n="3" title="Enable the Calendar API">
              Menu ☰ → <strong>APIs & Services</strong> → <strong>Library</strong>. Search{' '}
              <strong>Google Calendar API</strong> → open it → <strong>Enable</strong>. If it already says
              &quot;Manage&quot;, it is enabled.
            </Step>
            <Step n="4" title="Configure OAuth consent screen (OAuth method only)">
              <strong>APIs & Services</strong> → <strong>OAuth consent screen</strong>. User type:{' '}
              <strong>External</strong> → Create. App name: <em>JARVIS</em> (or any name). User support email: your
              email. Developer contact: your email → <strong>Save and Continue</strong>. On <strong>Scopes</strong>{' '}
              → Add scope → filter <em>calendar</em> → select{' '}
              <code className="text-[10px]">.../auth/calendar.readonly</code> → Add → Save and Continue. On{' '}
              <strong>Test users</strong> → <strong>Add users</strong> → add your Gmail address → Save. (While the
              app is in &quot;Testing&quot;, only test users can authorize — that is you.)
            </Step>
          </ol>
        </section>

        {/* —— Part B: OAuth —— */}
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Part B — OAuth credentials (private calendar — recommended)
          </h4>
          <ol className="list-none space-y-4">
            <Step n="5" title="Create OAuth client ID">
              <strong>APIs & Services</strong> → <strong>Credentials</strong> → <strong>Create credentials</strong>{' '}
              → <strong>OAuth client ID</strong>. Application type: <strong>Desktop app</strong>. Name:{' '}
              <em>JARVIS Desktop</em> → <strong>Create</strong>. Copy the <strong>Client ID</strong> and{' '}
              <strong>Client secret</strong> — you will paste them into JARVIS below.
            </Step>
            <Step n="6" title="Open OAuth Playground">
              In a browser, open{' '}
              <LinkButton href="https://developers.google.com/oauthplayground/">
                Google OAuth 2.0 Playground
              </LinkButton>
              .
            </Step>
            <Step n="7" title="Use your own OAuth credentials in the Playground">
              Click the <strong>gear icon</strong> (OAuth 2.0 configuration) on the right. Check{' '}
              <strong>Use your own OAuth credentials</strong>. Paste your <strong>Client ID</strong> and{' '}
              <strong>Client secret</strong> from step 5 → <strong>Close</strong>.
            </Step>
            <Step n="8" title="Select the Calendar read-only scope">
              In the left panel under <strong>Step 1</strong>, scroll to <strong>Google Calendar API v3</strong> and
              tick:
              <Code>{CALENDAR_READONLY_SCOPE}</Code>
              (Or paste that URL into the input at the bottom of the list and click <strong>Authorize APIs</strong>.)
            </Step>
            <Step n="9" title="Authorize with Google">
              Click <strong>Authorize APIs</strong>. Sign in if asked. If you see &quot;Google hasn&apos;t verified
              this app&quot; → <strong>Advanced</strong> → <strong>Go to JARVIS (unsafe)</strong> — normal for your own
              project in Testing mode. Allow access to view your calendars.
            </Step>
            <Step n="10" title="Exchange for refresh token">
              After authorization, <strong>Step 2</strong> on the Playground shows an authorization code. Click{' '}
              <strong>Exchange authorization code for tokens</strong>. In the response on the right, copy the{' '}
              <strong>Refresh token</strong> (long string). Keep it secret — it lets JARVIS read your calendar until
              you revoke it.
            </Step>
            <Step n="11" title="Paste into JARVIS">
              Below in this panel: Calendar ID = <code className="text-[10px]">primary</code> (your main calendar) or
              your Gmail address. Expand <strong>OAuth fields</strong> and paste Client ID, Client secret, and Refresh
              token → <strong>Save & test</strong>.
            </Step>
          </ol>
          <Note variant="warn">
            If <strong>Save & test</strong> fails with &quot;invalid_grant&quot;, generate a new refresh token (steps
            8–10). Refresh tokens can expire if revoked in{' '}
            <LinkButton href="https://myaccount.google.com/permissions">Google Account permissions</LinkButton>.
          </Note>
        </section>

        {/* —— Part C: API key —— */}
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Part C — API key (public calendar only)
          </h4>
          <ol className="list-none space-y-4">
            <Step n="A" title="Make the calendar public">
              Open{' '}
              <LinkButton href="https://calendar.google.com/">Google Calendar</LinkButton> → Settings → your calendar
              → <strong>Access permissions for events</strong> → enable <strong>Make available to public</strong> →
              See all event details → OK. (Most school/work calendars cannot be public — use OAuth instead.)
            </Step>
            <Step n="B" title="Create an API key">
              Cloud Console → <strong>Credentials</strong> → <strong>Create credentials</strong> →{' '}
              <strong>API key</strong>. Copy the key. Click <strong>Edit API key</strong> → Application restrictions:{' '}
              None (desktop app) → API restrictions: restrict to <strong>Google Calendar API</strong> → Save.
            </Step>
            <Step n="C" title="Find your Calendar ID">
              Calendar → Settings → your calendar → scroll to <strong>Integrate calendar</strong> → copy{' '}
              <strong>Calendar ID</strong> (often your email or a long <code className="text-[10px]">@group.calendar.google.com</code>{' '}
              string). Paste Calendar ID + API key in JARVIS → <strong>Save & test</strong>. Leave OAuth fields empty.
            </Step>
          </ol>
        </section>

        {/* —— Troubleshooting —— */}
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Troubleshooting
          </h4>
          <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed">
            <li>
              <strong>403 / Access not configured</strong> — Calendar API not enabled (Part A step 3) or wrong Google
              account.
            </li>
            <li>
              <strong>404 / Not Found</strong> — Wrong Calendar ID. Try <code className="text-[10px]">primary</code>{' '}
              or copy ID from Calendar settings.
            </li>
            <li>
              <strong>401 / Invalid credentials</strong> — API key wrong, or refresh token expired; redo Part B steps
              8–10.
            </li>
            <li>
              <strong>Events empty but connected</strong> — Check you have upcoming events in the next 7 days on that
              calendar.
            </li>
            <li>
              <strong>Playground won&apos;t authorize</strong> — Add your Gmail under OAuth consent screen → Test users
              (Part A step 4).
            </li>
          </ul>
        </section>

        <section className="border-t border-[rgba(255,255,255,0.06)] pt-3">
          <p className="text-[10px] leading-relaxed text-[rgba(240,240,240,0.38)]">
            Credentials are saved only on this PC at:
            <br />
            <code className="mt-1 block break-all text-[rgba(240,240,240,0.5)]">{credFileHint}</code>
            They are not uploaded to any JARVIS server. Disconnect anytime with <strong>Disconnect</strong> below.
          </p>
        </section>
      </div>
    </details>
  );
}
