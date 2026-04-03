import http from 'node:http';
import { createServer as createViteServer } from 'vite';
import { fetchGithubStreak } from './src/lib/githubStreak.js';

const PORT = Number(process.env.PORT || 5173);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(payload));
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
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Server error.',
    });
  }
});

vite = await createViteServer({
  server: {
    middlewareMode: true,
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
    server.listen(port, () => {
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

try {
  printAsciiBanner();
  const activePort = await listenWithFallback(PORT);
  console.log(`GitPulse API + Vite server running at http://localhost:${activePort}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}