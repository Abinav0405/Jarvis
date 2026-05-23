#!/usr/bin/env node
/** Quick resolver smoke test — empty apps store, Start Menu + fallbacks only. */
const { resolveAppLaunch } = require('../electron/app-launcher');

const EMPTY_STORE = { apps: [] };
const NAMES = [
  'notepad',
  'calculator',
  'calc',
  'spotify',
  'discord',
  'paint',
  'photos',
  'visual studio code',
  'google chrome',
  'cursor',
  'brave',
  'snipping tool',
  'wordpad',
];

async function main() {
  console.log('Testing resolveAppLaunch with empty apps store...\n');
  let ok = 0;
  let fail = 0;

  for (const name of NAMES) {
    const hit = await resolveAppLaunch(name, EMPTY_STORE);
    if (hit?.launchPath) {
      ok += 1;
      const amb = hit.ambiguous ? ` (ambiguous vs ${hit.altName})` : '';
      console.log(`✓ ${name.padEnd(22)} → ${hit.name} [${hit.source}] score=${hit.score}${amb}`);
      console.log(`  ${hit.launchPath}`);
    } else {
      fail += 1;
      console.log(`✗ ${name.padEnd(22)} → NOT FOUND`);
    }
  }

  console.log(`\n${ok}/${NAMES.length} resolved, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
