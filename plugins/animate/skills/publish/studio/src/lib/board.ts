// How episodes line up on the departures board: what's moving first, then by departure time, then what's waiting, then what left.
import type { Channel, PieceRow, PlatformId, Post } from '../api/types';
import { latestJob, type LiveJob } from '../api/events';

export type RowState = 'uploading' | 'scheduled' | 'ready' | 'needs-text' | 'needs-video' | 'live' | 'draft' | 'private' | 'failed' | 'writing';

export interface BoardRow {
  row: PieceRow;
  code: string;               // EP03
  channel: Channel | null;
  state: RowState;
  at: string | null;          // departure (scheduled) or departed (posted) time
  posts: Array<Post & { key: string }>;
  progress: number | null;    // 0..1 while uploading
}

export const codeOf = (slug: string) => {
  const m = /^ep(\d+)/i.exec(slug);
  return m ? `EP${m[1]!.padStart(2, '0')}` : slug.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase();
};

// a channel's board code: its own `code`, else the initials of its name (FDA), never more than 4
export const channelCode = (c: Channel | null | undefined) => {
  if (!c) return '—';
  const words = c.name.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map(w => w[0]).join('') : c.name.slice(0, 3)).slice(0, 4).toUpperCase();
};

const RANK: Record<RowState, number> = { uploading: 0, writing: 1, failed: 2, scheduled: 3, ready: 4, draft: 5, 'needs-text': 6, 'needs-video': 7, private: 8, 'live': 9 };

export function boardRows(pieces: PieceRow[], channels: Channel[], jobs: Record<string, LiveJob>): BoardRow[] {
  const byId = new Map(channels.map(c => [c.id, c]));
  const running = Object.values(jobs).filter(j => j.status === 'running');
  return pieces
    .filter(p => p.channel)
    .map((row): BoardRow => {
      const posts = Object.entries(row.posts).map(([key, p]) => ({ ...p, key }));
      const publication = latestJob(jobs, 'publish', row.slug);
      const up = publication?.status === 'running' ? publication : running.find(j => j.kind === 'batch' && j.events.at(-1)?.slug === row.slug);
      const writing = latestJob(jobs, 'words', row.slug)?.status === 'running';
      const newestPost = Math.max(0, ...posts.map(p => Date.parse(p.postedAt || '') || 0));
      const failed = publication?.status === 'failed' && newestPost <= (publication.endedAt ?? publication.startedAt);
      const scheduled = posts.filter(p => p.status === 'scheduled').map(p => p.publishAt!).sort()[0] ?? null;
      const posted = posts.filter(p => p.status === 'posted' || p.status === 'public' || p.status === 'unlisted' || p.status === 'friends' || p.status === 'followers').map(p => p.postedAt!).sort().at(-1) ?? null;
      const privateOnly = posts.some(p => p.status === 'private') && !scheduled && !posted;
      const draftOnly = posts.some(p => p.status === 'draft') && !scheduled && !posted;
      let state: RowState;
      if (up || posts.some(p => p.status === 'uploading')) state = 'uploading';
      else if (writing) state = 'writing';
      else if (failed) state = 'failed';
      else if (scheduled && row.todo.length === 0) state = 'scheduled';
      else if (posted && row.todo.length === 0) state = 'live';
      else if (privateOnly && row.todo.length === 0) state = 'private';
      else if (draftOnly && row.todo.length === 0) state = 'draft';
      else if (!row.render) state = 'needs-video';
      else state = row.meta ? 'ready' : 'needs-text';
      const at = state === 'scheduled' ? scheduled : state === 'live' || state === 'private' || state === 'draft' ? (posted ?? posts[0]?.postedAt ?? null) : null;
      const progress = up?.progress ? up.progress.sent / Math.max(1, up.progress.total) : null;
      return { row, code: codeOf(row.slug), channel: byId.get(row.channel!) ?? null, state, at, posts, progress };
    })
    .sort((a, b) => {
      if (RANK[a.state] !== RANK[b.state]) return RANK[a.state] - RANK[b.state];
      if (a.state === 'scheduled') return (a.at ?? '').localeCompare(b.at ?? '');
      if (a.state === 'live' || a.state === 'private') return (b.at ?? '').localeCompare(a.at ?? '');
      return a.row.slug.localeCompare(b.row.slug);
    });
}

export const STATE_WORD: Record<RowState, string> = {
  uploading: 'Uploading', writing: 'Writing', failed: 'Failed', scheduled: 'Scheduled', ready: 'Ready',
  'needs-text': 'Needs text', 'needs-video': 'Needs video', private: 'Private', 'live': 'Live', draft: 'Draft',
};
export const STATE_TONE: Record<RowState, 'ink' | 'amber' | 'red' | 'dim'> = {
  uploading: 'amber', writing: 'amber', failed: 'red', scheduled: 'amber', ready: 'ink', 'needs-text': 'dim', 'needs-video': 'dim', private: 'ink', 'live': 'ink', draft: 'ink',
};

export const PLATFORM_CODE: Record<PlatformId, string> = { youtube: 'YT', tiktok: 'TT', instagram: 'IG', x: 'X' };
