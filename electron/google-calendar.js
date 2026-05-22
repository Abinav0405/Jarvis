/**
 * Google Calendar — read-only events for Dashboard / briefing.
 * Credentials live in %AppData%/JARVIS/google-calendar.json (never in repo).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

/** @param {string} url */
function httpsGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          if (res.statusCode && res.statusCode >= 400) {
            const err = new Error(json.error?.message || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            err.details = json.error;
            reject(err);
            return;
          }
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

/** @param {string} url @param {string} body */
function httpsPostForm(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data || '{}');
            if (res.statusCode && res.statusCode >= 400) {
              const err = new Error(json.error_description || json.error || `HTTP ${res.statusCode}`);
              reject(err);
              return;
            }
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * @param {() => string} getUserDataPath
 */
function createGoogleCalendarApi(getUserDataPath) {
  function credPath() {
    return path.join(getUserDataPath(), 'google-calendar.json');
  }

  function readCredentials() {
    try {
      const p = credPath();
      if (!fs.existsSync(p)) return null;
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      return {
        apiKey: String(raw.apiKey || '').trim(),
        calendarId: String(raw.calendarId || 'primary').trim() || 'primary',
        clientId: String(raw.clientId || '').trim(),
        clientSecret: String(raw.clientSecret || '').trim(),
        refreshToken: String(raw.refreshToken || '').trim(),
      };
    } catch {
      return null;
    }
  }

  function writeCredentials(creds) {
    const dir = getUserDataPath();
    fs.mkdirSync(dir, { recursive: true });
    const next = {
      apiKey: String(creds?.apiKey || '').trim(),
      calendarId: String(creds?.calendarId || 'primary').trim() || 'primary',
      clientId: String(creds?.clientId || '').trim(),
      clientSecret: String(creds?.clientSecret || '').trim(),
      refreshToken: String(creds?.refreshToken || '').trim(),
    };
    fs.writeFileSync(credPath(), JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  function removeCredentials() {
    try {
      const p = credPath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    return true;
  }

  function hasCredentials(creds) {
    if (!creds) return false;
    if (creds.refreshToken && creds.clientId && creds.clientSecret) return true;
    if (creds.apiKey && creds.calendarId) return true;
    return false;
  }

  async function getAccessToken(creds) {
    if (!creds.refreshToken || !creds.clientId || !creds.clientSecret) return null;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
    }).toString();
    const token = await httpsPostForm('https://oauth2.googleapis.com/token', body);
    return token.access_token || null;
  }

  function encodeCalId(id) {
    return encodeURIComponent(id);
  }

  async function fetchEventsRaw(creds, { daysAhead = 3, maxResults = 12 } = {}) {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + daysAhead);
    const timeMin = now.toISOString();
    const timeMax = end.toISOString();
    const calId = encodeCalId(creds.calendarId || 'primary');
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(maxResults),
    });

    const accessToken = await getAccessToken(creds);
    if (accessToken) {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params}`;
      return httpsGetJson(url, { Authorization: `Bearer ${accessToken}` });
    }

    if (creds.apiKey) {
      params.set('key', creds.apiKey);
      const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params}`;
      return httpsGetJson(url);
    }

    throw new Error('No valid credentials. Add OAuth refresh token or API key + calendar ID.');
  }

  function normalizeEvents(apiResponse) {
    const items = Array.isArray(apiResponse?.items) ? apiResponse.items : [];
    return items.map((ev) => {
      const start = ev.start?.dateTime || ev.start?.date || null;
      const end = ev.end?.dateTime || ev.end?.date || null;
      const allDay = !ev.start?.dateTime;
      return {
        id: ev.id,
        title: ev.summary || '(No title)',
        start,
        end,
        allDay,
        location: ev.location || null,
        htmlLink: ev.htmlLink || null,
      };
    });
  }

  async function fetchEvents(opts) {
    const creds = readCredentials();
    if (!hasCredentials(creds)) {
      return { ok: false, connected: false, events: [], error: 'Calendar not configured' };
    }
    try {
      const raw = await fetchEventsRaw(creds, opts);
      return { ok: true, connected: true, events: normalizeEvents(raw) };
    } catch (e) {
      return {
        ok: false,
        connected: true,
        events: [],
        error: e && e.message ? e.message : String(e),
      };
    }
  }

  async function testConnection(credsInput) {
    const creds = credsInput || readCredentials();
    if (!hasCredentials(creds)) {
      return { ok: false, error: 'Enter API key + calendar ID, or OAuth client credentials with refresh token.' };
    }
    try {
      const raw = await fetchEventsRaw(creds, { daysAhead: 1, maxResults: 1 });
      const count = Array.isArray(raw?.items) ? raw.items.length : 0;
      return { ok: true, message: `Connected — found ${count} upcoming event(s) in the next day.` };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }

  function getStatus() {
    const creds = readCredentials();
    return {
      connected: hasCredentials(creds),
      calendarId: creds?.calendarId || '',
      hasOAuth: !!(creds?.refreshToken && creds?.clientId),
      hasApiKey: !!creds?.apiKey,
    };
  }

  return {
    readCredentials,
    writeCredentials,
    removeCredentials,
    hasCredentials,
    fetchEvents,
    testConnection,
    getStatus,
  };
}

module.exports = { createGoogleCalendarApi };
