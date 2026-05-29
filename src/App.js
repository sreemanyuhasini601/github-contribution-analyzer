import { useMemo, useState } from "react";
import axios from "axios";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Pie } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

const CONTRIBUTIONS_PROXY = "https://api.allorigins.win/raw?url=";
const CONTRIBUTIONS_API = "https://github-contributions-api.deno.dev";
const PLACEHOLDER_OPENAI_KEY = "your_real_openai_api_key_here";
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY?.trim();
const hasOpenAiKey = Boolean(
  OPENAI_API_KEY &&
  OPENAI_API_KEY !== PLACEHOLDER_OPENAI_KEY &&
  OPENAI_API_KEY.startsWith("sk-") &&
  OPENAI_API_KEY.length > 30
);
const OPENAI_MODEL = "gpt-3.5-turbo";

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const buildLanguageDistribution = (repos) => {
  const totals = {};
  repos.forEach((repo) => {
    if (!repo.language) return;
    totals[repo.language] = (totals[repo.language] || 0) + 1;
  });
  return totals;
};

const buildContributionStats = (days) => {
  if (!days?.length) return null;
  const sorted = [...days].sort((a, b) => new Date(a.date) - new Date(b.date));
  const sumLast = (n) => sorted.slice(-n).reduce((sum, day) => sum + day.count, 0);

  let longest = 0;
  let current = 0;
  let streak = 0;

  for (const day of sorted) {
    if (day.count > 0) {
      streak += 1;
      current += 1;
    } else {
      longest = Math.max(longest, streak);
      streak = 0;
      current = 0;
    }
  }
  longest = Math.max(longest, streak);

  return {
    daily: sumLast(1),
    weekly: sumLast(7),
    monthly: sumLast(30),
    yearly: sorted.reduce((sum, day) => sum + day.count, 0),
    currentStreak: current,
    longestStreak: longest,
  };
};

const parseContributionCalendar = (calendarHtml) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(calendarHtml, "text/html");
    const rects = Array.from(doc.querySelectorAll("rect[data-date]"));
    return rects.map((rect) => ({
      date: rect.getAttribute("data-date"),
      count: Number(rect.getAttribute("data-count") || 0),
    }));
  } catch {
    return [];
  }
};

const normalizeContributionDays = (contributionData) => {
  if (!contributionData) return [];
  const flatDays = Array.isArray(contributionData[0]) ? contributionData.flat() : contributionData;
  return flatDays
    .filter(Boolean)
    .map((day) => ({
      date: day.date,
      count: Number(day.contributionCount ?? day.count ?? 0),
    }))
    .filter((day) => day.date);
};

const buildAiPrompt = ({ profile, repos, languageTotals, contributionStats }) => {
  const topLanguages = Object.keys(languageTotals)
    .sort((a, b) => languageTotals[b] - languageTotals[a])
    .slice(0, 3)
    .join(", ");
  const topRepos = repos.slice(0, 3).map((repo) => `${repo.name}${repo.description ? ` (${repo.description})` : ""}`).join("; ");

  return `You are a helpful analytics assistant. Based on the following GitHub user profile and repository data, generate three concise, professional insights that summarize the developer's activity, strengths, and contribution behavior. Use a professional tone and keep each insight to one sentence.

Profile:
- username: ${profile.login}
- name: ${profile.name || "N/A"}
- followers: ${profile.followers}
- public repos: ${profile.public_repos}

Languages: ${topLanguages || "unknown"}
Contributions:
- daily: ${contributionStats?.daily ?? 0}
- weekly: ${contributionStats?.weekly ?? 0}
- monthly: ${contributionStats?.monthly ?? 0}
- yearly: ${contributionStats?.yearly ?? 0}
- current streak: ${contributionStats?.currentStreak ?? 0}
- longest streak: ${contributionStats?.longestStreak ?? 0}

Top repos: ${topRepos || "none"}`;
};

const fetchAiInsights = async (context) => {
  if (!OPENAI_API_KEY) return null;
  const prompt = buildAiPrompt(context);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: "You are a professional AI analytics assistant." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 220,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data?.choices?.length) {
    throw new Error(data?.error?.message || "OpenAI request failed.");
  }
  return data.choices[0].message.content.trim().split(/\n+/).filter(Boolean);
};

