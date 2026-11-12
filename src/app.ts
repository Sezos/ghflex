import { join } from 'node:path';
import { type CliOptions, parseCliArgs, UsageError } from './args.js';
import type { TokenSource } from './auth/token.js';
import type { GraphQLClient } from './github/client.js';
import { scanCommits } from './github/commits.js';
import { fetchIdentity, fetchProfile, type Target } from './github/profile.js';
import { fetchOwnedRepos } from './github/repos.js';
import { renderCard, TAGLINES } from './render/card.js';
import type { Line } from './render/spans.js';
import { colorEnabled, type Out, writeCard } from './render/terminal.js';
import type { CardData } from './types.js';
import { startSpinner } from './ui/spinner.js';

export interface AppDeps {
  stdout: Out;
  stderr: Out;
  env: NodeJS.ProcessEnv;
  cwd: string;
  now: () => Date;
  random: () => number;
  getToken: () => Promise<TokenSource>;
  deleteSavedToken: () => Promise<boolean>;
  makeClient: (token: string) => GraphQLClient;
  renderStory: (lines: Line[]) => Promise<Buffer>;
  writeFile: (path: string, data: Buffer) => Promise<void>;
  version: string;
}

export const HELP = `ghflex: your whole GitHub in one screenshot

usage
  npx ghflex                your card (includes private repos your token can see)
  npx ghflex <username>     someone else's card, public data only

options
  --banner "text"   custom banner text (A–Z and spaces)
  --hide-private    mask private repo names before you post
  --story           also save ghflex-story.png (1080×1920) for an Instagram story
  --theme <name>    color theme: neon (default), sunset, matrix
  --fast            skip the reveal animation
  --no-clear        don't clear the screen first
  --logout          delete the token ghflex saved
  -h, --help        show this help
  -v, --version     show the version
`;

const STORY_FILE = 'ghflex-story.png';

async function loadCardData(client: GraphQLClient, opts: CliOptions, now: Date): Promise<CardData> {
  const target: Target = opts.username ? { kind: 'user', login: opts.username } : { kind: 'viewer' };
  const who = await fetchIdentity(client, target);
  const ownedP = fetchOwnedRepos(client, target);
  const profileP = fetchProfile(client, target, now);
  // The scan starts right away: self mode doesn't need owned repos, and peek takes them as a promise.
  const scanP = scanCommits(client, target, who, target.kind === 'viewer' ? [] : ownedP, now);
  const [profile, ownedRepos, scan] = await Promise.all([profileP, ownedP, scanP]);
  return { mode: target.kind === 'viewer' ? 'self' : 'peek', profile, ownedRepos, scan, now };
}

export async function run(argv: string[], d: AppDeps): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCliArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    d.stderr.write(`ghflex: ${e.message}\nrun ghflex --help to see the options\n`);
    return 2;
  }

  if (opts.help) {
    d.stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    d.stdout.write(`${d.version}\n`);
    return 0;
  }
  if (opts.logout) {
    const removed = await d.deleteSavedToken();
    d.stdout.write(removed ? 'logged out: the saved token was deleted\n' : 'no saved token to delete\n');
    return 0;
  }

  let spinner = { stop() {} };
  try {
    const { token } = await d.getToken();
    const client = d.makeClient(token);
    spinner = startSpinner(d.stderr, 'fetching your greatness...', Boolean(d.stderr.isTTY) && !d.env.NO_COLOR);
    const data = await loadCardData(client, opts, d.now());
    spinner.stop();

    const tagline = TAGLINES[Math.floor(d.random() * TAGLINES.length) % TAGLINES.length];
    const lines = renderCard(data, { theme: opts.theme, hidePrivate: opts.hidePrivate, banner: opts.banner, tagline });
    const tty = Boolean(d.stdout.isTTY);
    const color = colorEnabled(d.env, tty);
    // clearing and the reveal are escape codes too, so NO_COLOR turns them off as well
    await writeCard(lines, d.stdout, { color, animate: tty && color && !opts.fast, clear: tty && color && opts.clear });

    if (opts.story) {
      const png = await d.renderStory(lines);
      await d.writeFile(join(d.cwd, STORY_FILE), png);
      d.stdout.write(`  saved ${STORY_FILE} (1080×1920)\n`);
    }
    return 0;
  } catch (e) {
    spinner.stop();
    d.stderr.write(`ghflex: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}
