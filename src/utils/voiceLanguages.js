/** Preferred voice / Live response languages for Gemini system instruction. */
export const VOICE_LANGUAGES = [
  { code: 'en', label: 'English', prompt: 'English' },
  { code: 'en-US', label: 'English (US)', prompt: 'English (United States)' },
  { code: 'en-GB', label: 'English (UK)', prompt: 'English (United Kingdom)' },
  { code: 'ta', label: 'Tamil', prompt: 'Tamil' },
  { code: 'hi', label: 'Hindi', prompt: 'Hindi' },
  { code: 'es', label: 'Spanish', prompt: 'Spanish' },
  { code: 'fr', label: 'French', prompt: 'French' },
  { code: 'de', label: 'German', prompt: 'German' },
  { code: 'pt', label: 'Portuguese', prompt: 'Portuguese' },
  { code: 'zh', label: 'Chinese (Mandarin)', prompt: 'Mandarin Chinese' },
  { code: 'ja', label: 'Japanese', prompt: 'Japanese' },
  { code: 'ko', label: 'Korean', prompt: 'Korean' },
  { code: 'ar', label: 'Arabic', prompt: 'Arabic' },
  { code: 'ms', label: 'Malay', prompt: 'Malay' },
];

export function resolveVoiceLanguage(code) {
  const c = String(code || 'en').trim();
  return VOICE_LANGUAGES.find((l) => l.code === c) || VOICE_LANGUAGES[0];
}

/** Strong instruction block appended to Gemini Live system prompt. */
export function buildLanguageInstruction(code) {
  const { prompt } = resolveVoiceLanguage(code);
  return [
    `PREFERRED LANGUAGE: ${prompt}.`,
    `You MUST speak and write all responses in ${prompt} only.`,
    `Do NOT switch to Japanese, Korean, or any other language unless the user explicitly asks for that language in this session.`,
    `If the user's speech is unclear, still reply in ${prompt}.`,
    `Tool call arguments stay in English; your spoken summary stays in ${prompt}.`,
  ].join(' ');
}
