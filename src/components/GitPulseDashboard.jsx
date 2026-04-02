import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Flame,
  GitBranch,
  ShieldCheck,
  Sparkles,
  Activity,
  CalendarRange,
  LogIn,
} from 'lucide-react';
import { GithubAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { useGithubStreak } from '../hooks/useGithubStreak';
import { createGithubProvider, getFirebaseAuth } from '../lib/firebase';

const AUTH_STORAGE_KEY = 'gitpulse-github-token';
const ACCOUNT_STORAGE_KEY = 'gitpulse-account-username';
const ACCOUNT_AVATAR_STORAGE_KEY = 'gitpulse-account-avatar';
const DAILY_GOAL = 30;

function sanitizeCredential(value) {
  const normalized = (value || '').trim();
  if (!normalized) {
    return '';
  }

  const placeholderPattern = /your_|placeholder|example/i;
  return placeholderPattern.test(normalized) ? '' : normalized;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getNotificationButtonLabel(notificationState) {
  if (notificationState === 'granted') {
    return 'Alerts On';
  }

  if (notificationState === 'denied') {
    return 'Alerts Blocked';
  }

  if (notificationState === 'unsupported') {
    return 'Alerts Unsupported';
  }

  return 'Enable Alerts';
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  return copy;
}

function summarizeWeek(days, repoContributionsByDate, weekStartDate) {
  const from = new Date(weekStartDate);
  const to = new Date(weekStartDate);
  to.setDate(to.getDate() + 6);

  const byDate = new Map((days || []).map((day) => [day.date, day.contributionCount]));
  let commits = 0;
  const activeRepos = new Set();

  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    const key = toDateKey(cursor);
    commits += byDate.get(key) || 0;

    const repos = repoContributionsByDate?.[key] || [];
    repos.forEach((repo) => activeRepos.add(repo.nameWithOwner));
  }

  return {
    commits,
    activeRepos: activeRepos.size,
  };
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildYearContributionCells(days, year) {
  const contributionsByDate = new Map((days || []).map((day) => [day.date, day.contributionCount]));
  const cells = [];
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  for (let index = 0; index < yearStart.getDay(); index += 1) {
    cells.push({
      key: `padding-start-${index}`,
      isPadding: true,
    });
  }

  for (let cursor = new Date(yearStart); cursor <= yearEnd; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor);
    const dateKey = toDateKey(date);
    cells.push({
      key: dateKey,
      isPadding: false,
      date: dateKey,
      contributionCount: contributionsByDate.get(dateKey) || 0,
    });
  }

  const trailingPadding = (7 - (cells.length % 7)) % 7;
  for (let index = 0; index < trailingPadding; index += 1) {
    cells.push({
      key: `padding-end-${index}`,
      isPadding: true,
    });
  }

  return cells;
}

function buildCommitFocus(days, year) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const buckets = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));

  (days || []).forEach((day) => {
    if (!day.date.startsWith(`${year}-`)) {
      return;
    }

    const date = new Date(`${day.date}T00:00:00`);
    const index = date.getDay();
    buckets[index].total += day.contributionCount;
    buckets[index].count += 1;
  });

  const averages = buckets.map((bucket) => (bucket.count ? bucket.total / bucket.count : 0));
  const bestAverage = Math.max(...averages, 0);
  const weakestIndex = averages.indexOf(Math.min(...averages));
  const weakestAverage = averages[weakestIndex] || 0;
  const suggestedExtra = Math.max(1, Math.ceil(bestAverage - weakestAverage));

  return {
    day: dayNames[weakestIndex] || 'Monday',
    suggestedExtra,
    weakestAverage: Number(weakestAverage.toFixed(2)),
  };
}

