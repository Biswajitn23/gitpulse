import { fetchGithubStreak } from '../src/lib/githubStreak.js';

function parseRequestBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    const trimmed = body.trim();
    return trimmed ? JSON.parse(trimmed) : {};
  }

  if (typeof body === 'object') {
    return body;
  }

  return {};
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

  return 500;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.setHeader('Allow', 'POST, OPTIONS');
    response.status(204).end();
    return;
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const parsedBody = parseRequestBody(request.body);
    const body = Object.keys(parsedBody).length ? parsedBody : parseRequestBody(await readBody(request));
    const token = String(body?.token || '').trim();
    const username = String(body?.username || '').trim();

    if (!token) {
      response.status(400).json({ error: 'Missing GitHub token.' });
      return;
    }

    const data = await fetchGithubStreak(username, token);
    response.status(200).json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error.';
    const statusCode = getStatusCodeForError(message);
    response.status(statusCode).json({ error: message });
  }
}