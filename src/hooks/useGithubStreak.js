import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchGithubStreak } from '../lib/githubStreak';

export function useGithubStreak(username, token = import.meta.env.VITE_GITHUB_TOKEN) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const refresh = useMemo(() => {
    return async () => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const result = await fetchGithubStreak(username, token);
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