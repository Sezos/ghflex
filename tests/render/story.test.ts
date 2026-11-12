import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { renderCard } from '../../src/render/card.js';
import { buildStorySvg, renderStoryPng, STORY_FONT_FILES, STORY_H, STORY_W } from '../../src/render/story.js';
import { emptyData, longNamesData, plain, richData } from '../fixtures/cards.js';

const opts = { theme: 'neon', hidePrivate: false, tagline: 'shipping > perfect' } as const;
const FONT = { family: 'DejaVu Sans Mono', advance: 0.6 };
const fontsPresent = STORY_FONT_FILES.every((u) => existsSync(fileURLToPath(u)));

test('svg is a 1080x1920 canvas with the dark background', () => {
  const svg = buildStorySvg([[{ text: 'x' }]], FONT);
  expect(STORY_W).toBe(1080);
  expect(STORY_H).toBe(1920);
  expect(svg).toMatch(/^<svg[^>]*width="1080"[^>]*height="1920"/);
  expect(svg).toContain('fill="#0b0d12"');
  expect(svg).toContain('#1b1035');
});

test('spans are positioned by column', () => {
  const svg = buildStorySvg([[{ text: 'ab' }, { text: 'c', fg: 213 }]], FONT);
  expect(svg).toMatch(/<text[^>]*fill="#ff87ff"[^>]*>c<\/text>/);
  const xs = [...svg.matchAll(/<text x="([\d.]+)"/g)].map((m) => Number(m[1]));
  expect(xs).toHaveLength(2);
  // 'c' starts two columns after 'ab'
  const fontSize = Math.min(960 / (56 * 0.6), 1800 / (1 * 1.28));
  expect(xs[1] - xs[0]).toBeCloseTo(2 * 0.6 * fontSize, 1);
});

test('dim spans get reduced opacity, bold uses the bold face, default color is light gray', () => {
  const svg = buildStorySvg(
    [
      [
        { text: 'x', dim: true },
        { text: 'y', bold: true },
      ],
    ],
    FONT,
  );
  expect(svg).toContain('fill-opacity="0.55"');
  expect(svg).toMatch(/<text[^>]*font-weight="bold"[^>]*>y<\/text>/);
  expect(svg).toContain('fill="#d0d0d0"');
});

test('text is escaped and whitespace-only spans are skipped', () => {
  const svg = buildStorySvg([[{ text: '   ' }, { text: 'a<b & "c"' }]], FONT);
  expect(svg).toContain('>a&lt;b &amp; "c"</text>');
  expect(svg.match(/<text /g)).toHaveLength(1);
});

test('a full card fits inside the canvas', () => {
  const svg = buildStorySvg(renderCard(richData(), opts), FONT);
  for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"/g)) {
    expect(Number(m[1])).toBeGreaterThanOrEqual(0);
    expect(Number(m[1])).toBeLessThan(STORY_W);
    expect(Number(m[2])).toBeGreaterThan(0);
    expect(Number(m[2])).toBeLessThan(STORY_H);
  }
});

// These two need the bundled DejaVu Sans Mono files in assets/fonts (added once the owner approves the download).
test.skipIf(!fontsPresent)('PNG is exactly 1080x1920', async () => {
  const png = await renderStoryPng(renderCard(richData(), opts));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1920);
});

test.skipIf(!fontsPresent)('every glyph used by fixture cards exists in the bundled fonts', async () => {
  // dev dependency added together with the fonts; a non-literal specifier keeps typecheck green until then
  const specifier = 'opentype.js';
  const opentype = (await import(specifier)) as {
    loadSync(path: string): { charToGlyphIndex(ch: string): number };
  };
  const fonts = STORY_FONT_FILES.map((u) => opentype.loadSync(fileURLToPath(u)));
  const chars = new Set([richData(), emptyData(), longNamesData()].flatMap((d) => plain(renderCard(d, opts))).join(''));
  for (const ch of chars) {
    if (ch !== ' ')
      expect(
        fonts.some((f) => f.charToGlyphIndex(ch) > 0),
        `missing ${ch}`,
      ).toBe(true);
  }
});

test.skipIf(fontsPresent)('without the bundled fonts, renderStoryPng fails with a clear message', async () => {
  await expect(renderStoryPng([[{ text: 'x' }]])).rejects.toThrow(/fonts/i);
});
