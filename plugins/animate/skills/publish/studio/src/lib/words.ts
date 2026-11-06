import type { Issue, PieceRow, PlatformId, Post } from '../api/types';
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: '2-digit', month: 'short', timeZone: tz });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz });
const longFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: tz });
export const day = (d: string | Date) => dayFmt.format(new Date(d));
export const time = (d: string | Date) => timeFmt.format(new Date(d));
export const when = (d: string | Date) => `${day(d)} · ${time(d)}`;
export const whenLong = (d: string | Date) => longFmt.format(new Date(d));
export function relative(d: string | Date): string {
  const ms = new Date(d).getTime() - Date.now(), abs = Math.abs(ms);
  const m = Math.round(abs / 60e3), h = Math.round(abs / 3600e3), days = Math.round(abs / 86400e3);
  const s = m < 60 ? `${m} min` : h < 36 ? `${h} h` : `${days} days`;
  return ms < 0 ? `${s} ago` : `in ${s}`;
}
export const mb = (n: number) => `${Math.round(n / 2 ** 20)} MiB`;
export const secs = (n: number) => `${Math.round(n)} s`;
export const count = (n: number | null) => n == null ? '—' : new Intl.NumberFormat('en-US', { notation: n >= 10_000 ? 'compact' : 'standard' }).format(n);
export const PLATFORM: Record<PlatformId, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', x: 'X' };
export type Stage = 'posted' | 'needs-render' | 'needs-text' | 'ready' | 'uploading' | 'scheduled' | 'live' | 'private' | 'unlisted';
export function stageOf(row: PieceRow, platform: PlatformId): Stage {
  const post: Post | undefined = row.channel ? row.posts[`${row.channel}/${platform}`] : undefined;
  if (post?.status === 'uploading') return 'uploading';
  if (post?.status === 'scheduled') return 'scheduled';
  if (post?.status === 'posted') return 'posted';
  if (post?.status === 'public') return 'live';
  if (post?.status === 'private') return 'private';
  if (post?.status === 'unlisted') return 'unlisted';
  if (!row.render) return 'needs-render';
  return row.meta ? 'ready' : 'needs-text';
}
export const STAGE: Record<Stage, string> = { posted: 'Posted', 'needs-render': 'Needs video', 'needs-text': 'Needs text', ready: 'Ready', uploading: 'Uploading', scheduled: 'Scheduled', 'live': 'Live', private: 'Private', 'unlisted': 'Unlisted' };
export const issueText = (i: Issue): string => i.text;
export function errorText(msg: string | null | undefined): string {
  if (!msg) return 'Something went wrong.';
  if (msg.startsWith('NEEDS_X_APP')) return 'Set up your X developer app in Channels → X.';
  if (msg.startsWith('NEEDS_X_RECONNECT')) return 'Reconnect X in Channels and allow the requested permissions.';
  if (msg.startsWith('X_OUTCOME_UNKNOWN')) return 'X may have received this post. Check your X profile before retrying. See the X connection guide for recovery.';
  if (msg.startsWith('NEEDS_TIKTOK_APP')) return 'Set up your TikTok developer app in Channels → TikTok.';
  if (msg.startsWith('NEEDS_GOOGLE_KEY')) return 'Download the Google Desktop app client JSON to Downloads, then connect YouTube.';
  if (msg.startsWith('NEEDS_LOGIN')) return 'Sign in to Claude Code on this computer to use the writing button.';
  if (msg.startsWith('NEEDS_RECONNECT')) return 'Reconnect YouTube with permission to manage videos.';
  if (/studio token/i.test(msg)) return 'Open Studio from its authenticated startup link.';
  if (/SIGNIN_TIMEOUT/.test(msg)) return 'Sign-in timed out. Choose Connect to start again.';
  if (/cancelled/i.test(msg)) return 'Cancelled. Review the saved upload before trying again.';
  return msg;
}
