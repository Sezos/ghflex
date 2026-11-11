import { expect, test } from 'vitest';
import { renderCard, section } from '../../src/render/card.js';
import { toAnsi, width } from '../../src/render/spans.js';
import { emptyData, longNamesData, peekData, plain, richData } from '../fixtures/cards.js';

const opts = { theme: 'neon', hidePrivate: false, tagline: 'shipping > perfect' } as const;

test('fixture sanity: rich data has 108 owned repos, 74 private', () => {
  const d = richData();
  expect(d.ownedRepos).toHaveLength(108);
  expect(d.ownedRepos.filter((r) => r.isPrivate)).toHaveLength(74);
});

test('stats rows match the prototype format', () => {
  const t = plain(renderCard(richData(), opts));
  expect(t).toContain('repos         108  74 private · 34 public');
  expect(t).toContain('contributions 818  past year · 1,590 all-time');
  expect(t).toContain('coding since  2019  7 years of shipping');
});

test('peek repos stat counts public only', () => {
  expect(plain(renderCard(peekData(), opts))).toContain('repos         34  public repos');
});

test('section header is exactly 56 wide', () => {
  expect(toAnsi(section('STATS'), { color: false })).toBe(`── STATS ${'─'.repeat(47)}`);
});

test('contribution grid: month labels, 7 rows, legend', () => {
  const t = plain(renderCard(richData(), opts));
  const i = t.findIndex((l) => l.startsWith('── LAST 6 MONTHS'));
  expect(t[i + 1]).toMatch(/[A-Z][a-z]{2}/); // month labels
  expect(t[i + 3].startsWith('Mon ')).toBe(true);
  expect(t[i + 9]).toMatch(/in 6 months +less ■ ■ ■ ■ ■ more$/);
});

test('empty account renders without NaN/undefined and says no languages yet', () => {
  const t = plain(renderCard(emptyData(), opts)).join('\n');
  expect(t).not.toMatch(/NaN|undefined|Infinity/);
  expect(t).toContain('no languages yet');
  expect(t).toContain('busiest day   —');
});

test('width invariant for every fixture, theme and hidePrivate', () => {
  for (const d of [richData(), emptyData(), longNamesData(), peekData()])
    for (const theme of ['neon', 'sunset', 'matrix'] as const)
      for (const hidePrivate of [false, true])
        for (const line of renderCard(d, { ...opts, theme, hidePrivate })) expect(width(line)).toBeLessThanOrEqual(56);
});
