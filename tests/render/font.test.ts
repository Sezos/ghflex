import { expect, test } from 'vitest';
import { bannerLines, bannerRows, pickBanner } from '../../src/render/font.js';
import { width } from '../../src/render/spans.js';

test('BADRAL renders 6 rows of 48 columns', () => {
  const rows = bannerRows('BADRAL');
  expect(rows).not.toBeNull();
  expect(rows).toHaveLength(6);
  expect(rows?.[0]).toBe('██████╗  █████╗ ██████╗ ██████╗  █████╗ ██╗     ');
  expect(rows?.every((r) => r.length === 48)).toBe(true);
});

test('unsupported or too wide returns null', () => {
  expect(bannerRows('Бадрал')).toBeNull();
  expect(bannerRows('ABCDEFGHI')).toBeNull(); // 68 cols
});

test('fallback order: name, then login, then plain', () => {
  expect(pickBanner({ name: 'Badral', login: 'Sezos' })).toMatchObject({ kind: 'art', text: 'BADRAL' });
  expect(pickBanner({ name: 'Бадрал', login: 'Sezos' })).toMatchObject({ kind: 'art', text: 'SEZOS' });
  expect(pickBanner({ name: null, login: 'dev-42' })).toEqual({ kind: 'plain', text: 'DEV-42' });
});

test('override: A-Z and spaces only; too wide becomes plain', () => {
  expect(() => pickBanner({ name: 'x', login: 'y' }, 'hi!')).toThrow(/A–Z and spaces/);
  expect(pickBanner({ name: 'x', login: 'y' }, 'ship it')).toMatchObject({ kind: 'art', text: 'SHIP IT' });
  expect(pickBanner({ name: 'x', login: 'y' }, 'abcdefghi')).toEqual({ kind: 'plain', text: 'ABCDEFGHI' });
});

test('bannerLines are centered and colored', () => {
  const lines = bannerLines(pickBanner({ name: 'Badral', login: 'Sezos' }), 'neon');
  expect(lines).toHaveLength(6);
  expect(lines[0][0].text).toBe('    '); // (56-48)/2
  expect(lines.every((l) => width(l) <= 56)).toBe(true);
  expect(lines[5].filter((s) => s.text.trim()).every((s) => s.fg === 60)).toBe(true); // shadow row
});

test('a plain banner longer than the card is cut to 56 columns', () => {
  const lines = bannerLines({ kind: 'plain', text: 'X'.repeat(70) }, 'neon');
  expect(lines).toHaveLength(1);
  expect(width(lines[0])).toBe(56);
});
