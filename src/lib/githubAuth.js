const GITHUB_DEVICE_CODE_ENDPOINT = 'https://github.com/login/device/code';
const GITHUB_ACCESS_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const DEFAULT_SCOPE = 'read:user user:email';

function parseFormBody(formBody) {
  return Object.fromEntries(new URLSearchParams(formBody));
}

export async function requestGithubDeviceCode(clientId, scope = DEFAULT_SCOPE) {
  if (!clientId) {
    throw new Error('Missing GitHub OAuth client id. Set VITE_GITHUB_CLIENT_ID in your environment.');
  }

  const response = await fetch(GITHUB_DEVICE_CODE_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope,
    }).toString(),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || 'Unable to start GitHub sign-in.');
  }

  return payload;
}

export async function pollGithubAccessToken({ clientId, deviceCode, interval, onPending }) {
  const pollInterval = Math.max(Number(interval) || 5, 5) * 1000;
  const start = Date.now();
  const timeoutAt = start + 15 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    const response = await fetch(GITHUB_ACCESS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
    });

    const payload = await response.json();

    if (payload.access_token) {
      return payload.access_token;
    }

    if (payload.error === 'authorization_pending') {
      onPending?.(payload);
      await new Promise((resolve) => window.setTimeout(resolve, pollInterval));
      continue;
    }

    if (payload.error === 'slow_down') {
      await new Promise((resolve) => window.setTimeout(resolve, pollInterval + 5000));
      continue;
    }

    if (payload.error === 'expired_token') {
      throw new Error('GitHub sign-in expired. Start again to continue.');
    }

    if (payload.error_description || payload.error) {
      throw new Error(payload.error_description || payload.error);
    }

    if (!response.ok) {
      throw new Error('Unable to complete GitHub sign-in.');
    }
  }

  throw new Error('GitHub sign-in timed out. Start again to continue.');
}

export function formatDeviceVerificationUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return url;
  }
}