export default function GitPulseDashboard() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authStep, setAuthStep] = useState('idle');
  const [authMessage, setAuthMessage] = useState('');
  const [nowTime, setNowTime] = useState(() => new Date());
  const [authToken, setAuthToken] = useState(() => {
    if (typeof window === 'undefined') {
      return sanitizeCredential(import.meta.env.VITE_GITHUB_TOKEN || '');
    }

    return sanitizeCredential(window.localStorage.getItem(AUTH_STORAGE_KEY) || '');
  });
  const [restoredAccount, setRestoredAccount] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(ACCOUNT_STORAGE_KEY) || '';
  });
  const [restoredAvatar, setRestoredAvatar] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.localStorage.getItem(ACCOUNT_AVATAR_STORAGE_KEY) || '';
  });
  const { data, loading, error, refresh } = useGithubStreak('', authToken);
  const [notificationState, setNotificationState] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [alertTriggeredForDay, setAlertTriggeredForDay] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  const progressPercent = useMemo(() => {
    if (!data) {
      return 0;
    }

    return Math.min(100, Math.round((data.currentStreak / DAILY_GOAL) * 100));
  }, [data]);

  const heatmapYear = nowTime.getFullYear();
  const heatmapCells = useMemo(() => buildYearContributionCells(data?.contributionDays || [], heatmapYear), [data, heatmapYear]);
  const yearContributionTotal = useMemo(() => {
    return (data?.contributionDays || [])
      .filter((day) => day.date.startsWith(`${heatmapYear}-`))
      .reduce((total, day) => total + day.contributionCount, 0);
  }, [data, heatmapYear]);
  const selectedRepos = useMemo(() => {
    if (!selectedDate) {
      return [];
    }

    return data?.repoContributionsByDate?.[selectedDate] || [];
  }, [data, selectedDate]);
  const commitFocus = useMemo(
    () => buildCommitFocus(data?.contributionDays || [], heatmapYear),
    [data, heatmapYear],
  );
  const weeklyDigest = useMemo(() => {
    const currentWeekStart = startOfWeek(nowTime);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const currentWeek = summarizeWeek(
      data?.contributionDays || [],
      data?.repoContributionsByDate || {},
      currentWeekStart,
    );
    const previousWeek = summarizeWeek(
      data?.contributionDays || [],
      data?.repoContributionsByDate || {},
      previousWeekStart,
    );

    return {
      currentWeek,
      previousWeek,
      commitDelta: currentWeek.commits - previousWeek.commits,
      repoDelta: currentWeek.activeRepos - previousWeek.activeRepos,
    };
  }, [data, nowTime]);
  const monthlySnapshot = useMemo(() => {
    const monthPrefix = `${heatmapYear}-${pad(nowTime.getMonth() + 1)}`;
    const monthDays = (data?.contributionDays || []).filter((day) => day.date.startsWith(monthPrefix));
    const commits = monthDays.reduce((total, day) => total + day.contributionCount, 0);
    const activeDays = monthDays.filter((day) => day.contributionCount > 0).length;
    const activeRepos = new Set();

    monthDays.forEach((day) => {
      (data?.repoContributionsByDate?.[day.date] || []).forEach((repo) => activeRepos.add(repo.nameWithOwner));
    });

    return {
      commits,
      activeDays,
      activeRepos: activeRepos.size,
      consistency: monthDays.length ? Math.round((activeDays / monthDays.length) * 100) : 0,
    };
  }, [data, heatmapYear, nowTime]);
  const monthlyHighlights = useMemo(() => {
    const monthPrefix = `${heatmapYear}-${pad(nowTime.getMonth() + 1)}`;
    const monthDays = (data?.contributionDays || []).filter((day) => day.date.startsWith(monthPrefix));

    if (!monthDays.length) {
      return {
        peakDate: '-',
        peakCommits: 0,
        averagePerDay: 0,
      };
    }

    const peakDay = monthDays.reduce((best, day) => {
      return day.contributionCount > best.contributionCount ? day : best;
    }, monthDays[0]);

    const total = monthDays.reduce((sum, day) => sum + day.contributionCount, 0);
    return {
      peakDate: formatDateLabel(peakDay.date),
      peakCommits: peakDay.contributionCount,
      averagePerDay: Number((total / monthDays.length).toFixed(2)),
    };
  }, [data, heatmapYear, nowTime]);

  const viewerName = data?.username || firebaseUser?.displayName || 'github-user';
  const profileName = data?.displayName || data?.username || firebaseUser?.displayName || restoredAccount || 'GitHub User';
  const profileAvatar = data?.avatarUrl || firebaseUser?.photoURL || restoredAvatar;
  const isEvening = nowTime.getHours() >= 20;
  const isCritical = Boolean(data) && isEvening && !data.hasContributedToday;
  const canUseAccount = Boolean(firebaseUser && authToken);

  useEffect(() => {
    const clockTimer = window.setInterval(() => {
      setNowTime(new Date());
    }, 1000);

    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    let auth;
    try {
      auth = getFirebaseAuth();
    } catch (exception) {
      setAuthStep('error');
      setAuthMessage(exception.message || 'Firebase authentication is not configured.');
      return undefined;
    }

    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);

      if (!user) {
        setAuthToken('');
        setAuthStep('idle');
        return;
      }

      const storedToken = sanitizeCredential(window.localStorage.getItem(AUTH_STORAGE_KEY) || '');
      if (storedToken) {
        setAuthToken(storedToken);
        setAuthStep('signed-in');
        setAuthMessage(`Session restored for ${user.displayName || user.email || user.uid}.`);
      }
    });
  }, []);

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
    if (!data?.username || typeof window === 'undefined') {
      return undefined;
    }

    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, data.username);
    if (data.avatarUrl) {
      window.localStorage.setItem(ACCOUNT_AVATAR_STORAGE_KEY, data.avatarUrl);
      setRestoredAvatar(data.avatarUrl);
    }
    setRestoredAccount(data.username);
    return undefined;
  }, [data]);

  useEffect(() => {
    if (!canUseAccount) {
      return undefined;
    }

    const pollingTimer = window.setInterval(() => {
      refresh();
    }, 60_000);

    return () => window.clearInterval(pollingTimer);
  }, [canUseAccount, refresh]);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      return undefined;
    }

    setNotificationState(Notification.permission);

    return undefined;
  }, []);

  useEffect(() => {
    if (!data || !isEvening || data.hasContributedToday || typeof Notification === 'undefined') {
      return undefined;
    }

    const todayKey = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const storageKey = `gitpulse-alert:${viewerName}:${todayKey}`;

    if (alertTriggeredForDay || localStorage.getItem(storageKey)) {
      return undefined;
    }

    if (Notification.permission === 'granted') {
      new Notification('GitPulse: commit missing for today', {
        body: `No GitHub contribution detected for ${viewerName} by 8:00 PM local time.`,
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
            body: `No GitHub contribution detected for ${viewerName} by 8:00 PM local time.`,
          });
          localStorage.setItem(storageKey, 'sent');
          setAlertTriggeredForDay(true);
        }
      });
    }

    return undefined;
  }, [alertTriggeredForDay, data, isEvening, viewerName]);

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
      const storageKey = `gitpulse-alert:${viewerName}:${todayKey}`;

      if (localStorage.getItem(storageKey)) {
        return;
      }

      if (Notification.permission === 'granted') {
        new Notification('GitPulse: commit missing for today', {
          body: `No GitHub contribution detected for ${viewerName} by 8:00 PM local time.`,
        });
        localStorage.setItem(storageKey, 'sent');
        setAlertTriggeredForDay(true);
      }
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [data, viewerName]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();

    let auth;
    try {
      auth = getFirebaseAuth();
    } catch (exception) {
      setAuthStep('error');
      setAuthMessage(exception.message || 'Firebase authentication is not configured.');
      return;
    }

    setAuthStep('starting');
    setAuthMessage('Opening GitHub sign-in...');

    try {
      const provider = createGithubProvider();
      const result = await signInWithPopup(auth, provider);
      const credential = GithubAuthProvider.credentialFromResult(result);
      const githubAccessToken = sanitizeCredential(credential?.accessToken || '');

      if (!githubAccessToken) {
        throw new Error('GitHub access token missing from Firebase login result.');
      }

      setAuthToken(githubAccessToken);
      setFirebaseUser(result.user);
      setAuthStep('signed-in');
      setAuthMessage(`Connected as ${result.user.displayName || result.user.email || 'GitHub user'}.`);
      setAlertTriggeredForDay(false);
    } catch (exception) {
      setAuthStep('error');
      setAuthMessage(exception.message || 'Unable to sign in with Firebase GitHub provider.');
    }
  };

  const handleSignOut = async () => {
    try {
      const auth = getFirebaseAuth();
      await signOut(auth);
    } catch {
      // Ignore sign-out provider errors and still clear local session.
    }

    setFirebaseUser(null);
    setAuthToken('');
    setAuthStep('idle');
    setAuthMessage('');
    setRestoredAccount('');
    setRestoredAvatar('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
      window.localStorage.removeItem(ACCOUNT_AVATAR_STORAGE_KEY);
    }
    setAlertTriggeredForDay(false);
  };

  const handleEnableNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationState('unsupported');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationState(permission);

    if (permission === 'granted') {
      new Notification('GitPulse alerts enabled', {
        body: 'You will be notified when your daily contribution is at risk.',
      });
    }
  };

  if (!canUseAccount) {
    return (
      <main className="min-h-screen overflow-hidden bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-8 sm:px-6">
          <section className="glass-card w-full rounded-3xl border border-emerald-400/20 p-6 shadow-glow sm:p-8">
            <div className="mb-3 flex items-center gap-3">
              <img src="/favicon.svg" alt="GitPulse logo" className="h-8 w-8 rounded-lg border border-emerald-400/30" />
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                GitPulse
              </p>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Login Required</h1>
            <p className="mt-2 text-sm text-slate-400">Sign in with GitHub to access the dashboard.</p>

            <form onSubmit={handleAuthSubmit} className="mt-6 rounded-3xl border border-emerald-400/20 bg-slate-950/70 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                <LogIn className="h-4 w-4 text-emerald-300" />
                Firebase GitHub Login
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={authStep === 'starting'}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {authStep === 'starting' ? 'Connecting...' : 'Sign In with GitHub'}
                </button>
              </div>
              {authMessage ? <p className="mt-3 text-xs text-slate-500">{authMessage}</p> : null}
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <img src="/favicon.svg" alt="GitPulse logo" className="h-8 w-8 rounded-lg border border-emerald-400/30" />
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                GitPulse
              </p>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
              Real-Time Contribution Monitor
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
              Dark, neon, and designed to keep a 30-day streak visible at a glance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canUseAccount && (data?.username || restoredAccount || profileAvatar) ? (
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1.5 text-slate-100">
                {profileAvatar ? (
                  <img
                    src={profileAvatar}
                    alt={profileName}
                    className="h-7 w-7 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-slate-800 text-xs font-semibold">
                    {profileName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[140px] truncate text-sm font-medium">{profileName}</span>
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleEnableNotifications}
              disabled={notificationState === 'unsupported'}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            >
              <BellRing className="h-3.5 w-3.5" />
              {getNotificationButtonLabel(notificationState)}
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
              {data?.username ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1">
                    Connected account: {data.username}
                  </span>
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1">
                    Device recognized
                  </span>
                </div>
              ) : null}

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
                    className={`h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-300 to-lime-200 shadow-[0_0_14px_rgba(16,185,129,0.55)] transition-all duration-500 ${loading ? 'animate-pulse' : ''}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                    <CalendarRange className="h-4 w-4 text-emerald-300" />
                    Monthly Snapshot
                  </div>
                  <p className="text-2xl font-bold text-white">{monthlySnapshot.commits}</p>
                  <p className="mt-1 text-xs text-slate-500">Commits this month</p>
                  <p className="mt-3 text-xs text-slate-400">
                    {monthlySnapshot.activeDays} active days • {monthlySnapshot.activeRepos} active repos
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                    <Activity className="h-4 w-4 text-emerald-300" />
                    Consistency Score
                  </div>
                  <p className="text-2xl font-bold text-white">{monthlySnapshot.consistency}%</p>
                  <p className="mt-1 text-xs text-slate-500">Days with at least one commit this month</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-200 shadow-[0_0_10px_rgba(16,185,129,0.45)]" style={{ width: `${monthlySnapshot.consistency}%` }} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                    <Flame className="h-4 w-4 text-emerald-300" />
                    Peak Day (Month)
                  </div>
                  <p className="text-2xl font-bold text-white">{monthlyHighlights.peakCommits}</p>
                  <p className="mt-1 text-xs text-slate-500">Most commits on a single day this month</p>
                  <p className="mt-3 text-xs text-slate-400">{monthlyHighlights.peakDate}</p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                    <Activity className="h-4 w-4 text-emerald-300" />
                    Daily Average
                  </div>
                  <p className="text-2xl font-bold text-white">{monthlyHighlights.averagePerDay}</p>
                  <p className="mt-1 text-xs text-slate-500">Average commits/day this month</p>
                  <p className="mt-3 text-xs text-slate-400">Based on all calendar days this month</p>
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
                <p className="mt-2 text-xs text-slate-500">Current local time: {formatTime(nowTime)}</p>
                <p className="mt-2 text-xs text-slate-500">Notification permission: {notificationState}</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Activity className="h-4 w-4 text-emerald-300" />
                  Commit Focus ({heatmapYear})
                </div>
                <p className="mt-3 text-sm text-slate-200">
                  Commit more on <span className="font-semibold text-emerald-300">{commitFocus.day}</span> in {heatmapYear}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Suggested extra commits: <span className="font-semibold text-emerald-300">+{commitFocus.suggestedExtra}</span>
                </p>
                <p className="mt-2 text-xs text-slate-500">Current average on {commitFocus.day}: {commitFocus.weakestAverage} commits/day</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <CalendarRange className="h-4 w-4 text-emerald-300" />
                  Weekly Digest
                </div>
                <p className="mt-3 text-xs text-slate-400">This week vs last week</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                    <p className="text-slate-400">Commits</p>
                    <p className="mt-1 text-lg font-semibold text-white">{weeklyDigest.currentWeek.commits}</p>
                    <p className={`mt-1 ${weeklyDigest.commitDelta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {weeklyDigest.commitDelta >= 0 ? '+' : ''}{weeklyDigest.commitDelta} vs last week
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                    <p className="text-slate-400">Active repos</p>
                    <p className="mt-1 text-lg font-semibold text-white">{weeklyDigest.currentWeek.activeRepos}</p>
                    <p className={`mt-1 ${weeklyDigest.repoDelta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {weeklyDigest.repoDelta >= 0 ? '+' : ''}{weeklyDigest.repoDelta} vs last week
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className="relative mt-6 rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
              <GitBranch className="h-4 w-4 text-emerald-300" />
              {heatmapYear} Contribution Heatmap
            </div>
            {hoveredCell ? (
              <p className="mb-3 text-xs text-slate-300">
                {formatDateLabel(hoveredCell.date)}: <span className="font-semibold text-emerald-300">{hoveredCell.contributionCount}</span> commits
              </p>
            ) : (
              <p className="mb-3 text-xs text-slate-500">Hover a day to see date and commit count.</p>
            )}
            <div className="overflow-x-auto pb-2">
              <div className="grid grid-flow-col grid-rows-7 gap-1.5">
                {heatmapCells.map((cell) => {
                  if (cell.isPadding) {
                    return <span key={cell.key} className="h-3 w-3 rounded-[4px] opacity-0" />;
                  }

                  const intensity =
                    cell.contributionCount === 0
                      ? 0
                      : cell.contributionCount <= 2
                        ? 1
                        : cell.contributionCount <= 5
                          ? 2
                          : cell.contributionCount <= 9
                            ? 3
                            : 4;

                  return (
                    <span
                      key={cell.key}
                      title={`${cell.date}: ${cell.contributionCount} contributions`}
                      onMouseEnter={() => setHoveredCell({ date: cell.date, contributionCount: cell.contributionCount })}
                      onMouseLeave={() => setHoveredCell(null)}
                      onClick={() => setSelectedDate(cell.date)}
                      className={`h-3 w-3 rounded-[4px] border border-white/5 ${
                        intensity === 0
                          ? 'bg-red-900/80'
                          : intensity === 1
                            ? 'bg-emerald-700'
                            : intensity === 2
                              ? 'bg-emerald-500'
                              : intensity === 3
                                ? 'bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.45)]'
                                : 'bg-lime-200 shadow-[0_0_12px_rgba(190,242,100,0.6)]'
                      } cursor-pointer transition hover:scale-110`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>{yearContributionTotal} contributions in {heatmapYear}</span>
              <span>•</span>
              <span>Full year view with all calendar days</span>
            </div>

            {selectedDate ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <p className="text-sm font-semibold text-slate-200">Repositories committed on {formatDateLabel(selectedDate)}</p>
                {selectedRepos.length ? (
                  <ul className="mt-3 space-y-2 text-xs text-slate-300">
                    {selectedRepos.map((repo) => (
                      <li key={`${selectedDate}-${repo.nameWithOwner}`} className="flex items-center justify-between gap-3">
                        <a href={repo.url} target="_blank" rel="noreferrer" className="truncate text-emerald-300 hover:text-emerald-200">
                          {repo.nameWithOwner}
                        </a>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-200">{repo.count} commits</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No repository commit details for this day.</p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500">Click a day to view committed repositories below.</p>
            )}
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