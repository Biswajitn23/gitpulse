const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toLocalDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function subtractDays(date, days) {
  return new Date(date.getTime() - days * MS_PER_DAY);
}

function sortDays(days) {
  return [...days].sort((left, right) => left.date.localeCompare(right.date));
}

function buildDayMap(days) {
  return days.reduce((accumulator, day) => {
    accumulator.set(day.date, day.contributionCount);
    return accumulator;
  }, new Map());
}

function calculateLongestStreak(days) {
  let longestStreak = 0;
  let activeStreak = 0;
  let previousDate = null;

  for (const day of sortDays(days)) {
    const currentDate = new Date(`${day.date}T00:00:00`);
    const hasContributions = day.contributionCount > 0;
    const isConsecutive = previousDate && currentDate.getTime() - previousDate.getTime() === MS_PER_DAY;

    if (hasContributions) {
      activeStreak = isConsecutive ? activeStreak + 1 : 1;
      longestStreak = Math.max(longestStreak, activeStreak);
    } else {
      activeStreak = 0;
    }

    previousDate = currentDate;
  }

  return longestStreak;
}

function calculateCurrentStreak(days, hasContributedToday, hasContributedYesterday) {
  const dayMap = buildDayMap(days);
  const today = startOfDay(new Date());
  const streakAnchor = hasContributedToday ? today : hasContributedYesterday ? subtractDays(today, 1) : null;

  if (!streakAnchor) {
    return 0;
  }

  let streak = 0;
  let cursor = streakAnchor;

  while ((dayMap.get(toLocalDateKey(cursor)) || 0) > 0) {
    streak += 1;
    cursor = subtractDays(cursor, 1);
  }

  return streak;
}

function buildRepoContributionsByDate(commitContributionsByRepository) {
  const dateBuckets = new Map();

  for (const repoContribution of commitContributionsByRepository || []) {
    const repository = repoContribution.repository;
    const nodes = repoContribution?.contributions?.nodes || [];

    for (const node of nodes) {
      const dateKey = toLocalDateKey(new Date(node.occurredAt));
      if (!dateBuckets.has(dateKey)) {
        dateBuckets.set(dateKey, new Map());
      }

      const repoMap = dateBuckets.get(dateKey);
      const existing = repoMap.get(repository.nameWithOwner) || {
        nameWithOwner: repository.nameWithOwner,
        url: repository.url,
        count: 0,
      };
      existing.count += 1;
      repoMap.set(repository.nameWithOwner, existing);
    }
  }

  return Object.fromEntries(
    [...dateBuckets.entries()].map(([dateKey, repoMap]) => {
      const repos = [...repoMap.values()].sort((a, b) => b.count - a.count);
      return [dateKey, repos];
    }),
  );
}

function buildCommitCountByDate(repoContributionsByDate) {
  const entries = Object.entries(repoContributionsByDate || {});
  const commitCountByDate = new Map();

  for (const [dateKey, repos] of entries) {
    const totalCommits = (repos || []).reduce((total, repo) => total + repo.count, 0);
    commitCountByDate.set(dateKey, totalCommits);
  }

  return commitCountByDate;
}

function formatClockTime(date) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getContributionRole(profile) {
  const commitCount = profile.totalCommitContributions || 0;
  const pullRequestCount = profile.totalPullRequestContributions || 0;
  const issueCount = profile.totalIssueContributions || 0;
  const repositoryCount = profile.totalRepositoryContributions || 0;

  if (pullRequestCount > commitCount && pullRequestCount >= issueCount) {
    return 'Architect';
  }

  if (issueCount > commitCount && issueCount >= pullRequestCount) {
    return 'Maintainer';
  }

  if (repositoryCount > commitCount) {
    return 'Collaborator';
  }

  if (commitCount >= pullRequestCount && commitCount >= issueCount) {
    return commitCount > 100 ? 'Builder' : 'Coder';
  }

  return 'Contributor';
}

function buildContributionWindow(commitContributionsByRepository) {
  const timestamps = [];

  for (const repoContribution of commitContributionsByRepository || []) {
    for (const node of repoContribution?.contributions?.nodes || []) {
      if (node?.occurredAt) {
        timestamps.push(new Date(node.occurredAt));
      }
    }
  }

  if (!timestamps.length) {
    return null;
  }

  const sorted = timestamps.sort((left, right) => left.getTime() - right.getTime());
  return {
    first: formatClockTime(sorted[0]),
    last: formatClockTime(sorted[sorted.length - 1]),
  };
}

