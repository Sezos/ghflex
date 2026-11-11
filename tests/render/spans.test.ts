import { expect, test } from 'vitest';
import { gradientAt, THEMES, toAnsi, width, xterm256ToHex } from '../../src/render/spans.js';

test('width counts visible characters only', () => {
  expect(width([{ text: 'ab', fg: 51, bold: true }, { text: '█▰…' }])).toBe(5);
});

test('toAnsi emits bold, dim, blink, then color, and resets after styled spans', () => {
  expect(toAnsi([{ text: 'hi', fg: 213, bold: true }, { text: ' x' }], { color: true })).toBe(
    '\x1b[1m\x1b[38;5;213mhi\x1b[0m x',
  );
  expect(toAnsi([{ text: 'a', dim: true, blink: true }], { color: true })).toBe('\x1b[2m\x1b[5ma\x1b[0m');
});

test('toAnsi without color is plain text', () => {
  expect(toAnsi([{ text: 'hi', fg: 213, blink: true }], { color: false })).toBe('hi');
});

test('themes', () => {
  expect(THEMES.neon).toEqual([51, 45, 39, 33, 69, 105, 141, 177, 213, 219]);
  expect(THEMES.sunset).toEqual([226, 220, 214, 208, 209, 204, 205, 206, 213, 219]);
  expect(THEMES.matrix).toEqual([22, 28, 34, 40, 46, 47, 48, 84, 120, 157]);
});

test('gradientAt spans first to last stop', () => {
  expect(gradientAt('neon', 0, 48)).toBe(51);
  expect(gradientAt('neon', 47, 48)).toBe(219);
});

test('xterm256ToHex', () => {
  expect(xterm256ToHex(16)).toBe('#000000');
  expect(xterm256ToHex(213)).toBe('#ff87ff');
  expect(xterm256ToHex(244)).toBe('#808080');
  expect(xterm256ToHex(1)).toBe('#800000');
});
