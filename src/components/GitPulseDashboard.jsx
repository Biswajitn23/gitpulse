import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Flame,
  GitBranch,
  ShieldCheck,
  Activity,
  RefreshCw,
  CalendarRange,
  LogIn,
  LogOut,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { GithubAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { useGithubStreak } from '../hooks/useGithubStreak';
import { createGithubProvider, getFirebaseAuth } from '../lib/firebase';

const AUTH_STORAGE_KEY = 'gitpulse-github-token';
const ACCOUNT_STORAGE_KEY = 'gitpulse-account-username';
const ACCOUNT_AVATAR_STORAGE_KEY = 'gitpulse-account-avatar';
const ALERTS_ENABLED_STORAGE_KEY = 'gitpulse-alerts-enabled';
const DAILY_GOAL = 30;

// --- Helper Functions (Logic Preserved) ---

function sanitizeCredential(value) {
  const normalized = (value || '').trim();
  if (!normalized) return '';
  const placeholderPattern = /your_|placeholder|example/i;
  return placeholderPattern.test(normalized) ? '' : normalized;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatTime(date) {
  const hours = date.getHours() % 12 || 12;
  const minutes = pad(date.getMinutes());
  const period = date.getHours() >= 12 ? 'PM' : 'AM';
  return `${hours}:${minutes} ${period}`;
}

function BrandMark({ className = '' }) {
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-2xl bg-[#020617] shadow-[0_0_24px_rgba(16,185,129,0.35)] ${className}`.trim()}>
      <img src="/favicon.svg" alt="GitPulse logo" className="h-full w-full object-contain" />
    </div>
  );
}

function SiteBrand({ sizeClassName = 'h-8 w-8', textClassName = 'text-lg', stacked = false }) {
  return (
    <div className={`flex items-center gap-3 ${stacked ? 'flex-col text-center' : ''}`.trim()}>
      <BrandMark className={sizeClassName} />
      <div className={stacked ? 'space-y-1' : ''}>
        <span className={`block font-black tracking-tight text-white ${textClassName}`.trim()}>GitPulse</span>
        <span className={`block text-xs uppercase tracking-[0.32em] text-emerald-300/80 ${stacked ? '' : 'mt-0.5'}`.trim()}>
          Streak intelligence
        </span>
      </div>
    </div>
  );
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
  if (notificationState === 'granted') return 'Alerts On';
  if (notificationState === 'denied') return 'Alerts Blocked';
  if (notificationState === 'unsupported') return 'Unsupported';
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
  return { commits, activeRepos: activeRepos.size };
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildYearContributionCells(days, year) {
  const contributionsByDate = new Map((days || []).map((day) => [day.date, day.contributionCount]));
  const cells = [];
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  for (let i = 0; i < yearStart.getDay(); i++) cells.push({ key: `pad-s-${i}`, isPadding: true });
  for (let cursor = new Date(yearStart); cursor <= yearEnd; cursor.setDate(cursor.getDate() + 1)) {
    const dateKey = toDateKey(cursor);
    cells.push({ key: dateKey, isPadding: false, date: dateKey, contributionCount: contributionsByDate.get(dateKey) || 0 });
  }
  return cells;
}

function buildCommitFocus(days, year) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const buckets = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
  (days || []).forEach((day) => {
    if (!day.date.startsWith(`${year}-`)) return;
    const index = new Date(`${day.date}T00:00:00`).getDay();
    buckets[index].total += day.contributionCount;
    buckets[index].count += 1;
  });
  const averages = buckets.map((b) => (b.count ? b.total / b.count : 0));
  const weakestIndex = averages.indexOf(Math.min(...averages));
  return {
    day: dayNames[weakestIndex] || 'Monday',
    suggestedExtra: Math.max(1, Math.ceil(Math.max(...averages) - averages[weakestIndex])),
    weakestAverage: Number(averages[weakestIndex].toFixed(2)),
  };
}

function buildPeakDayStats(days, year) {
  const currentYearDays = (days || []).filter((day) => day.date.startsWith(`${year}-`));

  if (!currentYearDays.length) {
    return {
      date: null,
      commits: 0,
    };
  }

  const peakDay = currentYearDays.reduce((bestDay, currentDay) => {
    if (!bestDay || currentDay.contributionCount > bestDay.contributionCount) {
      return currentDay;
    }

    return bestDay;
  }, null);

  return {
    date: peakDay.date,
    commits: peakDay.contributionCount,
  };
}

// --- Main Component ---

export default function GitPulseDashboard() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authStep, setAuthStep] = useState('idle');
  const [authMessage, setAuthMessage] = useState('');
  const [nowTime, setNowTime] = useState(() => new Date());
  const [authToken, setAuthToken] = useState(() => {
    if (typeof window === 'undefined') return sanitizeCredential(import.meta.env.VITE_GITHUB_TOKEN || '');
    return sanitizeCredential(window.localStorage.getItem(AUTH_STORAGE_KEY) || '');
  });
  const [restoredAccount, setRestoredAccount] = useState(() => typeof window === 'undefined' ? '' : window.localStorage.getItem(ACCOUNT_STORAGE_KEY) || '');
  const [restoredAvatar, setRestoredAvatar] = useState(() => typeof window === 'undefined' ? '' : window.localStorage.getItem(ACCOUNT_AVATAR_STORAGE_KEY) || '');
  
  const { data, loading, error, refresh } = useGithubStreak('', authToken);
  const [notificationState, setNotificationState] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [alertsEnabled, setAlertsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(ALERTS_ENABLED_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });
  const [alertTriggeredForDay, setAlertTriggeredForDay] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedReposDetailed, setSelectedReposDetailed] = useState([]);
  const [selectedReposLoading, setSelectedReposLoading] = useState(false);

  // Memoized Stats
  const progressPercent = useMemo(() => data ? Math.min(100, Math.round((data.currentStreak / DAILY_GOAL) * 100)) : 0, [data]);
  const heatmapYear = nowTime.getFullYear();
  const currentMonthLabel = nowTime.toLocaleDateString(undefined, { month: 'long' });
  const heatmapCells = useMemo(() => buildYearContributionCells(data?.contributionDays || [], heatmapYear), [data, heatmapYear]);
  const yearContributionTotal = useMemo(() => (data?.contributionDays || []).filter(d => d.date.startsWith(`${heatmapYear}-`)).reduce((t, d) => t + d.contributionCount, 0), [data, heatmapYear]);
  const selectedRepos = useMemo(() => {
    if (selectedReposDetailed.length > 0) {
      return selectedReposDetailed;
    }

    return selectedDate ? data?.repoContributionsByDate?.[selectedDate] || [] : [];
  }, [data, selectedDate, selectedReposDetailed]);
  const selectedDayTotal = useMemo(() => {
    if (!selectedDate) return 0;
    return data?.contributionDays?.find((day) => day.date === selectedDate)?.contributionCount || 0;
  }, [data, selectedDate]);
  const commitFocus = useMemo(() => buildCommitFocus(data?.contributionDays || [], heatmapYear), [data, heatmapYear]);
  const peakDayStats = useMemo(() => buildPeakDayStats(data?.contributionDays || [], heatmapYear), [data, heatmapYear]);

  const monthlySnapshot = useMemo(() => {
    const monthPrefix = `${heatmapYear}-${pad(nowTime.getMonth() + 1)}`;
    const monthDays = (data?.contributionDays || []).filter(d => d.date.startsWith(monthPrefix));
    const commits = monthDays.reduce((t, d) => t + d.contributionCount, 0);
    const activeDays = monthDays.filter(d => d.contributionCount > 0).length;
    const activeRepos = new Set();
    monthDays.forEach(d => (data?.repoContributionsByDate?.[d.date] || []).forEach(r => activeRepos.add(r.nameWithOwner)));
    return { commits, activeDays, activeRepos: activeRepos.size, consistency: monthDays.length ? Math.round((activeDays / monthDays.length) * 100) : 0 };
  }, [data, heatmapYear, nowTime]);

  const viewerName = data?.username || firebaseUser?.displayName || 'github-user';
  const profileName = data?.displayName || data?.username || firebaseUser?.displayName || restoredAccount || 'GitHub User';
  const profileAvatar = data?.avatarUrl || firebaseUser?.photoURL || restoredAvatar;
  const isEvening = nowTime.getHours() >= 20;
  const canUseAccount = Boolean(firebaseUser && authToken);

  // --- Effects (Logic Preserved) ---

  useEffect(() => {
    const clockTimer = setInterval(() => setNowTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    let auth;
    try { auth = getFirebaseAuth(); } catch (e) { setAuthStep('error'); return; }
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) { setAuthToken(''); setAuthStep('idle'); return; }
      const storedToken = sanitizeCredential(window.localStorage.getItem(AUTH_STORAGE_KEY) || '');
      if (storedToken) { setAuthToken(storedToken); setAuthStep('signed-in'); }
    });
  }, []);

  useEffect(() => {
    if (authToken) window.localStorage.setItem(AUTH_STORAGE_KEY, authToken);
    else window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [authToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ALERTS_ENABLED_STORAGE_KEY, String(alertsEnabled));
  }, [alertsEnabled]);

  useEffect(() => {
    if (!data?.username) return;
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, data.username);
    if (data.avatarUrl) {
      window.localStorage.setItem(ACCOUNT_AVATAR_STORAGE_KEY, data.avatarUrl);
      setRestoredAvatar(data.avatarUrl);
    }
    setRestoredAccount(data.username);
  }, [data]);

  useEffect(() => {
    if (!canUseAccount) return;
    const handleVisibilityRefresh = () => {
      if (!document.hidden) {
        refresh();
      }
    };

    const polling = setInterval(() => refresh(), 15000);

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      clearInterval(polling);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [canUseAccount, refresh]);

  useEffect(() => {
    if (!selectedDate || !canUseAccount || !data?.username || !authToken) {
      setSelectedReposDetailed([]);
      setSelectedReposLoading(false);
      return;
    }

    let isCancelled = false;
    const fetchSelectedDateRepos = async () => {
      setSelectedReposLoading(true);
      try {
        const startDate = new Date(`${selectedDate}T00:00:00`);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        const query = `author:${data.username} committer-date:${selectedDate}..${toDateKey(endDate)}`;
        let page = 1;
        const repoBuckets = new Map();
        let hasMore = true;

        while (hasMore) {
          const response = await fetch(`https://api.github.com/search/commits?q=${encodeURIComponent(query)}&per_page=100&page=${page}&sort=committer-date&order=asc`, {
            headers: {
              Authorization: `bearer ${authToken}`,
              Accept: 'application/vnd.github.cloak-preview+json',
              'Content-Type': 'application/json',
            },
          });

          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload?.message || 'Unable to load repository details for the selected day.');
          }

          const items = payload?.items || [];
          items.forEach((item) => {
            const repository = item?.repository;
            if (!repository?.full_name) return;

            const existing = repoBuckets.get(repository.full_name) || {
              nameWithOwner: repository.full_name,
              url: repository.html_url || repository?.html_url || `https://github.com/${repository.full_name}`,
              count: 0,
            };

            existing.count += 1;
            repoBuckets.set(repository.full_name, existing);
          });

          hasMore = items.length === 100 && repoBuckets.size < payload?.total_count;
          page += 1;
        }

        if (!isCancelled) {
          setSelectedReposDetailed([...repoBuckets.values()].sort((left, right) => right.count - left.count));
        }
      } catch (error) {
        if (!isCancelled) {
          setSelectedReposDetailed(data?.repoContributionsByDate?.[selectedDate] || []);
        }
      } finally {
        if (!isCancelled) {
          setSelectedReposLoading(false);
        }
      }
    };

    fetchSelectedDateRepos();

    return () => {
      isCancelled = true;
    };
  }, [authToken, canUseAccount, data?.repoContributionsByDate, data?.username, selectedDate]);

  // --- Handlers ---

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthStep('starting');
    try {
      const auth = getFirebaseAuth();
      const result = await signInWithPopup(auth, createGithubProvider());
      const credential = GithubAuthProvider.credentialFromResult(result);
      const token = sanitizeCredential(credential?.accessToken || '');
      setAuthToken(token);
      setFirebaseUser(result.user);
      setAuthStep('signed-in');
    } catch (e) { setAuthStep('error'); setAuthMessage(e.message); }
  };

  const handleSignOut = async () => {
    try { await signOut(getFirebaseAuth()); } catch (e) {}
    setFirebaseUser(null); setAuthToken(''); setAuthStep('idle');
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    window.localStorage.removeItem(ACCOUNT_AVATAR_STORAGE_KEY);
  };

  const handleEnableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    if (notificationState === 'granted' && alertsEnabled) {
      setAlertsEnabled(false);
      return;
    }

    if (notificationState === 'granted' && !alertsEnabled) {
      setAlertsEnabled(true);
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationState(permission);

    if (permission === 'granted') {
      setAlertsEnabled(true);
      new Notification('GitPulse Enabled', { body: 'Notifications active.' });
      return;
    }

    if (permission === 'denied') {
      setAuthMessage('Browser notifications are blocked. Open your site settings to allow them.');
    }
  };

  // --- Render (Modernized UI) ---

  if (!canUseAccount) {
    return (
      <main className="min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <section className="relative bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl text-center">
              <div className="mb-6">
                <SiteBrand sizeClassName="h-20 w-20" textClassName="text-3xl" stacked />
              </div>
              <p className="text-slate-400 text-sm mb-8">Sign in with GitHub to track your contribution streak.</p>
              <button
                onClick={handleAuthSubmit}
                disabled={authStep === 'starting'}
                className="w-full py-4 rounded-2xl bg-white text-slate-950 font-bold flex items-center justify-center gap-3 hover:bg-emerald-50 transition-all active:scale-[0.98]"
              >
                <ShieldCheck className="h-5 w-5" />
                {authStep === 'starting' ? 'Connecting...' : 'Connect GitHub'}
              </button>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-slate-200">
      <nav className="border-b border-white/5 bg-[#020617]/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <SiteBrand sizeClassName="h-8 w-8" textClassName="text-base" />
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
              <img src={profileAvatar} className="h-5 w-5 rounded-full" alt="" />
              <span className="text-xs font-medium text-slate-300">{profileName}</span>
            </div>
            <button onClick={handleSignOut} className="p-2 hover:bg-white/5 rounded-full text-slate-400"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-extrabold text-white tracking-tight">Dashboard</h1>
            <p className="text-slate-400 mt-1">Real-time stats for <span className="text-emerald-400">@{viewerName}</span></p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => refresh()} disabled={loading} className="px-4 py-2 rounded-xl text-xs font-bold border border-white/10 bg-white/5 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed">
                <RefreshCw className={`h-3.5 w-3.5 inline mr-2 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button onClick={handleEnableNotifications} className="px-4 py-2 rounded-xl text-xs font-bold border border-white/10 bg-white/5 text-slate-300">
                <BellRing className="h-3.5 w-3.5 inline mr-2" /> {notificationState === 'granted' ? (alertsEnabled ? 'Alerts On' : 'Alerts Off') : getNotificationButtonLabel(notificationState)}
              </button>
            </div>
            <div className="px-4 py-2 rounded-xl bg-slate-900 border border-white/5 text-xs text-slate-400 flex items-center gap-2 self-start sm:self-auto">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> {formatTime(nowTime)}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-8 transition-all">
            <p className="text-sm font-medium text-slate-400 flex items-center gap-2 mb-4"><Flame className="text-orange-400" /> Current Streak</p>
            <div className="flex items-baseline gap-2">
              <span className="text-7xl font-black text-white leading-none">{data?.currentStreak ?? 0}</span>
              <span className="text-xl text-slate-500 font-bold">DAYS</span>
            </div>
            <div className="mt-6">
              {data?.hasContributedToday ? (
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">SAFE TODAY</span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-white/5 text-slate-400 text-[10px] font-bold border border-white/10">DAY OPEN</span>
              )}
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-slate-500">Source: GitHub contribution calendar</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8">
            <p className="text-sm font-medium text-slate-400 mb-6 flex items-center gap-2"><TrendingUp className="text-emerald-400" /> Progress this month in {currentMonthLabel}</p>
            <div className="flex justify-between items-end mb-2">
              <span className="text-4xl font-bold text-white">{Math.min(100, Math.round((monthlySnapshot.activeDays / 30) * 100))}%</span>
              <span className="text-xs text-slate-500 font-medium">{monthlySnapshot.activeDays}/30 active days</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-1000" style={{ width: `${Math.min(100, Math.round((monthlySnapshot.activeDays / 30) * 100))}%` }} />
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-slate-500">Source: Derived from {currentMonthLabel} contribution activity</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8">
            <p className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2"><Activity className="text-yellow-400" /> Consistency</p>
            <div className="text-5xl font-bold text-white mb-4">{monthlySnapshot.consistency}%</div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                <div><p className="text-[10px] uppercase text-slate-500 font-bold">Commits</p><p className="text-lg font-semibold">{monthlySnapshot.commits}</p></div>
                <div><p className="text-[10px] uppercase text-slate-500 font-bold">Best Streak</p><p className="text-lg font-semibold">{data?.longestStreak ?? 0}</p></div>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-slate-500">Source: Monthly snapshot + derived stats</p>
          </div>
        </div>

        <section className="bg-white/[0.01] border border-white/10 rounded-[2rem] p-8">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg"><GitBranch className="h-5 w-5 text-emerald-400" /></div>
              <h2 className="text-xl font-bold text-white">Heatmap {heatmapYear}</h2>
            </div>
            <p className="text-sm text-slate-400">
              <span className="font-semibold text-white">{yearContributionTotal}</span> contributions in {heatmapYear}
            </p>
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500 text-right">Source: GitHub yearly contribution calendar</p>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-6 bg-white/[0.03] p-4 rounded-2xl border border-white/5">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-red-500/20 border border-red-500/40" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Missed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-yellow-500/10 border border-yellow-500/20" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Planned</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] text-slate-500 font-bold uppercase mr-2">Intensity:</span>
              <div className="h-3 w-3 rounded-sm bg-emerald-950" />
              <div className="h-3 w-3 rounded-sm bg-emerald-800" />
              <div className="h-3 w-3 rounded-sm bg-emerald-600" />
              <div className="h-3 w-3 rounded-sm bg-emerald-400" />
              <div className="h-3 w-3 rounded-sm bg-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>
          </div>

          <div className="overflow-x-auto pb-4 custom-scrollbar">
            <div className="grid grid-flow-col grid-rows-7 gap-1.5 min-w-max">
              {heatmapCells.map((cell) => {
                if (cell.isPadding) return <div key={cell.key} className="h-3.5 w-3.5 opacity-0" />;
                const todayKey = toDateKey(nowTime);
                const isFuture = cell.date > todayKey;
                const isToday = cell.date === todayKey;
                const isPast = cell.date < todayKey;
                const count = cell.contributionCount;
                let colorClass = '';

                if (isFuture || (isToday && count === 0)) {
                  colorClass = 'bg-yellow-500/10 border-yellow-500/20';
                } else if (isPast && count === 0) {
                  colorClass = 'bg-red-500/20 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.15)]';
                } else if (count === 1) {
                  colorClass = 'bg-emerald-950 border-emerald-900';
                } else if (count <= 3) {
                  colorClass = 'bg-emerald-800 border-emerald-700';
                } else if (count <= 6) {
                  colorClass = 'bg-emerald-600 border-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.2)]';
                } else if (count <= 10) {
                  colorClass = 'bg-emerald-400 border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.4)] text-slate-900';
                } else {
                  colorClass = 'bg-emerald-200 border-white shadow-[0_0_20px_rgba(16,185,129,0.6)]';
                }

                return (
                  <div
                    key={cell.key}
                    onMouseEnter={() => setHoveredCell(cell)}
                    onClick={() => setSelectedDate(cell.date)}
                    className={`h-3.5 w-3.5 rounded-[3px] border cursor-pointer transition-all duration-300 hover:scale-150 hover:z-10 ${colorClass} ${selectedDate === cell.date ? 'ring-2 ring-white ring-offset-2 ring-offset-[#020617]' : ''}`}
                    title={`${cell.date}: ${count} commits`}
                  />
                );
              })}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-black/20 rounded-2xl border border-white/5">
                <p className="text-xs font-bold text-slate-500 uppercase mb-4">Daily Insights</p>
                {hoveredCell ? (
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold text-white">{hoveredCell.contributionCount}</div>
                    <div><p className="text-sm text-slate-200">Commits</p><p className="text-xs text-slate-400">{formatDateLabel(hoveredCell.date)}</p></div>
                  </div>
                ) : <p className="text-sm text-slate-500 italic">Hover a day to see details...</p>}
            </div>
            <div className="p-6 bg-black/20 rounded-2xl border border-white/5 flex items-center gap-4">
              <div className="text-emerald-400 bg-emerald-400/10 p-3 rounded-xl"><CalendarRange /></div>
              <div>
                <p className="text-sm text-slate-300">Peak day in {heatmapYear}</p>
                <p className="text-white font-bold">{peakDayStats.date ? `${formatDateLabel(peakDayStats.date)} · ${peakDayStats.commits} commits` : 'No yearly data yet'}</p>
              </div>
            </div>
          </div>
        </section>

        {selectedDate && (
          <section className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-white text-lg flex items-center gap-2"><ChevronRight className="text-emerald-500" /> {formatDateLabel(selectedDate)}</h3>
                <button onClick={() => setSelectedDate(null)} className="text-xs text-slate-500 hover:text-white">Close</button>
              </div>
              <div className="mb-5 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-300/80">Total commits on this day</p>
                <p className="mt-1 text-2xl font-black text-white">{selectedDayTotal} commits</p>
              </div>
              {selectedReposLoading && (
                <p className="mb-4 text-xs text-slate-500">Loading repository breakdown...</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {selectedRepos.map((repo) => (
                  <a key={repo.nameWithOwner} href={repo.url} target="_blank" rel="noreferrer" className="p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-emerald-500/30 transition-all group">
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Repo</p>
                    <p className="text-sm font-bold text-white group-hover:text-emerald-400 truncate">{repo.nameWithOwner}</p>
                    <p className="mt-4 text-xs bg-emerald-500/10 text-emerald-400 w-fit px-2 py-0.5 rounded border border-emerald-500/10">{repo.count} commits</p>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}