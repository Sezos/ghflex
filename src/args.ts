import { parseArgs } from 'node:util';
import type { ThemeName } from './types.js';

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export interface CliOptions {
  username?: string;
  banner?: string;
  hidePrivate: boolean;
  story: boolean;
  theme: ThemeName;
  fast: boolean;
  clear: boolean;
  logout: boolean;
  help: boolean;
  version: boolean;
}

const THEMES: ThemeName[] = ['neon', 'sunset', 'matrix'];
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const BANNER = /^[A-Za-z ]+$/;

export function parseCliArgs(argv: string[]): CliOptions {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e));
  }
  const { values, positionals } = parsed;

  if (positionals.length > 1) throw new UsageError('Give at most one GitHub username.');
  const username = positionals[0];
  if (username !== undefined && !GITHUB_LOGIN.test(username)) {
    throw new UsageError(`'${username}' isn't a valid GitHub username.`);
  }

  const theme = (values.theme ?? 'neon') as ThemeName;
  if (!THEMES.includes(theme))
    throw new UsageError(`Unknown theme '${values.theme}'. Pick one of: ${THEMES.join(', ')}.`);

  if (values.banner !== undefined && !BANNER.test(values.banner)) {
    throw new UsageError('--banner supports A–Z and spaces only.');
  }

  return {
    username,
    banner: values.banner,
    hidePrivate: Boolean(values['hide-private']),
    story: Boolean(values.story),
    theme,
    fast: Boolean(values.fast),
    clear: !values['no-clear'],
    logout: Boolean(values.logout),
    help: Boolean(values.help),
    version: Boolean(values.version),
  };
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      banner: { type: 'string' },
      'hide-private': { type: 'boolean' },
      story: { type: 'boolean' },
      theme: { type: 'string' },
      fast: { type: 'boolean' },
      'no-clear': { type: 'boolean' },
      logout: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
}
