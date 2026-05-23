const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { getStartAppsCached } = require('./unified-search');

const execFileAsync = promisify(execFile);

/** Spoken nicknames → extra search terms (boost only, not required). */
const ALIASES = {
  vscode: ['visual studio code', 'vs code', 'code'],
  'vs code': ['visual studio code', 'code'],
  code: ['visual studio code'],
  cursor: ['cursor'],
  brave: ['brave browser', 'brave'],
  chrome: ['google chrome'],
  edge: ['microsoft edge'],
  firefox: ['mozilla firefox'],
  terminal: ['windows terminal', 'terminal'],
  powershell: ['windows powershell', 'powershell'],
  calc: ['calculator'],
  calculator: ['calculator'],
  photos: ['photos'],
  mail: ['mail'],
  store: ['microsoft store'],
};

const MIN_SCORE = 48;
const MIN_GAP = 6;
const SOURCE_BOOST = { start: 10, store: 6, known: 4, system32: 3, where: 2, command: 2 };

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function stripOpenPrefix(raw) {
  return String(raw || '')
    .trim()
    .replace(/^(?:open|launch|start|run)\s+/i, '')
    .trim();
}

function buildQueries(raw) {
  const primary = stripOpenPrefix(raw).toLowerCase();
  if (!primary) return [];

  const seen = new Set();
  const queries = [];

  const add = (text, { alias = false } = {}) => {
    const t = String(text || '').trim().toLowerCase();
    if (!t || seen.has(t)) return;
    seen.add(t);
    queries.push({
      text: t,
      norm: normKey(t),
      tokens: tokenize(t),
      alias,
    });
  };

  add(primary);
  add(normKey(primary));

  for (const [alias, targets] of Object.entries(ALIASES)) {
    const aliasNorm = normKey(alias);
    const primaryNorm = normKey(primary);
    const hit =
      primary === alias ||
      primary.includes(alias) ||
      alias.includes(primary) ||
      primaryNorm === aliasNorm ||
      primaryNorm.includes(aliasNorm) ||
      aliasNorm.includes(primaryNorm);
    if (!hit) continue;
    add(alias, { alias: true });
    for (const t of targets) add(t, { alias: true });
  }

  return queries;
}

function tokensInOrder(nameTokens, queryTokens) {
  if (!queryTokens.length) return false;
  let idx = 0;
  for (const nt of nameTokens) {
    if (nt === queryTokens[idx] || nt.startsWith(queryTokens[idx]) || queryTokens[idx].startsWith(nt)) {
      idx += 1;
      if (idx >= queryTokens.length) return true;
    }
  }
  return false;
}

function scoreName(name, queries) {
  const nameLower = String(name || '').toLowerCase();
  const nameNorm = normKey(name);
  const nameTokens = tokenize(name);
  let best = 0;

  for (const q of queries) {
    if (!q.text) continue;
    let score = 0;

    if (nameLower === q.text) score = 100;
    else if (nameNorm === q.norm) score = 96;
    else if (q.tokens.length > 1 && tokensInOrder(nameTokens, q.tokens)) {
      const exact = q.tokens.filter((t) => nameTokens.includes(t)).length;
      score = 78 + exact * 6 + (q.tokens.length - exact) * 2;
    } else if (
      q.tokens.length > 0 &&
      q.tokens.every(
        (t) =>
          nameTokens.some((nt) => nt === t) ||
          nameTokens.some((nt) => nt.startsWith(t) || (t.length >= 3 && nt.includes(t)))
      )
    ) {
      const exact = q.tokens.filter((t) => nameTokens.includes(t)).length;
      score = 68 + exact * 5;
    } else if (nameLower.startsWith(q.text)) score = 84;
    else if (nameNorm.startsWith(q.norm)) score = 82;
    else if (q.tokens.length === 1) {
      const t = q.tokens[0];
      if (nameTokens.some((nt) => nt === t)) score = 88;
      else if (nameTokens.some((nt) => nt.startsWith(t))) score = 76;
      else if (t.length >= 3 && nameNorm.includes(t)) score = 58;
    } else if (nameLower.includes(q.text)) score = 55;
    else if (q.norm.length >= 3 && nameNorm.includes(q.norm)) score = 50;

    if (q.alias && score > 0) score += 2;
    best = Math.max(best, score);
  }

  return best;
}

