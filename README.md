# JARVIS

A Windows desktop assistant — system dashboard, presets, app launcher, **Gemini Live voice core**, and AI chat (Claude / Ollama).

**Created by Mr Arumugam Abinav**

---

## Quick start (from GitHub)

### Requirements

- **Windows 10/11** (64-bit)
- **Node.js 20 LTS** — [https://nodejs.org/](https://nodejs.org/)
- **Python 3.8+** (optional, only to run the setup helper)
- **Gemini API key** — [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) (voice core)

### 1. Clone and install dependencies

```powershell
git clone <your-repo-url>
cd Jarvis
python requirements.py
```

`requirements.py` runs `npm ci` (or `npm install`) so all Node/Electron dependencies are installed.

### 2. Run in development

```powershell
npm run dev
```

- Opens the Vite dev UI and Electron together.
- First launch shows the **setup wizard** (name, Gemini key, appearance, preferences).

### 3. Build the Windows installer

```powershell
npm run build
```

Output: `release/JARVIS Setup 1.0.0.exe` (and portable `JARVIS 1.0.0.exe`).

---

## After install (end users)

1. Run **JARVIS Setup 1.0.0.exe** (SmartScreen → More info → Run anyway if unsigned).
2. Complete the setup wizard.
3. Add your **Gemini API key** under **Settings → General → Gemini voice core**.
4. Allow **microphone** access when prompted.
5. Use the **Dashboard** voice HUD to speak or type to JARVIS.

Full walkthrough: [`important notes/SETUP-NEW-PC.txt`](important%20notes/SETUP-NEW-PC.txt)  
Voice capabilities & speed tips: [`important notes/VOICE-CORE.md`](important%20notes/VOICE-CORE.md)

---

## Important folders

| Path | Purpose |
|------|---------|
| `electron/` | Main process, IPC, Gemini Live, app scan |
| `src/` | React UI |
| `data/templates/` | Default prompts & templates |
| `important notes/` | Setup guide + voice core docs |
| `release/` | Built installers (after `npm run build`) |

`Mark-XXXIX-reference/` is a local reference project only — **not** included in git (see `.gitignore`).

---

## Settings worth knowing

| Setting | Where |
|---------|--------|
| Your name | Settings → General |
| Gemini voice key | Settings → General |
| Voice language | Settings → General |
| Claude / Ollama | Settings → AI |
| Hotkeys | Settings → Hotkeys |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev mode (hot reload) |
| `npm run build` | Production installer |
| `python requirements.py` | Install npm deps after clone |

---

## License / distribution

Share the installer and the `important notes` folder so friends know how to set up Gemini and the voice core.

Questions: refer to the creator name shown in the app (**About** and sidebar footer).
