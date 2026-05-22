import { VOICE_LANGUAGES } from '@/utils/voiceLanguages.js';

/**
 * @param {{ value?: string; onChange: (code: string) => void; className?: string }} props
 */
export function VoiceLanguageSelect({ value = 'en', onChange, className = '' }) {
  return (
    <select
      className={`jarvis-input ${className}`}
      value={value || 'en'}
      onChange={(e) => onChange(e.target.value)}
    >
      {VOICE_LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
