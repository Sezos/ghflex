import { expect, test } from 'vitest';
import { parseCliArgs, UsageError } from '../src/args.js';

test('defaults', () => {
  expect(parseCliArgs([])).toEqual({
    username: undefined,
    banner: undefined,
    hidePrivate: false,
    story: false,
    theme: 'neon',
    fast: false,
    clear: true,
    logout: false,
    help: false,
    version: false,
  });
});

test('parses username, theme, flags', () => {
  expect(parseCliArgs(['torvalds', '--theme', 'sunset', '--hide-private', '--no-clear'])).toMatchObject({
    username: 'torvalds',
    theme: 'sunset',
    hidePrivate: true,
    clear: false,
    story: false,
  });
  expect(parseCliArgs(['--banner', 'ship it']).banner).toBe('ship it');
  expect(parseCliArgs(['-h']).help).toBe(true);
  expect(parseCliArgs(['-v']).version).toBe(true);
  expect(parseCliArgs(['--story', '--fast', '--logout'])).toMatchObject({ story: true, fast: true, logout: true });
});

test('usage errors', () => {
  expect(() => parseCliArgs(['--theme', 'pink'])).toThrow(/neon, sunset, matrix/);
  expect(() => parseCliArgs(['a', 'b'])).toThrow(UsageError);
  expect(() => parseCliArgs(['--nope'])).toThrow(UsageError);
  expect(() => parseCliArgs(['--banner', 'hi!'])).toThrow(/A–Z and spaces/);
  expect(() => parseCliArgs(['not a user!'])).toThrow(/valid GitHub username/);
});
