import { useEffect, useMemo, useState } from 'react';
import { Globe } from 'lucide-react';
import { faviconSourcesForHost, hostFromLinkUrl } from '@/utils/linkFavicon.js';

/** Favicon for pinned web links with CDN fallbacks and letter placeholder. */
export function PinnedLinkFavicon({ url, name, className = 'h-6 w-6 rounded' }) {
  const host = useMemo(() => hostFromLinkUrl(url), [url]);
  const sources = useMemo(() => faviconSourcesForHost(host), [host]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [host]);

  const failed = idx >= sources.length;
  const initial = (name || host || '?').trim().charAt(0).toUpperCase() || '?';

  if (!host || failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded bg-[rgba(255,255,255,0.08)] text-[var(--accent)] ${className}`}
        aria-hidden
      >
        {failed && host ? (
          <span className="text-[11px] font-semibold">{initial}</span>
        ) : (
          <Globe className="h-3.5 w-3.5 opacity-70" />
        )}
      </div>
    );
  }

  return (
    <img
      src={sources[idx]}
      alt=""
      className={`shrink-0 object-contain ${className}`}
      loading="lazy"
      decoding="async"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
