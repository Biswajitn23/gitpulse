import { useEffect, useMemo, useRef, useState } from 'react';

export function useGithubStreak(username, token = '') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const refresh = useMemo(() => {
    return async () => {
      if (!token) {
        setData(null);
        setError(null);
        setLoading(false);
        return null;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/github-streak', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, token }),
        });

        const payload = await response.json();

        if (!response.ok) {
          const fallbackMessage = response.status === 401
            ? 'GitHub token is invalid or expired.'
            : 'Unable to load streak data.';
          throw new Error(payload?.error || fallbackMessage);
        }

        const result = payload?.data || null;
        if (requestId === requestIdRef.current) {
          setData(result);
        }
        return result;
      } catch (exception) {
        if (requestId === requestIdRef.current) {
          setError(exception.message || 'Unable to load streak data.');
          setData(null);
        }
        return null;
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };
  }, [token, username]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}