function launchPathFromStartApp(sa) {
  const appId = String(sa.appId || sa.AppID || '').trim();
  if (!appId) return null;
  if (/\.exe$/i.test(appId) && fs.existsSync(appId)) return appId;
  if (/\.lnk$/i.test(appId) && fs.existsSync(appId)) return appId;
  return `uwp:${appId}`;
}

function collectFromStartApps(list, queries) {
  const candidates = [];
  for (const sa of list || []) {
    const name = String(sa.name || sa.Name || '').trim();
    const score = scoreName(name, queries);
    if (score <= 0) continue;
    const launchPath = launchPathFromStartApp(sa);
    if (!launchPath) continue;
    candidates.push({
      launchPath,
      name,
      score: score + SOURCE_BOOST.start,
      source: 'start',
    });
  }
  return candidates;
}

function collectFromStore(apps, queries) {
  const candidates = [];
  for (const app of apps || []) {
    const name = String(app.name || '').trim();
    const score = scoreName(name, queries);
    if (score <= 0 || !app.launchPath) continue;
    candidates.push({
      launchPath: app.launchPath,
      name,
      score: score + SOURCE_BOOST.store,
      source: 'store',
    });
  }
  return candidates;
}

function knownExeCandidates(query) {
  const queries = buildQueries(query);
  const keys = new Set(queries.flatMap((q) => [q.text, q.norm]).filter(Boolean));
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const table = {
    cursor: [
      path.join(local, 'Programs', 'cursor', 'Cursor.exe'),
      path.join(local, 'Programs', 'Cursor', 'Cursor.exe'),
    ],
    brave: [
      path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(local, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    ],
    vscode: [
      path.join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'),
      path.join(pf, 'Microsoft VS Code', 'Code.exe'),
      path.join(pf86, 'Microsoft VS Code', 'Code.exe'),
    ],
    code: [
      path.join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'),
      path.join(pf, 'Microsoft VS Code', 'Code.exe'),
    ],
    chrome: [
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ],
    spotify: [
      path.join(local, 'Microsoft', 'WindowsApps', 'Spotify.exe'),
      path.join(local, 'Programs', 'Spotify', 'Spotify.exe'),
    ],
    discord: [
      path.join(local, 'Discord', 'Update.exe'),
      path.join(local, 'Discord', 'app-*', 'Discord.exe'),
    ],
  };

  const out = [];
  for (const key of keys) {
    const paths = table[key];
    if (!paths) continue;
    for (const p of paths) {
      if (p.includes('*')) continue;
      if (fs.existsSync(p)) {
        out.push({
          launchPath: p,
          name: path.basename(p, '.exe'),
          score: 72 + SOURCE_BOOST.known,
          source: 'known',
        });
      }
    }
  }

  if (keys.has('discord') || keys.has(normKey('discord'))) {
    const discordRoot = path.join(local, 'Discord');
    if (fs.existsSync(discordRoot)) {
      try {
        const appDirs = fs.readdirSync(discordRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('app-'));
        for (const d of appDirs) {
          const exe = path.join(discordRoot, d.name, 'Discord.exe');
          if (fs.existsSync(exe)) {
            out.push({
              launchPath: exe,
              name: 'Discord',
              score: 74 + SOURCE_BOOST.known,
              source: 'known',
            });
            break;
          }
        }
      } catch {
        /* */
      }
    }
  }

  return out;
}

function system32Candidates(query) {
  const winDir = process.env.WINDIR || 'C:\\Windows';
  const sys32 = path.join(winDir, 'System32');
  const queries = buildQueries(query);
  const keys = new Set();
  for (const q of queries) {
    keys.add(q.text);
    keys.add(q.norm);
    for (const t of q.tokens) keys.add(t);
  }

  const builtins = {
    notepad: 'notepad.exe',
    calculator: 'calc.exe',
    calc: 'calc.exe',
    paint: 'mspaint.exe',
    mspaint: 'mspaint.exe',
    cmd: 'cmd.exe',
    powershell: 'WindowsPowerShell/v1.0/powershell.exe',
    snippingtool: 'SnippingTool.exe',
    wordpad: 'write.exe',
  };

  const out = [];
  for (const key of keys) {
    const exe = builtins[key];
    if (!exe) continue;
    const full = path.join(sys32, exe);
    if (fs.existsSync(full)) {
      out.push({
        launchPath: full,
        name: key,
        score: 70 + SOURCE_BOOST.system32,
        source: 'system32',
      });
    }
  }
  return out;
}

async function findViaWhere(query) {
  const q = stripOpenPrefix(query).trim();
  if (!q || q.length < 2) return [];
  const names = [`${q}.exe`, q.replace(/\s+/g, '') + '.exe'];
  const out = [];
  for (const exe of [...new Set(names)]) {
    try {
      const { stdout } = await execFileAsync('where.exe', [exe], {
        windowsHide: true,
        timeout: 4000,
        maxBuffer: 256 * 1024,
      });
      const first = String(stdout || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => /\.exe$/i.test(l) && fs.existsSync(l));
      if (first) {
        out.push({
          launchPath: first,
          name: path.basename(first, '.exe'),
          score: 65 + SOURCE_BOOST.where,
          source: 'where',
        });
      }
    } catch {
      /* not in PATH */
    }
  }
  return out;
}

async function findViaGetCommand(query) {
  const q = stripOpenPrefix(query).trim().replace(/'/g, "''");
  if (!q || q.length < 2) return [];
  const ps = `
$ErrorActionPreference='SilentlyContinue'
$names = @('${q}', '${q}.exe')
foreach ($n in $names) {
  $cmd = Get-Command $n -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) {
    $cmd.Source
    break
  }
}
`.trim();
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
      timeout: 6000,
      maxBuffer: 256 * 1024,
    });
    const p = String(stdout || '').trim().split(/\r?\n/)[0]?.trim();
    if (p && /\.exe$/i.test(p) && fs.existsSync(p)) {
      return [
        {
          launchPath: p,
          name: path.basename(p, '.exe'),
          score: 64 + SOURCE_BOOST.command,
          source: 'command',
        },
      ];
    }
  } catch {
    /* */
  }
  return [];
}

function pickBest(candidates) {
  if (!candidates.length) return null;
  const sorted = candidates.sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1];
  if (top.score < MIN_SCORE) return null;
  if (second && top.score - second.score < MIN_GAP && second.score >= MIN_SCORE) {
    return { ...top, ambiguous: true, altName: second.name };
  }
  return top;
}

/**
 * Resolve an app name to a launch path (Start Menu → store → known paths → where/Get-Command).
 */
async function resolveAppLaunch(appName, appsStore) {
  const queries = buildQueries(appName);
  if (!queries.length) return null;

  const candidates = [];

  const startList = await getStartAppsCached();
  candidates.push(...collectFromStartApps(startList, queries));
  candidates.push(...collectFromStore(appsStore?.apps, queries));
  candidates.push(...knownExeCandidates(appName));
  candidates.push(...system32Candidates(appName));

  let best = pickBest(candidates);
  if (best) return best;

  candidates.push(...(await findViaWhere(appName)));
  candidates.push(...(await findViaGetCommand(appName)));
  best = pickBest(candidates);

  return best;
}

module.exports = {
  resolveAppLaunch,
  scoreName,
  buildQueries,
  expandQueries: buildQueries,
  normKey,
  tokenize,
  MIN_SCORE,
};
