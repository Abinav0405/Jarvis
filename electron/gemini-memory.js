const fs = require('fs');
const path = require('path');

const DEFAULT = {
  identity: {},
  preferences: {},
  projects: {},
  notes: {},
};

function memoryPath(userDataDir) {
  return path.join(userDataDir, 'memory', 'long_term.json');
}

function loadMemory(userDataDir) {
  const p = memoryPath(userDataDir);
  try {
    if (!fs.existsSync(p)) return { ...DEFAULT };
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { ...DEFAULT, ...raw };
  } catch {
    return { ...DEFAULT };
  }
}

function saveMemory(userDataDir, data) {
  const dir = path.join(userDataDir, 'memory');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(memoryPath(userDataDir), JSON.stringify(data, null, 2), 'utf8');
}

function updateMemory(userDataDir, patch) {
  const mem = loadMemory(userDataDir);
  for (const [cat, entries] of Object.entries(patch || {})) {
    if (!mem[cat]) mem[cat] = {};
    Object.assign(mem[cat], entries);
  }
  saveMemory(userDataDir, mem);
  return mem;
}

function formatMemoryForPrompt(userDataDir, maxLines = 16) {
  const mem = loadMemory(userDataDir);
  const lines = [];
  for (const [cat, entries] of Object.entries(mem)) {
    for (const [key, val] of Object.entries(entries || {})) {
      const v = val && typeof val === 'object' ? val.value : val;
      if (v) lines.push(`[${cat}/${key}] ${v}`);
    }
  }
  if (!lines.length) return '';
  const trimmed = lines.slice(0, maxLines);
  const suffix = lines.length > maxLines ? `\n…(${lines.length - maxLines} more memories omitted)` : '';
  return `\nLong-term memory:\n${trimmed.join('\n')}${suffix}`;
}

module.exports = { loadMemory, saveMemory, updateMemory, formatMemoryForPrompt };
