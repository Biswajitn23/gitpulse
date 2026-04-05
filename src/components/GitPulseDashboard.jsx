import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Flame,
  Github,
  GitBranch,
  Activity,
  RefreshCw,
  CalendarRange,
  LogIn,
  LogOut,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { GithubAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { useGithubStreak } from '../hooks/useGithubStreak';
import { createGithubProvider, getFirebaseAuth } from '../lib/firebase';
import ProfilePage from './ProfilePage';

const AUTH_STORAGE_KEY = 'gitpulse-github-token';
const ACCOUNT_STORAGE_KEY = 'gitpulse-account-username';
const ACCOUNT_AVATAR_STORAGE_KEY = 'gitpulse-account-avatar';
const LAST_SIGNED_OUT_ACCOUNT_KEY = 'gitpulse-last-signed-out-account';
const ALERTS_ENABLED_STORAGE_KEY = 'gitpulse-alerts-enabled';
const EXPLICIT_LOGOUT_KEY = 'gitpulse-explicit-logout';
const NOTIFICATION_CACHE_KEY = 'gitpulse-notification-cache';
const DAILY_GOAL = 30;
const ROLE_GUIDE = [
  {
    name: 'Builder',
    condition: 'Most activity is commits with more than 100 commits.',
    action: 'Ship code consistently. Focus on frequent commits and keep a steady coding cadence.',
    challenge: 'Complete a 14-day coding streak with at least 8 high-focus days.',
  },
  {
    name: 'Coder',
    condition: 'Most activity is commits but commit count is 100 or less.',
    action: 'Keep coding regularly and increase commit volume to reach Builder.',
    challenge: 'Push code 5 days this week with clear, atomic commits.',
  },
  {
    name: 'Architect',
    condition: 'Pull requests are higher than commits and at least as high as issues.',
    action: 'Open more pull requests, split work into reviewable PRs, and collaborate via code reviews.',
    challenge: 'Open at least 4 PRs this week and request reviews for each.',
  },
  {
    name: 'Maintainer',
    condition: 'Issue contributions are higher than commits and at least as high as pull requests.',
    action: 'Triaging, issue fixing, and project maintenance activities should be your main contribution type.',
    challenge: 'Close 6 issues this week with labels, notes, and follow-up tasks.',
  },
  {
    name: 'Collaborator',
    condition: 'Repository contributions are higher than commits.',
    action: 'Contribute across repositories, help in multiple projects, and expand cross-repo collaboration.',
    challenge: 'Contribute to 3 different repositories in the next 7 days.',
  },
  {
    name: 'Contributor',
    condition: 'Fallback role when no category dominates.',
    action: 'Choose a focus area (commits, PRs, issues, or repo contributions) and grow it consistently.',
    challenge: 'Pick one lane this week and make at least 5 targeted contributions.',
  },
];

const ROLE_NEXT_TARGET = {
  Contributor: 'Coder',
  Coder: 'Builder',
  Builder: 'Architect',
  Architect: 'Maintainer',
  Maintainer: 'Collaborator',
  Collaborator: 'Architect',
};

const ROLE_THEME = {
  Builder: {
    icon: '🛠',
    badge: 'border-amber-300/35 bg-amber-500/15 text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.25)]',
    badgeAnimation: 'animate-pulse',
    card: 'border-amber-300/35 bg-amber-500/12',
    accent: 'text-amber-100',
  },
  Coder: {
    icon: '</>',
    badge: 'border-cyan-300/35 bg-cyan-500/12 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.2)]',
    badgeAnimation: 'animate-bounce',
    card: 'border-cyan-300/35 bg-cyan-500/10',
    accent: 'text-cyan-100',
  },
  Architect: {
    icon: '🏗',
    badge: 'border-violet-300/35 bg-violet-500/15 text-violet-100 shadow-[0_0_20px_rgba(167,139,250,0.25)]',
    badgeAnimation: 'animate-pulse',
    card: 'border-violet-300/35 bg-violet-500/12',
    accent: 'text-violet-100',
  },
  Maintainer: {
    icon: '🧭',
    badge: 'border-emerald-300/35 bg-emerald-500/15 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.25)]',
    badgeAnimation: 'animate-pulse',
    card: 'border-emerald-300/35 bg-emerald-500/12',
    accent: 'text-emerald-100',
  },
  Collaborator: {
    icon: '🤝',
    badge: 'border-pink-300/35 bg-pink-500/15 text-pink-100 shadow-[0_0_20px_rgba(244,114,182,0.25)]',
    badgeAnimation: 'animate-bounce',
    card: 'border-pink-300/35 bg-pink-500/12',
    accent: 'text-pink-100',
  },
  Contributor: {
    icon: '🚀',
    badge: 'border-slate-300/35 bg-slate-500/15 text-slate-100 shadow-[0_0_20px_rgba(148,163,184,0.2)]',
    badgeAnimation: 'animate-pulse',
    card: 'border-slate-300/35 bg-slate-500/10',
    accent: 'text-slate-100',
  },
};

function getRoleTheme(roleName) {
  return ROLE_THEME[roleName] || ROLE_THEME.Contributor;
}

function getNextRole(roleName) {
  return ROLE_NEXT_TARGET[roleName] || 'Coder';
}

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

function getGithubFollowersUrl(username) {
  return `https://github.com/${username}?tab=followers`;
}

function getGithubFollowingUrl(username) {
  return `https://github.com/${username}?tab=following`;
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

function getNotificationButtonClasses(notificationState, alertsEnabled) {
  if (notificationState === 'granted' && alertsEnabled) {
    return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.25)]';
  }

  if (notificationState === 'granted' && !alertsEnabled) {
    return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
  }

  if (notificationState === 'denied') {
    return 'border-red-500/30 bg-red-500/15 text-red-200 shadow-[0_0_18px_rgba(239,68,68,0.2)]';
  }

  return 'border-white/10 bg-white/5 text-slate-300';
}

