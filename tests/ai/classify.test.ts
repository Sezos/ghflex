import { expect, test } from 'vitest';
import { classifyCommit, isAgentAuthor } from '../../src/ai/classify.js';

const me = { authorName: 'Badral', authorEmail: 'b@x.com', authorLogin: 'Sezos' };
const msg = (trailer: string) => `feat: thing\n\n${trailer}`;

test('Claude Code trailer is mixed and keeps the model name', () => {
  expect(classifyCommit({ ...me, message: msg('Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>') })).toEqual({
    bucket: 'mixed',
    aiName: 'Claude Opus 5.5',
  });
});

test('generated-with marker alone is mixed', () => {
  expect(
    classifyCommit({ ...me, message: msg('🤖 Generated with [Claude Code](https://claude.com/claude-code)') }),
  ).toEqual({ bucket: 'mixed', aiName: 'Claude Code' });
});

test('Cursor and Copilot trailers', () => {
  expect(classifyCommit({ ...me, message: msg('Co-authored-by: Cursor Agent <cursoragent@cursor.com>') }).aiName).toBe(
    'Cursor Agent',
  );
  expect(
    classifyCommit({ ...me, message: msg('Co-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>') })
      .bucket,
  ).toBe('mixed');
});

test('aider author-name marker', () => {
  expect(classifyCommit({ ...me, authorName: 'Badral (aider)', message: 'fix' })).toEqual({
    bucket: 'mixed',
    aiName: 'aider',
  });
});

test('agent authors are agent; bots have no user login', () => {
  const bot = {
    authorName: 'copilot-swe-agent[bot]',
    authorEmail: '198982749+Copilot@users.noreply.github.com',
    authorLogin: null,
  };
  expect(classifyCommit({ ...bot, message: 'Fix bug' })).toEqual({ bucket: 'agent', aiName: 'copilot-swe-agent' });
  expect(isAgentAuthor(bot)).toBe(true);
  expect(isAgentAuthor(me)).toBe(false);
});

test('REVIEW FOCUS: humans named like AI tools stay you', () => {
  for (const t of [
    'Co-authored-by: Claude Dupont <claude.dupont@gmail.com>',
    'Co-authored-by: Devin Smith <devin@acme.io>',
    'Co-authored-by: Jules Martin <jules@acme.io>',
  ]) {
    expect(classifyCommit({ ...me, message: msg(t) })).toEqual({ bucket: 'you', aiName: null });
  }
});

test('plain commit is you', () => {
  expect(classifyCommit({ ...me, message: 'refactor: tidy' })).toEqual({ bucket: 'you', aiName: null });
});
