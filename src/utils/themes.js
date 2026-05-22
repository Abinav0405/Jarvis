/** Theme presets — applied via CSS variables on document.documentElement. */
export const THEMES = {
  'arc-reactor': {
    id: 'arc-reactor',
    label: 'Arc Reactor',
    description: 'Cyan arc glow (default)',
    accent: '#00D4FF',
    accentSecondary: '#7C3AED',
    accentGlow: 'rgba(0, 212, 255, 0.35)',
    swatch: ['#00D4FF', '#7C3AED', '#050506'],
  },
  'mark-42': {
    id: 'mark-42',
    label: 'Mark 42',
    description: 'Red and gold Iron Man palette',
    accent: '#E23636',
    accentSecondary: '#D4AF37',
    accentGlow: 'rgba(226, 54, 54, 0.35)',
    swatch: ['#E23636', '#D4AF37', '#1a0a0a'],
  },
  'minimal-monochrome': {
    id: 'minimal-monochrome',
    label: 'Minimal Monochrome',
    description: 'Silver grayscale accents',
    accent: '#C0C0C0',
    accentSecondary: '#808080',
    accentGlow: 'rgba(192, 192, 192, 0.25)',
    swatch: ['#C0C0C0', '#808080', '#0a0a0a'],
  },
};

export const DEFAULT_THEME_ID = 'arc-reactor';

export function getTheme(themeId) {
  return THEMES[themeId] || THEMES[DEFAULT_THEME_ID];
}

/** Apply theme CSS variables; optional custom accent overrides primary when themeId is null. */
export function applyThemeToDocument(themeId, customAccent) {
  const root = document.documentElement;
  if (themeId && THEMES[themeId]) {
    const t = THEMES[themeId];
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--accent-secondary', t.accentSecondary);
    root.style.setProperty('--accent-glow', t.accentGlow);
    root.dataset.jarvisTheme = themeId;
    return;
  }
  const accent = customAccent || THEMES[DEFAULT_THEME_ID].accent;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-secondary', THEMES[DEFAULT_THEME_ID].accentSecondary);
  root.style.setProperty('--accent-glow', THEMES[DEFAULT_THEME_ID].accentGlow);
  delete root.dataset.jarvisTheme;
}

export const THEME_LIST = Object.values(THEMES);
