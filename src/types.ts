export type ThemeName = 'neon' | 'sunset' | 'matrix';

export type Bucket = 'you' | 'mixed' | 'agent';

/** One day of the contribution calendar. `date` is `YYYY-MM-DD`. */
export interface Day {
  date: string;
  count: number;
}

export interface Repo {
  nameWithOwner: string;
  name: string;
  isPrivate: boolean;
  isFork: boolean;
  pushedAt: string;
  primaryLanguage: string | null;
}

export interface CommitRecord {
  repo: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorLogin: string | null;
  committedDate: string;
  byUser: boolean;
}

export interface Profile {
  id: string;
  login: string;
  name: string | null;
  createdAt: string;
  calendar: Day[];
  pastYearTotal: number;
  allTimeTotal: number;
}

export interface ScanResult {
  commits: CommitRecord[];
  scannedRepos: Repo[];
  capped: boolean;
}

export interface CardData {
  mode: 'self' | 'peek';
  profile: Profile;
  ownedRepos: Repo[];
  scan: ScanResult;
  now: Date;
}

export interface CardOptions {
  theme: ThemeName;
  hidePrivate: boolean;
  banner?: string;
  tagline: string;
}
