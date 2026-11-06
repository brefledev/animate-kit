// PUBLISHING: the departures board. Every rendered episode of every channel, ordered like a station board:
// moving now, then by departure time, then waiting, then what already left. A row opens its episode.
import { memo, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { useBatch, useBatchPlan, useJobs, useRefreshDrafts, useStudio } from '../api/queries';
import type { Channel } from '../api/types';
import { boardRows, STATE_TONE, STATE_WORD, type BoardRow } from '../lib/board';
import { PlatformIcon } from '../ui/PlatformIcon';
import { Select } from '../ui/Select';
import { day, errorText, time, when } from '../lib/words';
import { Flap } from '../ui/Flap';
import { Button, Lamp, Poster } from '../ui/controls';
import { Icon } from '../ui/Icon';

let cascaded = false;   // the board's one cascade per visit to the studio, not on every return

const shortTitle = (t: string) => t.split(' — ').at(-1) ?? t;

export function Board() {
  const { data, isLoading, error } = useStudio();
  const { mutate: checkDrafts } = useRefreshDrafts();
  useEffect(() => { checkDrafts(); }, [checkDrafts]);
  const jobs = useJobs();
  const [params, setParams] = useSearchParams();       // ?channel=<id>, so the filter survives opening an episode and coming back
  const wanted = params.get('channel');
  const filter = wanted && data?.channels.some(c => c.id === wanted) ? wanted : null;
  const setFilter = (id: string | null) => setParams(p => { const n = new URLSearchParams(p); if (id) n.set('channel', id); else n.delete('channel'); return n; }, { replace: true });
  const [planOpen, setPlanOpen] = useState(false);
  const intro = useState(() => { const first = !cascaded; cascaded = true; return first; })[0];

  const rows = useMemo(() => (data ? boardRows(data.pieces, data.channels, jobs) : []), [data, jobs]);
  const shown = filter ? rows.filter(r => r.row.channel === filter) : rows;
  const counts = useMemo(() => {
    const c = { scheduled: 0, ready: 0, 'needs-text': 0 } as Record<string, number>;
    for (const r of shown) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [shown]);
  const batchRunning = Object.values(jobs).some(j => j.kind === 'batch' && j.status === 'running');

  if (error) return <BoardMessage title="Connection error" text={errorText((error as Error).message)} tone="red" />;
  if (isLoading || !data) return <BoardSkeleton />;
  if (!data.channels.length) return <BoardMessage title="No channels" text="Add your first channel in publish/channels.json, then connect it in Channels." action={<Link to="/channels"><Button kind="primary" icon="arrow">Go to Channels</Button></Link>} />;

  const summary = [
    counts.scheduled ? `${counts.scheduled} scheduled` : null,
    counts.ready ? `${counts.ready} ready to publish` : null,
    counts['needs-text'] ? `${counts['needs-text']} need text` : null,
  ].filter(Boolean).join(' · ') || 'Nothing waiting to publish';

  return (
    <section aria-labelledby="board-title" className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="grid gap-3">
          <h1 id="board-title" className="sr-only">Publishing</h1>
          <Flap text="Publishing" size="lg" intro={intro} />
          <p className="font-cond text-[1.05rem] font-medium tracking-[0.04em] text-ink-2">{summary}</p>
        </div>
        <div className="flex items-center gap-3">
          <ChannelFilter channels={data.channels} rows={rows} value={filter} onChange={setFilter} />
          {batchRunning ? <span className="flex items-center gap-2 caps text-[0.8rem] text-amber"><Lamp tone="amber" blink /> Scheduling batch</span> : null}
          <Button kind="primary" icon="clock" disabled={!counts.ready || batchRunning} onClick={() => setPlanOpen(o => !o)} aria-expanded={planOpen}>
            Schedule ready episodes{counts.ready ? ` (${counts.ready})` : ''}
          </Button>
        </div>
      </div>


      <AnimatePresence initial={false}>
        {planOpen ? <BatchPlan key="plan" channel={filter} onClose={() => setPlanOpen(false)} /> : null}
      </AnimatePresence>

      <div className="overflow-x-auto rounded-xl border border-rule bg-[#141417]">
        <table className="w-full min-w-[880px] border-collapse">
          <caption className="sr-only">Episodes by publication time</caption>
          <thead>
            <tr className="border-b border-rule text-left">
              {['Time', 'Episode', 'Channel', 'Destination', 'Status'].map((h, i) => (
                <th key={h} scope="col" className={`px-4 py-3 text-[0.75rem] font-medium text-ink-3 ${i === 0 ? 'w-[8rem] pl-5' : i === 2 ? 'w-[11rem]' : i === 3 ? 'w-[8.5rem]' : i === 4 ? 'w-[10rem]' : ''}`}>{h}</th>
              ))}
              <th className="w-12" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {shown.length ? shown.map(r => <Row key={r.row.slug} r={r} />) : (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-[0.95rem] text-ink-3">This channel has no rendered episodes yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="font-cond text-[0.85rem] tracking-[0.04em] text-ink-3">
        Open an episode to edit its text and publish. Keys <kbd className="caps text-ink-2">1</kbd>, <kbd className="caps text-ink-2">2</kbd> and <kbd className="caps text-ink-2">3</kbd> switch screens.
      </p>
    </section>
  );
}

const DOT: Record<string, string> = {
  amber: 'bg-amber', red: 'bg-red', ink: 'bg-ink', dim: 'bg-transparent ring-1 ring-inset ring-ink-3', green: 'bg-[#5fd17a]',
};

const Row = memo(function Row({ r }: { r: BoardRow }) {
  const navigate = useNavigate();
  const href = `/ep/${r.row.slug}`;
  const tone = r.state === 'live' ? 'green' : STATE_TONE[r.state];
  const moving = r.state === 'uploading' || r.state === 'writing';
  const platforms = Object.entries(r.channel?.platforms ?? {});
  return (
    <tr onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) navigate(href); }}
      className="group cursor-pointer border-b border-rule/70 transition-colors last:border-b-0 hover:bg-white/[0.025]">
      <td className="py-3 pl-5 pr-4 align-middle">
        {r.at ? (
          <div className="grid gap-0.5 tabular-nums">
            <span className={`text-[1rem] font-semibold ${r.state === 'scheduled' ? 'text-amber' : 'text-ink'}`} aria-label={when(r.at)}>{time(r.at)}</span>
            <span className="text-[0.78rem] text-ink-3">{day(r.at)}</span>
          </div>
        ) : <span className="text-[0.85rem] text-ink-3">Unscheduled</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3.5">
          <Poster slug={r.row.slug} w={40} className="w-9 shrink-0 rounded-[4px]" />
          <div className="grid min-w-0 gap-0.5">
            <span className="text-[0.75rem] font-medium tabular-nums text-ink-3">{r.code}</span>
            <Link to={href} className="truncate text-[1rem] font-semibold leading-snug text-ink outline-offset-4">
              {shortTitle(r.row.title).replace(/^EP\d+:\s*/i, '')}
            </Link>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="truncate text-[0.9rem] text-ink-2">{r.channel?.name ?? '—'}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {platforms.map(([id, p]) => {
            const post = r.posts.find(x => x.platform === id);
            const ready = p.state === 'ready';
            const color = !ready ? 'text-ink-3/35' : post ? (post.status === 'scheduled' ? 'text-amber' : 'text-ink') : p.connected ? 'text-ink-2' : 'text-ink-3';
            const note = !ready ? 'planned' : post ? (post.status === 'scheduled' ? 'scheduled' : post.status === 'draft' ? 'draft in app' : 'sent') : p.connected ? 'connected, awaiting upload' : 'disconnected';
            return <PlatformIcon key={id} id={id} size={17} className={`shrink-0 ${color}`} title={`${p.label}: ${note}`} />;
          })}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="grid gap-1.5">
          <span className="flex items-center gap-2">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[tone]} ${moving ? 'lamp-blink' : ''}`} />
            <span className={`text-[0.9rem] font-medium ${tone === 'dim' ? 'text-ink-3' : tone === 'amber' ? 'text-amber' : tone === 'red' ? 'text-red' : 'text-ink'}`}>{STATE_WORD[r.state]}</span>
          </span>
          {r.progress !== null ? (
            <span className="relative h-[3px] w-full overflow-hidden rounded-full bg-flap" role="progressbar" aria-valuenow={Math.round(r.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload">
              <span className="absolute inset-y-0 left-0 bg-amber transition-[width] duration-500 ease-out" style={{ width: `${r.progress * 100}%` }} />
            </span>
          ) : r.state === 'private' ? <span className="text-[0.78rem] text-ink-3">Review visibility on the destination platform</span> : r.state === 'draft' ? <span className="text-[0.78rem] text-ink-3">Post in the TikTok app</span> : null}
        </div>
      </td>
      <td className="pr-5 text-ink-3 transition-colors group-hover:text-ink"><Icon name="arrow" size={16} /></td>
    </tr>
  );
});

function ChannelFilter({ channels, rows, value, onChange }: { channels: Channel[]; rows: BoardRow[]; value: string | null; onChange: (v: string | null) => void }) {
  const n = (id: string | null) => (id ? rows.filter(r => r.row.channel === id).length : rows.length);
  const options = [{ value: '', label: 'All', hint: n(null) }, ...channels.map(c => ({ value: c.id, label: c.name, hint: n(c.id) }))];
  return <Select label="Channel" value={value ?? ''} options={options} onChange={v => onChange(v || null)} className="w-[16rem]" />;
}

function BatchPlan({ channel, onClose }: { channel: string | null; onClose: () => void }) {
  const plan = useBatchPlan(true);
  const batch = useBatch();
  const items = (plan.data ?? []).filter(it => !channel || it.channel === channel);
  return (
    <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
      <div className="border border-amber/60 bg-flap-2 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 className="caps text-[1.05rem] text-amber">Each ready YouTube episode takes its channel’s next available slot</h2>
            <p className="text-[0.95rem] text-ink-2">Review the list. YouTube uploads run sequentially and remain private until their scheduled time. X and TikTok use immediate posting in each episode.</p>
          </div>
          <Button kind="quiet" size="sm" icon="x" onClick={onClose}>Close</Button>
        </div>
        <ul className="mt-4 grid gap-[3px]">
          {plan.isLoading ? <li className="flap-row px-4 py-3 text-ink-3">Calculating slots…</li> : null}
          {items.map(it => (
            <li key={it.slug} className="flap-row flex items-center gap-5 px-4 py-2.5">
              <Flap text={it.slug.replace(/^ep(\d+).*/i, 'EP$1').toUpperCase().slice(0, 4)} size="xs" tone="dim" />
              <span className="min-w-0 flex-1 truncate font-cond text-[1.05rem]">{shortTitle(it.title)}</span>
              {it.platforms.map(p => (
                <span key={p} className="flex items-center gap-2 font-cond text-[0.95rem] text-amber">
                  <PlatformIcon id={p} size={15} /> {it.at[p] ? when(it.at[p]!) : 'no available slot'}
                </span>
              ))}
            </li>
          ))}
        </ul>
        {batch.error ? <p className="mt-3 text-red">{errorText(batch.error.message)}</p> : null}
        <div className="mt-5 flex items-center gap-3">
          <Button kind="primary" icon="arrow" disabled={!items.length || batch.isPending} busy={batch.isPending}
            onClick={() => batch.mutate(items.map(i => i.slug), { onSuccess: onClose })}>
            Schedule {items.length} episode{items.length === 1 ? '' : 's'}
          </Button>
          <Button kind="quiet" onClick={onClose}>Later</Button>
        </div>
      </div>
    </m.div>
  );
}

function BoardMessage({ title, text, tone = 'ink', action }: { title: string; text: string; tone?: 'ink' | 'red'; action?: React.ReactNode }) {
  return (
    <div className="grid max-w-2xl gap-5 py-10">
      <Flap text={title} size="lg" tone={tone} />
      <p className="text-[1.1rem] leading-relaxed text-ink-2">{text}</p>
      {action}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading the board">
      <Flap text="Publishing" size="lg" tone="dim" />
      <div className="grid overflow-hidden rounded-xl border border-rule bg-[#141417]">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[76px] border-b border-rule/70 last:border-b-0" />)}
      </div>
    </div>
  );
}
