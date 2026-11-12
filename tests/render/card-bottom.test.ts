import { expect, test } from 'vitest';
import { renderCard } from '../../src/render/card.js';
import { emptyData, longNamesData, plain, richData } from '../fixtures/cards.js';

const opts = { theme: 'neon', hidePrivate: false, tagline: 'shipping > perfect' } as const;

test('building row exact layout', () => {
  // richData(): 'physicue-pro-app', Dart, 4 commits / 3 AI, last user commit 17 minutes before NOW
  expect(plain(renderCard(richData(), opts))).toContain('● physicue-pro-app    Dart  ▰▰▰▰▰▰▰▰▱▱  75% AI       17m');
});

test('building rows are ranked by the newest user commit and include org repos', () => {
  const t = plain(renderCard(richData(), opts));
  const i = t.findIndex((l) => l.startsWith('── CURRENTLY BUILDING'));
  const names = t.slice(i + 1, i + 7).map((l) => l.slice(2, 22).trim());
  expect(names).toEqual([
    'physicue-pro-app',
    'hymdral_backend',
    'vitamin-house',
    'darts',
    'tetgeleg-admin-api',
    'portfolio',
  ]);
});

test('long names and languages are cut, always leaving a gap before the language', () => {
  const t = plain(renderCard(longNamesData(), opts)).join('\n');
  expect(t).toContain('● a-really-long-repo… Wolfr ▰');
});

test('fill rows say no commits in 90d', () => {
  expect(
    plain(renderCard(richData(), opts)).some((l) => /^● \S.{19}.{6}no commits in 90d {2,}\d+(m|h|d|mo|y)$/.test(l)),
  ).toBe(true);
});

test('hide-private masks names but keeps rows', () => {
  const t = plain(renderCard(richData(), { ...opts, hidePrivate: true }));
  expect(t.filter((l) => l.startsWith('● (private)')).length).toBeGreaterThan(0);
  expect(t.join('\n')).not.toContain('physicue-pro-app');
  expect(t).toContain('● darts               Dart  ▱▱▱▱▱▱▱▱▱▱   0% AI        5d');
});

test('overall line, sidekick and footnote', () => {
  const t = plain(renderCard(richData(), opts));
  expect(t).toContain('overall 75% AI-assisted · sidekick Claude Opus 5.5');
  expect(t).toContain('AI = commits signed by an AI co-author/agent, last 90d');
  expect(plain(renderCard(emptyData(), opts))).toContain('overall 0% AI-assisted');
});

test('capped scan changes footnote', () => {
  const d = richData();
  d.scan.capped = true;
  expect(plain(renderCard(d, opts))).toContain('AI = signed commits, last 90d (newest 60 repos only)');
});

test('footer: npx ghflex shares the line when it fits, wraps when not', () => {
  const short = plain(renderCard(richData(), opts)).find((l) => l.startsWith('➜ ~ '));
  expect(short).toBe(`➜ ~ shipping > perfect █${' '.repeat(22)}npx ghflex`);
  const long = plain(renderCard(richData(), { ...opts, tagline: 'x'.repeat(39) }));
  const i = long.findIndex((l) => l.startsWith('➜ ~ '));
  expect(long[i + 1]).toBe(`${' '.repeat(46)}npx ghflex`);
});

test('npx ghflex is on every card', () => {
  for (const d of [richData(), emptyData(), longNamesData()]) {
    expect(plain(renderCard(d, opts)).join('\n')).toContain('npx ghflex');
  }
});

test('REVIEW: repos that could not be read are disclosed in the footnote', () => {
  const d = richData();
  d.scan.skipped = 2;
  expect(plain(renderCard(d, opts))).toContain('AI = signed commits, last 90d (2 repos unreadable)');
  d.scan.skipped = 1;
  d.scan.capped = true;
  expect(plain(renderCard(d, opts))).toContain('AI = signed commits, last 90d (newest 60, 1 unreadable)');
});
