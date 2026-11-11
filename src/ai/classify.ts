import type { Bucket, CommitRecord } from '../types.js';
import signatures from './signatures.json' with { type: 'json' };

export interface Classification {
  bucket: Bucket;
  aiName: string | null;
}

interface Pattern {
  tool: string;
  re: RegExp;
}

const compile = (list: { tool: string; pattern: string }[]): Pattern[] =>
  list.map((p) => ({ tool: p.tool, re: new RegExp(p.pattern, 'im') }));

const COAUTHOR_EMAILS = compile(signatures.coauthorEmails);
const MESSAGE_MARKERS = compile(signatures.messageMarkers);
const AUTHOR_NAME_MARKERS = compile(signatures.authorNameMarkers);
const AGENT_AUTHORS = signatures.agentAuthors.map((a) => a.toLowerCase());

const TRAILER = /^co-authored-by:\s*(.+?)\s*<([^>]+)>/gim;

type Author = { authorName: string; authorEmail: string; authorLogin: string | null };

function agentEntry(a: Author): string | null {
  const haystacks = [a.authorName, a.authorEmail, a.authorLogin ?? ''].map((s) => s.toLowerCase());
  return AGENT_AUTHORS.find((entry) => haystacks.some((h) => h.includes(entry))) ?? null;
}

/** True when the commit author is a known AI agent account (bots often have no user login). */
export function isAgentAuthor(a: Author): boolean {
  return agentEntry(a) !== null;
}

/**
 * Buckets a commit by explicit AI signatures only.
 * Co-authors are matched by email, never by name, so humans called Claude or Devin stay "you".
 */
export function classifyCommit(
  c: Pick<CommitRecord, 'message' | 'authorName' | 'authorEmail' | 'authorLogin'>,
): Classification {
  const agent = agentEntry(c);
  if (agent) return { bucket: 'agent', aiName: agent.replace(/\[bot\]$/, '') };

  for (const m of c.message.matchAll(TRAILER)) {
    const [, name, email] = m;
    if (COAUTHOR_EMAILS.some((p) => p.re.test(email.trim()))) return { bucket: 'mixed', aiName: name.trim() };
  }

  const marker =
    MESSAGE_MARKERS.find((p) => p.re.test(c.message)) ?? AUTHOR_NAME_MARKERS.find((p) => p.re.test(c.authorName));
  if (marker) return { bucket: 'mixed', aiName: marker.tool };

  return { bucket: 'you', aiName: null };
}
