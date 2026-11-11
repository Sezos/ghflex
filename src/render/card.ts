import { computeMeter, type MeterResult } from '../ai/meter.js';
import { activeRepos, busiestDay, languageStack, streaks } from '../stats.js';
import type { CardData, CardOptions, Day, Repo, ThemeName } from '../types.js';
import { bannerLines, pickBanner } from './font.js';
import { type Line, type Span, THEMES, width } from './spans.js';

export const WIDTH = 56;

const DAY_MS = 86_400_000;
const WHITE = 255;
const SOFT = 250;
const RULE = 238;
const TRACK = 236;
const HEAT = [237, 22, 28, 34, 46];
const WEEKS = 26;

export const LANG_COLORS: Record<string, number> = {
  Dart: 38,
  TypeScript: 33,
  JavaScript: 220,
  HTML: 208,
  CSS: 99,
  'C++': 205,
  C: 247,
  Python: 71,
  Swift: 209,
  Kotlin: 135,
  Go: 44,
  Rust: 173,
  Java: 130,
  Shell: 113,
  Vue: 42,
  Other: 244,
};

// ---------- small helpers ----------

const accentOf = (theme: ThemeName) => THEMES[theme][8];
const fmtNum = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, word: string) => `${fmtNum(n)} ${word}${n === 1 ? '' : 's'}`;
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const monthDay = (date: string) =>
  utc(date).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Cuts a line to `max` columns, ending with an ellipsis when something was cut. */
export function clip(line: Line, max = WIDTH): Line {
  if (width(line) <= max) return line;
  const out: Line = [];
  let left = max - 1;
  for (const span of line) {
    const chars = [...span.text];
    if (chars.length <= left) {
      out.push(span);
      left -= chars.length;
      continue;
    }
    out.push({ ...span, text: chars.slice(0, left).join('') + '…' });
    return out;
  }
  return out;
}

export function centered(line: Line): Line {
  const pad = Math.max(0, Math.floor((WIDTH - width(line)) / 2));
  return pad ? [{ text: ' '.repeat(pad) }, ...line] : line;
}

export function section(title: string, accent = 213): Line {
  const t = ` ${title} `;
  return [
    { text: '──', fg: accent },
    { text: t, bold: true },
    { text: '─'.repeat(Math.max(0, WIDTH - 2 - t.length)), fg: RULE },
  ];
}

// ---------- sections ----------

function subtitle(data: CardData): Line {
  const base: Line = [{ text: `github.com/${data.profile.login}`, fg: SOFT }];
  const langs = languageStack(data.ownedRepos)
    .map((l) => l.name)
    .filter((n) => n !== 'Other');
  for (let k = Math.min(3, langs.length); k > 0; k--) {
    const line: Line = [...base, { text: '  ·  ', dim: true }, { text: langs.slice(0, k).join(' / '), fg: SOFT }];
    if (width(line) <= WIDTH) return centered(line);
  }
  return centered(clip(base));
}

function statRow(label: string, color: number, value: string, extra?: string): Line {
  const line: Line = [
    { text: label.padEnd(14), dim: true },
    { text: value, bold: true, fg: color },
  ];
  if (extra) line.push({ text: `  ${extra}`, dim: true });
  return clip(line);
}

function statsRows(data: CardData, theme: ThemeName): Line[] {
  const c = THEMES[theme];
  const { profile, ownedRepos, now } = data;
  const priv = ownedRepos.filter((r) => r.isPrivate).length;
  const reposExtra = data.mode === 'peek' ? 'public repos' : `${priv} private · ${ownedRepos.length - priv} public`;
  const { current, best } = streaks(profile.calendar);
  const peak = busiestDay(profile.calendar);
  const created = new Date(profile.createdAt).getUTCFullYear();
  const years = now.getUTCFullYear() - created;
  const yearsText = years < 1 ? 'first year of shipping' : `${plural(years, 'year')} of shipping`;
  return [
    statRow('repos', c[0], fmtNum(ownedRepos.length), reposExtra),
    statRow(
      'contributions',
      c[1],
      fmtNum(profile.pastYearTotal),
      `past year · ${fmtNum(profile.allTimeTotal)} all-time`,
    ),
    statRow('streak', c[6], plural(current, 'day'), `best this year: ${best}`),
    peak
      ? statRow('busiest day', c[7], plural(peak.count, 'contribution'), `on ${monthDay(peak.date)}`)
      : statRow('busiest day', c[7], '—'),
    statRow('active', c[8], plural(activeRepos(ownedRepos, now), 'repo'), 'pushed in the last 30 days'),
    statRow('coding since', c[9], String(created), yearsText),
  ];
}

const BAR = 28;

