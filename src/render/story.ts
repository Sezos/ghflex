import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Line, xterm256ToHex } from './spans.js';

export const STORY_W = 1080;
export const STORY_H = 1920;
/** Instagram draws the profile row over the top of a story and the reply bar over the bottom (Meta: ~250px). */
export const STORY_SAFE_Y = 250;

const COLUMNS = 56;
const LINE_HEIGHT = 1.28;
const MAX_TEXT_W = 960;
const MAX_TEXT_H = STORY_H - 2 * STORY_SAFE_Y;
const DEFAULT_FG = 252;

/** DejaVu Sans Mono: 1233/2048 em per column. Same file layout from src/ (tests) and dist/ (published). */
const STORY_FONT = { family: 'DejaVu Sans Mono', advance: 1233 / 2048 };
export const STORY_FONT_FILES = [
  new URL('../../assets/fonts/DejaVuSansMono.ttf', import.meta.url),
  new URL('../../assets/fonts/DejaVuSansMono-Bold.ttf', import.meta.url),
];

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n2 = (v: number) => Number(v.toFixed(2));

/** The card as an SVG story: every span placed at its exact column, on the dark glow background. */
export function buildStorySvg(lines: Line[], font: { family: string; advance: number }): string {
  const fontSize = Math.min(
    MAX_TEXT_W / (COLUMNS * font.advance),
    MAX_TEXT_H / (Math.max(1, lines.length) * LINE_HEIGHT),
  );
  const lineH = fontSize * LINE_HEIGHT;
  const colW = font.advance * fontSize;
  const left = (STORY_W - COLUMNS * colW) / 2;
  const top = (STORY_H - lines.length * lineH) / 2;

  const texts: string[] = [];
  lines.forEach((line, row) => {
    const y = top + row * lineH + fontSize * 0.85;
    let col = 0;
    for (const span of line) {
      const len = [...span.text].length;
      if (span.text.trim()) {
        const attrs = [
          `x="${n2(left + col * colW)}"`,
          `y="${n2(y)}"`,
          `fill="${xterm256ToHex(span.fg ?? DEFAULT_FG)}"`,
          span.dim ? 'fill-opacity="0.55"' : '',
          span.bold ? 'font-weight="bold"' : '',
        ].filter(Boolean);
        texts.push(`<text ${attrs.join(' ')}>${escapeXml(span.text)}</text>`);
      }
      col += len;
    }
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_W}" height="${STORY_H}" viewBox="0 0 ${STORY_W} ${STORY_H}">`,
    '<defs><radialGradient id="glow" cx="0" cy="0" r="1.1" gradientUnits="objectBoundingBox">',
    '<stop offset="0" stop-color="#1b1035"/><stop offset="0.55" stop-color="#0b0d12" stop-opacity="0"/>',
    '</radialGradient></defs>',
    `<rect width="${STORY_W}" height="${STORY_H}" fill="#0b0d12"/>`,
    `<rect width="${STORY_W}" height="${STORY_H}" fill="url(#glow)"/>`,
    `<g font-family="${escapeXml(font.family)}" font-size="${n2(fontSize)}" xml:space="preserve">`,
    ...texts,
    '</g>',
    '</svg>',
  ].join('');
}

/** Renders the story PNG with the bundled fonts only, so it looks the same on every machine. */
export async function renderStoryPng(
  lines: Line[],
  fontFiles: string[] = STORY_FONT_FILES.map((u) => fileURLToPath(u)),
): Promise<Buffer> {
  if (!fontFiles.every((f) => existsSync(f))) {
    throw new Error('The --story fonts are missing from this install (assets/fonts). Reinstall ghflex and try again.');
  }
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(buildStorySvg(lines, STORY_FONT), {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: STORY_FONT.family },
    fitTo: { mode: 'original' },
  });
  return resvg.render().asPng();
}
