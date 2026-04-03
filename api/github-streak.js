import { fetchGithubStreak } from '../src/lib/githubStreak.js';

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
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const body = request.body && typeof request.body === 'object' ? request.body : await readBody(request);
    const token = String(body?.token || '').trim();
    const username = String(body?.username || '').trim();

    if (!token) {
      response.status(400).json({ error: 'Missing GitHub token.' });
      return;
    }

    const data = await fetchGithubStreak(username, token);
    response.status(200).json({ data });
  } catch (error) {
    response
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Server error.' });
  }
}