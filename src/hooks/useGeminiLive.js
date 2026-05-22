import { useCallback, useEffect, useRef, useState } from 'react';
import { getJarvis, isElectron } from '@/jarvis-bridge.js';
import { createPlaybackQueue, floatToPcm16 } from '@/utils/geminiAudio.js';

const LIVE_MOUNT_KEY = '__jarvisLiveMicMounted';

function pcmFromEvent(ev) {
  const raw = ev.pcm;
  if (!raw) return null;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (raw?.type === 'Buffer' && Array.isArray(raw.data)) return Uint8Array.from(raw.data);
  if (raw instanceof Uint8Array) return raw;
  if (Array.isArray(raw)) return Uint8Array.from(raw);
  return new Uint8Array(raw);
}

/**
 * Gemini Live voice session — mic capture + playback + state from main process.
 */
export function useGeminiLive({ enabled = true, hasApiKey = false } = {}) {
  const [voiceState, setVoiceState] = useState('INITIALISING');
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [logs, setLogs] = useState([]);
  const [micLevel, setMicLevel] = useState([]);
  const [statusHint, setStatusHint] = useState('');
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const playbackRef = useRef(null);

  const pushLog = useCallback((role, line) => {
    const text = String(line || '').trim();
    if (!text) return;
    setLogs((prev) => {
      const last = prev[prev.length - 1];
      if (last?.line === text && last?.role === role) return prev;
      return [...prev.slice(-48), { id: `${Date.now()}-${Math.random()}`, role, line: text }];
    });
  }, []);

  useEffect(() => {
    if (!isElectron() || !enabled || !hasApiKey) return undefined;

    if (typeof window !== 'undefined' && window[LIVE_MOUNT_KEY]) {
      return undefined;
    }
    if (typeof window !== 'undefined') window[LIVE_MOUNT_KEY] = true;

    playbackRef.current = createPlaybackQueue();
    playbackRef.current.setOnIdle(() => {
      setSpeaking(false);
    });

    const off = getJarvis().onLiveEvent?.((ev) => {
      if (!ev?.type) return;
      if (ev.type === 'state') {
        const s = ev.state || 'LISTENING';
        setVoiceState(s);
        setSpeaking(s === 'SPEAKING');
        if (s === 'LISTENING') setStatusHint('Listening…');
        else if (s === 'SPEAKING') setStatusHint('Speaking…');
        else if (s === 'THINKING') setStatusHint('Thinking…');
        else if (s === 'MUTED') setStatusHint('Muted');
        else setStatusHint('');
      }
      if (ev.type === 'log') pushLog(ev.role || 'sys', ev.line);
      if (ev.type === 'interrupt') {
        playbackRef.current?.reset();
        setSpeaking(false);
      }
      if (ev.type === 'audio') {
        const buf = pcmFromEvent(ev);
        if (buf?.byteLength >= 2) {
          const int16 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
          playbackRef.current?.scheduleChunk(int16);
        }
      }
    });

    let cancelled = false;

    const startMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        let ctx;
        try {
          ctx = new AudioContext({ sampleRate: 16000 });
        } catch {
          ctx = new AudioContext();
        }
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const proc = ctx.createScriptProcessor(2048, 1, 1);
        let meterTick = 0;
        const muteOut = ctx.createGain();
        muteOut.gain.value = 0;
        src.connect(analyser);
        analyser.connect(proc);
        proc.connect(muteOut);
        muteOut.connect(ctx.destination);

        proc.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          const pcm = floatToPcm16(input, ctx.sampleRate);
          getJarvis().livePushAudio?.(new Uint8Array(pcm.buffer));

          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          const bars = [];
          const step = Math.max(1, Math.floor(data.length / 36));
          for (let i = 0; i < 36; i++) bars.push((data[i * step] || 0) / 255);
          meterTick += 1;
          if (meterTick % 4 === 0) setMicLevel(bars);
        };
        processorRef.current = { ctx, proc, stream };
      } catch (err) {
        pushLog('sys', `Microphone: ${err.message || err}. Allow mic access in Windows Settings.`);
        setStatusHint('Mic blocked');
      }
    };

    void (async () => {
      await getJarvis().liveStart?.();
      if (!cancelled) await startMic();
    })();

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') window[LIVE_MOUNT_KEY] = false;
      off?.();
      try {
        processorRef.current?.proc?.disconnect();
        processorRef.current?.ctx?.close();
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        /* */
      }
      processorRef.current = null;
      streamRef.current = null;
      playbackRef.current?.reset();
    };
  }, [enabled, hasApiKey, pushLog]);

  const toggleMute = useCallback(async () => {
    const next = !muted;
    setMuted(next);
    await getJarvis().liveSetMuted?.(next);
    setVoiceState(next ? 'MUTED' : 'LISTENING');
    setStatusHint(next ? 'Muted' : 'Listening…');
  }, [muted]);

  const sendText = useCallback(async (text) => {
    const t = String(text || '').trim();
    if (!t) return;
    pushLog('user', t);
    await getJarvis().liveSendText?.(t);
  }, [pushLog]);

  return {
    voiceState,
    speaking,
    muted,
    logs,
    micLevel,
    statusHint,
    toggleMute,
    sendText,
  };
}