function stackRows(data: CardData): Line[] {
  const stack = languageStack(data.ownedRepos);
  if (!stack.length) return [[{ text: 'no languages yet', dim: true }]];
  const biggest = Math.max(...stack.map((s) => s.repos));
  return stack.map((s) => {
    const fill = Math.max(1, Math.round((s.repos / biggest) * BAR));
    return clip([
      { text: [...s.name].slice(0, 11).join('').padEnd(12), fg: WHITE },
      { text: '█'.repeat(fill), fg: LANG_COLORS[s.name] ?? SOFT },
      { text: '░'.repeat(BAR - fill), fg: TRACK },
      { text: ` ${String(s.pct).padStart(3)}%`, bold: true },
      { text: `  ${plural(s.repos, 'repo')}`, dim: true },
    ]);
  });
}

function heatmapRows(calendar: Day[], now: Date): Line[] {
  const lastTime = calendar.length
    ? utc(calendar[calendar.length - 1].date).getTime()
    : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const lastWeekStart = lastTime - new Date(lastTime).getUTCDay() * DAY_MS;
  const firstWeekStart = lastWeekStart - (WEEKS - 1) * 7 * DAY_MS;

  const grid: (number | null)[][] = Array.from({ length: 7 }, () => Array(WEEKS).fill(null));
  let sum = 0;
  const shown: number[] = [];
  for (const d of calendar) {
    const t = utc(d.date).getTime();
    if (t < firstWeekStart || t > lastTime) continue;
    const k = Math.floor((t - firstWeekStart) / (7 * DAY_MS));
    grid[new Date(t).getUTCDay()][k] = d.count;
    sum += d.count;
    if (d.count > 0) shown.push(d.count);
  }
  shown.sort((a, b) => a - b);
  const q = (p: number) => (shown.length ? shown[Math.min(shown.length - 1, Math.floor(p * shown.length))] : 0);
  const [t1, t2, t3] = [q(0.25), q(0.5), q(0.75)];
  const level = (n: number) => (n === 0 ? 0 : n <= t1 ? 1 : n <= t2 ? 2 : n <= t3 ? 3 : 4);

  const months = Array(WIDTH).fill(' ');
  for (let k = 0; k < WEEKS; k++) {
    const sunday = new Date(firstWeekStart + k * 7 * DAY_MS);
    const col = 4 + 2 * k;
    if (sunday.getUTCDate() <= 7 && col + 3 <= WIDTH) {
      const label = sunday.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      for (let j = 0; j < 3; j++) months[col + j] = label[j];
    }
  }

  const rows: Line[] = [[{ text: months.join('').trimEnd(), dim: true }]];
  const dayLabels: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };
  for (let r = 0; r < 7; r++) {
    const line: Line = [{ text: (dayLabels[r] ?? '').padEnd(4), dim: true }];
    for (let k = 0; k < WEEKS; k++) {
      const n = grid[r][k];
      line.push(n === null ? { text: '  ' } : { text: '■ ', fg: HEAT[level(n)] });
    }
    rows.push(line);
  }

  const left: Span = { text: `${fmtNum(sum)} in 6 months`, dim: true };
  const legend: Line = [
    { text: 'less ', dim: true },
    ...HEAT.map((fg): Span => ({ text: '■ ', fg })),
    { text: 'more', dim: true },
  ];
  const gap = Math.max(1, WIDTH - width([left]) - width(legend));
  rows.push([left, { text: ' '.repeat(gap) }, ...legend]);
  return rows;
}

// ---------- currently building + AI meter ----------

export const TAGLINES = [
  'it works on my machine',
  'sleep is a deprecated dependency',
  'git commit -m "final_final_v3"',
  'rm -rf node_modules && pray',
  'shipping > perfect',
  'coffee in, commits out',
  '99 little bugs in the code...',
  'deploying on a friday, no fear',
];

const BUILDING_ROWS = 6;
const AI_FILLED = 213;
const GREEN = 46;
const YELLOW = 220;
const GRAY = 240;

const SHORT_LANG: Record<string, string> = {
  TypeScript: 'TS',
  JavaScript: 'JS',
  Python: 'Py',
  Kotlin: 'Kt',
  Shell: 'Sh',
};
const KEEP_LANG = new Set(['Dart', 'Go', 'Rust', 'Swift', 'Java', 'Ruby', 'C', 'C++', 'C#', 'HTML', 'CSS', 'Vue']);

function langLabel(lang: string | null): string {
  if (!lang) return '';
  if (SHORT_LANG[lang]) return SHORT_LANG[lang];
  return KEEP_LANG.has(lang) ? lang : [...lang].slice(0, 5).join('');
}

