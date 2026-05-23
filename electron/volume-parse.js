/** Parse volume 0–100 from tool args or spoken phrases (e.g. "30", "30%", "thirty"). */

const WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

function parseVolumePercent(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(100, Math.max(0, Math.round(raw)));
  }
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;

  const digitMatch = s.match(/(\d{1,3})\s*%?/);
  if (digitMatch) {
    return Math.min(100, Math.max(0, parseInt(digitMatch[1], 10)));
  }

  for (const [word, val] of Object.entries(WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(s)) return val;
  }

  return null;
}

/** Gemini may pass percent on alternate keys or nested strings. */
function parseVolumeFromToolArgs(args) {
  if (!args || typeof args !== 'object') return null;
  const candidates = [args.percent, args.level, args.volume, args.value, args.amount];
  for (const c of candidates) {
    const n = parseVolumePercent(c);
    if (n != null) return n;
  }
  const joined = Object.values(args)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .join(' ');
  return parseVolumePercent(joined);
}

module.exports = { parseVolumePercent, parseVolumeFromToolArgs };
