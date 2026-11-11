import type { ThemeName } from '../types.js';

/** A run of text with one style. Colors are xterm-256 indices. */
export interface Span {
  text: string;
  fg?: number;
  bold?: boolean;
  dim?: boolean;
  blink?: boolean;
}

export type Line = Span[];

export const THEMES: Record<ThemeName, number[]> = {
  neon: [51, 45, 39, 33, 69, 105, 141, 177, 213, 219],
  sunset: [226, 220, 214, 208, 209, 204, 205, 206, 213, 219],
  matrix: [22, 28, 34, 40, 46, 47, 48, 84, 120, 157],
};

/** Visible width of a line: every character in the card is one column wide. */
export function width(line: Line): number {
  let n = 0;
  for (const span of line) n += [...span.text].length;
  return n;
}

export function toAnsi(line: Line, opts: { color: boolean }): string {
  let out = '';
  for (const s of line) {
    if (!opts.color) {
      out += s.text;
      continue;
    }
    let pre = '';
    if (s.bold) pre += '\x1b[1m';
    if (s.dim) pre += '\x1b[2m';
    if (s.blink) pre += '\x1b[5m';
    if (s.fg !== undefined) pre += `\x1b[38;5;${s.fg}m`;
    out += pre ? `${pre}${s.text}\x1b[0m` : s.text;
  }
  return out;
}

/** Color for position `i` of `n` across the theme's stops (same mapping as the prototype). */
export function gradientAt(theme: ThemeName, i: number, n: number): number {
  const stops = THEMES[theme];
  return stops[Math.min(stops.length - 1, Math.floor((i * stops.length) / Math.max(1, n)))];
}

const SYSTEM_COLORS = [
  '#000000',
  '#800000',
  '#008000',
  '#808000',
  '#000080',
  '#800080',
  '#008080',
  '#c0c0c0',
  '#808080',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#0000ff',
  '#ff00ff',
  '#00ffff',
  '#ffffff',
];
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];

const hex2 = (v: number) => v.toString(16).padStart(2, '0');

export function xterm256ToHex(n: number): string {
  if (n < 16) return SYSTEM_COLORS[n];
  if (n < 232) {
    const i = n - 16;
    const r = CUBE_LEVELS[Math.floor(i / 36)];
    const g = CUBE_LEVELS[Math.floor(i / 6) % 6];
    const b = CUBE_LEVELS[i % 6];
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }
  const v = 8 + 10 * (n - 232);
  return `#${hex2(v)}${hex2(v)}${hex2(v)}`;
}
