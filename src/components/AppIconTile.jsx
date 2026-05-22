import { useState } from 'react';

/** App tile icon: real PNG when present, otherwise initials on a branded gradient (fills box, crops with object-cover). */
export function AppIconTile({ name, iconPng, className = 'h-12 w-12', rounded = 'rounded-[10px]', textClass = 'text-xs' }) {
  const [imgBroken, setImgBroken] = useState(false);
  const label = String(name || '?').trim() || '?';
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (iconPng && !imgBroken) {
    return (
      <span className={`relative block shrink-0 overflow-hidden ${rounded} ${className}`}>
        <img
          src={iconPng}
          alt=""
          className="h-full w-full object-cover object-center"
          draggable={false}
          onError={() => setImgBroken(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-[rgba(0,212,255,0.35)] via-[rgba(0,100,140,0.45)] to-[rgba(20,20,28,0.95)] font-semibold tracking-tight text-[rgba(245,250,255,0.95)] shadow-inner ${textClass} ${rounded} ${className}`}
    >
      {initials}
    </span>
  );
}
