import type { ThemeName } from '../types.js';
import { gradientAt, type Line, type Span, THEMES } from './spans.js';

const CARD_WIDTH = 56;
const SHADOW_COLOR = 60;

// ANSI Shadow, A–Z. Each glyph: its letter on one line, then 6 rows.
const FONT_SRC = `
A
 █████╗
██╔══██╗
███████║
██╔══██║
██║  ██║
╚═╝  ╚═╝
B
██████╗
██╔══██╗
██████╔╝
██╔══██╗
██████╔╝
╚═════╝
C
 ██████╗
██╔════╝
██║
██║
╚██████╗
 ╚═════╝
D
██████╗
██╔══██╗
██║  ██║
██║  ██║
██████╔╝
╚═════╝
E
███████╗
██╔════╝
█████╗
██╔══╝
███████╗
╚══════╝
F
███████╗
██╔════╝
█████╗
██╔══╝
██║
╚═╝
G
 ██████╗
██╔════╝
██║  ███╗
██║   ██║
╚██████╔╝
 ╚═════╝
H
██╗  ██╗
██║  ██║
███████║
██╔══██║
██║  ██║
╚═╝  ╚═╝
I
██╗
██║
██║
██║
██║
╚═╝
J
     ██╗
     ██║
     ██║
██   ██║
╚█████╔╝
 ╚════╝
K
██╗  ██╗
██║ ██╔╝
█████╔╝
██╔═██╗
██║  ██╗
╚═╝  ╚═╝
L
██╗
██║
██║
██║
███████╗
╚══════╝
M
███╗   ███╗
████╗ ████║
██╔████╔██║
██║╚██╔╝██║
██║ ╚═╝ ██║
╚═╝     ╚═╝
N
███╗   ██╗
████╗  ██║
██╔██╗ ██║
██║╚██╗██║
██║ ╚████║
╚═╝  ╚═══╝
O
 ██████╗
██╔═══██╗
██║   ██║
██║   ██║
╚██████╔╝
 ╚═════╝
P
██████╗
██╔══██╗
██████╔╝
██╔═══╝
██║
╚═╝
Q
 ██████╗
██╔═══██╗
██║   ██║
██║▄▄ ██║
╚██████╔╝
 ╚══▀▀═╝
R
██████╗
██╔══██╗
██████╔╝
██╔══██╗
██║  ██║
╚═╝  ╚═╝
S
███████╗
██╔════╝
███████╗
╚════██║
███████║
╚══════╝
T
████████╗
╚══██╔══╝
   ██║
   ██║
   ██║
   ╚═╝
U
██╗   ██╗
██║   ██║
██║   ██║
██║   ██║
╚██████╔╝
 ╚═════╝
V
██╗   ██╗
██║   ██║
██║   ██║
╚██╗ ██╔╝
 ╚████╔╝
  ╚═══╝
W
██╗    ██╗
██║    ██║
██║ █╗ ██║
██║███╗██║
╚███╔███╔╝
 ╚══╝╚══╝
X
██╗  ██╗
╚██╗██╔╝
 ╚███╔╝
 ██╔██╗
██╔╝ ██╗
╚═╝  ╚═╝
Y
██╗   ██╗
╚██╗ ██╔╝
 ╚████╔╝
  ╚██╔╝
   ██║
   ╚═╝
Z
███████╗
╚══███╔╝
  ███╔╝
 ███╔╝
███████╗
╚══════╝
`;

function loadFont(): Map<string, string[]> {
  const lines = FONT_SRC.replace(/^\n+|\n+$/g, '').split('\n');
  const font = new Map<string, string[]>();
  for (let i = 0; i < lines.length; i += 7) {
    const rows = lines.slice(i + 1, i + 7);
    const w = Math.max(...rows.map((r) => r.length));
    font.set(
      lines[i],
      rows.map((r) => r.padEnd(w)),
    );
  }
  font.set(' ', Array(6).fill('   '));
  return font;
}

const FONT = loadFont();

export type BannerChoice = { kind: 'art'; text: string; rows: string[] } | { kind: 'plain'; text: string };

/** Six rows of block letters, or null if a character isn't in the font or the result is wider than the card. */
export function bannerRows(text: string): string[] | null {
  const chars = [...text.toUpperCase()];
  if (!text.trim() || chars.some((ch) => !FONT.has(ch))) return null;
  const rows = Array.from({ length: 6 }, (_, i) => chars.map((ch) => FONT.get(ch)?.[i] ?? '').join(''));
  return rows[0].length > CARD_WIDTH ? null : rows;
}

const OVERRIDE_OK = /^[A-Za-z ]+$/;

/** Banner from an override, else the display name, else the login, else plain text. */
export function pickBanner(p: { name: string | null; login: string }, override?: string): BannerChoice {
  if (override !== undefined) {
    if (!OVERRIDE_OK.test(override)) throw new Error('--banner supports A–Z and spaces only');
    const text = override.toUpperCase();
    const rows = bannerRows(text);
    return rows ? { kind: 'art', text, rows } : { kind: 'plain', text };
  }
  for (const candidate of [p.name, p.login]) {
    if (!candidate) continue;
    const text = candidate.toUpperCase();
    const rows = bannerRows(text);
    if (rows) return { kind: 'art', text, rows };
  }
  return { kind: 'plain', text: p.login.toUpperCase() };
}

function padLeft(contentWidth: number): Span[] {
  const n = Math.max(0, Math.floor((CARD_WIDTH - contentWidth) / 2));
  return n ? [{ text: ' '.repeat(n) }] : [];
}

export function bannerLines(choice: BannerChoice, theme: ThemeName): Line[] {
  if (choice.kind === 'plain') {
    const text = [...choice.text].slice(0, CARD_WIDTH).join('');
    return [[...padLeft([...text].length), { text, bold: true, fg: THEMES[theme][8] }]];
  }
  const w = choice.rows[0].length;
  return choice.rows.map((row, r) => {
    const line: Line = padLeft(w);
    let current: Span | null = null;
    [...row].forEach((ch, col) => {
      const fg = ch === ' ' ? undefined : '█▄▀'.includes(ch) ? gradientAt(theme, col + r * 2, w + 10) : SHADOW_COLOR;
      if (current && current.fg === fg) current.text += ch;
      else {
        current = fg === undefined ? { text: ch } : { text: ch, fg };
        line.push(current);
      }
    });
    return line;
  });
}
