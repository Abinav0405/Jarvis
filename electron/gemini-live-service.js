const { GoogleGenAI, Modality } = require('@google/genai');
const { buildToolDeclarations } = require('./gemini-live-tools.js');

const LIVE_MODELS = [
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'models/gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-live-2.5-flash-preview',
];

function cleanTranscript(text) {
  return String(text || '')
    .replace(/<ctrl\d+>/gi, '')
    .replace(/[\x00-\x08\x0b-\x1f]/g, '')
    .trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeAudioPayload(msg) {
  const raw = msg.data;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return Buffer.from(raw, 'base64');
    } catch {
      return Buffer.from(raw);
    }
  }
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  return Buffer.from(raw);
}

/**
 * @param {{
 *   getApiKey: () => string;
 *   getSystemInstruction: () => string;
 *   onEvent: (ev: object) => void;
 *   executeTool: (name: string, args: object) => Promise<string>;
 * }} deps
 */
function createGeminiLiveService(deps) {
  let session = null;
  let running = false;
  let muted = false;
  let turnComplete = true;
  let connectGen = 0;
  let reconnectAttempt = 0;

  const emit = (type, payload = {}) => {
    try {
      deps.onEvent({ type, ...payload });
    } catch {
      /* */
    }
  };

  const pushAudio = (buffer) => {
    if (!session || muted || !Buffer.isBuffer(buffer) || buffer.length < 2) return;
    try {
      session.sendRealtimeInput({
        audio: {
          data: buffer.toString('base64'),
          mimeType: 'audio/pcm',
        },
      });
    } catch (e) {
      console.error('[gemini-live] send audio', e?.message || e);
    }
  };

  const sendText = (text) => {
    const t = String(text || '').trim();
    if (!t || !session) return;
    try {
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: t }] }],
        turnComplete: true,
      });
    } catch (e) {
      console.error('[gemini-live] send text', e?.message || e);
    }
  };

  const setMuted = (m) => {
    muted = !!m;
    emit('state', { state: muted ? 'MUTED' : session ? 'LISTENING' : 'INITIALISING' });
  };

  const stop = async () => {
    running = false;
    connectGen += 1;
    if (session) {
      try {
        session.close();
      } catch {
        /* */
      }
      session = null;
    }
    emit('state', { state: 'INITIALISING' });
  };

  const connectOnce = async (apiKey, instruction) => {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1beta' } });
    let outBuf = [];
    let inBuf = [];
    let loggedOnline = false;
    let lastErr = null;

    for (const modelId of LIVE_MODELS) {
      try {
        await new Promise((resolve, reject) => {
          let settled = false;
          const finish = (err) => {
            if (settled) return;
            settled = true;
            if (err) reject(err);
            else resolve();
          };

          ai.live
            .connect({
              model: modelId,
              config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: instruction,
                tools: [{ functionDeclarations: buildToolDeclarations() }],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Charon' },
                  },
                },
              },
              callbacks: {
                onopen: () => {
                  reconnectAttempt = 0;
                  if (!loggedOnline) {
                    loggedOnline = true;
                    emit('log', { role: 'sys', line: 'Voice core connected — speak anytime.' });
                  }
                  emit('state', { state: muted ? 'MUTED' : 'LISTENING' });
                },
                onmessage: async (msg) => {
                  try {
                    if (msg.setupComplete) {
                      emit('state', { state: muted ? 'MUTED' : 'LISTENING' });
                    }

                    const audioBuf = decodeAudioPayload(msg);
                    if (audioBuf?.length) {
                      turnComplete = false;
                      emit('state', { state: 'SPEAKING' });
                      emit('audio', { pcm: audioBuf });
                    }

                    const sc = msg.serverContent;
                    if (sc) {
                      if (sc.outputTranscription?.text) {
                        outBuf.push(cleanTranscript(sc.outputTranscription.text));
                      }
                      if (sc.inputTranscription?.text) {
                        inBuf.push(cleanTranscript(sc.inputTranscription.text));
                      }
                      if (sc.interrupted) {
                        emit('interrupt');
                      }
                      if (sc.turnComplete) {
                        turnComplete = true;
                        const fullIn = inBuf.join(' ').trim();
                        const fullOut = outBuf.join(' ').trim();
                        if (fullIn) emit('log', { role: 'user', line: fullIn });
                        if (fullOut) emit('log', { role: 'assistant', line: fullOut });
                        inBuf = [];
                        outBuf = [];
                        if (!muted) emit('state', { state: 'LISTENING' });
                      }
                    }

                    const calls = msg.toolCall?.functionCalls;
                    if (calls?.length && session) {
                      emit('state', { state: 'THINKING' });
                      const functionResponses = [];
                      for (const fc of calls) {
                        const name = fc.name;
                        const args = fc.args || {};
                        let result = 'Done.';
                        try {
                          result = await deps.executeTool(name, args);
                        } catch (e) {
                          result = `Tool failed: ${e.message || e}`;
                        }
                        functionResponses.push({
                          id: fc.id,
                          name,
                          response: { result: String(result) },
                        });
                      }
                      session.sendToolResponse({ functionResponses });
                      if (!muted) emit('state', { state: 'LISTENING' });
                    }
                  } catch (e) {
                    console.error('[gemini-live] onmessage', e);
                  }
                },
                onerror: (e) => {
                  lastErr = e instanceof Error ? e : new Error(String(e?.message || e));
                  finish(lastErr);
                },
                onclose: (e) => {
                  session = null;
                  if (!settled && lastErr) finish(lastErr);
                  else finish();
                },
              },
            })
            .then((s) => {
              session = s;
              console.log('[gemini-live] connected:', modelId);
            })
            .catch((e) => {
              lastErr = e;
              finish(e);
            });
        });
        return true;
      } catch (e) {
        lastErr = e;
        console.warn('[gemini-live] model failed:', modelId, e?.message || e);
      }
    }

    throw lastErr || new Error('All live models failed');
  };

  const start = async () => {
    if (running) return;
    running = true;
    const myGen = ++connectGen;

    while (running && myGen === connectGen) {
      const apiKey = deps.getApiKey();
      if (!apiKey) {
        emit('state', { state: 'INITIALISING' });
        await sleep(2500);
        continue;
      }

      emit('state', { state: 'INITIALISING' });
      try {
        await connectOnce(apiKey, deps.getSystemInstruction());
      } catch (e) {
        const msg = e?.message || String(e);
        console.error('[gemini-live] session ended:', msg);
        emit('log', { role: 'sys', line: `Reconnecting… ${msg.slice(0, 120)}` });
        reconnectAttempt += 1;
      }

      session = null;
      if (!running || myGen !== connectGen) break;

      const delay = Math.min(15000, 2000 + reconnectAttempt * 1500);
      emit('state', { state: 'INITIALISING' });
      await sleep(delay);
    }
  };

  return {
    start,
    stop,
    pushAudio,
    sendText,
    setMuted,
    isSpeaking: () => false,
  };
}

module.exports = { createGeminiLiveService, LIVE_MODELS: LIVE_MODELS };
