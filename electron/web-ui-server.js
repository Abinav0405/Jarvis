/**

 * Serves the built SPA on loopback and exposes JSON-RPC + SSE for external browsers

 * while the Electron app is running (same machine, real data + OS integration).

 */

const http = require('http');

const fs = require('fs');

const path = require('path');

const crypto = require('crypto');

const { assertWebUiChannelAllowed } = require('./web-ui-channels');



const MIME = {

  '.html': 'text/html; charset=utf-8',

  '.js': 'text/javascript; charset=utf-8',

  '.mjs': 'text/javascript; charset=utf-8',

  '.css': 'text/css; charset=utf-8',

  '.json': 'application/json; charset=utf-8',

  '.png': 'image/png',

  '.jpg': 'image/jpeg',

  '.jpeg': 'image/jpeg',

  '.ico': 'image/x-icon',

  '.svg': 'image/svg+xml',

  '.woff2': 'font/woff2',

  '.map': 'application/json; charset=utf-8',

};



const DEFAULT_PORTS = [47843, 47844, 47845, 47846];

const AUTH_CODE_TTL_MS = 120000;



/**

 * @param {object} opts

 * @param {string} opts.distRoot Absolute path to Vite `dist/` (contains index.html, assets/)

 * @param {(channel: string, event: { sender: Electron.WebContents | null }, args: unknown[]) => Promise<unknown>} opts.invokeJarvis

 * @param {() => Electron.WebContents | null} [opts.getSender]

 */

async function startWebUiServer({ distRoot, invokeJarvis, getSender }) {

  const token = crypto.randomBytes(24).toString('hex');

  /** @type {Map<string, { token: string, expires: number }>} */

  const pendingAuthCodes = new Map();



  function createAuthCode() {

    const code = crypto.randomBytes(16).toString('hex');

    pendingAuthCodes.set(code, { token, expires: Date.now() + AUTH_CODE_TTL_MS });

    return code;

  }



  function consumeAuthCode(code) {

    const key = String(code || '').trim();

    if (!key) return null;

    const entry = pendingAuthCodes.get(key);

    pendingAuthCodes.delete(key);

    if (!entry || entry.expires < Date.now()) return null;

    return entry.token;

  }



  /** @type {Set<import('http').ServerResponse>} */

  const sseClients = new Set();



  function broadcast(channel, args) {

    const payload = JSON.stringify({ channel, args });

    const frame = `event: push\ndata: ${payload}\n\n`;

    for (const res of sseClients) {

      try {

        res.write(frame);

      } catch {

        sseClients.delete(res);

      }

    }

  }



  function safeResolve(urlPathname) {

    const rel = urlPathname === '/' || urlPathname === '' ? 'index.html' : urlPathname.slice(1);

    const decoded = decodeURIComponent(rel.replace(/\//g, path.sep));

    const candidate = path.normalize(path.join(distRoot, decoded));

    const root = path.normalize(distRoot + path.sep);

    if (candidate !== distRoot && !candidate.startsWith(root)) {

      return null;

    }

    return candidate;

  }



  async function invokeFromWeb(channel, event, args) {

    assertWebUiChannelAllowed(channel);

    return invokeJarvis(channel, event, args);

  }



  const server = http.createServer(async (req, res) => {

    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);



    if (url.pathname === '/auth' && req.method === 'GET') {

      const sessionToken = consumeAuthCode(url.searchParams.get('code'));

      if (!sessionToken) {

        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });

        res.end('<!DOCTYPE html><html><body><p>Invalid or expired sign-in link. Open the web version again from the desktop app.</p></body></html>');

        return;

      }

      const safeToken = JSON.stringify(sessionToken);

      res.writeHead(200, {

        'Content-Type': 'text/html; charset=utf-8',

        'Cache-Control': 'no-store',

      });

      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>JARVIS</title></head><body><p>Signing in…</p><script>

try{sessionStorage.setItem('jarvisWebSession',${safeToken});}catch(e){}

location.replace('/');

</script></body></html>`);

      return;

    }



    if (url.pathname === '/__jarvis/v1/invoke' && req.method === 'POST') {

      const auth = String(req.headers.authorization || '');

      if (auth !== `Bearer ${token}`) {

        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });

        res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));

        return;

      }

      let body = '';

      try {

        for await (const chunk of req) {

          body += chunk;

        }

        const parsed = JSON.parse(body || '{}');

        const channel = String(parsed.channel || '');

        const args = Array.isArray(parsed.args) ? parsed.args : [];

        const sender = typeof getSender === 'function' ? getSender() : null;

        const result = await invokeFromWeb(channel, { sender }, args);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });

        res.end(JSON.stringify({ ok: true, result }));

      } catch (e) {

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });

        res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));

      }

      return;

    }



    if (url.pathname === '/__jarvis/v1/events' && req.method === 'GET') {

      const t = url.searchParams.get('token') || '';

      if (t !== token) {

        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });

        res.end('Unauthorized');

        return;

      }

      res.writeHead(200, {

        'Content-Type': 'text/event-stream; charset=utf-8',

        'Cache-Control': 'no-cache, no-transform',

        Connection: 'keep-alive',

        'X-Accel-Buffering': 'no',

      });

      res.write(': ok\n\n');

      sseClients.add(res);

      req.on('close', () => {

        sseClients.delete(res);

      });

      return;

    }



    const filePath = safeResolve(url.pathname);

    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {

      res.writeHead(url.pathname === '/' ? 500 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });

      res.end(url.pathname === '/' ? 'Missing index.html in dist.' : 'Not found');

      return;

    }



    const ext = path.extname(filePath).toLowerCase();

    const ct = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, {

      'Content-Type': ct,

      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',

    });

    fs.createReadStream(filePath).pipe(res);

  });



  let actualPort = 0;

  let lastListenErr = null;

  for (const p of DEFAULT_PORTS) {

    try {

      await new Promise((resolve, reject) => {

        const onErr = (e) => {

          cleanup();

          reject(e);

        };

        const onOk = () => {

          cleanup();

          resolve();

        };

        function cleanup() {

          server.removeListener('error', onErr);

          server.removeListener('listening', onOk);

        }

        server.once('error', onErr);

        server.once('listening', onOk);

        server.listen(p, '127.0.0.1');

      });

      actualPort = p;

      break;

    } catch (e) {

      lastListenErr = e;

      if (!e || e.code !== 'EADDRINUSE') {

        throw e;

      }

      await new Promise((r) => {

        if (server.listening) server.close(() => r());

        else r();

      });

    }

  }



  if (!actualPort) {

    throw lastListenErr || new Error('Could not bind web UI port');

  }



  const origin = `http://127.0.0.1:${actualPort}`;



  return {

    origin,

    port: actualPort,

    token,

    broadcast,

    getOpenUrl: () => `${origin}/auth?code=${createAuthCode()}`,

    close: () =>

      new Promise((resolve) => {

        for (const r of sseClients) {

          try {

            r.end();

          } catch {

            /* */

          }

        }

        sseClients.clear();

        pendingAuthCodes.clear();

        server.close(() => resolve());

      }),

  };

}



module.exports = { startWebUiServer };


