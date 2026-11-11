import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { expect, test } from 'vitest';
import {
  type AuthDeps,
  AuthMissingError,
  deleteToken,
  promptForToken,
  readSavedToken,
  resolveToken,
  saveToken,
  TOKEN_URL,
  tokenPath,
} from '../../src/auth/token.js';

const deps = (o: Partial<AuthDeps> = {}): AuthDeps => ({
  env: {},
  ghToken: async () => null,
  readSaved: async () => null,
  prompt: null,
  validate: async () => true,
  save: async () => {},
  ...o,
});

test('env wins, then gh, then saved', async () => {
  expect(await resolveToken(deps({ env: { GITHUB_TOKEN: 'a' }, ghToken: async () => 'b' }))).toEqual({
    token: 'a',
    source: 'env',
  });
  expect(await resolveToken(deps({ env: { GH_TOKEN: 'a2' } }))).toEqual({ token: 'a2', source: 'env' });
  expect(await resolveToken(deps({ ghToken: async () => 'b', readSaved: async () => 'c' }))).toEqual({
    token: 'b',
    source: 'gh',
  });
  expect(await resolveToken(deps({ readSaved: async () => 'c' }))).toEqual({ token: 'c', source: 'saved' });
});

test('blank env vars are ignored', async () => {
  expect(await resolveToken(deps({ env: { GITHUB_TOKEN: '  ' }, ghToken: async () => 'b' }))).toEqual({
    token: 'b',
    source: 'gh',
  });
});

test('prompted token is validated then saved', async () => {
  let saved = '';
  expect(
    await resolveToken(
      deps({
        prompt: async () => 'p',
        save: async (t) => {
          saved = t;
        },
      }),
    ),
  ).toEqual({ token: 'p', source: 'prompt' });
  expect(saved).toBe('p');
  await expect(resolveToken(deps({ prompt: async () => 'bad', validate: async () => false }))).rejects.toBeInstanceOf(
    AuthMissingError,
  );
});

test('no token, no TTY: instructions mention gh auth login and the token URL', async () => {
  const e = await resolveToken(deps()).catch((x) => x);
  expect(e).toBeInstanceOf(AuthMissingError);
  expect(e.message).toContain('gh auth login');
  expect(e.message).toContain(TOKEN_URL);
});

test('tokenPath honors XDG and APPDATA', () => {
  expect(tokenPath({ XDG_CONFIG_HOME: '/x' }, 'linux', '/h')).toBe('/x/ghflex/token');
  expect(tokenPath({}, 'darwin', '/h')).toBe('/h/.config/ghflex/token');
  expect(tokenPath({ APPDATA: 'C:\\A' }, 'win32', 'C:\\h')).toBe('C:\\A\\ghflex\\token');
});

test.skipIf(process.platform === 'win32')('saveToken writes 0600 and deleteToken removes it', async () => {
  const p = join(tmpdir(), `ghflex-${Date.now()}`, 'token');
  await saveToken('s', p);
  expect((await stat(p)).mode & 0o777).toBe(0o600);
  expect(await readSavedToken(p)).toBe('s');
  expect(await deleteToken(p)).toBe(true);
  expect(await deleteToken(p)).toBe(false);
  expect(await readSavedToken(p)).toBeNull();
});

test('promptForToken reads hidden input: the token is never echoed', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: () => input });
  let shown = '';
  const output = {
    write: (s: string) => {
      shown += s;
      return true;
    },
  };
  const pending = promptForToken({ input: input as unknown as NodeJS.ReadStream, output });
  input.write('ghp_secret');
  input.write('X\u007f'); // typo, then backspace
  input.write('\r');
  expect(await pending).toBe('ghp_secret');
  expect(shown).toContain('gh auth login');
  expect(shown).toContain(TOKEN_URL);
  expect(shown).not.toContain('ghp_secret');
});

test('Ctrl-C at the token prompt cancels', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: () => input });
  const pending = promptForToken({ input: input as unknown as NodeJS.ReadStream, output: { write: () => true } });
  input.write('\u0003');
  await expect(pending).rejects.toBeInstanceOf(AuthMissingError);
});
