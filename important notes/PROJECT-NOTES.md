# Project notes (audit)

Internal notes from a pass over the repo (excluding `Mark-XXXIX-reference/`).

## Fixed or aligned in this pass

- **SETUP / docs** moved to `important notes/`; outdated Usage & Calendar UI references removed from setup text.
- **Voice latency** — smaller mic chunks, throttled HUD meter updates, leaner memory in live prompt, no “THINKING” flash on typed sends.
- **Apps page** — loads cache first; background scan only when stale (see prior change).

## Known discrepancies (low risk)

| Area | Note |
|------|------|
| **SETUP vs wizard** | Installer `SETUP-NEW-PC.txt` in `release/` is copied from `important notes/` on build. |
| **Wake word docs** | Legacy “Hey Jarvis” still documented; default mode is **Gemini Live** (`voiceMode: live`). |
| **Calendar IPC** | Backend handlers remain; UI removed — harmless if unused. |
| **Usage IPC** | Backend tracking may still run; Usage page removed from UI. |
| **Web version** | Sidebar can open browser UI; optional, desktop-first. |
| **AI Chat vs Voice** | Two systems: Dashboard voice = Gemini Live; AI Chat = Claude/Ollama. |

## Requirements

- **Node.js** required; Python only for `requirements.py` helper.
- **Windows** target for Electron build; dev on Windows is tested path.

## Sharing with friends

- Branding: **Mr Arumugam Abinav** via `CreatorAttribution.jsx`.
- Share `release/JARVIS Setup 1.0.0.exe` + `important notes/` folder (or point to GitHub + README).
