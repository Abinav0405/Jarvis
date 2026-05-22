const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  readData: () => ipcRenderer.invoke('data:read'),
  writeData: (data) => ipcRenderer.invoke('data:write', data),
  getSystemStats: () => ipcRenderer.invoke('system:stats'),
  getSystemStatsText: () => ipcRenderer.invoke('system:statsText'),
  getAboutComputer: () => ipcRenderer.invoke('system:aboutComputer'),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('window:setOpacity', opacity),
  setFullScreen: (enabled) => ipcRenderer.invoke('window:setFullscreen', enabled),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  setMainHotkey: (accelerator) => ipcRenderer.invoke('hotkey:set', accelerator),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  pickExe: () => ipcRenderer.invoke('dialog:pickExe'),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  launchPreset: (preset) => ipcRenderer.invoke('preset:launch', preset),
  restorePresetSystem: () => ipcRenderer.invoke('preset:restoreSystem'),
  setStartup: (enabled) => ipcRenderer.invoke('startup:set', enabled),
  executeAction: (action) => ipcRenderer.invoke('actions:execute', action),
  ollamaChat: (payload) => ipcRenderer.invoke('ollama:chat', payload),
  listOllamaModels: (baseUrl) => ipcRenderer.invoke('ollama:listModels', { baseUrl }),
  ollamaProbe: (baseUrl) => ipcRenderer.invoke('ollama:probe', { baseUrl }),
  getAppsStore: () => ipcRenderer.invoke('apps:get'),
  scanApps: (opts) => ipcRenderer.invoke('apps:scan', opts),
  launchAppPath: (launchPath) => ipcRenderer.invoke('apps:launch', launchPath),
  setAppPins: (orderedIds) => ipcRenderer.invoke('apps:setPins', orderedIds),
  toggleAppPin: (appId) => ipcRenderer.invoke('apps:togglePin', appId),
  addAppToPreset: (presetId, launchPath) =>
    ipcRenderer.invoke('apps:addToPreset', { presetId, launchPath }),
  pinAppToDashboard: (entry) => ipcRenderer.invoke('apps:pinDashboard', entry),
  unpinDashboardApp: (appId) => ipcRenderer.invoke('apps:unpinDashboard', appId),
  showItemInFolder: (fullPath) => ipcRenderer.invoke('shell:showItemInFolder', fullPath),
  onAppsProgress: (cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on('apps:progress', fn);
    return () => ipcRenderer.removeListener('apps:progress', fn);
  },
  onNavigate: (cb) => {
    const fn = (_e, panel) => cb(panel);
    ipcRenderer.on('jarvis:navigate', fn);
    return () => ipcRenderer.removeListener('jarvis:navigate', fn);
  },
  onWindowShown: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('jarvis:window-shown', fn);
    return () => ipcRenderer.removeListener('jarvis:window-shown', fn);
  },
  onWindowHidden: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('jarvis:window-hidden', fn);
    return () => ipcRenderer.removeListener('jarvis:window-hidden', fn);
  },
  onDataChanged: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('jarvis:data-changed', fn);
    return () => ipcRenderer.removeListener('jarvis:data-changed', fn);
  },
  capturePrimaryDisplay: () => ipcRenderer.invoke('screen:capturePrimary'),
  readChatFile: (absPath) => ipcRenderer.invoke('files:readForChat', absPath),
  readImageDataUrl: (absPath) => ipcRenderer.invoke('files:imageDataUrl', absPath),
  pickChatFile: () => ipcRenderer.invoke('dialog:pickChatFile'),
  onScreenReader: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('jarvis:screen-reader', fn);
    return () => ipcRenderer.removeListener('jarvis:screen-reader', fn);
  },
  getSuggestion: () => ipcRenderer.invoke('suggestions:current'),
  networkSpeed: () => ipcRenderer.invoke('network:speed'),
  networkPing: () => ipcRenderer.invoke('network:ping'),
  getUsage: () => ipcRenderer.invoke('usage:get'),
  clearUsage: () => ipcRenderer.invoke('usage:clear'),
  clearPatterns: () => ipcRenderer.invoke('patterns:clear'),
  unifiedSearch: (query) => ipcRenderer.invoke('search:unified', query),
  openSearchResult: (item) => ipcRenderer.invoke('search:open', item),
  getDashboardExtras: () => ipcRenderer.invoke('dashboard:extras'),
  fetchWeather: (city) => ipcRenderer.invoke('weather:fetch', city),
  searchWeatherCities: (query) => ipcRenderer.invoke('weather:searchCities', query),
  detectWeatherLocation: () => ipcRenderer.invoke('weather:detectLocation'),
  toggleDnd: () => ipcRenderer.invoke('system:toggleDnd'),
  getSystemVolume: () => ipcRenderer.invoke('system:getVolume'),
  setSystemVolume: (percent) => ipcRenderer.invoke('system:setVolume', percent),
  listProcesses: () => ipcRenderer.invoke('processes:list'),
  killProcess: (pid, name) => ipcRenderer.invoke('processes:kill', pid, name),
  networkFlushDns: () => ipcRenderer.invoke('network:flushDns'),
  networkTcp: () => ipcRenderer.invoke('network:tcp'),
  notifySuggestion: (title, body) => ipcRenderer.invoke('notify:suggestion', { title, body }),
  onFocusSuggestion: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('jarvis:focus-suggestion', fn);
    return () => ipcRenderer.removeListener('jarvis:focus-suggestion', fn);
  },
  downloadOllamaInstaller: () => ipcRenderer.invoke('ollama:downloadInstaller'),
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:info'),
  openInBrowser: () => ipcRenderer.invoke('runtime:openInBrowser'),
  switchToDesktopApp: () => ipcRenderer.invoke('runtime:switchToDesktopApp'),
  calendarSaveCredentials: (creds) => ipcRenderer.invoke('calendar:saveCredentials', creds),
  calendarRemoveCredentials: () => ipcRenderer.invoke('calendar:removeCredentials'),
  calendarTestConnection: (creds) => ipcRenderer.invoke('calendar:testConnection', creds),
  calendarFetchEvents: (opts) => ipcRenderer.invoke('calendar:fetchEvents', opts),
  calendarGetStatus: () => ipcRenderer.invoke('calendar:getStatus'),
  speechGetStatus: () => ipcRenderer.invoke('speech:getStatus'),
  speechSaveKey: (key) => ipcRenderer.invoke('speech:saveKey', key),
  speechOpenUserDataFolder: () => ipcRenderer.invoke('speech:openUserDataFolder'),
  resetUserData: () => ipcRenderer.invoke('app:resetUserData'),
  liveStart: () => ipcRenderer.invoke('live:start'),
  liveStop: () => ipcRenderer.invoke('live:stop'),
  liveStatus: () => ipcRenderer.invoke('live:status'),
  liveSetMuted: (muted) => ipcRenderer.invoke('live:setMuted', muted),
  liveSendText: (text) => ipcRenderer.invoke('live:sendText', text),
  livePushAudio: (buffer) => ipcRenderer.invoke('live:pushAudio', { buffer: Array.from(new Uint8Array(buffer)) }),
  livePlaybackStarted: () => ipcRenderer.invoke('live:playbackStarted'),
  livePlaybackEnded: () => ipcRenderer.invoke('live:playbackEnded'),
  geminiSaveApiKey: (key) => ipcRenderer.invoke('gemini:saveApiKey', key),
  geminiTestApiKey: (key) => ipcRenderer.invoke('gemini:testApiKey', key),
  onLiveEvent: (cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on('live:event', fn);
    return () => ipcRenderer.removeListener('live:event', fn);
  },
});
