/**
 * URLs for files in /public (copied to dist root). Must be relative so Electron
 * `loadFile(dist/index.html)` resolves them under file:// (root paths like /branding/… break).
 */
export function publicAsset(relativePath) {
  const p = String(relativePath || '').replace(/^\//, '');
  const base = import.meta.env.BASE_URL || './';
  if (base === './' || base === '/') {
    return `./${p}`;
  }
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${b}/${p}`;
}
