/** Light / dark shell — separate from accent theme presets. */
export const COLOR_MODES = {
  dark: {
    id: 'dark',
    label: 'Dark',
    description: 'Low-light interface (default)',
  },
  light: {
    id: 'light',
    label: 'Light',
    description: 'Bright backgrounds',
  },
};

export const DEFAULT_COLOR_MODE = 'dark';

export function applyColorModeToDocument(mode = DEFAULT_COLOR_MODE) {
  const root = document.documentElement;
  const m = mode === 'light' ? 'light' : 'dark';
  root.dataset.colorMode = m;
}

export const COLOR_MODE_LIST = Object.values(COLOR_MODES);
