import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Out } from '../render/terminal.js';

export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,read:user&description=ghflex';

export interface TokenSource {
  token: string;
  source: 'env' | 'gh' | 'saved' | 'prompt';
}

export class AuthMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthMissingError';
  }
}

export interface AuthDeps {
  env: NodeJS.ProcessEnv;
  ghToken: () => Promise<string | null>;
  readSaved: () => Promise<string | null>;
  prompt: (() => Promise<string>) | null;
  validate: (t: string) => Promise<boolean>;
  save: (t: string) => Promise<void>;
}

const MISSING = `No GitHub login found. Run \`gh auth login\`, or create a token at ${TOKEN_URL} and set GITHUB_TOKEN.`;

export function tokenPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (platform === 'win32') {
    return path.win32.join(env.APPDATA || path.win32.join(home, 'AppData', 'Roaming'), 'ghflex', 'token');
  }
  return path.posix.join(env.XDG_CONFIG_HOME || path.posix.join(home, '.config'), 'ghflex', 'token');
}

const clean = (t: string | null | undefined) => (t ?? '').trim() || null;

/** GITHUB_TOKEN → GH_TOKEN → `gh auth token` → saved token → interactive prompt (validated, then saved). */
export async function resolveToken(d: AuthDeps): Promise<TokenSource> {
  const env = clean(d.env.GITHUB_TOKEN) ?? clean(d.env.GH_TOKEN);
  if (env) return { token: env, source: 'env' };
  const gh = clean(await d.ghToken());
  if (gh) return { token: gh, source: 'gh' };
  const saved = clean(await d.readSaved());
  if (saved) return { token: saved, source: 'saved' };
  if (!d.prompt) throw new AuthMissingError(MISSING);

  const typed = clean(await d.prompt());
  if (!typed || !(await d.validate(typed))) {
    throw new AuthMissingError(`That token didn't work. ${MISSING}`);
  }
  await d.save(typed);
  return { token: typed, source: 'prompt' };
}

export async function saveToken(token: string, file = tokenPath()): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${token}\n`, { mode: 0o600 });
  await chmod(file, 0o600); // in case the file already existed with wider permissions
}

export async function readSavedToken(file = tokenPath()): Promise<string | null> {
  try {
    return clean(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function deleteToken(file = tokenPath()): Promise<boolean> {
  try {
    await rm(file);
    return true;
  } catch {
    return false;
  }
}

export function ghCliToken(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'token'], { timeout: 5000 }, (err, stdout) => resolve(err ? null : clean(stdout)));
  });
}

/** Explains both login options, then reads a token with no echo. */
export function promptForToken(io: { input: NodeJS.ReadStream; output: Out }): Promise<string> {
  io.output.write(
    [
      '',
      '  ghflex needs read access to your GitHub account.',
      '',
      '  Easiest: install the GitHub CLI and run   gh auth login',
      '  Or create a token here and paste it below:',
      `    ${TOKEN_URL}`,
      `  (saved to ${tokenPath()}, readable only by you)`,
      '',
      '  Token (hidden): ',
    ].join('\n'),
  );

  return new Promise((resolve, reject) => {
    const input = io.input;
    const wasRaw = Boolean(input.isRaw);
    input.setRawMode?.(true);
    input.setEncoding('utf8');
    input.resume();
    let buf = '';

    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode?.(wasRaw);
      input.pause();
      io.output.write('\n');
    };
    function onData(chunk: string | Buffer) {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          resolve(buf.trim());
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          reject(new AuthMissingError('Cancelled.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1);
        else buf += ch;
      }
    }
    input.on('data', onData);
  });
}
