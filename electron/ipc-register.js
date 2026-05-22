/**
 * Central IPC registration so the same handlers can be invoked from
 * the renderer (preload) and from the local web UI HTTP bridge.
 */
const { ipcMain } = require('electron');

/** @type {Map<string, (event: unknown, ...args: unknown[]) => unknown>} */
const handlers = new Map();

/**
 * @param {string} channel
 * @param {(event: unknown, ...args: unknown[]) => unknown} fn
 */
function register(channel, fn) {
  handlers.set(channel, fn);
  ipcMain.handle(channel, fn);
}

/**
 * @param {string} channel
 * @param {unknown} event
 * @param {unknown[]} args
 */
async function invoke(channel, event, args = []) {
  const fn = handlers.get(channel);
  if (!fn) {
    throw new Error(`Unknown IPC channel: ${channel}`);
  }
  return Reflect.apply(fn, null, [event, ...args]);
}

module.exports = { register, invoke };