function aggregateLanguageBytes(commitContributionsByRepository) {
  const languages = new Map();

  for (const repoContribution of commitContributionsByRepository || []) {
    const repository = repoContribution?.repository;
    const repoLanguageEdges = repository?.languages?.edges || [];

    for (const language of repoLanguageEdges) {
      const languageNode = language?.node || {};
      const current = languages.get(languageNode.name) || {
        name: languageNode.name,
        color: languageNode.color || '#64748b',
        bytes: 0,
      };

      current.bytes += language.size || 0;
      if (languageNode.color) {
        current.color = languageNode.color;
      }
      languages.set(languageNode.name, current);
    }
  }

  const ordered = [...languages.values()].sort((left, right) => right.bytes - left.bytes);
  const totalBytes = ordered.reduce((total, language) => total + language.bytes, 0) || 1;

  return ordered
    .filter((language) => {
      const percentage = Math.round((language.bytes / totalBytes) * 100);
      return percentage > 0;
    })
    .map((language) => ({
      name: language.name,
      color: language.color,
      bytes: language.bytes,
      percentage: Math.round((language.bytes / totalBytes) * 100),
    }));
}

function aggregateTopRepositoryImpact(commitContributionsByRepository) {
  const topRepositories = [...(commitContributionsByRepository || [])]
    .map((repoContribution) => {
      const repository = repoContribution?.repository;
      const commits = (repoContribution?.contributions?.nodes || []).length;
      return {
        nameWithOwner: repository?.nameWithOwner || 'unknown',
        url: repository?.url || `https://github.com/${repository?.nameWithOwner || ''}`,
        stars: repository?.stargazerCount || 0,
        forks: repository?.forkCount || 0,
        commits,
      };
    })
    .sort((left, right) => right.commits - left.commits)
    .slice(0, 3);

  const totalStars = topRepositories.reduce((total, repo) => total + repo.stars, 0);
  const totalForks = topRepositories.reduce((total, repo) => total + repo.forks, 0);

  return {
    totalStars,
    totalForks,
    topRepositories,
  };
}

async function fetchSocialAccounts(username, token) {
  const endpoint = username
    ? `https://api.github.com/users/${encodeURIComponent(username)}/social_accounts`
    : 'https://api.github.com/user/social_accounts';

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    },
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function buildContributionDays(contributionCalendar) {
  return (contributionCalendar?.weeks || [])
    .flatMap((week) => week.contributionDays || [])
    .map((day) => ({
      date: day.date,
      contributionCount: day.contributionCount,
    }));
}

