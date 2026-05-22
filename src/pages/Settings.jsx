import { useEffect, useMemo, useState } from 'react';
import { getJarvis } from '@/jarvis-bridge.js';
import { AnimatePresence, motion } from 'framer-motion';
import { publicAsset } from '@/utils/publicAsset.js';
import { WeatherLocationPicker } from '@/components/WeatherLocationPicker.jsx';
import { AboutComputerPanel } from '@/components/AboutComputerPanel.jsx';
import { CreatorAttribution } from '@/components/CreatorAttribution.jsx';
import { VoiceSettingsPanel } from '@/components/VoiceSettingsPanel.jsx';
import { applyThemeToDocument, THEME_LIST } from '@/utils/themes.js';
import { applyAppearanceToDocument, APPEARANCE_DEFAULTS } from '@/utils/appearance.js';
import { applyColorModeToDocument, COLOR_MODE_LIST } from '@/utils/colorMode.js';
import { GeminiSettingsPanel } from '@/components/GeminiSettingsPanel.jsx';
import { VoiceLanguageSelect } from '@/components/VoiceLanguageSelect.jsx';

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'computer', label: 'This PC' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'about', label: 'About' },
];

const SWATCHES = ['#00D4FF', '#A855F7', '#22C55E', '#FB923C', '#F472B6', '#F5F5F5'];

/** Same pill treatment as Dashboard quick actions — preview only, same tokens as the rest of the app. */
const previewPillClass =
  'jarvis-interactive flex items-center gap-2 rounded-pill border px-4 py-2.5 text-sm font-medium text-[#F0F0F0] backdrop-blur-glass transition-shadow hover:shadow-glow border-[color:var(--glass-border)] bg-[color:var(--glass-bg)]';

function toAccelerator(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  let key = e.key;
  if (key === ' ') key = 'Space';
  if (key.length === 1) key = key.toUpperCase();
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;
  if (key === 'ArrowUp') key = 'Up';
  if (key === 'ArrowDown') key = 'Down';
  if (key === 'ArrowLeft') key = 'Left';
  if (key === 'ArrowRight') key = 'Right';
  parts.push(key);
  return parts.join('+');
}

