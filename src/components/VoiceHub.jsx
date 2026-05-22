import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, SendHorizontal } from 'lucide-react';
import { VoiceCore } from '@/components/VoiceCore.jsx';
import { useGeminiLive } from '@/hooks/useGeminiLive.js';
import { getJarvis } from '@/jarvis-bridge.js';

/**
 * Full-height voice HUD for the dashboard center column.
 */
export function VoiceHub({ hasApiKey, onNavigate }) {
  const [text, setText] = useState('');
  const orbStageRef = useRef(null);
  const { voiceState, speaking, muted, logs, micLevel, toggleMute, sendText } = useGeminiLive({
    enabled: hasApiKey,
    hasApiKey,
  });

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    void sendText(t);
    setText('');
  };

  if (!hasApiKey) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-[rgba(0,212,255,0.2)] bg-[#000B14] px-8 py-12 text-center">
        <p className="max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
          Add your Gemini API key from{' '}
          <a
            href="https://aistudio.google.com/apikey"
            className="text-[var(--accent)] underline"
            onClick={(e) => {
              e.preventDefault();
              getJarvis().openExternal('https://aistudio.google.com/apikey');
            }}
          >
            Google AI Studio
          </a>{' '}
          in Settings to activate the voice core.
        </p>
        <motion.button
          type="button"
          className="mt-5 rounded-pill bg-[var(--accent)] px-6 py-2.5 text-xs font-bold text-black"
          whileTap={{ scale: 0.97 }}
          onClick={() => onNavigate?.('settings')}
        >
          Open Settings
        </motion.button>
      </div>
    );
  }

  return (
    <div className="voice-hub flex h-full min-h-0 flex-col gap-2">
      <div
        ref={orbStageRef}
        className="voice-hub__orb-stage relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[rgba(0,136,170,0.4)] shadow-[0_0_40px_rgba(0,136,170,0.12),inset_0_0_60px_rgba(0,136,170,0.06)]"
      >
        <VoiceCore
          fill
          containerRef={orbStageRef}
          state={voiceState}
          speaking={speaking}
          muted={muted}
          levels={micLevel}
        />
        <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-10 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Type a message…"
            className="jarvis-input min-w-0 flex-1 border-[rgba(0,212,255,0.25)] bg-[rgba(0,11,20,0.85)] text-sm backdrop-blur-md"
          />
          <motion.button
            type="button"
            onClick={submit}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-[var(--accent)] text-black shadow-[0_0_16px_rgba(0,212,255,0.45)]"
            whileTap={{ scale: 0.95 }}
            aria-label="Send"
          >
            <SendHorizontal className="h-4 w-4" />
          </motion.button>
          <motion.button
            type="button"
            onClick={() => void toggleMute()}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border backdrop-blur-md ${
              muted
                ? 'border-rose-500/50 bg-rose-500/20 text-rose-300'
                : 'border-[rgba(0,212,255,0.35)] bg-[rgba(0,11,20,0.85)] text-[var(--text-primary)]'
            }`}
            whileTap={{ scale: 0.95 }}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </motion.button>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="max-h-[72px] shrink-0 overflow-y-auto rounded-xl border border-[rgba(0,136,170,0.18)] bg-[rgba(0,11,20,0.75)] px-3 py-2 jarvis-scrollbar">
          <ul className="space-y-1 text-[10px] leading-relaxed">
            {logs.slice(-6).map((l) => (
              <li
                key={l.id}
                className={
                  l.role === 'user'
                    ? 'text-[var(--accent)]'
                    : l.role === 'assistant'
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] italic'
                }
              >
                {l.role === 'user' ? 'You: ' : l.role === 'assistant' ? 'JARVIS: ' : ''}
                {l.line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
