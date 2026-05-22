import { useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useJarvisSession } from '@/context/JarvisSessionContext.jsx';
import { getJarvis, isElectron } from '@/jarvis-bridge.js';

function playWakeChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.24);
    setTimeout(() => ctx.close().catch(() => {}), 400);
  } catch {
    /* ignore */
  }
}

/** Looser match for noisy transcripts ("hey jervis", extra punctuation, etc.). */
const WAKE_RE = /\b(hey[\s,.'-]{0,8}jarvis|hey[\s,.'-]{0,8}jervis)\b|\bjarvis\b/i;

/**
 * @param {'mic' | 'speech'} reason
 */
function wakeUnavailableMessage(reason) {
  if (reason === 'mic') {
    return 'Microphone blocked for JARVIS. Windows Settings → Privacy & security → Microphone → allow desktop apps. Then turn wake word off and on in Settings.';
  }
  return 'Wake word needs Google speech (Electron). Add GOOGLE_API_KEY.txt in your JARVIS data folder, restart JARVIS, or turn off wake word in Settings.';
}

export function VoiceJarvis({ data, persist, pushToast }) {
  const {
    submitVoiceTranscript,
    setVoiceListeningMode,
    setVoiceBarLine,
    setVoiceBarVisible,
    voiceBarVisible,
    voiceBarLine,
  } = useJarvisSession();

  const recRef = useRef(null);
  const modeRef = useRef('wake');
  const silenceTimerRef = useRef(null);
  const restartTimerRef = useRef(null);
  const wakeKeepAliveIdRef = useRef(null);
  const cmdBufRef = useRef('');
  const wakeBufRef = useRef('');
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const barsRef = useRef(null);
  const toastOnceRef = useRef(new Set());
  /** Stops onend / keep-alive from restarting after a fatal mic or speech error. */
  const fatalRef = useRef(null);
  const cancelledRef = useRef(false);
  const bootstrappedRef = useRef(false);

  const showToastOnce = useCallback(
    (key, message, type = 'info') => {
      if (toastOnceRef.current.has(key)) return;
      toastOnceRef.current.add(key);
      pushToast?.(message, type);
    },
    [pushToast],
  );

  const clearSilence = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopMicAnalyser = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const tickBars = useCallback(() => {
    const an = analyserRef.current;
    const el = barsRef.current;
    if (!an || !el) return;
    const buf = new Uint8Array(an.frequencyBinCount);
    const draw = () => {
      const a = analyserRef.current;
      const node = barsRef.current;
      if (!a || !node) return;
      a.getByteFrequencyData(buf);
      const n = 24;
      const step = Math.max(1, Math.floor(buf.length / n));
      let out = '';
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (let j = 0; j < step; j++) v += buf[i * step + j] || 0;
        v /= step;
        const h = 4 + (v / 255) * 28;
        out += `<span style="display:inline-block;width:4px;height:${h}px;margin:0 1px;border-radius:2px;background:rgba(0,212,255,0.85);vertical-align:bottom"></span>`;
      }
      node.innerHTML = out;
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  const startMicAnalyser = useCallback(async () => {
    stopMicAnalyser();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      analyserRef.current = an;
      tickBars();
    } catch {
      /* waveform optional */
    }
  }, [stopMicAnalyser, tickBars]);

  const haltRecognition = useCallback(() => {
    cancelledRef.current = true;
    if (wakeKeepAliveIdRef.current) {
      clearInterval(wakeKeepAliveIdRef.current);
      wakeKeepAliveIdRef.current = null;
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    clearSilence();
    stopMicAnalyser();
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    setVoiceListeningMode(false);
    setVoiceBarVisible(false);
    setVoiceBarLine('');
  }, [clearSilence, setVoiceBarLine, setVoiceBarVisible, setVoiceListeningMode, stopMicAnalyser]);

  const markWakeUnavailable = useCallback(
    async (reason) => {
      if (fatalRef.current === reason) return;
      fatalRef.current = reason;
      haltRecognition();
      showToastOnce(`wake-${reason}`, wakeUnavailableMessage(reason), reason === 'mic' ? 'error' : 'info');
      try {
        await persist?.((d) => ({
          ...d,
          settings: {
            ...d.settings,
            micPermissionAsked: true,
            voiceWakeUnavailable: reason,
          },
        }));
      } catch {
        /* */
      }
    },
    [haltRecognition, persist, showToastOnce],
  );

  const finishCommand = useCallback(
    (text) => {
      if (fatalRef.current) return;
      clearSilence();
      modeRef.current = 'wake';
      wakeBufRef.current = '';
      setVoiceListeningMode(false);
      stopMicAnalyser();
      const t = String(text || '')
        .replace(WAKE_RE, '')
        .trim();
      if (t) {
        setVoiceBarVisible(true);
        setVoiceBarLine(`I heard: ${t}`);
        submitVoiceTranscript(t);
        setTimeout(() => {
          setVoiceBarVisible(false);
          setVoiceBarLine('');
        }, 1800);
      } else {
        setVoiceBarVisible(false);
        setVoiceBarLine('');
      }
      if (cancelledRef.current || fatalRef.current) return;
      try {
        recRef.current?.start();
      } catch {
        /* */
      }
    },
    [clearSilence, setVoiceBarLine, setVoiceBarVisible, setVoiceListeningMode, stopMicAnalyser, submitVoiceTranscript],
  );

  const scheduleSilenceEnd = useCallback(() => {
    clearSilence();
    silenceTimerRef.current = setTimeout(() => {
      finishCommand(cmdBufRef.current);
    }, 5000);
  }, [clearSilence, finishCommand]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return undefined;

    const enabled = data?.settings?.wakeWordEnabled !== false;
    if (!enabled) {
      setVoiceBarVisible(false);
      setVoiceListeningMode(false);
      return undefined;
    }

    const priorBlock = data?.settings?.voiceWakeUnavailable;
    if (priorBlock === 'mic' || priorBlock === 'speech') {
      fatalRef.current = priorBlock;
      return undefined;
    }

    let cancelled = false;
    cancelledRef.current = false;
    fatalRef.current = null;
    toastOnceRef.current = new Set();
    bootstrappedRef.current = false;

    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    recRef.current = rec;

    const safeStart = () => {
      if (cancelled || cancelledRef.current || fatalRef.current) return false;
      try {
        rec.start();
        return true;
      } catch {
        return false;
      }
    };

    const armRestart = () => {
      if (fatalRef.current) return;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (cancelled || cancelledRef.current || fatalRef.current || modeRef.current !== 'wake') return;
        try {
          rec.stop();
        } catch {
          /* */
        }
        setTimeout(() => {
          if (cancelled || cancelledRef.current || fatalRef.current || modeRef.current !== 'wake') return;
          safeStart();
        }, 400);
      }, 30000);
    };

    rec.onresult = (ev) => {
      if (fatalRef.current) return;
      if (modeRef.current === 'wake') {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          wakeBufRef.current += ev.results[i][0].transcript;
          if (wakeBufRef.current.length > 200) wakeBufRef.current = wakeBufRef.current.slice(-200);
          if (WAKE_RE.test(wakeBufRef.current)) {
            wakeBufRef.current = '';
            try {
              rec.stop();
            } catch {
              /* */
            }
            modeRef.current = 'command';
            cmdBufRef.current = '';
            playWakeChime();
            setVoiceListeningMode(true);
            setVoiceBarVisible(true);
            setVoiceBarLine('Listening...');
            void startMicAnalyser();
            setTimeout(() => {
              if (cancelled || fatalRef.current) return;
              safeStart();
              scheduleSilenceEnd();
            }, 280);
            return;
          }
        }
        armRestart();
        return;
      }

      let chunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        chunk += ev.results[i][0].transcript;
      }
      if (chunk) {
        cmdBufRef.current = (cmdBufRef.current + chunk).trim();
        scheduleSilenceEnd();
      }
    };

    rec.onerror = (e) => {
      const code = String(e?.error || 'unknown');
      if (code === 'aborted' || code === 'no-speech') return;

      if (code === 'not-allowed' || code === 'audio-capture') {
        void markWakeUnavailable('mic');
        return;
      }

      if (code === 'network' || code === 'service-not-allowed') {
        if (isElectron()) {
          void (async () => {
            let keyLine =
              'Add GOOGLE_API_KEY.txt (one line) next to presets.json, then restart — see Settings → General.';
            try {
              const info = await getJarvis().getRuntimeInfo?.();
              if (info?.speechKeyConfigured) {
                keyLine = 'A key is loaded — check network, VPN, or firewall to Google speech endpoints.';
              } else if (info?.userDataPath) {
                keyLine = `Put GOOGLE_API_KEY.txt here, then restart: ${info.userDataPath}`;
              }
            } catch {
              /* */
            }
            showToastOnce(
              'speech-service',
              `Wake word cannot reach Google's speech service in Electron. ${keyLine}`,
              'info',
            );
            void markWakeUnavailable('speech');
          })();
        } else {
          showToastOnce('speech-network', 'Voice recognition needs internet. Use typed AI Chat instead.', 'error');
        }
        return;
      }

      showToastOnce(`speech-${code}`, `Voice recognition error: ${code}. Use typed chat or turn off wake word.`, 'error');
    };

    rec.onend = () => {
      if (cancelled || cancelledRef.current || fatalRef.current) return;
      if (modeRef.current === 'wake') {
        safeStart();
      }
    };

    const boot = async () => {
      if (bootstrappedRef.current) {
        if (!fatalRef.current) safeStart();
        return;
      }
      bootstrappedRef.current = true;

      if (!data?.settings?.micPermissionAsked) {
        showToastOnce('mic-intro', 'JARVIS needs microphone access for “Hey Jarvis”. Allow when Windows asks.', 'info');
      }

      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!data?.settings?.micPermissionAsked) {
          await persist?.((d) => ({
            ...d,
            settings: { ...d.settings, micPermissionAsked: true },
          }));
        }
      } catch {
        void markWakeUnavailable('mic');
        return;
      }

      if (cancelled || fatalRef.current) return;
      if (!safeStart()) {
        void markWakeUnavailable('mic');
        return;
      }
      armRestart();
    };

    void boot();

    wakeKeepAliveIdRef.current = setInterval(() => {
      if (cancelled || cancelledRef.current || fatalRef.current || modeRef.current !== 'wake') return;
      try {
        rec.stop();
      } catch {
        /* */
      }
      setTimeout(() => {
        if (cancelled || cancelledRef.current || fatalRef.current || modeRef.current !== 'wake') return;
        safeStart();
        armRestart();
      }, 450);
    }, 30000);

    return () => {
      cancelled = true;
      cancelledRef.current = true;
      bootstrappedRef.current = false;
      if (wakeKeepAliveIdRef.current) {
        clearInterval(wakeKeepAliveIdRef.current);
        wakeKeepAliveIdRef.current = null;
      }
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      clearSilence();
      stopMicAnalyser();
      try {
        rec.stop();
      } catch {
        /* */
      }
      recRef.current = null;
      modeRef.current = 'wake';
      wakeBufRef.current = '';
      setVoiceListeningMode(false);
      setVoiceBarVisible(false);
      setVoiceBarLine('');
    };
  }, [
    clearSilence,
    data?.settings?.voiceWakeUnavailable,
    data?.settings?.wakeWordEnabled,
    data?.settings?.micPermissionAsked,
    markWakeUnavailable,
    persist,
    scheduleSilenceEnd,
    setVoiceBarLine,
    setVoiceBarVisible,
    setVoiceListeningMode,
    showToastOnce,
    startMicAnalyser,
    stopMicAnalyser,
  ]);

  return (
    <motion.div
      className={`pointer-events-none fixed inset-x-0 bottom-5 z-[150] flex justify-center px-4 transition-opacity duration-200 ${
        voiceBarVisible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden={!voiceBarVisible}
    >
      <div className="pointer-events-none flex max-w-lg items-center gap-3 rounded-pill border border-[rgba(0,212,255,0.35)] bg-[rgba(8,10,14,0.72)] px-5 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-glass">
        <div
          ref={barsRef}
          className="flex h-8 min-w-[120px] items-end justify-center gap-0.5"
          aria-hidden
        />
        <motion.p
          className="text-sm font-medium text-[var(--accent)]"
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          {voiceBarLine || 'Listening...'}
        </motion.p>
      </div>
    </motion.div>
  );
}