export function Settings({ data, persist, refresh, pushToast }) {
  const [section, setSection] = useState('general');
  const [recording, setRecording] = useState(false);
  const [appVersion, setAppVersion] = useState('1.0.0');

  useEffect(() => {
    getJarvis()
      .getRuntimeInfo?.()
      .then((info) => {
        if (info?.version) setAppVersion(String(info.version));
      })
      .catch(() => {});
  }, []);

  const presets = Array.isArray(data.presets) ? data.presets : [];

  const fontSliderIndex = useMemo(() => {
    const map = [0.9, 1, 1.12];
    const cur = Number(data.settings?.fontScale ?? 1);
    return map.reduce((best, s, i, arr) => (Math.abs(s - cur) < Math.abs(arr[best] - cur) ? i : best), 1);
  }, [data.settings?.fontScale]);

  useEffect(() => {
    applyThemeToDocument(data.settings?.theme || null, data.settings?.accentColor);
  }, [data.settings?.theme, data.settings?.accentColor]);

  useEffect(() => {
    applyAppearanceToDocument(data.settings || {});
  }, [
    data.settings?.uiDensity,
    data.settings?.panelOpacity,
    data.settings?.accentGlow,
    data.settings?.cornerStyle,
    data.settings?.reduceMotion,
    data.settings?.sidebarCompact,
  ]);

  const setSetting = (patch) => {
    persist((d) => ({
      ...d,
      settings: { ...d.settings, ...patch },
    }));
  };

  const onStartupToggle = async (v) => {
    setSetting({ startupWithWindows: v });
    await getJarvis().setStartup(v);
  };

  useEffect(() => {
    if (!recording) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const acc = toAccelerator(e);
      if (!acc) return;
      getJarvis()
        .setMainHotkey(acc)
        .then(() => {
          setRecording(false);
          refresh?.();
          pushToast(`Hotkey saved: ${acc}`, 'success');
        });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, pushToast, refresh]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-[160px] shrink-0 border-r border-[rgba(255,255,255,0.07)] px-3 py-6">
        <nav className="space-y-1">
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`relative flex w-full rounded-btn px-3 py-2 text-left text-sm font-medium ${
                  active ? 'text-[var(--accent)]' : 'text-[rgba(240,240,240,0.65)] hover:text-[#F0F0F0]'
                }`}
              >
                {active && (
                  <span className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_12px_rgba(0,212,255,0.45)]" />
                )}
                <span className="relative">{s.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="min-h-0 flex-1 overflow-y-auto jarvis-scrollbar px-8 py-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="mx-auto max-w-xl space-y-5"
          >
            {section === 'general' && (
              <>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">General</h2>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Your name</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Used in the dashboard greeting and when JARVIS addresses you.
                  </p>
                  <input
                    key={`name-${data.settings?.userName ?? ''}`}
                    className="jarvis-input mt-2"
                    placeholder="e.g. Abinav"
                    defaultValue={data.settings?.userName || ''}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      setSetting({ userName: name });
                      if (name) pushToast?.('Name updated.', 'success');
                    }}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Gemini voice core</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Live conversation powered by{' '}
                    <button
                      type="button"
                      className="text-[var(--accent)] underline"
                      onClick={() => getJarvis().openExternal('https://aistudio.google.com/apikey')}
                    >
                      Google AI Studio
                    </button>
                    . Required for the arc reactor on the Dashboard.
                  </p>
                  <div className="mt-3">
                    <GeminiSettingsPanel
                      initialKey={data.settings?.geminiApiKey || ''}
                      onSaved={(k) => {
                        setSetting({ geminiApiKey: k, voiceMode: 'live' });
                        refresh?.();
                      }}
                      pushToast={pushToast}
                    />
                  </div>
                  <div className="mt-4">
                    <p className="text-sm font-medium text-[var(--text-primary)]">Voice language</p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      JARVIS will speak and reply in this language. Stops random switches (e.g. to Japanese) unless you
                      pick that language here or ask for it in chat.
                    </p>
                    <VoiceLanguageSelect
                      className="mt-2"
                      value={data.settings?.preferredLanguage || 'en'}
                      onChange={(code) => {
                        setSetting({ preferredLanguage: code });
                        pushToast?.('Voice language updated. Restart voice or send a message to apply.', 'info');
                        void getJarvis().liveStop?.().then(() => getJarvis().liveStart?.());
                      }}
                    />
                  </div>
                </div>
                <ToggleRow
                  label="Launch JARVIS on Windows startup"
                  checked={!!data.settings?.startupWithWindows}
                  onChange={onStartupToggle}
                />
                <div>
                  <p className="text-sm text-[rgba(240,240,240,0.55)]">Default preset on launch</p>
                  <select
                    className="jarvis-input mt-2"
                    value={data.settings?.defaultPresetOnLaunch || ''}
                    onChange={(e) => setSetting({ defaultPresetOnLaunch: e.target.value || null })}
                  >
                    <option value="">None</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <ToggleRow
                  label="Log activity"
                  checked={data.settings?.logActivity !== false}
                  onChange={(v) => setSetting({ logActivity: v })}
                />
                <ToggleRow
                  label='Voice wake word ("Hey Jarvis")'
                  description='Legacy wake word (optional): say “Hey Jarvis” or “Jarvis” when voice mode is set to legacy in data. Prefer the Gemini voice core on the dashboard. For legacy wake, add GOOGLE_API_KEY.txt in your JARVIS data folder and restart.'
                  checked={data.settings?.wakeWordEnabled !== false}
                  onChange={(v) => {
                    if (v) {
                      setSetting({ wakeWordEnabled: true, voiceWakeUnavailable: null });
                      pushToast?.('Wake word re-enabled. Restart JARVIS if you changed microphone or API settings.', 'info');
                    } else {
                      setSetting({ wakeWordEnabled: false });
                    }
                  }}
                />
                {data.settings?.voiceWakeUnavailable === 'mic' && (
                  <p className="rounded-btn border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-100/90">
                    Microphone was blocked. Open Windows Settings → Privacy &amp; security → Microphone, allow desktop
                    apps and JARVIS, then turn this toggle off and on again.
                  </p>
                )}
                {data.settings?.voiceWakeUnavailable === 'speech' && (
                  <p className="rounded-btn border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90">
                    Google speech service is unavailable. Add GOOGLE_API_KEY.txt in your JARVIS data folder, restart
                    JARVIS, then turn wake word off and on. Use the dashboard voice core for conversation.
                  </p>
                )}
                <div className="rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
                  <p className="mb-1 text-sm font-medium text-[#F0F0F0]">Google speech API (wake word)</p>
                  <p className="mb-3 text-[11px] text-[rgba(240,240,240,0.4)]">
                    Expand the guide for step-by-step Cloud Console instructions. Save your key, restart JARVIS, then
                    use the wake word toggle above.
                  </p>
                  <VoiceSettingsPanel pushToast={pushToast} />
                </div>
                <div>
                  <p className="text-sm text-[rgba(240,240,240,0.55)]">Custom search base URL</p>
                  <input
                    key={data.settings?.customSearchUrl || ''}
                    className="jarvis-input mt-2 font-mono text-xs"
                    placeholder="https://example.com/search?q="
                    defaultValue={data.settings?.customSearchUrl || ''}
                    onBlur={(e) => setSetting({ customSearchUrl: e.target.value.trim() })}
                  />
                  <p className="mt-1 text-[11px] text-[rgba(240,240,240,0.35)]">
                    Used when Quick Search engine is set to Custom. Append query directly after this string.
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[rgba(240,240,240,0.55)]">Dashboard weather location</p>
                  <WeatherLocationPicker
                    value={data.settings?.weatherCity || 'London'}
                    onChange={(city) => setSetting({ weatherCity: city })}
                    pushToast={pushToast}
                  />
                </div>
                <ToggleRow
                  label="Focus mode on Study preset"
                  description="Blocks distracting sites when Study launches (planned)."
                  checked={false}
                  onChange={() => pushToast('Site blocking for Study preset is planned for a future update.', 'info')}
                />
              </>
            )}

            {section === 'computer' && (
              <>
                <h2 className="text-xl font-semibold text-[#F0F0F0]">About this PC</h2>
                <p className="text-sm text-[rgba(240,240,240,0.45)]">
                  Hardware and system details from this machine.
                </p>
                <AboutComputerPanel />
              </>
            )}

            {section === 'appearance' && (
              <>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">Appearance</h2>
                <motion.div>
                  <p className="text-sm text-[var(--text-muted)]">Color mode</p>
                  <div className="mt-2 flex max-w-md gap-2">
                    {COLOR_MODE_LIST.map((m) => {
                      const active = (data.settings?.colorMode || 'dark') === m.id;
                      return (
                        <motion.button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            applyColorModeToDocument(m.id);
                            setSetting({ colorMode: m.id });
                            applyAppearanceToDocument({ ...data.settings, colorMode: m.id });
                          }}
                          className={`flex-1 rounded-card border px-3 py-2.5 text-sm font-medium ${
                            active
                              ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.08)] text-[var(--accent)]'
                              : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                          }`}
                          whileTap={{ scale: 0.98 }}
                        >
                          {m.label}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
                <motion.div>
                  <p className="text-sm text-[var(--text-muted)]">Theme</p>
                  <p className="mt-1 text-[11px] text-[rgba(240,240,240,0.35)]">
                    Presets override accent swatches until you pick a custom color.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {THEME_LIST.map((t) => {
                      const active = (data.settings?.theme || 'arc-reactor') === t.id;
                      return (
                        <motion.button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            applyThemeToDocument(t.id, null);
                            setSetting({ theme: t.id, accentColor: t.accent });
                          }}
                          className={`rounded-card border p-3 text-left transition-colors ${
                            active
                              ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.08)]'
                              : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)]'
                          }`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className="mb-2 flex gap-1">
                            {t.swatch.map((c) => (
                              <span
                                key={c}
                                className="h-5 w-5 rounded-full border border-[rgba(255,255,255,0.15)]"
                                style={{ background: c }}
                              />
                            ))}
                          </div>
                          <p className="text-sm font-medium text-[#F0F0F0]">{t.label}</p>
                          <p className="mt-0.5 text-[10px] text-[rgba(240,240,240,0.4)]">{t.description}</p>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
                <div>
                  <p className="text-sm text-[rgba(240,240,240,0.55)]">Accent color</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SWATCHES.map((c) => (
                      <motion.button
                        key={c}
                        type="button"
                        onClick={() => {
                          applyThemeToDocument(null, c);
                          setSetting({ theme: null, accentColor: c });
                        }}
                        className={`h-9 w-9 rounded-full border ${
                          (data.settings?.accentColor || '#00D4FF').toLowerCase() === c.toLowerCase()
                            ? 'border-white ring-2 ring-[var(--accent)]'
                            : 'border-[rgba(255,255,255,0.12)]'
                        }`}
                        style={{ background: c }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="font-mono text-xs text-[rgba(240,240,240,0.45)]">Custom</span>
                    <input
                      className="jarvis-input max-w-[200px] font-mono text-xs"
                      defaultValue={data.settings?.accentColor || '#00D4FF'}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return;
                        applyThemeToDocument(null, v);
                        setSetting({ theme: null, accentColor: v });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-[rgba(240,240,240,0.55)]">Font size</p>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={1}
                    className="mt-2 w-full accent-[var(--accent)]"
                    value={fontSliderIndex}
                    onChange={(e) => {
                      const map = [0.9, 1, 1.12];
                      const v = map[Number(e.target.value)];
                      document.documentElement.style.setProperty('--font-scale', String(v));
                      setSetting({ fontScale: v });
                    }}
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-[rgba(240,240,240,0.35)]">
                    <span>Small</span>
                    <span>Medium</span>
                    <span>Large</span>
                  </div>
                </div>
                <AppearanceSubheading>Layout &amp; spacing</AppearanceSubheading>
                <PillSelect
                  label="UI density"
                  description="Comfortable keeps default spacing; Compact tightens panels and controls."
                  value={data.settings?.uiDensity ?? APPEARANCE_DEFAULTS.uiDensity}
                  options={[
                    { id: 'comfortable', label: 'Comfortable' },
                    { id: 'compact', label: 'Compact' },
                  ]}
                  onChange={(uiDensity) => {
                    setSetting({ uiDensity });
                    applyAppearanceToDocument({ ...data.settings, uiDensity });
                  }}
                />
                <PillSelect
                  label="Corner style"
                  value={data.settings?.cornerStyle ?? APPEARANCE_DEFAULTS.cornerStyle}
                  options={[
                    { id: 'rounded', label: 'Rounded' },
                    { id: 'sharp', label: 'Sharp' },
                  ]}
                  onChange={(cornerStyle) => {
                    setSetting({ cornerStyle });
                    applyAppearanceToDocument({ ...data.settings, cornerStyle });
                  }}
                />
                <ToggleRow
                  label="Compact sidebar"
                  description="Icon-only navigation — labels hidden."
                  checked={!!data.settings?.sidebarCompact}
                  onChange={(sidebarCompact) => {
                    setSetting({ sidebarCompact });
                    applyAppearanceToDocument({ ...data.settings, sidebarCompact });
                  }}
                />

                <AppearanceSubheading>Glass &amp; glow</AppearanceSubheading>
                <SliderField
                  label="Panel glass opacity"
                  hint={`${Math.round((Number(data.settings?.panelOpacity ?? APPEARANCE_DEFAULTS.panelOpacity) || 0.04) * 100)}%`}
                  min={2}
                  max={12}
                  step={1}
                  value={Math.round((Number(data.settings?.panelOpacity ?? APPEARANCE_DEFAULTS.panelOpacity) || 0.04) * 100)}
                  onChange={(pct) => {
                    const panelOpacity = pct / 100;
                    setSetting({ panelOpacity });
                    applyAppearanceToDocument({ ...data.settings, panelOpacity });
                  }}
                  ticks={['Subtle', '', 'Bold']}
                />
                <PillSelect
                  label="Accent glow"
                  description="Glow around accent buttons and highlights."
                  value={data.settings?.accentGlow ?? APPEARANCE_DEFAULTS.accentGlow}
                  options={[
                    { id: 'off', label: 'Off' },
                    { id: 'subtle', label: 'Subtle' },
                    { id: 'strong', label: 'Strong' },
                  ]}
                  onChange={(accentGlow) => {
                    setSetting({ accentGlow });
                    applyAppearanceToDocument({ ...data.settings, accentGlow });
                  }}
                />
                <ToggleRow
                  label="Hologram effects"
                  description="Arc-reactor pulse when presets launch or JARVIS comes online."
                  checked={data.settings?.hologramEffects !== false}
                  onChange={(hologramEffects) => setSetting({ hologramEffects })}
                />

                <AppearanceSubheading>Motion &amp; startup</AppearanceSubheading>
                <ToggleRow
                  label="Reduce motion"
                  description="Minimizes animations. Also follows Windows reduced-motion when set in system settings."
                  checked={!!data.settings?.reduceMotion}
                  onChange={(reduceMotion) => {
                    setSetting({ reduceMotion });
                    applyAppearanceToDocument({ ...data.settings, reduceMotion });
                  }}
                />
                <ToggleRow
                  label="Boot animation"
                  description="Play the JARVIS startup sequence when the app opens."
                  checked={data.settings?.bootAnimationEnabled !== false}
                  onChange={(bootAnimationEnabled) => setSetting({ bootAnimationEnabled })}
                />

                <AppearanceSubheading>Window</AppearanceSubheading>
                <div>
                  <p className="text-sm text-[rgba(240,240,240,0.55)]">Window opacity</p>
                  <input
                    type="range"
                    min={60}
                    max={100}
                    className="mt-2 w-full accent-[var(--accent)]"
                    value={Math.round((data.settings?.windowOpacity ?? 1) * 100)}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      getJarvis().setWindowOpacity(v);
                      setSetting({ windowOpacity: v });
                    }}
                  />
                </div>
                <ToggleRow
                  label="Fullscreen"
                  description="Fill the entire display (frameless edge-to-edge). Turn off to return to the floating 900×620 window."
                  checked={!!data.settings?.fullscreen}
                  onChange={(v) => {
                    getJarvis().setFullScreen(v);
                    setSetting({ fullscreen: v });
                  }}
                />

                <AppearanceSubheading>Preview</AppearanceSubheading>
                <div
                  className="rounded-card border p-4 backdrop-blur-glass"
                  style={{
                    borderColor: 'var(--glass-border)',
                    background: 'var(--glass-bg)',
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
                    Live preview
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[#F0F0F0]">
                    Theme, density, corners, and glass settings apply here and across JARVIS.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 pointer-events-none" aria-hidden>
                    <span className={previewPillClass}>Outline</span>
                    <span className="inline-flex rounded-btn bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-black shadow-glow">
                      Accent
                    </span>
                  </div>
                </div>
              </>
            )}

            {section === 'hotkeys' && (
              <>
                <h2 className="text-xl font-semibold text-[#F0F0F0]">Hotkeys</h2>
                <div className="overflow-hidden rounded-card border border-[rgba(255,255,255,0.08)]">
                  <HotRow
                    label="Summon JARVIS"
                    value={data.settings?.mainHotkey || 'Control+Shift+Space'}
                    action={
                      <motion.button
                        type="button"
                        onClick={() => setRecording(true)}
                        className="rounded-btn border border-[rgba(255,255,255,0.1)] px-3 py-1 text-xs font-semibold text-[var(--accent)]"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        Edit
                      </motion.button>
                    }
                  />
                  {recording && (
                    <div className="border-t border-[rgba(255,255,255,0.06)] bg-[rgba(0,212,255,0.06)] px-4 py-3 text-xs font-mono text-[var(--accent)]">
                      Press your shortcut…
                    </div>
                  )}
                  <HotRow label="Close JARVIS" value="Esc" />
                  <HotRow label="Go to Search" value="Ctrl+K" />
                  <HotRow label="Go to Dashboard" value="Ctrl+J" />
                  <HotRow label="Go to Presets" value="Ctrl+P" />
                </div>
              </>
            )}

            {section === 'about' && (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="mx-auto h-[72px] w-[min(100%,260px)] overflow-hidden rounded-2xl ring-1 ring-[rgba(255,255,255,0.1)] drop-shadow-[0_6px_28px_rgba(0,212,255,0.18)]">
                  <img
                    src={publicAsset('branding/jarvis-mark.jpg')}
                    alt="JARVIS"
                    className="h-full w-full object-cover object-center"
                  />
                </div>
                <p className="mt-4 font-mono text-sm text-[rgba(240,240,240,0.55)]">v{appVersion}</p>
                <p className="mt-3 text-sm text-[rgba(240,240,240,0.45)]">Your personal system, your way.</p>
                <CreatorAttribution inline className="mt-4 opacity-80" />
                <p className="mt-3 text-xs text-[rgba(240,240,240,0.45)]">Built with Electron + React + Gemini Live</p>
                <p className="mt-2 max-w-sm text-[11px] leading-relaxed text-[rgba(240,240,240,0.4)]">
                  Version <span className="font-mono">v{appVersion}</span> comes from this app&apos;s build (
                  <span className="font-mono">package.json</span>). It does not auto-update from GitHub — download a new
                  installer from Releases when you publish one.
                </p>
                <motion.span
                  className="mt-4 inline-block h-2 w-2 rounded-full bg-[var(--accent)]"
                  animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.15, 1] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.button
                  type="button"
                  className="mt-6 rounded-btn border border-[rgba(255,255,255,0.1)] px-4 py-2 text-xs font-semibold text-[#F0F0F0]"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    getJarvis().openExternal?.('https://github.com/Abinav0405/Jarvis/releases');
                  }}
                >
                  Visit releases
                </motion.button>
                <motion.div className="mt-10 w-full max-w-md text-left">
                  <p className="text-sm font-medium text-rose-200/90">Reset JARVIS data</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[rgba(240,240,240,0.4)]">
                    Clears presets, AI chats, and API keys from this PC&apos;s data folder (
                    <span className="font-mono">%AppData%\JARVIS</span> when installed;{' '}
                    <span className="font-mono">%LOCALAPPDATA%\Jarvis-Electron-Dev</span> when running{' '}
                    <span className="font-mono">npm run dev</span>). Shows the setup wizard again. Fully quit and
                    reopen JARVIS after resetting.
                  </p>
                  <motion.button
                    type="button"
                    className="mt-3 rounded-btn border border-rose-500/40 px-4 py-2 text-xs font-semibold text-rose-300/90"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          'Reset all JARVIS data on this PC? Presets, chats, and API keys will be removed.',
                        )
                      ) {
                        return;
                      }
                      try {
                        const r = await getJarvis().resetUserData?.();
                        if (r?.ok) {
                          pushToast('Data reset. Quit JARVIS completely, then reopen to run setup again.', 'success');
                          refresh?.();
                        } else {
                          pushToast(r?.error || 'Reset failed.', 'error');
                        }
                      } catch (e) {
                        pushToast(String(e?.message || e), 'error');
                      }
                    }}
                  >
                    Reset JARVIS data
                  </motion.button>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm text-[#F0F0F0]">{label}</span>
        {description ? (
          <span className="mt-1 block text-xs leading-relaxed text-[rgba(240,240,240,0.4)]">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="mt-0.5 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function AppearanceSubheading({ children }) {
  return (
    <h3 className="pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(240,240,240,0.4)]">
      {children}
    </h3>
  );
}

function PillSelect({ label, description, value, options, onChange }) {
  return (
    <motion.div>
      <p className="text-sm text-[rgba(240,240,240,0.55)]">{label}</p>
      {description ? (
        <p className="mt-0.5 text-[11px] leading-relaxed text-[rgba(240,240,240,0.35)]">{description}</p>
      ) : null}
      <motion.div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <motion.button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`rounded-pill border px-3 py-1.5 text-xs font-semibold ${
                active
                  ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.12)] text-[var(--accent)]'
                  : 'border-[rgba(255,255,255,0.08)] text-[rgba(240,240,240,0.75)] hover:border-[rgba(255,255,255,0.15)]'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              {opt.label}
            </motion.button>
          );
        })}
      </motion.div>
    </motion.div>
  );
}

function SliderField({ label, hint, min, max, step, value, onChange, ticks }) {
  return (
    <div>
      <motion.div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[rgba(240,240,240,0.55)]">{label}</p>
        {hint ? <span className="font-mono text-[10px] text-[rgba(240,240,240,0.4)]">{hint}</span> : null}
      </motion.div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        className="mt-2 w-full accent-[var(--accent)]"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {ticks ? (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-[rgba(240,240,240,0.35)]">
          {ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HotRow({ label, value, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.06)] px-4 py-3 last:border-0">
      <span className="text-sm text-[rgba(240,240,240,0.75)]">{label}</span>
      <div className="flex items-center gap-2">
        <span className="rounded-pill border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-2 py-1 font-mono text-[11px] text-[rgba(240,240,240,0.85)]">
          {value}
        </span>
        {action}
      </div>
    </div>
  );
}
