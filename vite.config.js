import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchGithubStreak } from './src/lib/githubStreak.js';

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

  return 500;
}

function githubStreakApiPlugin() {
  return {
    name: 'github-streak-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url !== '/api/github-streak' || request.method !== 'POST') {
          next();
          return;
        }

        try {
          const chunks = [];

          for await (const chunk of request) {
            chunks.push(chunk);
          }

          const rawBody = Buffer.concat(chunks).toString('utf8');
          const body = rawBody ? JSON.parse(rawBody) : {};
          const token = String(body?.token || '').trim();
          const username = String(body?.username || '').trim();

          if (!token) {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ error: 'Missing GitHub token.' }));
            return;
          }

          const data = await fetchGithubStreak(username, token);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ data }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Server error.';
          response.statusCode = getStatusCodeForError(message);
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), githubStreakApiPlugin()],
});