function readNotificationCache() {
  if (typeof window === 'undefined') return { sent: {}, forkCounts: {}, totalForks: null };

  try {
    const raw = window.localStorage.getItem(NOTIFICATION_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      sent: parsed?.sent || {},
      forkCounts: parsed?.forkCounts || {},
      totalForks: typeof parsed?.totalForks === 'number' ? parsed.totalForks : null,
    };
  } catch {
    return { sent: {}, forkCounts: {}, totalForks: null };
  }
}

function writeNotificationCache(cache) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NOTIFICATION_CACHE_KEY, JSON.stringify(cache));
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

function canUseRedirectAuth() {
  if (typeof window === 'undefined') return false;

  try {
    const probeKey = '__gitpulse_redirect_probe__';
    window.sessionStorage.setItem(probeKey, '1');
    window.sessionStorage.removeItem(probeKey);
  } catch {
    return false;
  }

  return true;
}

function shouldFallbackToRedirect(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return /popup-blocked|popup closed|operation-not-supported|unauthorized-domain|web-storage-unsupported/i.test(message)
    || /popup-blocked|popup-closed-by-user|operation-not-supported-in-this-environment|unauthorized-domain|web-storage-unsupported/i.test(code);
}

function isMissingRedirectStateError(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  return /missing initial state|no auth event|unable to process request due to missing initial state/i.test(message)
    || /missing-initial-state|no-auth-event/i.test(code);
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
  const [activeView, setActiveView] = useState(() => (typeof window !== 'undefined' && window.location.hash === '#profile' ? 'profile' : 'dashboard'));
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedReposDetailed, setSelectedReposDetailed] = useState([]);
  const [selectedReposLoading, setSelectedReposLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [languageRepos, setLanguageRepos] = useState([]);
  const [showAllRepos, setShowAllRepos] = useState(false);
  const [repoSearchInput, setRepoSearchInput] = useState('');
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [tappedDate, setTappedDate] = useState(null);
  const hasRecoveredUnauthorizedTokenRef = useRef(false);
  const languageSectionRef = useRef(null);
  const allReposSectionRef = useRef(null);
  const selectedDateSectionRef = useRef(null);
  const tapHighlightTimeoutRef = useRef(null);

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

  const activeInsightCell = useMemo(() => {
    if (hoveredCell) return hoveredCell;
    if (!selectedDate) return null;
    return heatmapCells.find((cell) => !cell.isPadding && cell.date === selectedDate) || null;
  }, [hoveredCell, selectedDate, heatmapCells]);

  const allRepos = useMemo(() => {
    if (Array.isArray(data?.allRepositories) && data.allRepositories.length > 0) {
      return [...data.allRepositories].sort((a, b) => {
        if ((b.isFork ? 1 : 0) !== (a.isFork ? 1 : 0)) {
          return (a.isFork ? 1 : 0) - (b.isFork ? 1 : 0);
        }
        return a.nameWithOwner.localeCompare(b.nameWithOwner);
      });
    }

    if (!data?.commitContributionsByRepository) return [];
    const repos = data.commitContributionsByRepository.map((repoContrib) => ({
      nameWithOwner: repoContrib.repository?.nameWithOwner || 'unknown',
      url: repoContrib.repository?.url || '',
      stargazerCount: repoContrib.repository?.stargazerCount || 0,
      forkCount: repoContrib.repository?.forkCount || 0,
      commits: repoContrib.contributions?.nodes?.length || 0,
      isFork: false,
      isPrivate: false,
    }));
    return repos.sort((a, b) => b.commits - a.commits);
  }, [data?.allRepositories, data?.commitContributionsByRepository]);

  const filteredAllRepos = useMemo(() => {
    const normalizedQuery = repoSearchInput.trim().toLowerCase();
    if (!normalizedQuery) return allRepos;
    return allRepos.filter((repo) => {
      const fullName = repo.nameWithOwner.toLowerCase();
      const shortName = repo.nameWithOwner.split('/').pop()?.toLowerCase() || '';
      return shortName.includes(normalizedQuery) || fullName.includes(normalizedQuery);
    });
  }, [allRepos, repoSearchInput]);

  const allReposCount = data?.allRepositoriesCount ?? allRepos.length;
  const currentRoleTheme = getRoleTheme(data?.activityRole || 'Contributor');
  const currentRoleName = data?.activityRole || 'Contributor';
  const nextRoleName = getNextRole(currentRoleName);
  const nextRole = ROLE_GUIDE.find((role) => role.name === nextRoleName);
  const nextRoleTheme = getRoleTheme(nextRoleName);

  const viewerName = data?.username || firebaseUser?.displayName || 'github-user';
  const profileName = data?.displayName || data?.username || firebaseUser?.displayName || restoredAccount || 'GitHub User';
  const profileAvatar = data?.avatarUrl || firebaseUser?.photoURL || restoredAvatar;
  const isGitHubPro = Boolean(data?.isGitHubPro);
  const isEvening = nowTime.getHours() >= 20;
  const canUseAccount = Boolean(authToken);
  const isInitialDataLoading = canUseAccount && loading && !data;

  useEffect(() => {
    const syncViewFromHash = () => {
      setActiveView(window.location.hash === '#profile' ? 'profile' : 'dashboard');
    };

    syncViewFromHash();
    window.addEventListener('hashchange', syncViewFromHash);

    return () => window.removeEventListener('hashchange', syncViewFromHash);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pointerQuery = window.matchMedia('(hover: none), (pointer: coarse)');
    const updateTouchPreference = () => setIsTouchDevice(pointerQuery.matches);

    updateTouchPreference();
    pointerQuery.addEventListener('change', updateTouchPreference);

    return () => {
      pointerQuery.removeEventListener('change', updateTouchPreference);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (tapHighlightTimeoutRef.current) {
        clearTimeout(tapHighlightTimeoutRef.current);
      }
    };
  }, []);

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
      const isExplicitLogout = window.localStorage.getItem(EXPLICIT_LOGOUT_KEY) === 'true';
      if (isExplicitLogout) { setAuthToken(''); setAuthStep('idle'); return; }
      const storedToken = sanitizeCredential(window.localStorage.getItem(AUTH_STORAGE_KEY) || '');
      if (!user) {
        if (storedToken) {
          setAuthToken(storedToken);
          setAuthStep('signed-in');
          return;
        }
        setAuthToken('');
        setAuthStep('idle');
        return;
      }
      if (storedToken) {
        setAuthToken(storedToken);
        setAuthStep('signed-in');
      }
    });
  }, []);

  useEffect(() => {
    if (authToken) window.localStorage.setItem(AUTH_STORAGE_KEY, authToken);
    else window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [authToken]);

  useEffect(() => {
    if (!authToken) {
      hasRecoveredUnauthorizedTokenRef.current = false;
      return;
    }

    if (!error || hasRecoveredUnauthorizedTokenRef.current) {
      return;
    }

    if (/token is invalid or expired|bad credentials|unauthorized|401/i.test(error)) {
      hasRecoveredUnauthorizedTokenRef.current = true;
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      window.localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      setAuthToken('');
      setAuthStep('idle');
      setAuthMessage('Your GitHub session expired. Please reconnect your GitHub account.');
    }
  }, [authToken, error]);

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
    if (selectedLanguage && languageSectionRef.current) {
      languageSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedLanguage]);

  useEffect(() => {
    if (showAllRepos && allReposSectionRef.current) {
      allReposSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showAllRepos]);

  useEffect(() => {
    if (!showAllRepos) {
      setRepoSearchInput('');
    }
  }, [showAllRepos]);

  useEffect(() => {
    if (selectedDate && selectedDateSectionRef.current) {
      selectedDateSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!showRoleGuide) return;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowRoleGuide(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showRoleGuide]);

  useEffect(() => {
    if (!canUseAccount || !data || !alertsEnabled || notificationState !== 'granted' || typeof Notification === 'undefined') {
      return;
    }

    const now = new Date();
    const todayKey = toDateKey(now);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = toDateKey(yesterdayDate);
    const username = data?.username || viewerName;
    const yesterdayCommits = data?.contributionDays?.find((day) => day.date === yesterdayKey)?.contributionCount || 0;
    const currentStreak = data?.currentStreak || 0;

    const cache = readNotificationCache();
    let hasCacheUpdates = false;

    const notifyOnce = (eventKey, title, body) => {
      if (cache.sent[eventKey]) return;
      new Notification(title, { body });
      cache.sent[eventKey] = now.toISOString();
      hasCacheUpdates = true;
    };

    // 1) Streak at Risk (Evening)
    if (now.getHours() >= 20 && !data?.hasContributedToday) {
      notifyOnce(
        `streak-risk-${todayKey}`,
        '⚠️ Streak at Risk!',
        `You haven't committed today, @${username}. Push a change now to protect your ${currentStreak} day streak!`,
      );
    }

    // 2) Streak Failed (Morning-After)
    if (now.getHours() >= 0 && now.getHours() < 12 && currentStreak === 0 && yesterdayCommits === 0) {
      notifyOnce(
        `streak-failed-${todayKey}`,
        '❌ Streak Lost',
        'Yesterday ended without activity. Your streak has been reset to 0. Time to start a new one!',
      );
    }

    // 3) Repository Forked (Social Impact)
    const currentForkCounts = Object.fromEntries(
      (data?.allRepositories || []).map((repo) => [repo.nameWithOwner, repo.forkCount || 0]),
    );
    const currentTotalForks = Object.values(currentForkCounts).reduce((total, count) => total + count, 0);
    const previousTotalForks = cache.totalForks;

    if (previousTotalForks !== null && currentTotalForks > previousTotalForks) {
      const increasedRepo = (data?.allRepositories || []).find(
        (repo) => (repo.forkCount || 0) > (cache.forkCounts?.[repo.nameWithOwner] || 0),
      );

      if (increasedRepo) {
        notifyOnce(
          `fork-increase-${increasedRepo.nameWithOwner}-${increasedRepo.forkCount}`,
          '🍴 New Fork Detected',
          `Your repository ${increasedRepo.nameWithOwner} was just forked. Your project's reach is growing!`,
        );
      }
    }

    // 4) New Milestone
    if (currentStreak > 0 && currentStreak % 10 === 0) {
      notifyOnce(
        `milestone-${currentStreak}`,
        '🏆 New Milestone Achieved!',
        `Incredible momentum! You've officially reached a ${currentStreak} day contribution streak.`,
      );
    }

    // 5) Goal Completion (30-day target)
    if (currentStreak === 30) {
      notifyOnce(
        'goal-30',
        '⭐ 30-Day Goal Met!',
        "Congratulations! You've completed your 30-day consistency challenge. Badge unlocked.",
      );
    }

    cache.forkCounts = currentForkCounts;
    cache.totalForks = currentTotalForks;
    hasCacheUpdates = true;

    if (hasCacheUpdates) {
      writeNotificationCache(cache);
    }
  }, [alertsEnabled, canUseAccount, data, notificationState, viewerName]);

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

  const handleLanguageSelect = (languageName) => {
    setSelectedLanguage(languageName);
    
    // Filter repos that use this language
    const reposWithLanguage = new Map();
    const commitContributions = data?.commitContributionsByRepository || [];
    
    for (const repoContribution of commitContributions) {
      const repository = repoContribution?.repository;
      const repoLanguageEdges = repository?.languages?.edges || [];
      
      const hasLanguage = repoLanguageEdges.some(
        (lang) => lang?.node?.name === languageName && (lang?.size || 0) > 0
      );
      
      if (hasLanguage) {
        reposWithLanguage.set(repository.nameWithOwner, {
          nameWithOwner: repository.nameWithOwner,
          url: repository.url,
          stargazerCount: repository.stargazerCount || 0,
          forkCount: repository.forkCount || 0,
        });
      }
    }
    
    setLanguageRepos(Array.from(reposWithLanguage.values()));
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthMessage('');

    const existingToken = sanitizeCredential(window.localStorage.getItem(AUTH_STORAGE_KEY) || '');
    const isExplicitLogout = window.localStorage.getItem(EXPLICIT_LOGOUT_KEY) === 'true';
    if (existingToken && !isExplicitLogout) {
      setAuthToken(existingToken);
      setAuthStep('signed-in');
      return;
    }

    setAuthStep('starting');
    try {
      const auth = getFirebaseAuth();
      const provider = createGithubProvider();
      let result;

      try {
        result = await signInWithPopup(auth, provider);
      } catch (popupError) {
        if (shouldFallbackToRedirect(popupError) && canUseRedirectAuth()) {
          await signInWithRedirect(auth, provider);
          return;
        }

        throw popupError;
      }

      const credential = GithubAuthProvider.credentialFromResult(result);
      const token = sanitizeCredential(credential?.accessToken || '');
      const signedInLogin = sanitizeCredential(result?.additionalUserInfo?.profile?.login || '');

      window.localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      if (signedInLogin) {
        window.localStorage.removeItem(LAST_SIGNED_OUT_ACCOUNT_KEY);
      }
      window.localStorage.setItem(AUTH_STORAGE_KEY, token);
      setAuthToken(token);
      setFirebaseUser(result.user);
      setAuthStep('signed-in');
    } catch (e) {
      setAuthStep('error');
      setAuthMessage(e.message || 'Unable to sign in with GitHub.');
    }
  };

  const handleSignOut = async () => {
    const lastAccount = sanitizeCredential(data?.username || restoredAccount || firebaseUser?.displayName || '');
    window.localStorage.setItem(EXPLICIT_LOGOUT_KEY, 'true');
    if (lastAccount) {
      window.localStorage.setItem(LAST_SIGNED_OUT_ACCOUNT_KEY, lastAccount);
    }
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    window.localStorage.removeItem(ACCOUNT_AVATAR_STORAGE_KEY);
    setFirebaseUser(null); setAuthToken(''); setAuthStep('idle');
    try { await signOut(getFirebaseAuth()); } catch (e) {}
  };

  const handleOpenProfilePage = () => {
    window.location.hash = '#profile';
  };

  const handleHeatmapCellClick = (cell) => {
    setHoveredCell(cell);
    setSelectedDate(cell.date);

    if (!isTouchDevice) return;

    if (tapHighlightTimeoutRef.current) {
      clearTimeout(tapHighlightTimeoutRef.current);
    }

    setTappedDate(cell.date);
    tapHighlightTimeoutRef.current = setTimeout(() => {
      setTappedDate(null);
      tapHighlightTimeoutRef.current = null;
    }, 260);
  };

  const handleBackFromProfilePage = () => {
    if (window.location.hash === '#profile') {
      window.location.hash = '';
    }
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

  useEffect(() => {
    let isMounted = true;

    const handleRedirectSignIn = async () => {
      let auth;
      try {
        auth = getFirebaseAuth();
      } catch {
        return;
      }

      try {
        const result = await getRedirectResult(auth);
        if (!isMounted || !result) return;

        const credential = GithubAuthProvider.credentialFromResult(result);
        const token = sanitizeCredential(credential?.accessToken || '');
        const signedInLogin = sanitizeCredential(result?.additionalUserInfo?.profile?.login || '');

        if (!token) {
          setAuthStep('error');
          setAuthMessage('GitHub did not return an access token. Please try again.');
          return;
        }

        window.localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
        if (signedInLogin) {
          window.localStorage.removeItem(LAST_SIGNED_OUT_ACCOUNT_KEY);
        }

        window.localStorage.setItem(AUTH_STORAGE_KEY, token);
        setAuthToken(token);
        setFirebaseUser(result.user);
        setAuthStep('signed-in');
      } catch (error) {
        if (!isMounted) return;

        if (isMissingRedirectStateError(error)) {
          setAuthStep('idle');
          setAuthMessage('Sign-in could not be restored in this PWA session. Tap Connect GitHub again.');
          return;
        }

        setAuthStep('error');
        setAuthMessage(error?.message || 'Unable to complete mobile sign in.');
      }
    };

    handleRedirectSignIn();

    return () => {
      isMounted = false;
    };
  }, []);

  // --- Render (Modernized UI) ---

  if (!canUseAccount) {
    return (
      <main className="min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center px-3 py-4 sm:p-4">
        <div className="w-full max-w-sm sm:max-w-md">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <section className="relative bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-8 shadow-2xl text-center">
              <div className="mb-5 sm:mb-6">
                <SiteBrand sizeClassName="h-16 w-16 sm:h-20 sm:w-20" textClassName="text-2xl sm:text-3xl" stacked />
              </div>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-slate-400 sm:mb-8">Sign in with GitHub to track your contribution streak.</p>
              <button
                onClick={handleAuthSubmit}
                disabled={authStep === 'starting'}
                className="mt-6 w-full rounded-2xl bg-white px-4 py-4 font-bold text-slate-950 transition-all active:scale-[0.98] flex items-center justify-center gap-3 hover:bg-emerald-50"
              >
                <Github className="h-5 w-5" />
                {authStep === 'starting' ? 'Connecting...' : 'Connect GitHub'}
              </button>
              {authMessage ? <p className="mt-3 text-xs text-rose-300">{authMessage}</p> : null}
            </section>
          </div>
        </div>
      </main>
    );
  }

  if (isInitialDataLoading) {
    return (
      <main className="min-h-screen bg-[#020617] text-slate-200 animate-pulse">
        <nav className="border-b border-white/5 bg-[#020617]/50 backdrop-blur-md sticky top-0 z-50">
          <div className="mx-auto flex h-auto max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:h-16">
            <SiteBrand sizeClassName="h-8 w-8" textClassName="text-sm sm:text-base" />
            <div className="h-9 w-28 rounded-full border border-white/10 bg-white/5" />
          </div>
        </nav>

        <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
          <header className="mb-6 flex flex-col gap-4 md:mb-10">
            <div className="h-10 w-52 rounded-xl bg-white/10" />
            <div className="h-5 w-72 max-w-full rounded-lg bg-white/5" />
          </header>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 sm:gap-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`stat-skeleton-${index}`} className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-8">
                <div className="h-4 w-24 rounded bg-white/10" />
                <div className="mt-5 h-12 w-28 rounded-xl bg-white/10" />
                <div className="mt-5 h-3 w-20 rounded bg-white/5" />
              </div>
            ))}
          </div>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.01] p-4 sm:p-8">
            <div className="mb-6 h-6 w-44 rounded-lg bg-white/10" />
            <div className="mb-6 grid grid-flow-col grid-rows-7 gap-1.5 min-w-max overflow-x-auto pb-2">
              {Array.from({ length: 84 }).map((_, index) => (
                <div key={`heat-skeleton-${index}`} className="h-3.5 w-3.5 rounded-[3px] bg-emerald-900/40" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 sm:gap-6">
              <div className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-6">
                <div className="h-4 w-28 rounded bg-white/10" />
                <div className="mt-4 h-10 w-24 rounded-lg bg-white/10" />
              </div>
              <div className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-6">
                <div className="h-4 w-36 rounded bg-white/10" />
                <div className="mt-4 h-5 w-56 max-w-full rounded bg-white/10" />
              </div>
            </div>
          </section>

          {error && <p className="mt-4 text-xs text-rose-300">{error}</p>}
        </div>
      </main>
    );
  }

  if (activeView === 'profile') {
    return (
      <ProfilePage
        data={data}
        profileAvatar={profileAvatar}
        profileName={profileName}
        isGitHubPro={isGitHubPro}
        viewerName={viewerName}
        onBack={handleBackFromProfilePage}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-slate-200">
      <nav className="border-b border-white/5 bg-[#020617]/50 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex h-auto max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:h-16">
          <SiteBrand sizeClassName="h-8 w-8" textClassName="text-sm sm:text-base" />
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={handleOpenProfilePage}
              className={`md:hidden h-10 w-10 rounded-full overflow-hidden transition-all ${isGitHubPro ? 'bg-[conic-gradient(from_180deg_at_50%_50%,#f5d0fe_0deg,#c084fc_120deg,#fbbf24_240deg,#f5d0fe_360deg)] p-[2px] shadow-[0_0_20px_rgba(168,85,247,0.35)]' : 'ring-2 bg-white/5 ring-emerald-500/30'}`}
            >
              <span className={`block h-full w-full rounded-full overflow-hidden ${isGitHubPro ? 'bg-[#020617]' : ''}`}>
                <img src={profileAvatar} className={`h-full w-full object-cover ${isGitHubPro ? 'rounded-full ring-1 ring-white/15' : ''}`} alt="" />
              </span>
            </button>
            <button onClick={handleOpenProfilePage} className={`hidden md:flex items-center gap-3 px-4 py-2 rounded-full border transition-colors text-left ${isGitHubPro ? 'bg-gradient-to-r from-violet-500/15 via-fuchsia-500/10 to-amber-500/10 border-violet-400/30 shadow-[0_0_22px_rgba(168,85,247,0.18)]' : 'bg-white/5 border-white/10 shadow-[0_0_18px_rgba(16,185,129,0.08)] hover:bg-white/10'}`}>
              <img src={profileAvatar} className={`h-8 w-8 rounded-full ring-2 ${isGitHubPro ? 'ring-violet-400/40' : 'ring-emerald-500/30'}`} alt="" />
              <span className={`text-sm font-semibold ${isGitHubPro ? 'text-violet-100' : 'text-slate-200'}`}>{profileName}</span>
              {isGitHubPro && <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.25em] text-violet-200">Pro</span>}
            </button>
            <button onClick={handleSignOut} className="p-2 hover:bg-white/5 rounded-full text-slate-400"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
        <header className="mb-6 flex flex-col gap-5 md:mb-10 md:flex-row md:items-end md:justify-between md:gap-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Dashboard</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-400 sm:text-base">
              <span>
                Real-time stats for <span className="text-emerald-400">@{viewerName}</span>
              </span>
              {data?.activityRole && (
                <button
                  onClick={() => setShowRoleGuide(true)}
                  className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:scale-105 ${currentRoleTheme.badge} ${currentRoleTheme.badgeAnimation}`}
                >
                  {currentRoleTheme.icon} Role: {data.activityRole}
                </button>
              )}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <button onClick={() => refresh()} disabled={loading} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 inline mr-2 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={handleEnableNotifications}
                className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 text-xs font-bold transition-all duration-200 ${getNotificationButtonClasses(notificationState, alertsEnabled)}`}
              >
                <BellRing className={`h-3.5 w-3.5 inline mr-2 ${notificationState === 'granted' && alertsEnabled ? 'text-emerald-200' : notificationState === 'denied' ? 'text-red-200' : 'text-current'}`} />
                {notificationState === 'granted' ? (alertsEnabled ? 'Alerts On' : 'Alerts Off') : getNotificationButtonLabel(notificationState)}
              </button>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/5 bg-slate-900 px-4 py-2 text-xs text-slate-400 self-start sm:self-auto">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> {formatTime(nowTime)}
            </div>
          </div>
        </header>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 sm:gap-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-5 transition-all sm:p-8">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-400"><Flame className="text-orange-400" /> Current Streak</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black leading-none text-white sm:text-7xl">{data?.currentStreak ?? 0}</span>
              <span className="text-lg font-bold text-slate-500 sm:text-xl">DAYS</span>
            </div>
            <div className="mt-5 sm:mt-6">
              {data?.hasContributedToday ? (
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">SAFE TODAY</span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-white/5 text-slate-400 text-[10px] font-bold border border-white/10">DAY OPEN</span>
              )}
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-slate-500">Source: GitHub contribution calendar</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-8">
            <p className="mb-5 flex items-center gap-2 text-sm font-medium text-slate-400 sm:mb-6"><TrendingUp className="text-emerald-400" /> Progress this month in {currentMonthLabel}</p>
            <div className="flex justify-between items-end mb-2">
              <span className="text-3xl font-bold text-white sm:text-4xl">{Math.min(100, Math.round((monthlySnapshot.activeDays / 30) * 100))}%</span>
              <span className="text-xs font-medium text-slate-500 text-right">{monthlySnapshot.activeDays}/30 active days</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-1000" style={{ width: `${Math.min(100, Math.round((monthlySnapshot.activeDays / 30) * 100))}%` }} />
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-slate-500">Source: Derived from {currentMonthLabel} contribution activity</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-8">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-400"><Activity className="text-yellow-400" /> Activity Mix</p>
            <div className="mb-4 text-4xl font-bold text-white sm:text-5xl">{monthlySnapshot.consistency}%</div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                <div><p className="text-[10px] uppercase text-slate-500 font-bold">Commits</p><p className="text-lg font-semibold">{monthlySnapshot.commits}</p></div>
                <div><p className="text-[10px] uppercase text-slate-500 font-bold">Best Streak</p><p className="text-lg font-semibold">{data?.longestStreak ?? 0}</p></div>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-slate-500">Source: Monthly snapshot + derived stats</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-8">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-400"><GitBranch className="text-blue-400" /> Total Pull Requests</p>
            <div className="mb-4 text-4xl font-bold text-white sm:text-5xl">{data?.totalPullRequestContributions ?? 0}</div>
            <div className="grid grid-cols-1 gap-4 pt-4 border-t border-white/5">
                <div><p className="text-[10px] uppercase text-slate-500 font-bold">Issues</p><p className="text-lg font-semibold">{data?.totalIssueContributions ?? 0}</p></div>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-slate-500">Source: GitHub contribution stats</p>
          </div>

          <button
            onClick={() => setShowAllRepos(true)}
            className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 text-left transition-all cursor-pointer hover:bg-white/[0.04] sm:p-8"
          >
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-400"><Github className="text-purple-400" /> All Repositories</p>
            <div className="mb-4 text-4xl font-bold text-white sm:text-5xl">{allReposCount}</div>
            <p className="text-xs text-slate-400">Click to view all repositories</p>
            <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-slate-500">Source: GitHub repositories</p>
          </button>
        </div>

        <section className="bg-white/[0.01] border border-white/10 rounded-[2rem] p-4 sm:p-8">
          <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg"><GitBranch className="h-5 w-5 text-emerald-400" /></div>
              <h2 className="text-lg font-bold text-white sm:text-xl">Heatmap {heatmapYear}</h2>
            </div>
            <p className="text-sm text-slate-400 sm:text-base">
              <span className="font-semibold text-white">{yearContributionTotal}</span> contributions in {heatmapYear}
            </p>
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500 text-left sm:text-right">Source: GitHub yearly contribution calendar</p>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-3 bg-white/[0.03] p-3 sm:gap-6 sm:p-4 rounded-2xl border border-white/5">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-red-500/20 border border-red-500/40" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Missed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-yellow-500/10 border border-yellow-500/20" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Planned</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
              <span className="text-[10px] text-slate-500 font-bold uppercase mr-2">Intensity:</span>
              <div className="h-3 w-3 rounded-sm bg-emerald-950" />
              <div className="h-3 w-3 rounded-sm bg-emerald-800" />
              <div className="h-3 w-3 rounded-sm bg-emerald-600" />
              <div className="h-3 w-3 rounded-sm bg-emerald-400" />
              <div className="h-3 w-3 rounded-sm bg-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>
          </div>

          <div className="overflow-x-auto pb-4 custom-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
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
                    onClick={() => handleHeatmapCellClick(cell)}
                    className={`h-3.5 w-3.5 rounded-[3px] border cursor-pointer transition-all duration-300 hover:scale-150 hover:z-10 ${colorClass} ${isTouchDevice && tappedDate === cell.date ? 'scale-150 z-10 shadow-[0_0_16px_rgba(16,185,129,0.55)]' : ''} ${selectedDate === cell.date ? 'ring-2 ring-white ring-offset-2 ring-offset-[#020617]' : ''}`}
                    title={`${cell.date}: ${count} commits`}
                  />
                );
              })}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 sm:gap-6">
            <div className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-6">
                <p className="mb-4 text-xs font-bold uppercase text-slate-500">Daily Insights</p>
                {activeInsightCell ? (
                  <div className="flex items-start gap-4">
                    <div className="text-3xl font-bold text-white">{activeInsightCell.contributionCount}</div>
                    <div><p className="text-sm text-slate-200">Commits</p><p className="text-xs text-slate-400">{formatDateLabel(activeInsightCell.date)}</p></div>
                  </div>
                ) : <p className="text-sm text-slate-500 italic">Hover or tap a day to see details...</p>}
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-6">
              <div className="text-emerald-400 bg-emerald-400/10 p-3 rounded-xl"><CalendarRange /></div>
              <div>
                <p className="text-sm text-slate-300">Peak day in {heatmapYear}</p>
                <p className="text-white font-bold">{peakDayStats.date ? `${formatDateLabel(peakDayStats.date)} · ${peakDayStats.commits} commits` : 'No yearly data yet'}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3 sm:gap-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500 mb-4">Workday</p>
            {data?.contributionWindow ? (
              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">First Contribution</p>
                  <p className="mt-2 text-sm font-semibold text-white">Earliest: {data.contributionWindow.first}</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Last Contribution</p>
                  <p className="mt-2 text-sm font-semibold text-white">Latest: {data.contributionWindow.last}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No contribution timestamps available.</p>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500 mb-4">Tech Profile</p>
            {data?.languageBreakdown && data.languageBreakdown.length > 0 ? (
              <>
                <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
                  {data.languageBreakdown.map((language) => (
                    <div
                      key={language.name}
                      className="h-full"
                      style={{ width: `${Math.max(4, language.percentage)}%`, backgroundColor: language.color }}
                      title={`${language.name} ${language.percentage}%`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-2 text-xs sm:gap-x-3">
                  {data.languageBreakdown.map((language) => (
                    <button
                      key={language.name}
                      onClick={() => handleLanguageSelect(language.name)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                        selectedLanguage === language.name
                          ? 'bg-white/15 border border-white/20'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: language.color }} />
                      <span className="text-slate-300 cursor-pointer">
                        {language.name} ({language.percentage}%)
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">No language data available.</p>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500 mb-4">Total Impact</p>
            {data?.totalImpact ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Stars</p>
                    <p className="mt-1 text-lg font-black text-white">{data.totalImpact.totalStars ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Forks</p>
                    <p className="mt-1 text-lg font-black text-white">{data.totalImpact.totalForks ?? 0}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-400">
                  {data.totalImpact.totalStars ?? 0} stars, {data.totalImpact.totalForks ?? 0} forks
                </p>
                {data.totalImpact.topRepositories && data.totalImpact.topRepositories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {data.totalImpact.topRepositories.slice(0, 2).map((repo) => (
                      <span key={repo.nameWithOwner} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                        {repo.nameWithOwner} · {repo.stars}★
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No impact data available.</p>
            )}
          </div>
        </div>

        {selectedLanguage && (
          <section ref={languageSectionRef} className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-4 sm:p-8">
              <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white"><ChevronRight className="text-emerald-500" /> Repositories using {selectedLanguage}</h3>
                <button onClick={() => setSelectedLanguage(null)} className="text-xs text-slate-500 hover:text-white">Close</button>
              </div>
              <div className="mb-5 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-300/80">Total repositories</p>
                <p className="mt-1 text-2xl font-black text-white">{languageRepos.length}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {languageRepos.map((repo) => (
                  <a
                    key={repo.nameWithOwner}
                    href={repo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-emerald-500/30 transition-all group"
                  >
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Repo</p>
                    <p className="text-sm font-bold text-white group-hover:text-emerald-400 truncate">{repo.nameWithOwner}</p>
                    <div className="mt-3 flex gap-3 text-xs">
                      <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/10">
                        ⭐ {repo.stargazerCount}
                      </span>
                      <span className="bg-slate-500/10 text-slate-400 px-2 py-0.5 rounded border border-slate-500/10">
                        🍴 {repo.forkCount}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        {showAllRepos && (
          <section ref={allReposSectionRef} className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-4 sm:p-8">
              <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white"><ChevronRight className="text-emerald-500" /> All Repositories</h3>
                <button onClick={() => setShowAllRepos(false)} className="text-xs text-slate-500 hover:text-white">Close</button>
              </div>
              <div className="mb-5 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-300/80">Total repositories</p>
                <p className="mt-1 text-2xl font-black text-white">{allReposCount}</p>
                <p className="mt-1 text-xs text-slate-400">Showing {filteredAllRepos.length}{repoSearchInput.trim() ? ` matching "${repoSearchInput.trim()}"` : ''}</p>
              </div>
              <form className="mb-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => event.preventDefault()}>
                <input
                  type="text"
                  value={repoSearchInput}
                  onChange={(event) => setRepoSearchInput(event.target.value)}
                  placeholder="Search repository name..."
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-400/40 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRepoSearchInput('')}
                    disabled={!repoSearchInput}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-black text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200 hover:bg-emerald-500/20 sm:flex-none"
                  >
                    Search
                  </button>
                </div>
              </form>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredAllRepos.map((repo) => (
                  <a
                    key={repo.nameWithOwner}
                    href={repo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-emerald-500/30 transition-all group"
                  >
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Repo</p>
                    <p className="text-sm font-bold text-white group-hover:text-emerald-400 truncate">{repo.nameWithOwner}</p>
                    <div className="mt-3 flex gap-2 flex-wrap text-xs">
                      <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/10">
                        ⭐ {repo.stargazerCount}
                      </span>
                      <span className="bg-slate-500/10 text-slate-400 px-2 py-0.5 rounded border border-slate-500/10">
                        🍴 {repo.forkCount}
                      </span>
                      {typeof repo.commits === 'number' && (
                        <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/10">
                          💾 {repo.commits}
                        </span>
                      )}
                      {repo.isFork && (
                        <span className="bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/10">
                          Fork
                        </span>
                      )}
                      {repo.isPrivate && (
                        <span className="bg-violet-500/10 text-violet-300 px-2 py-0.5 rounded border border-violet-500/10">
                          Private
                        </span>
                      )}
                    </div>
                  </a>
                ))}
                {filteredAllRepos.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400 md:col-span-2 lg:col-span-3">
                    No repositories found for "{repoSearchInput.trim()}".
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {selectedDate && (
          <section ref={selectedDateSectionRef} className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-4 sm:p-8">
              <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-white"><ChevronRight className="text-emerald-500" /> {formatDateLabel(selectedDate)}</h3>
                <button onClick={() => setSelectedDate(null)} className="text-xs text-slate-500 hover:text-white">Close</button>
              </div>
              <div className="mb-5 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-300/80">Total commits on this day</p>
                <p className="mt-1 text-2xl font-black text-white">{selectedDayTotal} commits</p>
              </div>
              {selectedReposLoading && (
                <p className="mb-4 text-xs text-slate-500">Loading repository breakdown...</p>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

        {showRoleGuide && (
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 px-3 py-4 sm:items-center sm:p-4"
            onClick={() => setShowRoleGuide(false)}
          >
            <div
              className="w-full max-w-6xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1220] via-[#101a30] to-[#0a0f1d] p-3 sm:p-4 md:p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div>
                  <h3 className="text-xl font-black text-white md:text-xl">Role Guide</h3>
                  <p className="mt-0.5 text-sm text-slate-400 md:text-sm">
                    Active role: <span className={`font-bold ${currentRoleTheme.accent}`}>{currentRoleName}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowRoleGuide(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className={`mb-3 rounded-2xl border p-3 sm:p-4 ${currentRoleTheme.card}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${currentRoleTheme.accent}`}>
                      {currentRoleTheme.icon} Active Role
                    </p>
                    <p className="mt-1 text-base font-black text-white md:text-base">You are in the {currentRoleName} lane.</p>
                    <p className="mt-0.5 text-sm text-slate-200/85 md:text-sm">This role is selected from your current contribution mix and challenge path.</p>
                  </div>
                  {nextRole && (
                    <div className={`rounded-xl border px-3 py-1.5 ${nextRoleTheme.card}`}>
                      <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${nextRoleTheme.accent}`}>Next Target</p>
                      <p className={`mt-1 text-base font-black ${nextRoleTheme.accent}`}>{nextRoleTheme.icon} {nextRole.name}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="max-h-[calc(100vh-15.5rem)] overflow-y-auto pr-1 sm:max-h-[calc(100vh-16rem)] sm:pr-2">
                <div className="grid grid-cols-1 gap-3 pb-1 md:grid-cols-2 xl:grid-cols-3">
                {ROLE_GUIDE.map((role) => {
                  const roleTheme = getRoleTheme(role.name);
                  const isCurrentRole = data?.activityRole === role.name;

                  return (
                    <div
                      key={role.name}
                      className={`rounded-xl border p-3 sm:p-3.5 transition-all ${roleTheme.card} ${isCurrentRole ? `${roleTheme.badgeAnimation} scale-[1.01] shadow-[0_0_20px_rgba(255,255,255,0.08)]` : 'opacity-90 hover:opacity-100 hover:-translate-y-0.5'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-black uppercase tracking-[0.14em] ${roleTheme.accent}`}>
                          {roleTheme.icon} {role.name}
                        </p>
                        {isCurrentRole && (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] ${roleTheme.badge}`}>
                            Active
                          </span>
                        )}
                      </div>
                      <p className={`mt-1.5 text-xs leading-relaxed ${roleTheme.accent} opacity-90`}>
                        <span className="font-bold">Rule:</span> {role.condition}
                      </p>
                      <p className={`mt-1.5 text-xs leading-relaxed ${roleTheme.accent}`}>
                        <span className="font-bold">Do:</span> {role.action}
                      </p>
                      <div className="mt-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
                        <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${roleTheme.accent}`}>Challenge</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-200">{role.challenge}</p>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}