import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Flame,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Activity,
  CalendarRange,
  LogIn,
} from 'lucide-react';
import { useGithubStreak } from '../hooks/useGithubStreak';
import { formatDeviceVerificationUrl, pollGithubAccessToken, requestGithubDeviceCode } from '../lib/githubAuth';

const DEFAULT_USERNAME = '';
const AUTH_STORAGE_KEY = 'gitpulse-github-token';
const CLIENT_ID_STORAGE_KEY = 'gitpulse-github-client-id';
const DAILY_GOAL = 30;

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildHeatmapSquares(days) {
  const totalSquares = 98;
  const squares = [];

  for (let index = 0; index < totalSquares; index += 1) {
    const day = days?.[index % days.length];
    const intensity = day ? Math.min(4, Math.floor(day.contributionCount / 2)) : 0;
    squares.push(intensity);
  }

  return squares;
}

export default function GitPulseDashboard() {
  const [username, setUsername] = useState(DEFAULT_USERNAME);
  const [submittedUsername, setSubmittedUsername] = useState(DEFAULT_USERNAME);
  const [clientIdInput, setClientIdInput] = useState(() => {
    if (typeof window === 'undefined') {
      return import.meta.env.VITE_GITHUB_CLIENT_ID || '';
    }

    return window.localStorage.getItem(CLIENT_ID_STORAGE_KEY) || import.meta.env.VITE_GITHUB_CLIENT_ID || '';
  });
  const [authStep, setAuthStep] = useState('idle');
  const [authMessage, setAuthMessage] = useState('');
  const [deviceCodeInfo, setDeviceCodeInfo] = useState(null);
  const [authToken, setAuthToken] = useState(() => {
    if (typeof window === 'undefined') {
      return import.meta.env.VITE_GITHUB_TOKEN || '';
    }

    return window.localStorage.getItem(AUTH_STORAGE_KEY) || import.meta.env.VITE_GITHUB_TOKEN || '';
  });
  const [authMode, setAuthMode] = useState(Boolean(authToken));
  const { data, loading, error, refresh } = useGithubStreak(submittedUsername, authToken);
  const [notificationState, setNotificationState] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [alertTriggeredForDay, setAlertTriggeredForDay] = useState(false);

  const progressPercent = useMemo(() => {
    if (!data) {
      return 0;
    }

    return Math.min(100, Math.round((data.currentStreak / DAILY_GOAL) * 100));
  }, [data]);

  const heatmapSquares = useMemo(() => buildHeatmapSquares(data?.contributionDays || []), [data]);

  const isEvening = new Date().getHours() >= 20;
  const isCritical = Boolean(data) && isEvening && !data.hasContributedToday;
  const canUseAccount = Boolean(authToken);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (authToken) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, authToken);
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    return undefined;
  }, [authToken]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (clientIdInput) {
      window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientIdInput);
    } else {
      window.localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
    }

    return undefined;
  }, [clientIdInput]);

  useEffect(() => {
    setAuthMode(Boolean(authToken));
  }, [authToken]);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      return undefined;
    }

    if (notificationState === 'default') {
      Notification.requestPermission().then(setNotificationState);
    }

    return undefined;
  }, [notificationState]);

  useEffect(() => {
    if (!data || !isEvening || data.hasContributedToday || typeof Notification === 'undefined') {
      return undefined;
    }

    const todayKey = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const storageKey = `gitpulse-alert:${submittedUsername}:${todayKey}`;

    if (alertTriggeredForDay || localStorage.getItem(storageKey)) {
      return undefined;
    }

    if (Notification.permission === 'granted') {
      new Notification('GitPulse: commit missing for today', {
        body: `No GitHub contribution detected for ${submittedUsername} by 8:00 PM local time.`,
      });
      localStorage.setItem(storageKey, 'sent');
      setAlertTriggeredForDay(true);
      return undefined;
    }

    if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        setNotificationState(permission);
        if (permission === 'granted') {
          new Notification('GitPulse: commit missing for today', {
            body: `No GitHub contribution detected for ${submittedUsername} by 8:00 PM local time.`,
          });
          localStorage.setItem(storageKey, 'sent');
          setAlertTriggeredForDay(true);
        }
      });
    }

    return undefined;
  }, [alertTriggeredForDay, data, isEvening, submittedUsername]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!data || typeof Notification === 'undefined') {
        return;
      }

      const now = new Date();
      if (now.getHours() < 20 || data.hasContributedToday) {
        return;
      }

      const todayKey = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      const storageKey = `gitpulse-alert:${submittedUsername}:${todayKey}`;

      if (localStorage.getItem(storageKey)) {
        return;
      }

      if (Notification.permission === 'granted') {
        new Notification('GitPulse: commit missing for today', {
          body: `No GitHub contribution detected for ${submittedUsername} by 8:00 PM local time.`,
        });
        localStorage.setItem(storageKey, 'sent');
        setAlertTriggeredForDay(true);
      }
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [data, submittedUsername]);

  const handleSubmit = (event) => {
    event.preventDefault();
    setAlertTriggeredForDay(false);
    setSubmittedUsername(username.trim());
  };

  const handleAuthSubmit = (event) => {
    event.preventDefault();
    const trimmedClientId = clientIdInput.trim();

    if (!trimmedClientId) {
      setAuthMessage('Enter your GitHub OAuth app client id first.');
      return;
    }

    setAuthStep('starting');
    setAuthMessage('Starting GitHub sign-in...');
    setAlertTriggeredForDay(false);

    requestGithubDeviceCode(trimmedClientId)
      .then(async (deviceCode) => {
        setDeviceCodeInfo(deviceCode);
        setAuthStep('waiting');
        setAuthMessage('Approve the sign-in in GitHub, then return here.');

        const verificationUrl = deviceCode.verification_uri_complete || deviceCode.verification_uri;
        if (verificationUrl) {
          window.open(verificationUrl, '_blank', 'noopener,noreferrer');
        }

        const accessToken = await pollGithubAccessToken({
          clientId: trimmedClientId,
          deviceCode: deviceCode.device_code,
          interval: deviceCode.interval,
          onPending: () => setAuthMessage('Waiting for GitHub approval...'),
        });

        setAuthToken(accessToken);
        setAuthMode(true);
        setAuthStep('signed-in');
        setAuthMessage('GitHub account connected.');
      })
      .catch((exception) => {
        setAuthStep('error');
        setAuthMessage(exception.message || 'Unable to sign in with GitHub.');
      });
  };

  const handleSignOut = () => {
    setAuthToken('');
    setAuthMode(false);
    setAuthStep('idle');
    setAuthMessage('');
    setDeviceCodeInfo(null);
    setSubmittedUsername('');
    setUsername('');
    setAlertTriggeredForDay(false);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              GitPulse
            </p>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
              Real-Time Contribution Monitor
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
              Dark, neon, and designed to keep a 30-day streak visible at a glance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-400/15"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {canUseAccount ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/10"
              >
                Sign Out
              </button>
            ) : null}
          </div>
        </header>

        <section className={`glass-card relative overflow-hidden rounded-3xl p-5 shadow-2xl shadow-emerald-950/30 transition sm:p-8 ${isCritical ? 'border-red-500/60 shadow-danger' : 'border-emerald-400/20 shadow-glow'}`}>
          <div className="absolute inset-0 bg-grid-radial opacity-80" />
          <div className="relative grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-6">
              {!authMode ? (
                <form onSubmit={handleAuthSubmit} className="rounded-3xl border border-emerald-400/20 bg-slate-950/70 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                    <LogIn className="h-4 w-4 text-emerald-300" />
                    GitHub OAuth Sign-In
                  </div>
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-[0.25em] text-slate-400">
                      GitHub OAuth Client ID
                    </span>
                    <input
                      value={clientIdInput}
                      onChange={(event) => setClientIdInput(event.target.value)}
                      placeholder="Paste your GitHub OAuth app client id"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={authStep === 'starting' || authStep === 'waiting'}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {authStep === 'starting' || authStep === 'waiting' ? 'Connecting...' : 'Sign In with GitHub'}
                    </button>
                    <p className="text-xs text-slate-500">
                      This uses GitHub device flow. No backend is required, but you must create an OAuth app client id.
                    </p>
                  </div>
                  {deviceCodeInfo ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-300">
                      <p className="text-slate-400">Open this URL in GitHub and enter the code:</p>
                      <p className="mt-2 font-semibold text-emerald-300">
                        {formatDeviceVerificationUrl(deviceCodeInfo.verification_uri)}
                      </p>
                      <p className="mt-1 text-lg font-black tracking-[0.2em] text-white">{deviceCodeInfo.user_code}</p>
                      <p className="mt-2 text-xs text-slate-500">{authMessage}</p>
                    </div>
                  ) : null}
                  {authMessage ? <p className="mt-3 text-xs text-slate-500">{authMessage}</p> : null}
                </form>
              ) : null}

              <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex-1">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.25em] text-slate-400">
                    GitHub Login
                  </span>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Enter any GitHub login"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </label>
                <button
                  type="submit"
                  disabled={!canUseAccount}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  <GitBranch className="h-4 w-4" />
                  Load Account
                </button>
              </form>

              {data?.username ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1">
                    Viewing: {data.username}
                  </span>
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1">
                    Enter a different GitHub login to switch accounts
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1">
                      Sign in with GitHub OAuth to view your own account
                    </span>
                    <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1">
                      Type a GitHub login to load another profile
                    </span>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                    <Flame className="h-4 w-4 text-emerald-300" />
                    Current Streak
                  </div>
                  <div className="flex items-end gap-3">
                    <span className="text-6xl font-black tracking-tight text-white glow-text sm:text-7xl">
                      {loading ? '...' : data?.currentStreak ?? 0}
                    </span>
                    <span className="pb-2 text-2xl">🔥</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-400">Consecutive days with activity, anchored to today or yesterday.</p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                    <Activity className="h-4 w-4 text-emerald-300" />
                    Longest Streak
                  </div>
                  <div className="flex items-end gap-3">
                    <span className="text-5xl font-black tracking-tight text-white sm:text-6xl">
                      {loading ? '...' : data?.longestStreak ?? 0}
                    </span>
                    <span className="pb-2 text-sm text-slate-400">days</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-400">Best run found in the last year.</p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <CalendarRange className="h-4 w-4 text-emerald-300" />
                      30-Day Goal Progress
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Goal: {DAILY_GOAL} consecutive days</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-300">{progressPercent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-800/80">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-lime-300 transition-all duration-500 ${loading ? 'animate-pulse' : ''}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  {data?.hasContributedToday ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                  )}
                  Daily Status
                </div>
                <div className="mt-4 flex items-center gap-3">
                  {data?.hasContributedToday ? (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                      Safe
                    </span>
                  ) : (
                    <span className="pulse-danger rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300">
                      Streak at Risk
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-slate-400">
                  {data?.hasContributedToday
                    ? 'A contribution was detected today in your local timezone.'
                    : 'No contribution has been detected today. The card shifts to critical red after 8:00 PM.'}
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <BellRing className="h-4 w-4 text-emerald-300" />
                  Evening Alert
                </div>
                <p className="mt-3 text-sm text-slate-300">
                  Browser notifications trigger after 8:00 PM if no contribution is present for the current day.
                </p>
                <p className="mt-2 text-xs text-slate-500">Current local time: {formatTime(new Date())}</p>
                <p className="mt-2 text-xs text-slate-500">Notification permission: {notificationState}</p>
              </div>
            </aside>
          </div>

          <div className="relative mt-6 rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
              <GitBranch className="h-4 w-4 text-emerald-300" />
              Contribution Heatmap Placeholder
            </div>
            <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5">
              {heatmapSquares.map((intensity, index) => (
                <span
                  key={`${index}-${intensity}`}
                  className={`aspect-square rounded-[4px] border border-white/5 ${
                    intensity === 0
                      ? 'bg-slate-800/60'
                      : intensity === 1
                        ? 'bg-emerald-950'
                        : intensity === 2
                          ? 'bg-emerald-900'
                          : intensity === 3
                            ? 'bg-emerald-700'
                            : 'bg-emerald-400'
                  }`}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>{data?.totalContributions ?? 0} total contributions in the last year</span>
              <span>•</span>
              <span>Responsive CSS grid mimic of GitHub squares</span>
            </div>
          </div>

          {error ? (
            <div className="relative mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}