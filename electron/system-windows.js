const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

let dndJarvisActive = false;
let toastBackup = null;

function ps(command) {
  return execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

// Core Audio COM — vtable stubs required (see stackoverflow.com/a/19348221)
const VOLUME_CSHARP = `
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int f();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }

public class JarvisAudioVolume {
  static IAudioEndpointVolume Vol() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    var epvid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref epvid, 23, 0, out epv));
    return epv;
  }

  public static void SetPercent(int percent) {
    percent = Math.Max(0, Math.Min(100, percent));
    var vol = Vol();
    Marshal.ThrowExceptionForHR(vol.SetMasterVolumeLevelScalar(percent / 100f, Guid.Empty));
    Marshal.ThrowExceptionForHR(vol.SetMute(percent == 0, Guid.Empty));
  }

  public static int GetPercent() {
    float scalar;
    Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out scalar));
    return (int)Math.Round(Math.Max(0f, Math.Min(1f, scalar)) * 100f);
  }
}
`.trim();

function volumePs(scriptBody) {
  return `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -TypeDefinition @"
${VOLUME_CSHARP}
"@ -ErrorAction Stop
} catch {
  if ($_.Exception.Message -notmatch 'already exists|Cannot add type') { throw }
}
${scriptBody}
`.trim();
}

/** Set master output volume (0–100) via Windows Core Audio API. */
async function setMasterVolumePercent(percent) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const cmd = volumePs(`[JarvisAudioVolume]::SetPercent(${p})`);
      await ps(cmd);
      await new Promise((r) => setTimeout(r, 100));
      const got = await getMasterVolumePercent();
      if (got != null && (Math.abs(got - p) <= 6 || (p === 0 && got <= 3))) return;
      lastErr = new Error(`Volume verify failed (wanted ${p}%, got ${got}%)`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Volume change failed');
}

function isDndJarvisActive() {
  return dndJarvisActive;
}

async function setDesktopWallpaper(imagePath) {
  const safe = String(imagePath || '').replace(/'/g, "''");
  const cmd = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class JarvisWall {
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
"@
[JarvisWall]::SystemParametersInfo(20, 0, '${safe}', 3) | Out-Null
`;
  await ps(cmd);
}

async function readToastEnabled() {
  try {
    const cmd = `
$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications'
if (Test-Path $path) {
  $v = (Get-ItemProperty -Path $path -Name ToastEnabled -ErrorAction SilentlyContinue).ToastEnabled
  if ($null -ne $v) { Write-Output $v } else { Write-Output 1 }
} else { Write-Output 1 }
`;
    const { stdout } = await ps(cmd);
    const n = parseInt(String(stdout).trim(), 10);
    return Number.isFinite(n) ? n : 1;
  } catch {
    return 1;
  }
}

async function writeToastEnabled(val) {
  const v = val ? 1 : 0;
  const cmd = `
$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications'
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -Path $path -Name ToastEnabled -PropertyType DWord -Value ${v} -Force | Out-Null
`;
  await ps(cmd);
}

async function enableDoNotDisturbLite() {
  if (dndJarvisActive) return;
  toastBackup = await readToastEnabled();
  await writeToastEnabled(0);
  dndJarvisActive = true;
}

async function restoreDoNotDisturbLite() {
  if (!dndJarvisActive) return;
  const prev = toastBackup === null ? 1 : toastBackup;
  await writeToastEnabled(prev);
  dndJarvisActive = false;
  toastBackup = null;
}

async function getMasterVolumePercent() {
  const cmd = volumePs('[JarvisAudioVolume]::GetPercent()');
  try {
    const { stdout } = await ps(cmd);
    const n = Math.round(Number(String(stdout).trim()));
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, n));
  } catch {
    return null;
  }
}

async function getDesktopWallpaper() {
  const cmd = `
$ErrorActionPreference = 'SilentlyContinue'
$path = 'HKCU:\\Control Panel\\Desktop'
if (Test-Path $path) {
  $v = (Get-ItemProperty -Path $path -Name Wallpaper -ErrorAction SilentlyContinue).Wallpaper
  if ($v) { Write-Output $v }
}
`;
  try {
    const { stdout } = await ps(cmd);
    const p = String(stdout || '').trim();
    return p || null;
  } catch {
    return null;
  }
}

module.exports = {
  setMasterVolumePercent,
  setDesktopWallpaper,
  getMasterVolumePercent,
  getDesktopWallpaper,
  readToastEnabled,
  writeToastEnabled,
  enableDoNotDisturbLite,
  restoreDoNotDisturbLite,
  isDndJarvisActive,
};
