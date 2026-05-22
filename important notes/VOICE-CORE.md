# JARVIS Voice Core (Gemini Live)

The **Voice Core** on the Dashboard is JARVIS’s live voice assistant. It uses **Google Gemini Live** (native audio in/out), not the older “Hey Jarvis” wake-word + cloud speech path.

## What you need

1. A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey) (free tier available).
2. Save it in **Settings → General → Gemini voice core** (or during setup).
3. Allow **microphone** access for JARVIS in Windows Settings → Privacy → Microphone.
4. Set **Voice language** in Settings → General so replies stay in your chosen language.

## What the voice core can do

| Capability | How |
|------------|-----|
| **Talk naturally** | Speak; JARVIS listens via the mic and replies with voice + on-screen transcript. |
| **Type instead** | Use the message box under the HUD orb on the Dashboard. |
| **Open apps** | e.g. “Open Chrome”, “Launch Spotify”. |
| **Web search** | Opens your browser with a search query. |
| **Weather** | Reports weather for a city you name. |
| **Navigate JARVIS** | e.g. “Open settings”, “Go to presets”, “Show tasks”. |
| **Launch presets** | Starts a saved workspace preset by name. |
| **Set volume** | Sets Windows master volume (0–100%). |
| **Remember facts** | Silently saves notes to long-term memory (identity, preferences, projects). |

Tools run on your PC; the model speaks a short summary after each action.

## What it does *not* do (use other pages)

- **Long documents / files** → **AI Chat** (Claude or Ollama).
- **Screen analysis** → **AI Chat** (screen capture).
- **Wake word only** (“Hey Jarvis” without Live) → optional legacy path in Settings (Google Speech API key); default is Live mode.

## Response speed (why it can feel ~3–5 seconds)

Live voice goes: **mic → Google servers → audio back**. Delay is mostly:

1. **Network** to Gemini (Singapore/US region latency).
2. **End-of-speech detection** — the model waits until you pause before answering.
3. **Tool calls** — opening apps, search, or weather adds a second round trip.
4. **Long prompts** — very large memory/context slow the first reply.

**Tips for faster replies**

- Ask **short, direct** questions.
- Use **typed** messages for instant turn boundaries.
- Prefer simple Q&A without tools (“What time is it?”) vs. “Open five apps and search…”
- Keep a stable internet connection; avoid VPN spikes.
- Set **Voice language** so the model does not re-detect language mid-session.

Recent builds use smaller mic chunks and leaner prompts to reduce delay; sub‑2s is possible on good networks for simple prompts, but **tool + network** tasks will always take longer.

## Status labels on the HUD

| Label | Meaning |
|-------|---------|
| **INITIALISING** | Connecting or reconnecting to Gemini Live. |
| **LISTENING** | Ready for you to speak. |
| **THINKING** | Processing (often during tools). |
| **SPEAKING** | Playing JARVIS’s voice reply. |
| **MUTED** | Mic not sent to the API. |

## Troubleshooting

- Stuck on **INITIALISING** → Check API key, internet, and that Live/native audio is enabled for your key in AI Studio.
- No voice back → Check volume, mute button on the HUD, and Windows output device.
- Wrong language → **Settings → General → Voice language**, then restart voice (save key again or restart JARVIS).
- Repeating “Reconnecting…” → Key invalid, quota exceeded, or firewall blocking WebSockets.

---

Created by **Mr Arumugam Abinav** — see `SETUP-NEW-PC.txt` in this folder for full install steps.
