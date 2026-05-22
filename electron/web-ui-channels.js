/** IPC channels allowed from the loopback web UI (browser). All others are blocked. */
const WEB_UI_ALLOWED_CHANNELS = new Set([
  'data:read',
  'data:write',
  'runtime:info',
  'runtime:version',
  'runtime:switchToDesktopApp',
  'system:stats',
  'system:statsText',
  'system:aboutComputer',
  'system:toggleDnd',
  'system:getVolume',
  'system:setVolume',
  'window:setOpacity',
  'window:setFullscreen',
  'window:hide',
  'hotkey:set',
  'screen:capturePrimary',
  'files:readForChat',
  'files:imageDataUrl',
  'suggestions:current',
  'network:speed',
  'network:ping',
  'network:flushDns',
  'network:tcp',
  'processes:list',
  'search:unified',
  'search:open',
  'dashboard:extras',
  'weather:fetch',
  'weather:searchCities',
  'weather:detectLocation',
  'usage:get',
  'notify:suggestion',
  'shell:openExternal',
  'ollama:probe',
  'ollama:listModels',
  'ollama:chat',
  'apps:get',
  'apps:scan',
  'apps:launch',
  'apps:setPins',
  'apps:togglePin',
  'apps:addToPreset',
  'apps:pinDashboard',
  'apps:unpinDashboard',
  'dialog:pickExe',
  'dialog:pickImage',
  'dialog:pickChatFile',
  'calendar:saveCredentials',
  'calendar:removeCredentials',
  'calendar:testConnection',
  'calendar:fetchEvents',
  'calendar:getStatus',
  'speech:getStatus',
  'speech:saveKey',
]);

const WEB_UI_BLOCKED_ERROR =
  'This action is not available from the web interface. Use the JARVIS desktop app.';

function assertWebUiChannelAllowed(channel) {
  if (!WEB_UI_ALLOWED_CHANNELS.has(channel)) {
    throw new Error(WEB_UI_BLOCKED_ERROR);
  }
}

module.exports = { WEB_UI_ALLOWED_CHANNELS, WEB_UI_BLOCKED_ERROR, assertWebUiChannelAllowed };
