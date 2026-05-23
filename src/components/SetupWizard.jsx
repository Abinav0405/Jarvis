import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getJarvis } from '@/jarvis-bridge.js';
import { CreatorAttribution } from '@/components/CreatorAttribution.jsx';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Loader2,
  Palette,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { GeminiSettingsPanel } from '@/components/GeminiSettingsPanel.jsx';
import { VoiceLanguageSelect } from '@/components/VoiceLanguageSelect.jsx';
import { applyThemeToDocument, THEME_LIST, DEFAULT_THEME_ID } from '@/utils/themes.js';
import { applyColorModeToDocument, COLOR_MODE_LIST, DEFAULT_COLOR_MODE } from '@/utils/colorMode.js';
import { applyAppearanceToDocument, APPEARANCE_DEFAULTS } from '@/utils/appearance.js';

const SWATCHES = ['#00D4FF', '#A855F7', '#22C55E', '#FB923C', '#F472B6', '#F5F5F5'];

const STEPS = ['welcome', 'name', 'gemini', 'appearance', 'preferences', 'done'];

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir < 0 ? 80 : -80, opacity: 0 }),
};

/** Full-screen first-launch setup wizard (OOBE). */
export function SetupWizard({ onComplete }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [dir, setDir] = useState(1);

  // Wizard state
  const [userName, setUserName] = useState('');
  const [accent, setAccent] = useState('#00D4FF');
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [colorMode, setColorMode] = useState(DEFAULT_COLOR_MODE);
  const [fontScale, setFontScale] = useState(1);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [weatherCity, setWeatherCity] = useState('London');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const [saving, setSaving] = useState(false);

  const step = STEPS[stepIdx];

  const go = useCallback((delta) => {
    setDir(delta);
    setStepIdx((i) => Math.max(0, Math.min(STEPS.length - 1, i + delta)));
  }, []);

  useEffect(() => {
    applyThemeToDocument(themeId, accent);
  }, [themeId, accent]);

  useEffect(() => {
    applyColorModeToDocument(colorMode);
    applyAppearanceToDocument({
      ...APPEARANCE_DEFAULTS,
      colorMode,
      panelOpacity: APPEARANCE_DEFAULTS.panelOpacity,
    });
  }, [colorMode]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(fontScale));
  }, [fontScale]);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const data = await getJarvis().readData();
      const next = {
        ...data,
        settings: {
          ...data.settings,
          userName,
          accentColor: accent,
          theme: themeId,
          colorMode,
          fontScale,
          startupWithWindows: startOnBoot,
          wakeWordEnabled: false,
          voiceMode: 'live',
          geminiApiKey: geminiApiKey.trim(),
          weatherCity,
          preferredLanguage,
          setupComplete: true,
        },
      };
      await getJarvis().writeData(next);
      onComplete?.();
      if (startOnBoot) {
        void getJarvis().setStartup(true);
      }
    } catch (e) {
      console.error('[SetupWizard] save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const canNext = () => {
    if (step === 'name') return userName.trim().length > 0;
    return true;
  };

  return (
    <motion.div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-app)]">
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="setup-aura absolute left-1/2 top-1/3 h-[min(80vh,600px)] w-[min(80vw,600px)] -translate-x-1/2 -translate-y-1/2" />
      </div>

      <motion.div
        className={`relative z-10 mx-auto flex min-h-0 w-full flex-1 flex-col px-4 py-3 sm:px-6 ${
          step === 'gemini' || step === 'appearance' ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="mb-4 flex shrink-0 items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <motion.div
              key={s}
              className={`h-2 rounded-pill transition-all duration-300 ${
                i === stepIdx
                  ? 'w-8 bg-[var(--accent)]'
                  : i < stepIdx
                    ? 'w-2 bg-[var(--accent)] opacity-50'
                    : 'w-2 bg-[var(--border-subtle)]'
              }`}
              layout
            />
          ))}
        </div>

        {/* Step content — flex scroll area (no absolute positioning) */}
        <div className="flex min-h-0 flex-1 flex-col">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto jarvis-scrollbar py-2"
            >
              {/* ——— WELCOME ——— */}
              {step === 'welcome' && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <motion.div
                    className="boot-orb mb-8 flex h-20 w-20 items-center justify-center rounded-full"
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <div className="boot-orb-inner h-14 w-14 rounded-full" />
                  </motion.div>
                  <h1 className="text-3xl font-light tracking-wider text-white">
                    Welcome to <span className="font-semibold text-[var(--accent)]">JARVIS</span>
                  </h1>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-[rgba(240,240,240,0.5)]">
                    Your personal system manager & AI assistant.
                    Let's set things up — it only takes a minute.
                  </p>
                  <motion.button
                    type="button"
                    onClick={() => go(1)}
                    className="mt-8 inline-flex items-center gap-2 rounded-pill bg-[var(--accent)] px-8 py-3 text-sm font-bold text-black shadow-glow"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Get started <ArrowRight className="h-4 w-4" />
                  </motion.button>
                </div>
              )}

              {/* ——— NAME ——— */}
              {step === 'name' && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--accent)] bg-[rgba(0,212,255,0.08)]">
                    <User className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                  <h2 className="text-2xl font-light text-white">What should I call you?</h2>
                  <p className="mt-2 text-sm text-[rgba(240,240,240,0.45)]">
                    I'll address you by this name across the app.
                  </p>
                  <input
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canNext() && go(1)}
                    placeholder="e.g. Boss, Tony, your name…"
                    autoFocus
                    className="mt-6 w-full max-w-xs rounded-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] px-4 py-3 text-center text-lg text-white outline-none placeholder:text-[rgba(255,255,255,0.25)] focus:border-[rgba(0,212,255,0.5)] focus:shadow-[0_0_24px_rgba(0,212,255,0.15)]"
                  />
                </div>
              )}

              {/* ——— APPEARANCE ——— */}
              {step === 'appearance' && (
                <div className="flex flex-col items-center pb-4">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--accent)] bg-[rgba(0,212,255,0.08)]">
                    <Palette className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                  <h2 className="text-2xl font-light text-[var(--text-primary)]">Pick your style</h2>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Light or dark shell, then a theme preset or custom accent.
                  </p>
                  <div className="mt-5 flex w-full max-w-md gap-2">
                    {COLOR_MODE_LIST.map((m) => (
                      <motion.button
                        key={m.id}
                        type="button"
                        onClick={() => setColorMode(m.id)}
                        className={`flex-1 rounded-card border px-3 py-2.5 text-center text-sm font-medium ${
                          colorMode === m.id
                            ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.08)] text-[var(--accent)]'
                            : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                        }`}
                        whileTap={{ scale: 0.97 }}
                      >
                        {m.label}
                      </motion.button>
                    ))}
                  </div>
                  <div className="mt-5 grid w-full max-w-md gap-2 sm:grid-cols-3">
                    {THEME_LIST.map((t) => (
                      <motion.button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setThemeId(t.id);
                          setAccent(t.accent);
                        }}
                        className={`rounded-card border p-2.5 text-left ${
                          themeId === t.id
                            ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.08)]'
                            : 'border-[rgba(255,255,255,0.08)]'
                        }`}
                        whileTap={{ scale: 0.97 }}
                      >
                        <div className="mb-1.5 flex gap-1">
                          {t.swatch.map((c) => (
                            <span key={c} className="h-4 w-4 rounded-full" style={{ background: c }} />
                          ))}
                        </div>
                        <p className="text-[11px] font-medium text-white">{t.label}</p>
                      </motion.button>
                    ))}
                  </div>
                  {/* Accent swatches */}
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    {SWATCHES.map((c) => (
                      <motion.button
                        key={c}
                        type="button"
                        onClick={() => {
                          setAccent(c);
                          setThemeId(null);
                        }}
                        className={`h-10 w-10 rounded-full border-2 transition-all ${
                          accent.toLowerCase() === c.toLowerCase()
                            ? 'border-white ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[#050506]'
                            : 'border-[rgba(255,255,255,0.15)]'
                        }`}
                        style={{ background: c }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      />
                    ))}
                  </div>
                  {/* Custom hex */}
                  <input
                    className="mt-4 w-32 rounded-btn border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] px-3 py-2 text-center font-mono text-xs text-white outline-none"
                    defaultValue={accent}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) setAccent(v);
                    }}
                    placeholder="#hex"
                  />
                  {/* Font size */}
                  <div className="mt-6 w-full max-w-xs">
                    <p className="mb-2 text-center text-xs text-[rgba(240,240,240,0.45)]">Font size</p>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={1}
                      value={[0.9, 1, 1.12].reduce((best, s, i, arr) => (Math.abs(s - fontScale) < Math.abs(arr[best] - fontScale) ? i : best), 1)}
                      onChange={(e) => {
                        const map = [0.9, 1, 1.12];
                        setFontScale(map[Number(e.target.value)]);
                      }}
                      className="w-full accent-[var(--accent)]"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-[rgba(240,240,240,0.35)]">
                      <span>Small</span>
                      <span>Medium</span>
                      <span>Large</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ——— PREFERENCES ——— */}
              {step === 'preferences' && (
                <div className="flex h-full flex-col items-center justify-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--accent)] bg-[rgba(0,212,255,0.08)]">
                    <Zap className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                  <h2 className="text-2xl font-light text-white">Preferences</h2>
                  <p className="mt-2 mb-6 text-sm text-[rgba(240,240,240,0.45)]">
                    Customise how JARVIS behaves.
                  </p>

                  <div className="w-full max-w-sm space-y-3">
                    <SetupToggle
                      label="Launch on Windows startup"
                      description="JARVIS will start when you log in."
                      checked={startOnBoot}
                      onChange={setStartOnBoot}
                    />
                    <div className="rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                      <p className="text-sm text-white">Voice language</p>
                      <p className="mt-1 text-[11px] text-[rgba(240,240,240,0.4)]">
                        JARVIS speaks in this language by default.
                      </p>
                      <VoiceLanguageSelect
                        className="mt-2 w-full"
                        value={preferredLanguage}
                        onChange={setPreferredLanguage}
                      />
                    </div>
                    <div className="rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                      <p className="text-sm text-white">Weather location</p>
                      <input
                        value={weatherCity}
                        onChange={(e) => setWeatherCity(e.target.value)}
                        placeholder="London"
                        className="mt-2 w-full rounded-btn border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-white outline-none placeholder:text-[rgba(255,255,255,0.25)] focus:border-[rgba(0,212,255,0.4)]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ——— GEMINI LIVE (voice core) ——— */}
              {step === 'gemini' && (
                <div className="flex flex-col items-center pb-4">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--accent)] bg-[rgba(0,212,255,0.08)]">
                    <Sparkles className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                  <h2 className="text-2xl font-light text-[var(--text-primary)]">Gemini voice core</h2>
                  <p className="mt-2 mb-4 max-w-md text-center text-sm text-[var(--text-muted)]">
                    Get a free API key from Google AI Studio — this powers live conversation (like Mark XXXIX).
                    You can skip and add it later in Settings.
                  </p>
                  <div className="w-full max-w-2xl">
                    <GeminiSettingsPanel
                      compact
                      initialKey={geminiApiKey}
                      onSaved={setGeminiApiKey}
                      pushToast={() => {}}
                    />
                  </div>
                </div>
              )}

              {/* ——— DONE ——— */}
              {step === 'done' && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <motion.div
                    className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  >
                    <Check className="h-8 w-8 text-black" />
                  </motion.div>
                  <h2 className="text-3xl font-light text-white">
                    All set, <span className="font-semibold text-[var(--accent)]">{userName || 'Boss'}</span>!
                  </h2>
                  <p className="mt-3 max-w-sm text-sm text-[rgba(240,240,240,0.5)]">
                    JARVIS is ready. You can always tweak these settings later.
                  </p>
                  <motion.button
                    type="button"
                    onClick={finish}
                    disabled={saving}
                    className="mt-8 inline-flex items-center gap-2 rounded-pill bg-[var(--accent)] px-8 py-3 text-sm font-bold text-black shadow-glow disabled:opacity-50"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        Launch JARVIS <Sparkles className="h-4 w-4" />
                      </>
                    )}
                  </motion.button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        {step !== 'welcome' && step !== 'done' && (
          <div className="mt-4 flex shrink-0 items-center justify-between border-t border-[var(--border-subtle)] pt-4">
            <motion.button
              type="button"
              onClick={() => go(-1)}
              className="inline-flex items-center gap-1 rounded-pill border border-[rgba(255,255,255,0.1)] px-4 py-2 text-xs text-[rgba(240,240,240,0.65)]"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </motion.button>

            <motion.button
              type="button"
              onClick={() => go(1)}
              disabled={!canNext()}
              className="inline-flex items-center gap-1 rounded-pill bg-[var(--accent)] px-6 py-2 text-xs font-bold text-black disabled:opacity-30"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              {stepIdx === STEPS.length - 2 ? 'Finish' : 'Next'} <ArrowRight className="h-3.5 w-3.5" />
            </motion.button>
          </div>
        )}

        <CreatorAttribution inline className="mt-2 shrink-0 pb-1" />
      </motion.div>
    </motion.div>
  );
}

function SetupToggle({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-card border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm text-white">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-[rgba(240,240,240,0.4)]">{description}</span>
        )}
      </span>
      <input
        type="checkbox"
        className="mt-0.5 shrink-0 accent-[var(--accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
