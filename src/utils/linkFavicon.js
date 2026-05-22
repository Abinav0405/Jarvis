/** Hostname from a pinned URL (adds https:// when missing). */
export function hostFromLinkUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.replace(/^www\./i, '');
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '');
  }
}

/** Ordered favicon sources (DuckDuckGo first — stable, no gstatic redirect). */
export function faviconSourcesForHost(host) {
  const h = String(host || '').trim();
  if (!h) return [];
  return [
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(h)}.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64`,
    `https://${h}/favicon.ico`,
  ];
}