export async function fetchGithubStreak(username, token = import.meta.env.VITE_GITHUB_TOKEN) {
  const trimmedUsername = username?.trim();
  const useViewer = !trimmedUsername || trimmedUsername.toLowerCase() === 'me' || trimmedUsername.toLowerCase() === 'viewer';

  if (!token) {
    throw new Error('Missing GitHub token. Set VITE_GITHUB_TOKEN in your environment.');
  }

  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const query = useViewer
    ? `
      query($from: DateTime!, $to: DateTime!) {
        viewer {
          login
          name
          avatarUrl
          bio
          company
          location
          websiteUrl
          twitterUsername
          pronouns
          url
          status {
            emoji
            message
            expiresAt
            indicatesLimitedAvailability
          }
          followers {
            totalCount
          }
          following {
            totalCount
          }
          repositories(first: 100, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: { field: PUSHED_AT, direction: DESC }) {
            totalCount
            nodes {
              nameWithOwner
              url
              stargazerCount
              forkCount
              isFork
              isPrivate
            }
          }
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            totalPullRequestContributions
            totalIssueContributions
            totalRepositoryContributions
            commitContributionsByRepository(maxRepositories: 100) {
              repository {
                nameWithOwner
                url
                stargazerCount
                forkCount
                languages(first: 100) {
                  edges {
                    size
                    node {
                      name
                      color
                    }
                  }
                }
              }
              contributions(first: 100) {
                nodes {
                  occurredAt
                }
              }
            }
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                }
              }
            }
          }
        }
      }
    `
    : `
      query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          login
          name
          avatarUrl
          bio
          company
          location
          websiteUrl
          twitterUsername
          pronouns
          url
          status {
            emoji
            message
            expiresAt
            indicatesLimitedAvailability
          }
          followers {
            totalCount
          }
          following {
            totalCount
          }
          repositories(first: 100, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: { field: PUSHED_AT, direction: DESC }) {
            totalCount
            nodes {
              nameWithOwner
              url
              stargazerCount
              forkCount
              isFork
              isPrivate
            }
          }
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            totalPullRequestContributions
            totalIssueContributions
            totalRepositoryContributions
            commitContributionsByRepository(maxRepositories: 100) {
              repository {
                nameWithOwner
                url
                stargazerCount
                forkCount
                languages(first: 100) {
                  edges {
                    size
                    node {
                      name
                      color
                    }
                  }
                }
              }
              contributions(first: 100) {
                nodes {
                  occurredAt
                }
              }
            }
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                }
              }
            }
          }
        }
      }
    `;

  const response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: useViewer
        ? {
            from: oneYearAgo.toISOString(),
            to: now.toISOString(),
          }
        : {
            login: trimmedUsername,
            from: oneYearAgo.toISOString(),
            to: now.toISOString(),
          },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || 'GitHub API request failed.');
  }

  if (payload.errors?.length) {
    const message = payload.errors.map((error) => error.message).join(' ');

    if (/Could not resolve to a User/i.test(message)) {
      throw new Error('Invalid GitHub username.');
    }

    if (/resource not accessible|bad credentials|expired|invalid/i.test(message)) {
      throw new Error('GitHub token is invalid or expired.');
    }

    throw new Error(message);
  }

  const user = useViewer ? payload?.data?.viewer : payload?.data?.user;

  if (!user) {
    throw new Error(useViewer ? 'Unable to load the authenticated GitHub account.' : 'Invalid GitHub username.');
  }

  const contributionCalendar = user.contributionsCollection.contributionCalendar;
  const contributionStats = user.contributionsCollection;
  const repoContributionsByDate = buildRepoContributionsByDate(
    user.contributionsCollection.commitContributionsByRepository,
  );
  const contributionDays = buildContributionDays(contributionCalendar);
  const dayMap = buildDayMap(contributionDays);
  const todayKey = toLocalDateKey(new Date());
  const yesterdayKey = toLocalDateKey(subtractDays(new Date(), 1));
  const hasContributedToday = (dayMap.get(todayKey) || 0) > 0;
  const hasContributedYesterday = (dayMap.get(yesterdayKey) || 0) > 0;

  const totalCommits = contributionCalendar.totalContributions || contributionDays.reduce((total, day) => total + day.contributionCount, 0);
  const socialAccounts = await fetchSocialAccounts(user.login, token);
  const activityRole = getContributionRole(contributionStats);
  const contributionWindow = buildContributionWindow(user.contributionsCollection.commitContributionsByRepository);
  const totalImpact = aggregateTopRepositoryImpact(user.contributionsCollection.commitContributionsByRepository);
  const languageBreakdown = aggregateLanguageBytes(user.contributionsCollection.commitContributionsByRepository);
  const allRepositories = (user.repositories?.nodes || []).map((repository) => ({
    nameWithOwner: repository?.nameWithOwner || 'unknown',
    url: repository?.url || '',
    stargazerCount: repository?.stargazerCount || 0,
    forkCount: repository?.forkCount || 0,
    isFork: Boolean(repository?.isFork),
    isPrivate: Boolean(repository?.isPrivate),
  }));

  let isGitHubPro = false;
  try {
    const profileResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (profileResponse.ok) {
      const profilePayload = await profileResponse.json();
      isGitHubPro = String(profilePayload?.plan?.name || '').toLowerCase() === 'pro';
    }
  } catch {
    isGitHubPro = false;
  }

  return {
    username: user.login,
    displayName: user.name || user.login,
    avatarUrl: user.avatarUrl || '',
    bio: user.bio || '',
    company: user.company || '',
    location: user.location || '',
    websiteUrl: user.websiteUrl || '',
    twitterUsername: user.twitterUsername || '',
    pronouns: user.pronouns || '',
    profileUrl: user.url || '',
    status: user.status ? {
      emoji: user.status.emoji || '',
      message: user.status.message || '',
      expiresAt: user.status.expiresAt || null,
      indicatesLimitedAvailability: Boolean(user.status.indicatesLimitedAvailability),
    } : null,
    followersCount: user.followers?.totalCount || 0,
    followingCount: user.following?.totalCount || 0,
    socialAccounts,
    profileTimezone: null,
    activityRole,
    contributionWindow,
    totalImpact,
    languageBreakdown,
    totalCommitContributions: contributionStats.totalCommitContributions || 0,
    totalPullRequestContributions: contributionStats.totalPullRequestContributions || 0,
    totalIssueContributions: contributionStats.totalIssueContributions || 0,
    totalRepositoryContributions: contributionStats.totalRepositoryContributions || 0,
    achievements: [],
    isGitHubPro,
    totalContributions: totalCommits,
    currentStreak: calculateCurrentStreak(contributionDays, hasContributedToday, hasContributedYesterday),
    longestStreak: calculateLongestStreak(contributionDays),
    hasContributedToday,
    contributionDays,
    repoContributionsByDate,
    allRepositories,
    allRepositoriesCount: user.repositories?.totalCount || allRepositories.length,
    commitContributionsByRepository: user.contributionsCollection.commitContributionsByRepository,
    fetchedAt: now.toISOString(),
  };
}