export const PRESET_CATEGORIES = ['Work', 'Study', 'Gaming', 'Chill', 'Custom'];

export const ICON_PICKER_NAMES = [
  'Box',
  'Cpu',
  'Terminal',
  'Code',
  'Gamepad2',
  'Music',
  'Coffee',
  'Moon',
  'Sun',
  'Briefcase',
  'GraduationCap',
  'Rocket',
  'Flame',
  'Heart',
  'Zap',
  'Globe',
  'Camera',
  'Palette',
  'Shield',
  'Sparkles',
];

export function emptySystemActions() {
  return {
    setVolume: { enabled: false, percent: 50 },
    doNotDisturb: { enabled: false },
    changeWallpaper: { enabled: false, imagePath: '' },
  };
}

export function createEmptyPresetForm() {
  return {
    name: '',
    icon: 'Box',
    category: 'Work',
    apps: [],
    tabs: [],
    systemActions: emptySystemActions(),
  };
}

export function domainFromUrl(url) {
  try {
    const u = url.includes('://') ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 32);
  }
}

export function exeLabel(path) {
  if (!path) return '';
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}
