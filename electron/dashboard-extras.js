const { execFile } = require('child_process');
const { promisify } = require('util');
const sysWin = require('./system-windows');

const execFileAsync = promisify(execFile);

async function ps(command, timeout = 10000) {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    windowsHide: true,
    timeout,
    maxBuffer: 2 * 1024 * 1024,
  });
  return String(stdout || '').trim();
}

async function getBatteryStatus() {
  if (process.platform !== 'win32') return { percent: null, charging: false };
  const cmd = `
$ErrorActionPreference='SilentlyContinue'
$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $b) { @{ percent = $null; charging = $false } | ConvertTo-Json -Compress; exit }
@{ percent = [int]$b.EstimatedChargeRemaining; charging = ($b.BatteryStatus -eq 2 -or $b.BatteryStatus -eq 6 -or $b.BatteryStatus -eq 7 -or $b.BatteryStatus -eq 8 -or $b.BatteryStatus -eq 9) } | ConvertTo-Json -Compress
`.trim();
  try {
    const j = JSON.parse(await ps(cmd, 8000));
    const percent = Number(j.percent);
    return {
      percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null,
      charging: Boolean(j.charging),
    };
  } catch {
    return { percent: null, charging: false };
  }
}

async function getDndEnabled() {
  try {
    const v = await sysWin.readToastEnabled?.();
    if (v == null) return false;
    return Number(v) === 0;
  } catch {
    return false;
  }
}

function formatPlace(hit) {
  if (!hit) return null;
  const parts = [hit.name, hit.admin1, hit.country].filter(Boolean);
  return {
    city: hit.name,
    label: parts.join(', '),
    latitude: hit.latitude,
    longitude: hit.longitude,
  };
}

async function searchCities(query, limit = 6) {
  const q = String(query || '').trim();
  if (q.length < 2) return { ok: true, results: [] };
  try {
    const geoUrl =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
      `&count=${Math.min(10, Math.max(1, limit))}&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    const geo = await geoRes.json();
    const results = (geo?.results || [])
      .map(formatPlace)
      .filter(Boolean);
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), results: [] };
  }
}

async function verifyCityName(city, region, country) {
  const q = String(city || '').trim();
  if (!q) return null;
  const { results } = await searchCities(q, 5);
  if (!results?.length) {
    return {
      city: q,
      label: [city, region, country].filter(Boolean).join(', '),
    };
  }
  const countryLower = String(country || '').toLowerCase();
  const regionLower = String(region || '').toLowerCase();
  const match =
    results.find((r) => {
      const label = String(r.label || '').toLowerCase();
      return (
        (countryLower && label.includes(countryLower)) ||
        (regionLower && label.includes(regionLower)) ||
        r.city.toLowerCase() === q.toLowerCase()
      );
    }) || results[0];
  return match;
}

async function detectWindowsCoordinates() {
  if (process.platform !== 'win32') return null;
  const cmd = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function AwaitOp($Op, $Type) {
  $task = $asTask.MakeGenericMethod($Type).Invoke($null, @($Op))
  if (-not $task.Wait(12000)) { throw 'timeout' }
  $task.Result
}
[Windows.Devices.Geolocation.Geolocator,Windows.Devices,ContentType=WindowsRuntime] | Out-Null
$loc = New-Object Windows.Devices.Geolocation.Geolocator
$loc.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High
$pos = AwaitOp ($loc.GetGeopositionAsync()) ([Windows.Devices.Geolocation.Geoposition])
@{ lat = [double]$pos.Coordinate.Latitude; lon = [double]$pos.Coordinate.Longitude } | ConvertTo-Json -Compress
`.trim();
  try {
    const raw = await ps(cmd, 15000);
    const j = JSON.parse(raw);
    const lat = Number(j.lat);
    const lon = Number(j.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, source: 'windows' };
  } catch {
    return null;
  }
}

async function detectIpCoordinates() {
  const providers = [
    async () => {
      const res = await fetch('http://ip-api.com/json/?fields=status,message,city,regionName,country,lat,lon', {
        signal: AbortSignal.timeout(8000),
      });
      const j = await res.json();
      if (j.status !== 'success') return null;
      return {
        lat: Number(j.lat),
        lon: Number(j.lon),
        city: String(j.city || '').trim(),
        region: String(j.regionName || '').trim(),
        country: String(j.country || '').trim(),
      };
    },
    async () => {
      const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(8000) });
      const j = await res.json();
      if (!j.success) return null;
      return {
        lat: Number(j.latitude),
        lon: Number(j.longitude),
        city: String(j.city || '').trim(),
        region: String(j.region || '').trim(),
        country: String(j.country || '').trim(),
      };
    },
  ];

  for (const load of providers) {
    try {
      const j = await load();
      if (!j || !Number.isFinite(j.lat) || !Number.isFinite(j.lon)) continue;
      const { lat, lon, city, region, country } = j;
      return {
        lat,
        lon,
        source: 'ip',
        fallback: city
          ? { city, region, country, label: [city, region, country].filter(Boolean).join(', ') }
          : null,
      };
    } catch {
      /* try next provider */
    }
  }
  return null;
}

/** Resolve approximate device location (Windows GPS + IP, verified via Open-Meteo search). */
async function detectLocation() {
  try {
    const [windows, ip] = await Promise.all([detectWindowsCoordinates(), detectIpCoordinates()]);
    if (!windows && !ip) return { ok: false, error: 'unavailable' };

    const source = windows ? 'windows' : 'ip';
    const fb = ip?.fallback;
    if (!fb?.city) return { ok: false, error: 'geocode' };

    const place = await verifyCityName(fb.city, fb.region, fb.country);
    if (!place?.city) return { ok: false, error: 'geocode' };

    return { ok: true, ...place, source };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

async function fetchWeather(city) {
  const q = String(city || 'London').trim() || 'London';
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    const geo = await geoRes.json();
    const hit = geo?.results?.[0];
    if (!hit) return { ok: false, error: 'city' };
    const { latitude, longitude, name } = hit;
    const wUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code&timezone=auto`;
    const wRes = await fetch(wUrl);
    const w = await wRes.json();
    const cur = w?.current;
    if (!cur) return { ok: false };
    const code = Number(cur.weather_code);
    const desc =
      code === 0
        ? 'Clear'
        : code <= 3
          ? 'Partly cloudy'
          : code <= 48
            ? 'Foggy'
            : code <= 67
              ? 'Rain'
              : code <= 77
                ? 'Snow'
                : code <= 82
                  ? 'Showers'
                  : 'Stormy';
    return {
      ok: true,
      city: name,
      tempC: Math.round(Number(cur.temperature_2m) || 0),
      description: desc,
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

module.exports = {
  getBatteryStatus,
  getDndEnabled,
  fetchWeather,
  searchCities,
  detectLocation,
};
