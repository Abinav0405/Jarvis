/** Appearance defaults — keep in sync with electron/main.js + jarvis-bridge.js */
export const APPEARANCE_DEFAULTS = {
  uiDensity: 'comfortable',
  panelOpacity: 0.04,
  accentGlow: 'subtle',
  cornerStyle: 'rounded',
  reduceMotion: false,
  bootAnimationEnabled: true,
  hologramEffects: true,
  sidebarCompact: false,
};

const GLOW_ALPHA = { off: 0, subtle: 0.15, strong: 0.38 };

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Whether OS or user wants reduced motion. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Apply layout, glass, glow, corners, and motion classes on :root. */
export function applyAppearanceToDocument(settings = {}) {
  const root = document.documentElement;
  const uiDensity = settings.uiDensity === 'compact' ? 'compact' : 'comfortable';
  const panelOpacity = clamp(Number(settings.panelOpacity ?? APPEARANCE_DEFAULTS.panelOpacity), 0.02, 0.12);
  const glowKey = settings.accentGlow in GLOW_ALPHA ? settings.accentGlow : APPEARANCE_DEFAULTS.accentGlow;
  const glowAlpha = GLOW_ALPHA[glowKey];
  const cornerStyle = settings.cornerStyle === 'sharp' ? 'sharp' : 'rounded';
  const reduceMotion = settings.reduceMotion === true || prefersReducedMotion();
  const sidebarCompact = settings.sidebarCompact === true;
  const isLight = root.dataset.colorMode === 'light';
  const glassRgb = isLight ? '15, 20, 31' : '255, 255, 255';

  root.dataset.uiDensity = uiDensity;
  root.dataset.cornerStyle = cornerStyle;
  root.dataset.sidebarCompact = sidebarCompact ? 'true' : 'false';

  root.style.setProperty('--space-scale', uiDensity === 'compact' ? '0.88' : '1');
  root.style.setProperty('--panel-bg-alpha', String(panelOpacity));
  root.style.setProperty('--glass-bg', `rgba(${glassRgb}, ${panelOpacity})`);
  root.style.setProperty(
    '--glass-border',
    `rgba(${glassRgb}, ${clamp(panelOpacity + 0.04, 0.06, 0.2)})`,
  );
  root.style.setProperty('--glow-intensity', String(glowAlpha));
  root.style.setProperty(
    '--shadow-glow',
    `0 0 20px color-mix(in srgb, var(--accent) ${Math.round(glowAlpha * 100)}%, transparent)`,
  );
  root.style.setProperty(
    '--shadow-glow-strong',
    `0 0 24px color-mix(in srgb, var(--accent) ${Math.round(Math.min(glowAlpha * 1.35, 0.55) * 100)}%, transparent)`,
  );

  if (cornerStyle === 'sharp') {
    root.style.setProperty('--radius-card', '6px');
    root.style.setProperty('--radius-btn', '4px');
    root.style.setProperty('--radius-pill', '6px');
  } else {
    root.style.setProperty('--radius-card', '16px');
    root.style.setProperty('--radius-btn', '12px');
    root.style.setProperty('--radius-pill', '999px');
  }

  root.classList.toggle('reduce-motion', reduceMotion);
}