const detectDeveloperRole = (languageTotals, repoNames, repoDescriptions) => {
  const languages = Object.keys(languageTotals).map((lang) => lang.toLowerCase());
  const text = [...repoNames, ...repoDescriptions]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const isCompetitive = /(algorithm|leetcode|codeforces|competitive|contest|challenge|acm|uva|spoj)/.test(text);
  const isMl = /(machine learning|ml|tensorflow|keras|pytorch|data science|scikit|opencv|nlp|cv)/.test(text);
  const hasFrontend =
    languages.includes("javascript") ||
    languages.includes("typescript") ||
    languages.includes("html") ||
    languages.includes("css");
  const hasBackend = ["python", "java", "go", "ruby", "php", "c#", "rust", "kotlin"].some((lang) =>
    languages.includes(lang)
  );
  const hasMlLang = ["python", "r", "julia"].some((lang) => languages.includes(lang));

  if (isCompetitive) return "Competitive Programmer";
  if (isMl || (hasMlLang && text.includes("model"))) return "ML Engineer";
  if (hasFrontend && hasBackend) return "Full Stack Developer";
  if (hasFrontend && !hasBackend) return "Frontend Developer";
  if (hasBackend && !hasFrontend) return "Backend Developer";
  return "Software Developer";
};

const buildInsights = ({ profile, languageTotals, contributionStats, repoCount, topRepos }) => {
  const topLanguage = Object.entries(languageTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || "multiple languages";
  const activeText = contributionStats?.yearly > 100 ? "maintains consistent activity" : "shows steady work on key repositories";
  const focusText = topLanguage ? `focuses on ${topLanguage}` : "works across several technology areas";

  return [
    `This developer ${focusText} and ${activeText}.`,
    `${profile.name || profile.login} has ${profile.followers} followers and ${repoCount} public repos, indicating a strong public footprint.`,
    `Top repositories include ${topRepos.slice(0, 3).map((repo) => repo.name).join(", ")}.`,
  ];
};

const buildSkillAreas = (languageTotals, role) => {
  const topLanguages = Object.keys(languageTotals)
    .sort((a, b) => languageTotals[b] - languageTotals[a])
    .slice(0, 3);
  const skills = [...topLanguages];
  if (role === "Frontend Developer") skills.push("React / UI");
  if (role === "Backend Developer") skills.push("APIs / Server-side");
  if (role === "Full Stack Developer") skills.push("Full-stack systems");
  if (role === "ML Engineer") skills.push("Modeling / Data pipelines");
  return skills.slice(0, 5);
};

function App() {
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState(null);
  const [repos, setRepos] = useState([]);
  const [contributions, setContributions] = useState(null);
  const [contributionsError, setContributionsError] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const languageTotals = useMemo(() => buildLanguageDistribution(repos), [repos]);
  const contributionStats = useMemo(() => buildContributionStats(contributions), [contributions]);

  const topReposByStars = useMemo(
    () => [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 5),
    [repos]
  );

  const recentRepos = useMemo(
    () => [...repos].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 5),
    [repos]
  );

  const inactiveRepos = useMemo(
    () =>
      repos.filter((repo) => {
        const daysInactive = (Date.now() - new Date(repo.updated_at).getTime()) / 86400000;
        return daysInactive > 120;
      }),
    [repos]
  );

  const developerRole = useMemo(
    () =>
      detectDeveloperRole(
        languageTotals,
        repos.map((repo) => repo.name),
        repos.map((repo) => repo.description || "")
      ),
    [languageTotals, repos]
  );

  const insights = useMemo(
    () =>
      profile
        ? buildInsights({
            profile,
            languageTotals,
            contributionStats,
            repoCount: repos.length,
            topRepos: topReposByStars,
          })
        : [],
    [profile, languageTotals, contributionStats, repos.length, topReposByStars]
  );

  const displayedInsights = aiInsights?.length ? aiInsights : insights;

  const skillAreas = useMemo(() => buildSkillAreas(languageTotals, developerRole), [languageTotals, developerRole]);

  const languageChartData = useMemo(() => {
    const labels = Object.keys(languageTotals);
    const values = labels.map((label) => languageTotals[label]);
    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: [
            "#22c55e",
            "#60a5fa",
            "#f97316",
            "#eab308",
            "#a855f7",
            "#38bdf8",
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [languageTotals]);

  const pieOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          boxWidth: 12,
          padding: 12,
        },
      },
    },
  };

  const handleFetch = async () => {
    if (!username.trim()) {
      setError("Please enter a GitHub username.");
      return;
    }

    setError(null);
    setContributionsError(null);
    setIsLoading(true);
    setProfile(null);
    setRepos([]);
    setContributions(null);

    try {
      const profileResponse = await axios.get(`https://api.github.com/users/${username}`);
      const reposResponse = await axios.get(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`);

      setProfile(profileResponse.data);
      setRepos(reposResponse.data || []);

      let contributionDays = [];
      try {
        const contributionsResponse = await axios.get(`${CONTRIBUTIONS_API}/${username}.json`);
        contributionDays = normalizeContributionDays(contributionsResponse.data?.contributions);

        if (contributionDays.length) {
          setContributions(contributionDays);
        } else {
          throw new Error("No contributions data returned.");
        }
      } catch (err) {
        try {
          const contributionsUrl = `${CONTRIBUTIONS_PROXY}${encodeURIComponent(`https://github.com/users/${username}/contributions`)}`;
          const contributionsResponse = await fetch(contributionsUrl);
          const html = await contributionsResponse.text();
          contributionDays = normalizeContributionDays(parseContributionCalendar(html));
          setContributions(contributionDays);
          if (!contributionDays.length) {
            throw new Error("Parsed contribution calendar is empty.");
          }
        } catch (innerErr) {
          setContributions(null);
          setContributionsError("Contributions calendar could not be loaded. This may happen due to GitHub page restrictions or proxy access limits.");
        }
      }

      if (hasOpenAiKey) {
        setIsAiLoading(true);
        setAiError(null);
        setAiInsights(null);
        try {
          const contributionStatsResult = buildContributionStats(contributionDays);
          const aiResult = await fetchAiInsights({
            profile: profileResponse.data,
            repos: reposResponse.data || [],
            languageTotals: buildLanguageDistribution(reposResponse.data || []),
            contributionStats: contributionStatsResult,
          });
          setAiInsights(aiResult);
        } catch (llmError) {
          setAiError(
            llmError?.message
              ? `LLM insights unavailable: ${llmError.message}`
              : "LLM insights unavailable. Please check your OpenAI API key and usage."
          );
        } finally {
          setIsAiLoading(false);
        }
      } else {
        setAiInsights(null);
        setAiError("Set a real OpenAI API key in .env. The placeholder value is not valid.");
      }
    } catch (err) {
      setError(err.response?.status === 404 ? "GitHub user not found." : "Unable to load user data right now.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl shadow-slate-950/20">
          <h1 className="text-4xl font-semibold tracking-tight text-white">GitHub Contribution Analyzer</h1>
          <p className="mt-2 max-w-2xl text-slate-400">Enter a GitHub username to analyze profile details, repository trends, language distribution, contribution streaks, and developer strengths.</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter GitHub username"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30 sm:max-w-md"
            />
            <button
              onClick={handleFetch}
              disabled={isLoading}
              className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {isLoading ? "Analyzing…" : "Analyze Profile"}
            </button>
          </div>
          {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
          {!error && contributionsError && <p className="mt-4 text-sm text-amber-300">{contributionsError}</p>}
        </header>

        {profile && (
          <main className="space-y-8">
            <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
                <div className="flex items-center gap-4">
                  <img
                    src={profile.avatar_url}
                    alt={`${profile.login} avatar`}
                    className="h-24 w-24 rounded-3xl border border-slate-700 object-cover"
                  />
                  <div>
                    <h2 className="text-2xl font-semibold text-white">{profile.name || profile.login}</h2>
                    <p className="text-slate-400">@{profile.login}</p>
                  </div>
                </div>

                <div className="mt-6 space-y-4 text-sm text-slate-300">
                  <p>{profile.bio || "No bio available."}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-950/80 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Followers</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{profile.followers}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Following</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{profile.following}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Public Repos</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{profile.public_repos}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Joined</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{formatDate(profile.created_at)}</p>
                    </div>
                  </div>
                </div>
              </article>

              <article className="grid gap-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-slate-950/80 p-5">
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Detected Role</p>
                    <p className="mt-3 text-xl font-semibold text-white">{developerRole}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-950/80 p-5">
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Most Active Repo</p>
                    <p className="mt-3 text-xl font-semibold text-white">{recentRepos[0]?.name || "N/A"}</p>
                  </div>
                </div>

                <div className="rounded-3xl bg-slate-950/80 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-500">AI-generated insights</p>
                    {hasOpenAiKey ? (
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">OpenAI enabled</span>
                    ) : (
                      <span className="text-xs uppercase tracking-[0.2em] text-amber-300">OpenAI disabled</span>
                    )}
                  </div>
                  {isAiLoading && <p className="mt-3 text-sm text-slate-400">Generating AI insights…</p>}
                  <div className="mt-4 space-y-3 text-slate-300">
                    {displayedInsights.map((insight, idx) => (
                      <p key={idx}>{insight}</p>
                    ))}
                  </div>
                  {!OPENAI_API_KEY && !aiError && (
                    <p className="mt-4 text-sm text-slate-400">No OpenAI API key configured. Insights use local rule-based analysis.</p>
                  )}
                </div>
              </article>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
              <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">Repository analysis</h3>
                    <p className="mt-1 text-sm text-slate-400">Overview for the user's public repositories.</p>
                  </div>
                  <span className="rounded-full bg-slate-950/90 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-400">{repos.length} repos</span>
                </div>

                <div className="mt-6 space-y-4">
                  {repos.slice(0, 6).map((repo) => (
                    <div key={repo.id} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 transition hover:border-sky-500/50">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-lg font-semibold text-white hover:text-sky-300"
                          >
                            {repo.name}
                          </a>
                          <p className="mt-1 text-sm text-slate-400">{repo.description || "No description"}</p>
                        </div>
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                          {repo.private ? "Private" : "Public"}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-400">
                        <span>{repo.language || "Unknown"}</span>
                        <span>⭐ {repo.stargazers_count}</span>
                        <span>⑂ {repo.forks_count}</span>
                        <span>📦 {Math.round((repo.size / 1024) * 100) / 100} MB</span>
                        <span>Updated {formatDate(repo.updated_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
                <div className="rounded-3xl bg-slate-950/80 p-5">
                  <h3 className="text-xl font-semibold text-white">Language distribution</h3>
                  {languageChartData.labels.length ? (
                    <div className="mt-6 h-72 sm:h-64">
                      <Pie data={languageChartData} options={pieOptions} />
                    </div>
                  ) : (
                    <p className="mt-4 text-slate-400">Not enough language data available.</p>
                  )}
                </div>

                <div className="rounded-3xl bg-slate-950/80 p-5">
                  <h3 className="text-xl font-semibold text-white">Contribution metrics</h3>
                  <p className="mt-2 text-sm text-slate-400">Summary of contributions for the past 24 hours, 7 days, 30 days, and the full year.</p>
                  {contributionStats ? (
                    <>
                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        {[
                          ["Daily (24h)", contributionStats.daily],
                          ["Weekly (7d)", contributionStats.weekly],
                          ["Monthly (30d)", contributionStats.monthly],
                          ["Yearly", contributionStats.yearly],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-3xl bg-slate-950/90 p-4">
                            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{label}</p>
                            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                          </div>
                        ))}
                      </div>
                      {contributionStats.yearly > 0 && contributionStats.monthly === 0 && contributionStats.weekly === 0 && contributionStats.daily === 0 && (
                        <p className="mt-4 text-sm text-slate-400">The user has contributions earlier in the year, but none in the last 30 days.</p>
                      )}
                    </>
                  ) : (
                    <p className="mt-4 text-slate-400">Contribution calendar data is unavailable or loading.</p>
                  )}
                </div>

                <div className="rounded-3xl bg-slate-950/80 p-5">
                  <h3 className="text-xl font-semibold text-white">Coding streak</h3>
                  {contributionStats ? (
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-3xl bg-slate-950/90 p-4">
                        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Current streak</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{contributionStats.currentStreak} days</p>
                      </div>
                      <div className="rounded-3xl bg-slate-950/90 p-4">
                        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Longest streak</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{contributionStats.longestStreak} days</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-slate-400">Loading streak information...</p>
                  )}
                </div>
              </article>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
                <h3 className="text-xl font-semibold text-white">Top repositories</h3>
                <div className="mt-5 space-y-4">
                  {topReposByStars.map((repo) => (
                    <div key={repo.id} className="rounded-3xl bg-slate-950/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-white">{repo.name}</span>
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">⭐ {repo.stargazers_count}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{repo.description || "No description"}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
                <h3 className="text-xl font-semibold text-white">Activity analysis</h3>
                <div className="mt-5 space-y-4 text-sm text-slate-300">
                  <div className="rounded-3xl bg-slate-950/80 p-4">
                    <p className="text-slate-400">Recently updated repos</p>
                    <ul className="mt-3 space-y-2">
                      {recentRepos.slice(0, 4).map((repo) => (
                        <li key={repo.id} className="flex items-center justify-between gap-3">
                          <span>{repo.name}</span>
                          <span className="text-slate-400">{formatDate(repo.updated_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-3xl bg-slate-950/80 p-4">
                    <p className="text-slate-400">Inactive repositories</p>
                    <p className="mt-3 text-slate-200">{inactiveRepos.length || "None detected"} repos not updated in over 120 days.</p>
                  </div>
                </div>
              </article>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
              <h3 className="text-xl font-semibold text-white">Skill analysis</h3>
              <div className="mt-5 flex flex-wrap gap-3">
                {skillAreas.map((skill) => (
                  <span key={skill} className="rounded-2xl bg-slate-950/90 px-4 py-2 text-sm text-slate-200">✔ {skill}</span>
                ))}
              </div>
            </section>
          </main>
        )}
      </div>
    </div>
  );
}

export default App;
