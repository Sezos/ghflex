import { expect, test } from 'vitest';
import { renderCard } from '../../src/render/card.js';
import { colorEnabled, onInterrupt, writeCard } from '../../src/render/terminal.js';
import { startSpinner } from '../../src/ui/spinner.js';
import { richData } from '../fixtures/cards.js';

const opts = { theme: 'neon', hidePrivate: false, tagline: 'shipping > perfect' } as const;

const sink = (isTTY = false) => {
  const out = {
    buf: '',
    isTTY,
    write(s: string) {
      out.buf += s;
      return true;
    },
  };
  return out;
};

test('REVIEW FOCUS: piped, no color: plain text, no escapes', async () => {
  const o = sink(false);
  await writeCard(renderCard(richData(), opts), o, { animate: false, clear: false, color: false });
  expect(o.buf).not.toMatch(/\x1b/);
  expect(o.buf.split('\n')[2].startsWith('  ')).toBe(true);
  expect(o.buf).toContain('npx ghflex');
});

test('colorEnabled', () => {
  expect(colorEnabled({ NO_COLOR: '1' }, true)).toBe(false);
  expect(colorEnabled({ FORCE_COLOR: '1' }, false)).toBe(true);
  expect(colorEnabled({}, false)).toBe(false);
  expect(colorEnabled({}, true)).toBe(true);
});

test('animated TTY output clears, hides, then restores cursor', async () => {
  const o = sink(true);
  await writeCard([[{ text: 'hi' }]], o, { animate: true, clear: true, color: true, delayMs: 0 });
  expect(o.buf.startsWith('\x1b[?25l\x1b[2J\x1b[H')).toBe(true);
  expect(o.buf.endsWith('\x1b[?25h')).toBe(true);
});

test('cursor is restored even if writing throws mid-reveal', async () => {
  let n = 0;
  const o = {
    buf: '',
    isTTY: true,
    write(s: string) {
      n++;
      if (n === 3) throw new Error('boom');
      o.buf += s;
      return true;
    },
  };
  await expect(
    writeCard([[{ text: 'a' }], [{ text: 'b' }]], o, { animate: true, clear: true, color: false, delayMs: 0 }),
  ).rejects.toThrow('boom');
  expect(o.buf.endsWith('\x1b[?25h')).toBe(true);
});

test('REVIEW FOCUS: interrupt restores cursor, cleans up, returns 130', () => {
  const o = sink(true);
  let cleaned = false;
  expect(
    onInterrupt(o, () => {
      cleaned = true;
    }),
  ).toBe(130);
  expect(o.buf).toContain('\x1b[?25h');
  expect(cleaned).toBe(true);
});

test('spinner is silent when not a TTY and clears its line on stop', () => {
  const o = sink(false);
  startSpinner(o, 'x').stop();
  expect(o.buf).toBe('');
  const t = sink(true);
  const s = startSpinner(t, 'fetching your greatness...');
  expect(t.buf).toContain('fetching your greatness...');
  s.stop();
  expect(t.buf.endsWith('\r\x1b[K')).toBe(true);
});
