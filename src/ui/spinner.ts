import type { Out } from '../render/terminal.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;
const PINK = '\x1b[38;5;213m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/** A one-line braille spinner. Does nothing unless enabled (default: the stream is a terminal). */
export function startSpinner(err: Out, message: string, enabled = Boolean(err.isTTY)): { stop(): void } {
  if (!enabled) return { stop() {} };
  let i = 0;
  const draw = () => {
    err.write(`\r  ${PINK}${FRAMES[i % FRAMES.length]}${RESET} ${DIM}${message}${RESET}`);
    i++;
  };
  draw();
  const timer = setInterval(draw, INTERVAL_MS);
  timer.unref?.();
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      err.write('\r\x1b[K');
    },
  };
}
