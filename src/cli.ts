#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { type AppDeps, run } from './app.js';
import { deleteToken, ghCliToken, promptForToken, readSavedToken, resolveToken, saveToken } from './auth/token.js';
import { createClient, GitHubError } from './github/client.js';
import { onInterrupt } from './render/terminal.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** A pasted token is only saved after GitHub accepts it. */
async function validateToken(token: string): Promise<boolean> {
  try {
    await createClient(token).query('query { viewer { login } }');
    return true;
  } catch (e) {
    if (e instanceof GitHubError && e.kind === 'auth') return false;
    throw e;
  }
}

const deps: AppDeps = {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  cwd: process.cwd(),
  now: () => new Date(),
  random: Math.random,
  getToken: () =>
    resolveToken({
      env: process.env,
      ghToken: ghCliToken,
      readSaved: () => readSavedToken(),
      prompt: interactive ? () => promptForToken({ input: process.stdin, output: process.stderr }) : null,
      validate: validateToken,
      save: (t) => saveToken(t),
    }),
  deleteSavedToken: () => deleteToken(),
  makeClient: (token) => createClient(token),
  renderStory: async (lines) => (await import('./render/story.js')).renderStoryPng(lines),
  writeFile: (path, data) => writeFile(path, data),
  version: pkg.version,
};

process.on('SIGINT', () => process.exit(onInterrupt(process.stdout, () => process.stderr.write('\r\x1b[K'))));
process.exitCode = await run(process.argv.slice(2), deps);
