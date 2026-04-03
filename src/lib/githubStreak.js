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
          contributionsCollection(from: $from, to: $to) {
            commitContributionsByRepository(maxRepositories: 100) {
              repository {
                nameWithOwner
                url
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
          contributionsCollection(from: $from, to: $to) {
            commitContributionsByRepository(maxRepositories: 100) {
              repository {
                nameWithOwner
                url
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

  return {
    username: user.login,
    displayName: user.name || user.login,
    avatarUrl: user.avatarUrl || '',
    totalContributions: totalCommits,
    currentStreak: calculateCurrentStreak(contributionDays, hasContributedToday, hasContributedYesterday),
    longestStreak: calculateLongestStreak(contributionDays),
    hasContributedToday,
    contributionDays,
    repoContributionsByDate,
    fetchedAt: now.toISOString(),
  };
}