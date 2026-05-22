const fs = require('fs');
const path = require('path');
const { createGeminiLiveService } = require('./gemini-live-service.js');
const { formatMemoryForPrompt, updateMemory } = require('./gemini-memory.js');

function buildLanguageInstruction(code) {
  const languages = {
    en: 'English',
    'en-US': 'English (United States)',
    'en-GB': 'English (United Kingdom)',
    ta: 'Tamil',
    hi: 'Hindi',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    zh: 'Mandarin Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic',
    ms: 'Malay',
  };
  const prompt = languages[String(code || 'en').trim()] || languages.en;
  return [
    `PREFERRED LANGUAGE: ${prompt}.`,
    `You MUST speak and write all responses in ${prompt} only.`,
    `Do NOT switch to Japanese, Korean, or any other language unless the user explicitly asks for that language in this session.`,
    `If the user's speech is unclear, still reply in ${prompt}.`,
    `Tool call arguments stay in English; your spoken summary stays in ${prompt}.`,
  ].join(' ');
}

/**
 * Wire Gemini Live to Electron main + existing JARVIS helpers.
 * @param {{
 *   getMainWindow: () => import('electron').BrowserWindow | null;
 *   getUserDataPath: () => string;
 *   readDataSync: () => object;
 *   writeDataSync: (d: object) => void;
 *   emitJarvis: (channel: string, payload?: unknown) => void;
 *   executeLiveTool: (name: string, args: object) => Promise<string>;
 * }} ctx
 */
function createGeminiLiveHost(ctx) {
  let live = null;
  let started = false;

  const promptPath = () => {
    const base = path.join(__dirname, '..', 'data', 'templates', 'gemini-prompt.txt');
    if (fs.existsSync(base)) return base;
    return path.join(ctx.getUserDataPath(), 'gemini-prompt.txt');
  };

  const getSystemInstruction = () => {
    const data = ctx.readDataSync();
    const user = data.settings?.userName || 'Boss';
    let base = 'You are JARVIS, a desktop assistant.';
    try {
      base = fs.readFileSync(promptPath(), 'utf8').trim() || base;
    } catch {
      /* */
    }
    const mem = formatMemoryForPrompt(ctx.getUserDataPath());
    const now = new Date().toString();
    const lang = buildLanguageInstruction(data.settings?.preferredLanguage);
    return `${base}\n\nUser name: ${user}\nCurrent time: ${now}${mem}\n\n${lang}`;
  };

  const getApiKey = () => {
    const data = ctx.readDataSync();
    return String(data.settings?.geminiApiKey || '').trim();
  };

  const broadcast = (ev) => {
    const win = ctx.getMainWindow();
    if (win && !win.isDestroyed()) {
      const payload = { ...ev };
      if (ev.type === 'audio' && ev.pcm) {
        payload.pcm = Buffer.isBuffer(ev.pcm) ? ev.pcm : Buffer.from(ev.pcm);
      }
      win.webContents.send('live:event', payload);
    }
  };

  const ensureService = () => {
    if (live) return live;
    live = createGeminiLiveService({
      getApiKey,
      getSystemInstruction,
      onEvent: broadcast,
      executeTool: async (name, args) => {
        if (name === 'save_memory') {
          const cat = args.category || 'notes';
          const key = args.key || '';
          const value = args.value || '';
          if (key && value) {
            updateMemory(ctx.getUserDataPath(), { [cat]: { [key]: { value } } });
          }
          return 'ok';
        }
        return ctx.executeLiveTool(name, args);
      },
    });
    return live;
  };

  return {
    async start() {
      if (started) return { ok: true };
      started = true;
      const svc = ensureService();
      void svc.start();
      return { ok: true };
    },
    async stop() {
      started = false;
      if (live) await live.stop();
      return { ok: true };
    },
    pushAudio(buffer) {
      if (!started) return;
      ensureService().pushAudio(buffer);
    },
    sendText(text) {
      ensureService().sendText(text);
      return { ok: true };
    },
    setMuted(muted) {
      ensureService().setMuted(muted);
      return { ok: true };
    },
    playbackStarted() {
      return { ok: true };
    },
    playbackEnded() {
      return { ok: true };
    },
    status() {
      return { running: started, hasKey: !!getApiKey() };
    },
    saveApiKey(key) {
      const data = ctx.readDataSync();
      data.settings = data.settings || {};
      data.settings.geminiApiKey = String(key || '').trim();
      ctx.writeDataSync(data);
      return { ok: true };
    },
    testApiKey(key) {
      const k = String(key || getApiKey()).trim();
      if (!k) return { ok: false, error: 'No API key' };
      try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: k });
        return ai.models
          .generateContent({ model: 'gemini-2.5-flash', contents: 'Reply with OK only.' })
          .then((r) => ({ ok: !!(r.text || '').trim(), hint: (r.text || '').slice(0, 80) }))
          .catch((e) => ({ ok: false, error: String(e.message || e) }));
      } catch (e) {
        return Promise.resolve({ ok: false, error: String(e.message || e) });
      }
    },
  };
}

module.exports = { createGeminiLiveHost };
