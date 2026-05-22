/** Creator name and credit line — single source for UI, window title, and package metadata. */
export const CREATOR_NAME = 'Mr Arumugam Abinav';
export const CREATOR_ATTRIBUTION = `Created by ${CREATOR_NAME} © All rights reserved`;

/** Subtle creator/copyright line for full-screen boot and setup flows. */
export function CreatorAttribution({ className = '', inline = false }) {
  return (
    <p
      className={`pointer-events-none z-10 text-center text-[10px] tracking-wide text-[var(--text-muted)] opacity-70 ${
        inline ? 'relative' : 'absolute bottom-4 left-0 right-0'
      } ${className}`}
    >
      {CREATOR_ATTRIBUTION}
    </p>
  );
}
