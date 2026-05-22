const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

let startAppsCache = { list: [], at: 0 };
const START_CACHE_MS = 5 * 60 * 1000;

async function fetchStartApps() {
  const ps = `
$ErrorActionPreference='SilentlyContinue'
Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress -Depth 3
`.trim();
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
      timeout: 12000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout.trim() || '[]');
    const arr = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return arr
      .map((r) => ({
        name: String(r.Name || r.name || '').trim(),
        appId: String(r.AppID || r.appId || '').trim(),
      }))
      .filter((r) => r.name && r.appId);
  } catch {
    return [];
  }
}

async function getStartAppsCached() {
  const now = Date.now();
  if (startAppsCache.list.length && now - startAppsCache.at < START_CACHE_MS) {
    return startAppsCache.list;
  }
  const list = await fetchStartApps();
  startAppsCache = { list, at: Date.now() };
  return list;
}

function scoreMatch(text, q) {
  const t = String(text || '').toLowerCase();
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 50;
  return 0;
}

/**
 * @returns {Promise<Array<{ id: string, type: string, label: string, sub: string, iconPng?: string, launchPath?: string, preset?: object, url?: string, appId?: string }>>}
 */
async function unifiedSearch(query, { appsStore, jarvisData, limit = 4 }) {
  const raw = String(query || '').trim();
  const q = raw.toLowerCase();
  if (q.length < 1) return [];

  const candidates = [];
  const push = (item, score) => {
    if (!item?.label || score <= 0) return;
    candidates.push({ ...item, score });
  };

  for (const app of appsStore?.apps || []) {
    const name = String(app.name || '');
    const s = scoreMatch(name, q);
    if (s > 0) {
      push(
        {
          id: `app:${app.id}`,
          type: 'app',
          label: name,
          sub: 'Application',
          iconPng: app.iconPng,
          launchPath: app.launchPath,
        },
        s
      );
    }
  }

  for (const p of jarvisData?.presets || []) {
    const name = String(p.name || '');
    const s = scoreMatch(name, q);
    if (s > 0) {
      push(
        {
          id: `preset:${p.id}`,
          type: 'preset',
          label: name,
          sub: 'Preset',
          preset: p,
        },
        s + 5
      );
    }
  }

  for (const link of jarvisData?.pinnedLinks || []) {
    const name = String(link.name || '');
    const s = Math.max(scoreMatch(name, q), scoreMatch(link.url, q) * 0.85);
    if (s > 0) {
      push(
        {
          id: `link:${link.id}`,
          type: 'link',
          label: name || link.url,
          sub: 'Pinned link',
          url: link.url,
        },
        s
      );
    }
  }

  const startApps = await getStartAppsCached();
  for (const sa of startApps) {
    const s = scoreMatch(sa.name, q);
    if (s > 0) {
      push(
        {
          id: `start:${sa.appId}`,
          type: 'start',
          label: sa.name,
          sub: 'Windows app',
          appId: sa.appId,
        },
        s + 2
      );
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const results = candidates.slice(0, limit).map(({ score, ...rest }) => rest);

  if (results.length < limit && raw.length >= 1) {
    results.push({
      id: `web:${encodeURIComponent(raw)}`,
      type: 'web',
      label: `Search the web for “${raw}”`,
      sub: 'Google',
      url: `https://www.google.com/search?q=${encodeURIComponent(raw)}`,
    });
  }

  return results.slice(0, limit);
}

module.exports = { unifiedSearch, getStartAppsCached };
