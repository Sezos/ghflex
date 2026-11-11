import { type Line, toAnsi } from './spans.js';

export interface Out {
  write(s: string): unknown;
  isTTY?: boolean;
}

export interface OutputOptions {
  animate: boolean;
  clear: boolean;
  color: boolean;
  delayMs?: number;
}

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_SCREEN = '\x1b[2J\x1b[H';
const MARGIN = '  ';

/** NO_COLOR wins, then FORCE_COLOR, otherwise color only on a terminal. */
export function colorEnabled(env: NodeJS.ProcessEnv, isTTY: boolean): boolean {
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return isTTY;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Writes the card with a 2-space margin; optionally clears first and reveals it line by line. */
export async function writeCard(lines: Line[], out: Out, o: OutputOptions): Promise<void> {
  const delay = o.delayMs ?? 25;
  try {
    if (o.animate) out.write(HIDE_CURSOR);
    if (o.clear) out.write(CLEAR_SCREEN);
    for (const line of lines) {
      out.write(`${MARGIN}${toAnsi(line, { color: o.color })}\n`);
      if (o.animate && delay > 0) await sleep(delay);
    }
  } finally {
    if (o.animate) out.write(SHOW_CURSOR);
  }
}

/** Ctrl-C handler body: bring the cursor back, run cleanup, and return the conventional exit code. */
export function onInterrupt(out: Out, cleanup: () => void): number {
  out.write(SHOW_CURSOR);
  cleanup();
  return 130;
}
