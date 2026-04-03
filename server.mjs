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

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
});

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

server.listen(PORT, () => {
  console.log(`GitPulse API + Vite server running at http://localhost:${PORT}`);
});