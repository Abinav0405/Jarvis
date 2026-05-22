export interface JarvisTodo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  location: string | null;
  htmlLink: string | null;
}

export interface JarvisSettings {
  startupWithWindows?: boolean;
  defaultPresetOnLaunch?: string | null;
  logActivity?: boolean;
  accentColor?: string;
  /** `arc-reactor` | `mark-42` | `minimal-monochrome` | null for custom accent */
  theme?: string | null;
  googleCalendarConnected?: boolean;
  fontScale?: number;
  windowOpacity?: number;
  fullscreen?: boolean;
  customSearchUrl?: string;
  apiKey?: string;
  /** `anthropic` | `ollama` */
  aiProvider?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  mainHotkey?: string;
}

export interface ActivityEntry {
  id: string;
  message: string;
  timestamp: number;
}

export interface PinnedLink {
  id: string;
  name: string;
  url: string;
}

export interface DashboardAppPin {
  id: string;
  name: string;
  path: string;
  iconPng?: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
}

export interface AiChatHistoryEntry {
  id: string;
  title: string;
  updatedAt: number;
  messages: AiChatMessage[];
}

export interface JarvisAppsStore {
  version: number;
  lastScan?: number;
  apps: unknown[];
  pinnedIds: string[];
}

export interface JarvisData {
  version: number;
  presets: unknown[];
  pinnedLinks: PinnedLink[];
  activePresetId: string | null;
  settings: JarvisSettings;
  todos?: JarvisTodo[];
  activityLog: ActivityEntry[];
  dashboardAppPins?: DashboardAppPin[];
  aiChatHistory?: AiChatHistoryEntry[];
}

export type JarvisAction =
  | { type: 'open_preset'; name?: string }
  | { type: 'close_preset'; name?: string }
  | { type: 'search_web'; query?: string; engine?: string }
  | { type: 'get_system_stats' };

export interface AboutComputerGpu {
  model: string;
  vram: string | null;
  driver: string | null;
}

export interface AboutComputerVolume {
  mount: string;
  fs: string;
  type: string;
  size: string;
  used: string;
  usePct: number;
}

export interface AboutComputerInfo {
  preview?: boolean;
  hostname: string;
  os: {
    platform: string;
    distro: string;
    release: string;
    build: string;
    arch: string;
    uptime: string;
  };
  system: {
    manufacturer: string;
    model: string;
    sku: string | null;
  };
  baseboard: {
    manufacturer: string;
    model: string;
    version: string | null;
  };
  cpu: {
    brand: string;
    cores: number;
    physicalCores: number;
    speed: string | null;
  };
  gpus: AboutComputerGpu[];
  ram: {
    total: string;
    type: string | null;
    slots: string | null;
  };
  npu: {
    detected: boolean;
    name: string | null;
    detail: string | null;
  };
  storage: AboutComputerVolume[];
}

export interface JarvisAPI {
  readData: () => Promise<JarvisData>;
  writeData: (data: JarvisData) => Promise<boolean>;
  getSystemStats: () => Promise<{
    cpu: number;
    ramUsed: number;
    ramTotal: number;
    storageUsed: number;
    storageTotal: number;
    storageUsedPct: number;
  }>;
  getSystemStatsText: () => Promise<string>;
  getAboutComputer: () => Promise<AboutComputerInfo>;
  setWindowOpacity: (opacity: number) => Promise<void>;
  setFullScreen: (enabled: boolean) => Promise<void>;
  hideWindow: () => Promise<void>;
  setMainHotkey: (accelerator: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  pickExe: () => Promise<string | null>;
  pickImage: () => Promise<string | null>;
  launchPreset: (preset: unknown) => Promise<{ ok: boolean }>;
  restorePresetSystem: () => Promise<boolean>;
  setStartup: (enabled: boolean) => Promise<boolean>;
  executeAction: (action: JarvisAction) => Promise<{ ok: boolean; statsText?: string; error?: string }>;
  ollamaChat: (payload: {
    baseUrl: string;
    model: string;
    messages: { role: string; content: string }[];
  }) => Promise<{ text: string; promptEval?: number; evalCount?: number }>;
  listOllamaModels: (baseUrl: string) => Promise<{ models: string[] }>;
  ollamaProbe: (baseUrl: string) => Promise<{
    ok: boolean;
    exePath: string | null;
    models: string[];
    hint: string;
  }>;
  getAppsStore: () => Promise<JarvisAppsStore>;
  scanApps: () => Promise<JarvisAppsStore>;
  launchAppPath: (launchPath: string) => Promise<{ ok: boolean }>;
  setAppPins: (orderedIds: string[]) => Promise<JarvisAppsStore>;
  toggleAppPin: (appId: string) => Promise<{ ok: boolean; error?: string; store?: JarvisAppsStore }>;
  addAppToPreset: (presetId: string, launchPath: string) => Promise<{ ok: boolean }>;
  pinAppToDashboard: (entry: DashboardAppPin) => Promise<{ ok: boolean; error?: string }>;
  unpinDashboardApp: (appId: string) => Promise<{ ok: boolean }>;
  showItemInFolder: (fullPath: string) => Promise<boolean>;
  onAppsProgress: (cb: (payload: JarvisAppsStore & { partial?: boolean }) => void) => () => void;
  onNavigate: (cb: (panel: string) => void) => () => void;
  onWindowShown: (cb: () => void) => () => void;
  onWindowHidden: (cb: () => void) => () => void;
  onDataChanged: (cb: () => void) => () => void;
  getRuntimeInfo?: () => Promise<{
    isElectron?: boolean;
    isDev?: boolean;
    devUrl?: string | null;
    devFocusPort?: number | null;
    focusPort?: number | null;
    focusSecret?: string;
    version?: string;
    webVersionSupported?: boolean;
    /** @deprecated Use webVersionSupported */
    browserPreviewSupported?: boolean;
    webUiActive?: boolean;
    webUiUrl?: string | null;
    speechKeyConfigured?: boolean;
    userDataPath?: string;
  }>;
  openInBrowser?: () => Promise<{ ok: boolean; error?: string }>;
  switchToDesktopApp?: () => Promise<{ ok: boolean; error?: string }>;
  calendarSaveCredentials?: (creds: {
    apiKey?: string;
    calendarId?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
  }) => Promise<{ ok: boolean; connected?: boolean }>;
  calendarRemoveCredentials?: () => Promise<{ ok: boolean }>;
  calendarTestConnection?: (creds?: unknown) => Promise<{ ok: boolean; message?: string; error?: string }>;
  calendarFetchEvents?: (opts?: { daysAhead?: number; maxResults?: number }) => Promise<{
    ok: boolean;
    connected?: boolean;
    events: CalendarEvent[];
    error?: string;
  }>;
  calendarGetStatus?: () => Promise<{
    connected: boolean;
    calendarId: string;
    hasOAuth: boolean;
    hasApiKey: boolean;
  }>;
  speechGetStatus?: () => Promise<{ configured: boolean }>;
  speechSaveKey?: (key: string) => Promise<{ ok: boolean; needRestart?: boolean; error?: string }>;
  speechOpenUserDataFolder?: () => Promise<{ ok: boolean; error?: string }>;
  resetUserData?: () => Promise<{ ok: boolean; needRestart?: boolean; userDataPath?: string; error?: string }>;
}

declare global {
  interface Window {
    /** Present only in the Electron renderer (preload). */
    jarvis?: JarvisAPI;
    __jarvisBrowserModeWarned?: boolean;
  }
}