function age(fromIso: string, now: Date): string {
  const mins = Math.max(0, (now.getTime() - Date.parse(fromIso)) / 60_000);
  if (mins < 60) return `${Math.max(1, Math.floor(mins))}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function dotColor(fromIso: string, now: Date): number {
  const hours = (now.getTime() - Date.parse(fromIso)) / 3_600_000;
  return hours < 24 ? GREEN : hours < 24 * 7 ? YELLOW : GRAY;
}

function repoName(r: Repo, hidePrivate: boolean): Span {
  if (hidePrivate && r.isPrivate) return { text: '(private)'.padEnd(20), dim: true };
  // 20-column field that always ends in a gap: names over 19 characters become 18 + '…'.
  const chars = [...r.name];
  const name = chars.length > 19 ? `${chars.slice(0, 18).join('')}…` : r.name;
  return { text: name.padEnd(20), fg: WHITE };
}

interface BuildingRow {
  repo: Repo;
  since: string; // last user commit, or pushedAt for fill rows
  pct: number | null; // null = no commits in the window
}

function pickBuildingRows(data: CardData, meter: MeterResult): BuildingRow[] {
  const byName = new Map<string, Repo>();
  for (const r of [...data.ownedRepos, ...data.scan.scannedRepos]) byName.set(r.nameWithOwner, r);

  const active: BuildingRow[] = [];
  for (const m of meter.perRepo.values()) {
    const repo = byName.get(m.repo);
    if (repo && m.lastUserCommit) active.push({ repo, since: m.lastUserCommit, pct: m.pct });
  }
  active.sort((a, b) => Date.parse(b.since) - Date.parse(a.since));
  const rows = active.slice(0, BUILDING_ROWS);

  const listed = new Set(rows.map((r) => r.repo.nameWithOwner));
  const fill = [...data.ownedRepos]
    .filter((r) => !listed.has(r.nameWithOwner))
    .sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));
  for (const repo of fill) {
    if (rows.length >= BUILDING_ROWS) break;
    rows.push({ repo, since: repo.pushedAt, pct: null });
  }
  return rows;
}

function buildingLine(row: BuildingRow, data: CardData, opts: CardOptions): Line {
  const lang = langLabel(row.repo.primaryLanguage);
  const line: Line = [
    { text: '● ', fg: dotColor(row.since, data.now) },
    repoName(row.repo, opts.hidePrivate),
    { text: lang.padEnd(6), fg: LANG_COLORS[row.repo.primaryLanguage ?? ''] ?? 244 },
  ];
  if (row.pct === null) {
    line.push({ text: 'no commits in 90d '.padEnd(18), dim: true });
  } else {
    const filled = Math.round(row.pct / 10);
    line.push(
      { text: '▰'.repeat(filled), fg: AI_FILLED },
      { text: '▱'.repeat(10 - filled), fg: TRACK },
      { text: ' ' },
      { text: `${row.pct}%`.padStart(4), bold: true },
      { text: ' AI', dim: true },
    );
  }
  line.push({ text: age(row.since, data.now).padStart(10), dim: true });
  return clip(line);
}

function aiLines(data: CardData, meter: MeterResult, accent: number): Line[] {
  const overall: Line = [
    { text: 'overall ', dim: true },
    { text: `${meter.overall.pct}% AI-assisted`, bold: true, fg: accent },
  ];
  if (meter.sidekick) overall.push({ text: ' · sidekick ', dim: true }, { text: meter.sidekick, fg: WHITE });
  const footnote = data.scan.capped
    ? 'AI = signed commits, last 90d (newest 60 repos only)'
    : 'AI = commits signed by an AI co-author/agent, last 90d';
  return [clip(overall), [{ text: footnote, fg: GRAY, dim: true }]];
}

const AD = 'npx ghflex';

function footerLines(tagline: string, accent: number): Line[] {
  const prompt: Line = clip(
    [
      { text: '➜ ', fg: GREEN, bold: true },
      { text: '~ ', fg: 51 },
      { text: `${tagline} `, fg: WHITE },
      { text: '█', fg: accent, blink: true },
    ],
    WIDTH,
  );
  const ad: Span = { text: AD, dim: true };
  const used = width(prompt);
  if (used + 2 + AD.length <= WIDTH) {
    return [[...prompt, { text: ' '.repeat(WIDTH - used - AD.length) }, ad]];
  }
  return [prompt, [{ text: ' '.repeat(WIDTH - AD.length) }, ad]];
}

// ---------- card ----------

export function renderCard(data: CardData, opts: CardOptions): Line[] {
  const accent = accentOf(opts.theme);
  const meter = computeMeter(data.scan.commits);
  const building = pickBuildingRows(data, meter);
  return [
    [],
    ...bannerLines(pickBanner(data.profile, opts.banner), opts.theme),
    [],
    subtitle(data),
    [],
    section('STATS', accent),
    ...statsRows(data, opts.theme),
    [],
    section('STACK', accent),
    ...stackRows(data),
    [],
    section('LAST 6 MONTHS', accent),
    ...heatmapRows(data.profile.calendar, data.now),
    [],
    section('CURRENTLY BUILDING', accent),
    ...(building.length
      ? building.map((row) => buildingLine(row, data, opts))
      : [[{ text: 'no repos yet', dim: true }] as Line]),
    [],
    ...aiLines(data, meter, accent),
    [],
    ...footerLines(opts.tagline, accent),
    [],
  ];
}
