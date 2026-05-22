import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const Ctx = createContext(null);

export const AI_CHAT_WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  text: 'Online and ready, Boss. What do you need?',
};

export function JarvisSessionProvider({ children }) {
  const [aiTokens, setAiTokens] = useState(0);
  const [chatEpoch, setChatEpoch] = useState(0);
  const [chatMessages, setChatMessages] = useState(() => [AI_CHAT_WELCOME_MESSAGE]);

  const [voiceListeningMode, setVoiceListeningMode] = useState(false);
  const [voiceBarLine, setVoiceBarLine] = useState('');
  const [voiceBarVisible, setVoiceBarVisible] = useState(false);

  const voiceSendRef = useRef(null);

  const addAiTokens = useCallback((n) => {
    setAiTokens((t) => t + (Number(n) || 0));
  }, []);

  const clearChat = useCallback(() => {
    setAiTokens(0);
    setChatMessages([AI_CHAT_WELCOME_MESSAGE]);
    setChatEpoch((e) => e + 1);
  }, []);

  const startNewChat = useCallback(() => {
    setChatMessages([AI_CHAT_WELCOME_MESSAGE]);
    setChatEpoch((e) => e + 1);
  }, []);

  const registerVoiceSend = useCallback((fn) => {
    voiceSendRef.current = typeof fn === 'function' ? fn : null;
  }, []);

  const submitVoiceTranscript = useCallback((text) => {
    const fn = voiceSendRef.current;
    if (fn) fn(String(text || '').trim());
  }, []);

  const value = useMemo(
    () => ({
      aiTokens,
      addAiTokens,
      clearChat,
      startNewChat,
      chatEpoch,
      chatMessages,
      setChatMessages,
      voiceListeningMode,
      setVoiceListeningMode,
      voiceBarLine,
      setVoiceBarLine,
      voiceBarVisible,
      setVoiceBarVisible,
      registerVoiceSend,
      submitVoiceTranscript,
    }),
    [
      aiTokens,
      addAiTokens,
      clearChat,
      startNewChat,
      chatEpoch,
      chatMessages,
      voiceListeningMode,
      voiceBarLine,
      voiceBarVisible,
      registerVoiceSend,
      submitVoiceTranscript,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJarvisSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useJarvisSession must be used within JarvisSessionProvider');
  return v;
}
