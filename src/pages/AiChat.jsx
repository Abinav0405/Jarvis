import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_CHAT_WELCOME_MESSAGE, useJarvisSession } from '@/context/JarvisSessionContext.jsx';
import { getJarvis } from '@/jarvis-bridge.js';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FileText,
  History,
  ImagePlus,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Save,
  SendHorizontal,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { formatBytes } from '@/utils/format.js';
import { publicAsset } from '@/utils/publicAsset.js';

const MAX_SAVED_CHATS = 40;

const CHAT_FILE_EXT = /\.(pdf|txt|md|js|jsx|ts|tsx|json|csv)$/i;

function deriveHistoryTitle(messages) {
  const first = messages.find((m) => m.role === 'user' && String(m.text || '').trim());
  if (!first) return 'Chat';
  const t = String(first.text).trim();
  return t.length > 56 ? `${t.slice(0, 56)}…` : t;
}

function formatHistoryTime(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT =
  'You are JARVIS, a sharp and efficient personal AI assistant built into a desktop system manager app. You help the user manage their computer, open apps, search the web, and answer any question. Be concise, intelligent, and slightly witty. Always address the user as Boss. When the user asks you to perform a system action (like opening a preset, searching the web, or checking system stats), respond with your normal message AND include a special JSON block at the very end of your response wrapped in <action></action> tags, like: <action>{"type": "open_preset", "name": "Developer"}</action>. Supported action types: open_preset (name), search_web (query, engine), get_system_stats, close_preset (name).';

function parseAction(text) {
  const m = text.match(/<action>([\s\S]*?)<\/action>/i);
  if (!m) return { clean: text, action: null };
  let action = null;
  try {
    action = JSON.parse(m[1].trim());
  } catch {
    action = null;
  }
  const clean = text.replace(/<action>[\s\S]*?<\/action>/i, '').trim();
  return { clean, action };
}

function isReadScreenPhrase(t) {
  const s = String(t || '').toLowerCase();
  return (
    s.includes("what's on my screen") ||
    s.includes('what is on my screen') ||
    s.includes('read my screen') ||
    s.includes('whats on my screen')
  );
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

/** Plain text for TTS — strip actions and trim length. */
function stripForSpeech(text) {
  return String(text || '')
    .replace(/<action>[\s\S]*?<\/action>/gi, '')
    .replace(/[*_`#>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

function userMessageToAnthropicBlocks(m) {
  const text = String(m.text || '').trim() || ' ';
  if (m.imageDataUrl) {
    const parsed = parseDataUrl(m.imageDataUrl);
    if (!parsed) return text;
    return [
      { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data } },
      { type: 'text', text },
    ];
  }
  return text;
}

export function AiChat({
  data,
  refresh,
  persist,
  pushToast,
  screenCaptureVersion = 0,
  onScreenCaptureConsumed,
  seedPrompt = null,
  onSeedConsumed,
}) {
  const { chatMessages, setChatMessages, chatEpoch, addAiTokens, startNewChat, registerVoiceSend } = useJarvisSession();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef(null);
  const [pendingScreen, setPendingScreen] = useState(null);
  const [pendingImagePick, setPendingImagePick] = useState(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const imgInputRef = useRef(null);
  const sendRef = useRef(async () => {});

  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTtsOn, setVoiceTtsOn] = useState(true);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const voiceRecRef = useRef(null);
  const voiceFinalsRef = useRef('');
  const prevBusyForTtsRef = useRef(false);
  const usedVoiceThisSessionRef = useRef(false);
  const skipVoiceEndSendRef = useRef(false);

  const savedChats = Array.isArray(data.aiChatHistory) ? data.aiChatHistory : [];
  const sortedSaved = [...savedChats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  useEffect(() => {
    setInput('');
    setBusy(false);
    setPendingScreen(null);
    setPendingImagePick(null);
    setAttachedFile(null);
    skipVoiceEndSendRef.current = true;
    try {
      voiceRecRef.current?.stop();
    } catch {
      /* */
    }
    voiceRecRef.current = null;
    setVoiceListening(false);
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* */
    }
    setVoiceSpeaking(false);
    usedVoiceThisSessionRef.current = false;
  }, [chatEpoch]);

  useEffect(() => {
    const t = String(seedPrompt || '').trim();
    if (!t) return;
    setInput(t);
    onSeedConsumed?.();
  }, [seedPrompt, onSeedConsumed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, busy, pendingScreen, attachedFile]);

  useEffect(() => {
    if (!screenCaptureVersion) return undefined;
    let cancelled = false;
    (async () => {
      const r = await getJarvis().capturePrimaryDisplay?.();
      onScreenCaptureConsumed?.();
      if (cancelled) return;
      if (r?.ok && r.dataUrl) {
        setPendingScreen({ dataUrl: r.dataUrl });
        setInput((prev) => (prev && prev.trim() ? prev : "What's on my screen?"));
      } else {
        pushToast?.("Couldn't capture screen, Boss. Check permissions.", 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screenCaptureVersion, onScreenCaptureConsumed, pushToast]);

  const apiKey = data.settings?.apiKey || '';
  const provider = data.settings?.aiProvider || 'anthropic';
  const ollamaBaseUrl = (data.settings?.ollamaBaseUrl || 'http://127.0.0.1:11434').trim();
  const ollamaModel = (data.settings?.ollamaModel || 'llama3.2').trim();
  const userCount = chatMessages.filter((m) => m.role === 'user').length;
  const showChips = userCount === 0;

  const loadPathAsAttachedFile = useCallback(
    async (absPath) => {
      const r = await getJarvis().readChatFile?.(absPath);
      if (!r?.ok) {
        if (r?.error === 'Unsupported type') pushToast?.("I can't read that file type yet, Boss.", 'error');
        else if (String(r?.error || '').toLowerCase().includes('pdf')) pushToast?.("Couldn't read that PDF — try a different file.", 'error');
        else pushToast?.('Could not read that file, Boss.', 'error');
        return;
      }
      if (r.truncated) pushToast?.("File was large so I'm only using the first 50,000 characters, Boss.", 'info');
      setAttachedFile({ name: r.name, size: r.size, text: r.text });
      setInput((prev) => (prev && prev.trim() ? prev : 'Summarise this file'));
    },
    [pushToast]
  );

  const cancelVoiceSpeech = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* */
    }
    setVoiceSpeaking(false);
  }, []);

  const speakAssistant = useCallback(
    (text) => {
      if (!voiceTtsOn || !text) return;
      const plain = stripForSpeech(text);
      if (!plain) return;
      try {
        window.speechSynthesis?.cancel();
        const ut = new SpeechSynthesisUtterance(plain);
        ut.rate = 1.02;
        ut.pitch = 1;
        ut.onstart = () => setVoiceSpeaking(true);
        ut.onend = () => setVoiceSpeaking(false);
        ut.onerror = () => setVoiceSpeaking(false);
        window.speechSynthesis.speak(ut);
      } catch {
        setVoiceSpeaking(false);
      }
    },
    [voiceTtsOn]
  );

  const stopVoiceListening = useCallback(() => {
    const rec = voiceRecRef.current;
    if (!rec) {
      setVoiceListening(false);
      return;
    }
    try {
      rec.stop();
    } catch {
      voiceRecRef.current = null;
      setVoiceListening(false);
    }
  }, []);

  const startVoiceListening = useCallback(async () => {
    if (busy || voiceListening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      pushToast?.('Speech recognition is not available here, Boss.', 'error');
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      pushToast?.('Microphone access is needed for voice input.', 'error');
      return;
    }
    cancelVoiceSpeech();
    skipVoiceEndSendRef.current = false;
    voiceFinalsRef.current = '';
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    voiceRecRef.current = rec;

    rec.onresult = (ev) => {
      let interim = '';
      let finals = voiceFinalsRef.current;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const tr = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finals += tr;
        else interim += tr;
      }
      voiceFinalsRef.current = finals;
      setInput((finals + interim).trim());
    };

    rec.onerror = (e) => {
      const code = String(e?.error || '');
      if (code === 'aborted' || code === 'no-speech') return;
      pushToast?.(`Voice input: ${code}`, 'error');
      skipVoiceEndSendRef.current = true;
      try {
        rec.stop();
      } catch {
        /* */
      }
    };

    rec.onend = () => {
      voiceRecRef.current = null;
      setVoiceListening(false);
      const t = voiceFinalsRef.current.trim();
      voiceFinalsRef.current = '';
      if (skipVoiceEndSendRef.current) {
        skipVoiceEndSendRef.current = false;
        return;
      }
      if (t) {
        usedVoiceThisSessionRef.current = true;
        void sendRef.current(t);
      }
    };

    try {
      rec.start();
      setVoiceListening(true);
      usedVoiceThisSessionRef.current = true;
    } catch {
      pushToast?.('Could not start the microphone, Boss.', 'error');
      voiceRecRef.current = null;
      setVoiceListening(false);
    }
  }, [busy, voiceListening, pushToast, cancelVoiceSpeech]);

  useEffect(() => {
    if (prevBusyForTtsRef.current && !busy && voiceTtsOn && usedVoiceThisSessionRef.current) {
      const last = chatMessages[chatMessages.length - 1];
      if (last?.role === 'assistant' && !last.error && last.text) {
        speakAssistant(last.text);
      }
    }
    prevBusyForTtsRef.current = busy;
  }, [busy, chatMessages, voiceTtsOn, speakAssistant]);

  useEffect(() => {
    return () => {
      skipVoiceEndSendRef.current = true;
      try {
        voiceRecRef.current?.stop();
      } catch {
        /* */
      }
      voiceRecRef.current = null;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* */
      }
    };
  }, []);

  const send = useCallback(
    async (rawText) => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* */
      }
      setVoiceSpeaking(false);
      if (voiceRecRef.current) {
        skipVoiceEndSendRef.current = true;
        try {
          voiceRecRef.current.stop();
        } catch {
          /* */
        }
        voiceRecRef.current = null;
        setVoiceListening(false);
      }

      let text = (rawText ?? input).trim();
      let screenSnap = pendingScreen;
      let imgSnap = pendingImagePick;

      if (text && isReadScreenPhrase(text) && !busy) {
        const r = await getJarvis().capturePrimaryDisplay?.();
        if (r?.ok && r.dataUrl) {
          screenSnap = { dataUrl: r.dataUrl };
          text = "What's on my screen?";
        } else {
          pushToast?.("Couldn't capture screen, Boss. Check permissions.", 'error');
          return;
        }
      }

      setPendingScreen(null);
      setPendingImagePick(null);

      const imageForSend = screenSnap?.dataUrl || imgSnap?.dataUrl || null;
      const isScreen = Boolean(screenSnap?.dataUrl);

      if (!text && !imageForSend) return;
      if (!text && imageForSend) text = isScreen ? "What's on my screen?" : 'Describe this image.';

      if (busy) return;
      if (provider === 'anthropic' && !apiKey) {
        setChatMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: 'Add your Claude API key in Settings first, Boss.',
            error: true,
          },
        ]);
        return;
      }
      if (provider === 'ollama' && !ollamaModel) {
        setChatMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: 'Set an Ollama model name in Settings, Boss.',
            error: true,
          },
        ]);
        return;
      }
      if (imageForSend && provider === 'ollama') {
        pushToast?.('Vision in this chat needs Claude (Anthropic), Boss.', 'info');
        setBusy(false);
        return;
      }

      setBusy(true);
      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        ...(imageForSend
          ? {
              imageDataUrl: imageForSend,
              screenCapture: isScreen,
            }
          : {}),
      };
      const thread = [...chatMessages, userMsg];
      setChatMessages(thread);
      setInput('');

      let filePrefix = '';
      if (attachedFile?.text) {
        filePrefix = `\n\nThe user has attached a file named ${attachedFile.name}. Here is its content:\n${attachedFile.text}\nAnswer the user's questions about this file.`;
      }

      try {
        const msgs = thread.map((m) => {
          if (m.role !== 'user' && m.role !== 'assistant') return null;
          const role = m.role === 'user' ? 'user' : 'assistant';
          if (role === 'assistant') return { role, content: m.text || '' };
          return { role, content: userMessageToAnthropicBlocks(m) };
        }).filter(Boolean);

        let raw;
        if (provider === 'ollama') {
          const flat = msgs.map((x) => ({ role: x.role, content: typeof x.content === 'string' ? x.content : JSON.stringify(x.content) }));
          const out = await getJarvis().ollamaChat({
            baseUrl: ollamaBaseUrl,
            model: ollamaModel,
            messages: [{ role: 'system', content: SYSTEM_PROMPT + filePrefix }, ...flat],
          });
          addAiTokens((Number(out.promptEval) || 0) + (Number(out.evalCount) || 0));
          raw = out.text || 'Nothing came back on the wire, Boss.';
        } else {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 1024,
              system: SYSTEM_PROMPT + filePrefix,
              messages: msgs,
            }),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(errText || `HTTP ${res.status}`);
          }
          const json = await res.json();
          const usage = json.usage || {};
          addAiTokens((usage.input_tokens || 0) + (usage.output_tokens || 0));
          raw =
            (json.content && json.content[0] && json.content[0].text) || 'Nothing came back on the wire, Boss.';
        }

        const { clean, action } = parseAction(raw);
        if (action && action.type) {
          const result = await getJarvis().executeAction(action);
          if (action.type === 'get_system_stats' && result?.statsText) {
            setChatMessages((m) => [
              ...m,
              { id: crypto.randomUUID(), role: 'assistant', text: clean || 'Here are the vitals, Boss.' },
              { id: crypto.randomUUID(), role: 'assistant', text: result.statsText },
            ]);
          } else {
            setChatMessages((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', text: clean || 'Done, Boss.' }]);
          }
          await refresh?.();
        } else {
          setChatMessages((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', text: clean }]);
        }
      } catch (err) {
        const detail =
          err && typeof err === 'object' && 'message' in err && err.message
            ? String(err.message)
            : 'Something went wrong, Boss. Try again.';
        setChatMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: detail.length > 600 ? `${detail.slice(0, 600)}…` : detail,
            error: true,
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [
      addAiTokens,
      apiKey,
      attachedFile,
      busy,
      chatMessages,
      input,
      ollamaBaseUrl,
      ollamaModel,
      pendingImagePick,
      pendingScreen,
      provider,
      pushToast,
      refresh,
      setChatMessages,
    ]
  );

  sendRef.current = send;

  useEffect(() => {
    registerVoiceSend((t) => {
      void sendRef.current(t);
    });
    return () => registerVoiceSend(null);
  }, [registerVoiceSend]);

  const saveCurrentToHistory = useCallback(async () => {
    if (userCount === 0) {
      pushToast?.('Nothing to save yet, Boss.', 'info');
      return;
    }
    try {
      await persist((d) => {
        const prev = Array.isArray(d.aiChatHistory) ? d.aiChatHistory : [];
        const entry = {
          id: crypto.randomUUID(),
          title: deriveHistoryTitle(chatMessages),
          updatedAt: Date.now(),
          messages: structuredClone(chatMessages),
        };
        return { ...d, aiChatHistory: [entry, ...prev].slice(0, MAX_SAVED_CHATS) };
      });
      pushToast?.('Chat saved to history.', 'info');
    } catch {
      pushToast?.('Could not save chat.', 'error');
    }
  }, [chatMessages, persist, pushToast, userCount]);

  const loadSavedChat = useCallback(
    (entry) => {
      const raw = Array.isArray(entry?.messages) ? entry.messages : [];
      const msgs = raw.map((m) => ({
        id: m.id || crypto.randomUUID(),
        role: m.role === 'user' ? 'user' : 'assistant',
        text: String(m.text || ''),
        ...(m.error ? { error: true } : {}),
        ...(m.imageDataUrl ? { imageDataUrl: m.imageDataUrl, screenCapture: m.screenCapture } : {}),
      }));
      setChatMessages(msgs.length ? msgs : [AI_CHAT_WELCOME_MESSAGE]);
      setInput('');
      setBusy(false);
      setShowHistory(false);
      setPendingScreen(null);
      setPendingImagePick(null);
      setAttachedFile(null);
    },
    [setChatMessages]
  );

  const deleteSavedChat = useCallback(
    async (id) => {
      if (!confirm('Remove this saved chat from history?')) return;
      try {
        await persist((d) => ({
          ...d,
          aiChatHistory: (Array.isArray(d.aiChatHistory) ? d.aiChatHistory : []).filter((h) => h.id !== id),
        }));
        pushToast?.('Saved chat removed.', 'info');
      } catch {
        pushToast?.('Could not remove chat.', 'error');
      }
    },
    [persist, pushToast]
  );

  const onPickImage = useCallback(async () => {
    const p = await getJarvis().pickImage?.();
    if (!p) return;
    const r = await getJarvis().readImageDataUrl?.(p);
    if (r?.ok) setPendingImagePick({ dataUrl: r.dataUrl });
    else pushToast?.('Could not load that image, Boss.', 'error');
  }, [pushToast]);

  const onPickChatFile = useCallback(async () => {
    const p = await getJarvis().pickChatFile?.();
    if (!p) return;
    await loadPathAsAttachedFile(p);
  }, [loadPathAsAttachedFile]);

  const onDropFiles = useCallback(
    async (e) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      const p = f.path;
      if (p) {
        if (CHAT_FILE_EXT.test(p)) await loadPathAsAttachedFile(p);
        else pushToast?.("I can't read that file type yet, Boss.", 'error');
        return;
      }
      if (f.name && CHAT_FILE_EXT.test(f.name)) {
        pushToast?.('Drop files from your desktop (Electron) for full path support, Boss.', 'info');
      } else {
        pushToast?.("I can't read that file type yet, Boss.", 'error');
      }
    },
    [loadPathAsAttachedFile, pushToast]
  );

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDropFiles}
    >
      {dragOver && (
        <div className="absolute inset-0 z-[40] flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[var(--accent)] bg-[rgba(6,8,12,0.92)] backdrop-blur-sm">
          <FileText className="h-14 w-14 text-[var(--accent)]" strokeWidth={1.25} />
          <p className="text-lg font-medium text-[#F0F0F0]">Drop to chat with this file</p>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.07)] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <motion.button
            type="button"
            title="Chat history"
            onClick={() => setShowHistory((v) => !v)}
            className={`flex h-9 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold ${
              showHistory
                ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.12)] text-[var(--accent)]'
                : 'border-[rgba(255,255,255,0.1)] text-[rgba(240,240,240,0.75)]'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <History className="h-3.5 w-3.5" strokeWidth={2.25} />
            History
          </motion.button>
          <motion.button
            type="button"
            title="Start a new chat (current thread is not deleted until you save it)"
            onClick={() => {
              startNewChat();
              pushToast?.('New chat started.', 'info');
            }}
            className="flex h-9 items-center gap-1.5 rounded-pill border border-[rgba(255,255,255,0.1)] px-3 text-xs font-semibold text-[rgba(240,240,240,0.75)]"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" strokeWidth={2.25} />
            New
          </motion.button>
        </div>
        <motion.button
          type="button"
          title="Save this conversation to disk"
          onClick={() => void saveCurrentToHistory()}
          disabled={userCount === 0 || busy}
          className="flex h-9 items-center gap-1.5 rounded-pill border border-[rgba(255,255,255,0.1)] px-3 text-xs font-semibold text-[rgba(240,240,240,0.75)] disabled:opacity-35"
          whileHover={{ scale: userCount === 0 || busy ? 1 : 1.02 }}
          whileTap={{ scale: userCount === 0 || busy ? 1 : 0.98 }}
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2.25} />
          Save chat
        </motion.button>
      </div>

      <div className="relative min-h-0 flex-1">
        {showHistory && (
          <>
            <button
              type="button"
              className="absolute inset-0 z-10 bg-black/45"
              aria-label="Close history"
              onClick={() => setShowHistory(false)}
            />
            <aside className="absolute left-0 top-0 z-20 flex h-full w-[min(100%,300px)] flex-col border-r border-[rgba(255,255,255,0.08)] bg-[rgba(12,12,14,0.97)] shadow-xl backdrop-blur-glass">
              <div className="border-b border-[rgba(255,255,255,0.06)] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[rgba(240,240,240,0.4)]">
                  Saved chats
                </p>
                <p className="mt-1 text-[11px] leading-snug text-[rgba(240,240,240,0.38)]">
                  Saving stores the thread in your JARVIS data file so it survives restarts.
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto jarvis-scrollbar p-2">
                {sortedSaved.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-[rgba(240,240,240,0.35)]">
                    No saved chats yet. Use Save chat after you have sent a message.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {sortedSaved.map((h) => (
                      <li
                        key={h.id}
                        className="group flex items-stretch gap-1 rounded-lg border border-transparent hover:border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.04)]"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 px-2.5 py-2 text-left"
                          onClick={() => loadSavedChat(h)}
                        >
                          <span className="line-clamp-2 text-[13px] font-medium text-[#F0F0F0]">{h.title || 'Chat'}</span>
                          <span className="mt-0.5 block text-[10px] text-[rgba(240,240,240,0.35)]">
                            {formatHistoryTime(h.updatedAt)}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          className="flex shrink-0 items-center justify-center px-2 text-rose-400/70 opacity-60 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteSavedChat(h.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </>
        )}

        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto jarvis-scrollbar px-4 py-4">
            <div className="mx-auto flex max-w-[580px] flex-col gap-3">
              {showChips && (
                <div className="flex flex-col items-center justify-center pb-4 pt-6 text-center">
                  <div className="mx-auto h-[76px] w-[min(100%,300px)] overflow-hidden rounded-2xl ring-1 ring-[rgba(255,255,255,0.08)] drop-shadow-[0_8px_32px_rgba(0,212,255,0.12)]">
                    <img
                      src={publicAsset('branding/jarvis-mark.jpg')}
                      alt="JARVIS"
                      className="h-full w-full object-cover object-center opacity-[0.95]"
                    />
                  </div>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {['Open my Developer preset', "What's my CPU usage?", 'Search YouTube for lo-fi music'].map((s) => (
                      <motion.button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-pill border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-xs font-medium text-[rgba(240,240,240,0.8)]"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
              <AnimatePresence initial={false}>
                {chatMessages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    {m.role === 'assistant' && (
                      <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">
                        JARVIS
                      </span>
                    )}
                    {m.role === 'user' && m.imageDataUrl && (
                      <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">
                        {m.screenCapture ? 'Screen capture' : 'Image'}
                      </span>
                    )}
                    {m.role === 'user' && m.imageDataUrl && (
                      <div className="mb-2 overflow-hidden rounded-lg border border-[rgba(0,212,255,0.45)] shadow-[0_0_20px_rgba(0,212,255,0.12)]" style={{ width: 120 }}>
                        <img src={m.imageDataUrl} alt="" className="h-auto w-[120px] object-cover" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] px-3.5 py-2.5 text-[14px] leading-relaxed ${
                        m.role === 'user'
                          ? 'rounded-[18px] rounded-br-[4px] bg-[#00D4FF] text-black'
                          : m.error
                            ? 'rounded-[18px] rounded-bl-[4px] border border-rose-400/40 bg-[rgba(255,80,80,0.08)] text-rose-50'
                            : 'rounded-[18px] rounded-bl-[4px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.05)] text-[#F0F0F0]'
                      }`}
                      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                    >
                      {m.text}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {pendingScreen && (
                <div className="flex flex-col items-end">
                  <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">
                    Screen capture
                  </span>
                  <div
                    className="mb-1 overflow-hidden rounded-lg border border-[rgba(0,212,255,0.45)]"
                    style={{ width: 120 }}
                  >
                    <img src={pendingScreen.dataUrl} alt="" className="h-auto w-[120px] object-cover" />
                  </div>
                </div>
              )}
              {pendingImagePick && (
                <div className="flex flex-col items-end">
                  <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">
                    Image
                  </span>
                  <div
                    className="mb-1 overflow-hidden rounded-lg border border-[rgba(0,212,255,0.45)]"
                    style={{ width: 120 }}
                  >
                    <img src={pendingImagePick.dataUrl} alt="" className="h-auto w-[120px] object-cover" />
                  </div>
                </div>
              )}
              {busy && (
                <div className="flex flex-col items-start">
                  <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">
                    JARVIS
                  </span>
                  <div className="flex gap-1 rounded-[18px] rounded-bl-[4px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.05)] px-3 py-2">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                        animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t border-[rgba(255,255,255,0.07)] p-4">
            <div className="mx-auto max-w-[580px] space-y-2">
              {attachedFile && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] px-3 py-2 backdrop-blur-glass">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
                        File attached
                      </p>
                      <p className="truncate text-xs font-medium text-[#F0F0F0]">{attachedFile.name}</p>
                      <p className="text-[10px] text-[rgba(240,240,240,0.4)]">{formatBytes(attachedFile.size || 0)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-[rgba(240,240,240,0.45)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
                    aria-label="Remove file"
                    onClick={() => setAttachedFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="relative flex items-end gap-2 rounded-pill border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-2 backdrop-blur-glass">
                {(voiceListening || voiceSpeaking) && (
                  <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1.5 rounded-pill border border-[rgba(0,212,255,0.25)] bg-[rgba(8,10,14,0.9)] px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.span
                        key={i}
                        className={`h-2 w-2 rounded-full ${voiceListening ? 'bg-[var(--accent)]' : 'bg-violet-400'}`}
                        animate={{ opacity: [0.25, 1, 0.25], scale: [1, 1.35, 1] }}
                        transition={{
                          duration: voiceListening ? 0.55 : 0.85,
                          repeat: Infinity,
                          delay: i * 0.09,
                          ease: 'easeInOut',
                        }}
                      />
                    ))}
                    <span className="ml-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-[rgba(240,240,240,0.55)]">
                      {voiceListening ? 'Listening' : 'Speaking'}
                    </span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.txt,.md,.js,.jsx,.ts,.tsx,.json,.csv" onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const p = file.path;
                  if (p) void loadPathAsAttachedFile(p);
                  else pushToast?.('Use Electron or attach via paperclip from disk, Boss.', 'info');
                }} />
                <input ref={imgInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') setPendingImagePick({ dataUrl: reader.result });
                  };
                  reader.readAsDataURL(file);
                }} />
                <textarea
                  rows={1}
                  className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 font-sans text-sm text-[#F0F0F0] outline-none placeholder:text-[rgba(255,255,255,0.3)]"
                  placeholder="Ask JARVIS anything..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <motion.button
                  type="button"
                  title={voiceListening ? 'Stop and send' : 'Voice input (mic)'}
                  disabled={busy}
                  onClick={() => {
                    if (voiceListening) stopVoiceListening();
                    else void startVoiceListening();
                  }}
                  className={`mb-1 flex h-9 w-9 items-center justify-center rounded-pill border text-[rgba(240,240,240,0.75)] disabled:opacity-35 ${
                    voiceListening
                      ? 'border-[var(--accent)] bg-[rgba(0,212,255,0.15)] text-[var(--accent)] shadow-[0_0_18px_rgba(0,212,255,0.35)]'
                      : 'border-[rgba(255,255,255,0.08)]'
                  }`}
                  animate={
                    voiceListening
                      ? {
                          scale: [1, 1.06, 1],
                          boxShadow: [
                            '0 0 0 0 rgba(0,212,255,0.35)',
                            '0 0 0 8px rgba(0,212,255,0)',
                            '0 0 0 0 rgba(0,212,255,0.35)',
                          ],
                        }
                      : false
                  }
                  transition={voiceListening ? { duration: 1.25, repeat: Infinity, ease: 'easeInOut' } : {}}
                  whileHover={{ scale: busy ? 1 : 1.02 }}
                  whileTap={{ scale: busy ? 1 : 0.97 }}
                >
                  <Mic className="h-4 w-4" strokeWidth={2.25} />
                </motion.button>
                <motion.button
                  type="button"
                  title={voiceTtsOn ? 'JARVIS reads replies aloud (tap to mute)' : 'Tap to speak replies aloud'}
                  disabled={busy}
                  onClick={() => {
                    setVoiceTtsOn((v) => {
                      if (v) {
                        try {
                          window.speechSynthesis?.cancel();
                        } catch {
                          /* */
                        }
                        setVoiceSpeaking(false);
                      } else {
                        usedVoiceThisSessionRef.current = true;
                      }
                      return !v;
                    });
                  }}
                  className={`mb-1 flex h-9 w-9 items-center justify-center rounded-pill border disabled:opacity-35 ${
                    voiceTtsOn
                      ? 'border-[rgba(168,85,247,0.45)] bg-[rgba(168,85,247,0.12)] text-violet-200'
                      : 'border-[rgba(255,255,255,0.08)] text-[rgba(240,240,240,0.45)]'
                  }`}
                  animate={
                    voiceSpeaking && voiceTtsOn
                      ? { scale: [1, 1.05, 1] }
                      : {}
                  }
                  transition={{ duration: 0.9, repeat: voiceSpeaking && voiceTtsOn ? Infinity : 0 }}
                  whileHover={{ scale: busy ? 1 : 1.02 }}
                  whileTap={{ scale: busy ? 1 : 0.97 }}
                >
                  {voiceTtsOn ? <Volume2 className="h-4 w-4" strokeWidth={2.25} /> : <VolumeX className="h-4 w-4" strokeWidth={2.25} />}
                </motion.button>
                <motion.button
                  type="button"
                  title="Attach file"
                  className="mb-1 flex h-9 w-9 items-center justify-center rounded-pill border border-[rgba(255,255,255,0.08)] text-[rgba(240,240,240,0.75)]"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (getJarvis().pickChatFile) void onPickChatFile();
                    else fileInputRef.current?.click();
                  }}
                >
                  <Paperclip className="h-4 w-4" />
                </motion.button>
                <motion.button
                  type="button"
                  title="Attach image"
                  className="mb-1 flex h-9 w-9 items-center justify-center rounded-pill border border-[rgba(255,255,255,0.08)] text-[rgba(240,240,240,0.75)]"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (getJarvis().pickImage) void onPickImage();
                    else imgInputRef.current?.click();
                  }}
                >
                  <ImagePlus className="h-4 w-4" />
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => send()}
                  className="mb-1 flex h-9 w-9 items-center justify-center rounded-pill bg-[var(--accent)] text-black"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <SendHorizontal className="h-4 w-4" strokeWidth={2.25} />
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
