import { ChevronLeft, ExternalLink, LogOut, User2 } from 'lucide-react';

function SectionCard({ title, children, className = '' }) {
  return (
    <section className={`rounded-3xl border border-white/10 bg-white/[0.03] p-3.5 sm:p-4 ${className}`.trim()}>
      <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-slate-500">{title}</p>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function formatSocialLabel(provider, url) {
  if (provider) {
    return provider
      .toString()
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'Social';
  }
}

function formatStatusEmoji(emoji) {
  const normalized = (emoji || '').trim();
  if (!normalized) return '';

  const emojiMap = {
    ':octocat:': '🐙',
    ':coffee:': '☕',
    ':rocket:': '🚀',
    ':wave:': '👋',
    ':speech_balloon:': '💬',
    ':zap:': '⚡',
    ':computer:': '💻',
    ':art:': '🎨',
    ':fire:': '🔥',
    ':sparkles:': '✨',
  };

  return emojiMap[normalized] || normalized.replace(/:/g, '');
}

export default function ProfilePage({
  data,
  profileAvatar,
  profileName,
  isGitHubPro,
  viewerName,
  onBack,
  onSignOut,
}) {
  const username = data?.username || viewerName;
  const socialAccounts = data?.socialAccounts || [];
  const achievements = data?.achievements || [];
  const activityRole = data?.activityRole || 'Coder';
  const contributionWindow = data?.contributionWindow;
  const profileStatus = data?.status;
  const statusEmoji = formatStatusEmoji(profileStatus?.emoji);
  const totalImpact = data?.totalImpact || { totalStars: 0, totalForks: 0, topRepositories: [] };
  const languageBreakdown = data?.languageBreakdown || [];
  const pageShellClass = isGitHubPro
    ? 'bg-gradient-to-br from-[#09051a] via-[#12091f] to-[#020617] text-slate-100'
    : 'bg-[#020617] text-slate-200';
  const cardShellClass = isGitHubPro
    ? 'border-violet-400/15 bg-gradient-to-br from-white/[0.055] via-white/[0.035] to-violet-500/[0.03] shadow-2xl shadow-violet-950/20'
    : 'border-white/10 bg-white/[0.03] shadow-2xl shadow-emerald-950/10';
  const innerCardClass = isGitHubPro
    ? 'border-violet-400/10 bg-black/25'
    : 'border-white/5 bg-black/20';

  return (
    <main className={`min-h-screen ${pageShellClass}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${isGitHubPro ? 'border-violet-400/10 bg-[#09051a]/75' : 'border-white/5 bg-[#020617]/80'}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] ${isGitHubPro ? 'text-violet-200/70' : 'text-slate-500'}`}>
            <User2 className={`h-4 w-4 ${isGitHubPro ? 'text-violet-300' : 'text-emerald-400'}`} />
            Profile page
          </div>
          <button
            onClick={onSignOut}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <section className={`overflow-hidden rounded-[2rem] border ${cardShellClass}`}>
          <div className={`border-b px-4 py-4 sm:px-5 ${isGitHubPro ? 'border-violet-400/10 bg-gradient-to-r from-violet-500/18 via-fuchsia-500/8 to-transparent' : 'border-white/5 bg-gradient-to-r from-emerald-500/10 via-cyan-500/5 to-transparent'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <img src={profileAvatar} alt="" className={`h-14 w-14 rounded-2xl object-cover ring-2 ${isGitHubPro ? 'ring-violet-300/55 shadow-[0_0_24px_rgba(168,85,247,0.18)]' : 'ring-emerald-500/30'}`} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className={`text-xl font-black leading-tight ${isGitHubPro ? 'text-violet-100' : 'text-white'}`}>{profileName}</h1>
                    {isGitHubPro && <span className="rounded-full border border-violet-300/30 bg-violet-500/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.25em] text-violet-100">Premium</span>}
                  </div>
                  <p className={`mt-1 text-xs sm:text-sm ${isGitHubPro ? 'text-violet-200/70' : 'text-slate-400'}`}>@{username} · {data?.pronouns || 'he/him'}</p>
                  {profileStatus?.message || profileStatus?.emoji ? (
                    <div className={`mt-1.5 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] ${isGitHubPro ? 'border-violet-300/25 bg-violet-500/10 text-violet-100' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'}`}>
                      <span className="text-sm">{statusEmoji || '💬'}</span>
                      <span className="font-semibold">{profileStatus?.message || 'Active on GitHub'}</span>
                      <span className={`text-[10px] uppercase tracking-[0.18em] ${isGitHubPro ? 'text-violet-100/65' : 'text-emerald-100/75'}`}>
                        {profileStatus?.indicatesLimitedAvailability ? 'Limited' : 'Available'}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              <a href={data?.profileUrl || `https://github.com/${username}`} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 self-start rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors ${isGitHubPro ? 'border-violet-300/25 bg-violet-500/12 text-violet-50 hover:bg-violet-500/18' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'}`}>
                <ExternalLink className="h-3.5 w-3.5" />
                Open GitHub
              </a>
            </div>
          </div>

          <div className="grid gap-3 p-3.5 sm:p-5 lg:grid-cols-2">
            <SectionCard title="Profile" className={innerCardClass}>
              <div className="grid gap-2">
                <div className={`rounded-2xl border p-2.5 ${innerCardClass}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isGitHubPro ? 'text-violet-200/60' : 'text-slate-500'}`}>Handle</p>
                  <p className="mt-1 text-sm font-semibold text-white">@{username}</p>
                </div>
                <div className={`rounded-2xl border p-2.5 ${innerCardClass}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isGitHubPro ? 'text-violet-200/60' : 'text-slate-500'}`}>Bio</p>
                  <p className={`mt-1 text-sm leading-relaxed ${isGitHubPro ? 'text-violet-100/90' : 'text-slate-300'}`}>
                    {data?.bio || 'Turning imagination into 0s and 1s.'}
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Connections" className={innerCardClass}>
              <div className="grid gap-2 sm:grid-cols-2">
                <a href={`https://github.com/${username}?tab=followers`} target="_blank" rel="noreferrer" className={`min-h-[96px] rounded-2xl border p-2.5 transition-colors ${innerCardClass} ${isGitHubPro ? 'hover:border-violet-300/30 hover:bg-white/[0.05]' : 'hover:border-emerald-500/30 hover:bg-white/[0.04]'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isGitHubPro ? 'text-violet-200/60' : 'text-slate-500'}`}>Followers</p>
                  <p className="mt-1 text-xl font-black text-white">{data?.followersCount ?? 0}</p>
                  <p className={`mt-4 text-[11px] font-medium ${isGitHubPro ? 'text-violet-100/55' : 'text-slate-500'}`}>Click to see</p>
                </a>
                <a href={`https://github.com/${username}?tab=following`} target="_blank" rel="noreferrer" className={`min-h-[96px] rounded-2xl border p-2.5 transition-colors ${innerCardClass} ${isGitHubPro ? 'hover:border-violet-300/30 hover:bg-white/[0.05]' : 'hover:border-emerald-500/30 hover:bg-white/[0.04]'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isGitHubPro ? 'text-violet-200/60' : 'text-slate-500'}`}>Following</p>
                  <p className="mt-1 text-xl font-black text-white">{data?.followingCount ?? 0}</p>
                  <p className={`mt-4 text-[11px] font-medium ${isGitHubPro ? 'text-violet-100/55' : 'text-slate-500'}`}>Click to see</p>
                </a>
                <div className={`rounded-2xl border p-2.5 ${innerCardClass}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isGitHubPro ? 'text-violet-200/60' : 'text-slate-500'}`}>Company</p>
                  <p className="mt-1 text-sm font-semibold text-white">{data?.company || 'Not set'}</p>
                </div>
                <div className={`rounded-2xl border p-2.5 ${innerCardClass}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isGitHubPro ? 'text-violet-200/60' : 'text-slate-500'}`}>Location</p>
                  <p className="mt-1 text-sm font-semibold text-white">{data?.location || 'Not set'}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Social Links" className={innerCardClass}>
              <p className={`-mt-1 mb-3 text-[11px] font-medium ${isGitHubPro ? 'text-violet-100/55' : 'text-slate-500'}`}>Click any social media card to open it.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {socialAccounts.length > 0 ? (
                  socialAccounts.map((account, index) => (
                    <a
                      key={`${account.url || account.provider || index}`}
                      href={account.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded-2xl border p-2.5 transition-colors ${innerCardClass} ${isGitHubPro ? 'hover:border-violet-300/30 hover:bg-white/[0.05]' : 'hover:border-emerald-500/30 hover:bg-white/[0.04]'}`}
                    >
                      <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isGitHubPro ? 'text-violet-200/60' : 'text-slate-500'}`}>
                        {formatSocialLabel(account.provider, account.url)}
                      </p>
                      <p className="mt-1 truncate text-xs sm:text-sm font-semibold text-white">{account.url}</p>
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-slate-400 sm:col-span-2">No additional social accounts were returned.</p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Highlights" className={innerCardClass}>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className={`rounded-2xl border p-2.5 ${innerCardClass}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isGitHubPro ? 'text-violet-200/60' : 'text-slate-500'}`}>Current Streak</p>
                  <p className="mt-1 text-lg font-black text-white">{data?.currentStreak ?? 0}</p>
                </div>
                <div className={`rounded-2xl border p-2.5 ${innerCardClass}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isGitHubPro ? 'text-violet-200/60' : 'text-slate-500'}`}>Total Contributions</p>
                  <p className="mt-1 text-lg font-black text-white">{data?.totalContributions ?? 0}</p>
                </div>
                <div className={`rounded-2xl border p-2.5 ${innerCardClass}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.25em] ${isGitHubPro ? 'text-violet-200/60' : 'text-slate-500'}`}>Best Streak</p>
                  <p className="mt-1 text-lg font-black text-white">{data?.longestStreak ?? 0}</p>
                </div>
              </div>
            </SectionCard>

            {achievements.length > 0 && (
              <SectionCard title="Achievements" className={innerCardClass}>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  {achievements.map((achievement, index) => (
                    <span
                      key={`${achievement.name || 'achievement'}-${index}`}
                      className={`rounded-full border px-3 py-1 ${isGitHubPro ? 'border-violet-300/25 bg-violet-500/15 text-violet-50' : 'border-violet-400/20 bg-violet-500/10 text-violet-100'}`}
                    >
                      {achievement.name}
                    </span>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}