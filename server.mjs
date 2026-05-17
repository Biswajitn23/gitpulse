import http from 'node:http';
import os from 'node:os';
import { createServer as createViteServer, loadEnv } from 'vite';
import { fetchGithubStreak } from './src/lib/githubStreak.js';

const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
const PORT = Number(env.PORT || process.env.PORT || 5173);
const HOST = env.HOST || process.env.HOST || '::';

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(payload));
}

function getStatusCodeForError(message) {
  if (/missing github token/i.test(message)) {
    return 400;
  }

  if (/invalid github username|could not resolve to a user/i.test(message)) {
    return 404;
  }

  if (/token is invalid or expired|bad credentials|expired token|requires authentication/i.test(message)) {
    return 401;
  }

  if (/api request failed|rate limit|abuse detection/i.test(message)) {
    return 502;
  }

  if (/response could not be parsed|contributions are unavailable|fetch failed|network/i.test(message)) {
    return 502;
  }

  return 500;
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
}

let vite;

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host}`);

    if (requestUrl.pathname === '/api/github-streak' && request.method === 'POST') {
      const body = await readJsonBody(request);
      const token = String(body?.token || '').trim();
      const username = String(body?.username || '').trim();

      if (!token) {
        sendJson(response, 400, { error: 'Missing GitHub token.' });
        return;
      }

      const data = await fetchGithubStreak(username, token);
      sendJson(response, 200, { data });
      return;
    }

    if (!vite) {
      sendJson(response, 503, { error: 'Dev server is starting. Please retry in a moment.' });
      return;
    }

    vite.middlewares(request, response, (error) => {
      if (error) {
        throw error;
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error.';
    sendJson(response, getStatusCodeForError(message), {
      error: message,
    });
  }
});

vite = await createViteServer({
  server: {
    middlewareMode: true,
    host: HOST,
    hmr: {
      server,
    },
  },
  appType: 'custom',
});

function listenWithFallback(port, attemptsLeft = 10) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      if (error?.code === 'EADDRINUSE' && attemptsLeft > 0) {
        console.warn(`Port ${port} is busy, trying ${port + 1}...`);
        resolve(listenWithFallback(port + 1, attemptsLeft - 1));
        return;
      }

      reject(error);
    };

    server.once('error', onError);
    server.listen(port, HOST, () => {
      server.off('error', onError);
      resolve(port);
    });
  });
}

function printAsciiBanner() {
  console.log(String.raw`
  ____ _ _   ____       _
 / ___(_) |_|  _ \ _   _| |___  ___
| |  _| | __| |_) | | | | / __|/ _ \
| |_| | | |_|  __/| |_| | \__ \  __/
 \____|_|\__|_|    \__,_|_|___/\___|
`);
}

function getLanUrls(port) {
  const urls = [];
  const interfaces = os.networkInterfaces();

  for (const networkInterface of Object.values(interfaces)) {
    for (const address of networkInterface || []) {
      if (address.family === 'IPv4' && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    }
  }

  return urls;
}

try {
  printAsciiBanner();
  const activePort = await listenWithFallback(PORT);
  console.log(`GitPulse API + Vite server running at http://localhost:${activePort}`);
  console.log(`Direct loopback URL: http://127.0.0.1:${activePort}`);
  const lanUrls = getLanUrls(activePort);

  if (lanUrls.length) {
    console.log(`Open on your phone with one of these network URLs:`);
    lanUrls.forEach((url) => console.log(url));
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}