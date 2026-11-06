import { useEffect, useState } from 'react';
import { useCancel, useConnect, useJobFor, useRefreshProfiles, useSaveTikTokApp, useSaveXApp, useStudio } from '../api/queries';
import type { Channel, PlatformId } from '../api/types';
import { errorText } from '../lib/words';
import { Flap } from '../ui/Flap';
import { Button, Field, Lamp, inputClass } from '../ui/controls';
import { PlatformIcon } from '../ui/PlatformIcon';

export function Channels() {
  const { data, error } = useStudio();
  const { mutate: refresh } = useRefreshProfiles();
  useEffect(() => { refresh(); }, [refresh]);
  return <section className="grid gap-8" aria-label="Channels">
    <h1><Flap text="Channels" size="lg" /></h1>
    <p className="text-ink-2">Connect each destination and review the account shown before publishing. Add channel profiles in your project’s publish/channels.json.</p>
    {error ? <p role="alert">{errorText(error.message)}</p> : null}
    {!data ? <p>Loading channels…</p> : data.channels.map(c => <article key={c.id} className="grid gap-5 rounded-lg border border-rule bg-flap-2 p-6">
      <h2 className="text-2xl font-semibold">{c.name}</h2>
      <p className="text-ink-2">{c.audience}</p><p className="text-ink-3">{c.voice}</p>
      <p>Language: {c.language || 'English'} · YouTube schedule: {c.schedule.join(', ') || 'Choose a time per post'}</p>
      <ul className="grid gap-4">{Object.entries(c.platforms).map(([id, p]) => <PlatformRow key={id} channel={c} id={id as PlatformId} p={p!} />)}</ul>
    </article>)}
  </section>;
}
function PlatformRow({ channel, id, p }: { channel: Channel; id: PlatformId; p: NonNullable<Channel['platforms'][PlatformId]> }) {
  const connect = useConnect(), cancel = useCancel();
  const job = useJobFor('connect', `${channel.id}/${id}`);
  const [setup, setSetup] = useState(false);
  const busy = job?.status === 'running' || connect.isPending;
  const needsApp = p.needs.includes('x-app') || p.needs.includes('tiktok-app');
  const url = job?.events.filter(e => e.type === 'signin-url').at(-1)?.url;
  return <li className="grid gap-3 rounded border border-rule p-4">
    <div className="flex flex-wrap items-center gap-3">
      <PlatformIcon id={id} title={p.label} /><strong>{p.label}</strong>
      <Lamp tone={p.needs.includes('wrong-channel') ? 'red' : p.connected ? 'green' : 'amber'} blink={busy} />
      <span>{p.state !== 'ready' ? 'Planned' : p.connected?.title || 'Connect an account'}</span>
      {p.state === 'ready' && !needsApp ? <Button size="sm" className="ml-auto" disabled={busy} busy={busy} onClick={() => connect.mutate({ channel: channel.id, platform: id })}>{p.connected ? 'Reconnect' : 'Connect'}</Button> : null}
      {(id === 'x' || id === 'tiktok') && !busy ? <Button size="sm" kind="quiet" onClick={() => setSetup(v => !v)}>App settings</Button> : null}
    </div>
    {p.needs.includes('wrong-channel') ? <p className="text-red">Reconnect the intended account to update this channel’s saved destination.</p> : null}
    {busy ? <div className="flex flex-wrap gap-3"><span>Complete sign-in in your browser.</span>{typeof url === 'string' ? <a href={url} target="_blank" rel="noreferrer" className="text-amber underline">Open sign-in</a> : null}<Button size="sm" onClick={() => job && cancel.mutate(job.id)}>Cancel</Button></div> : null}
    {job?.status === 'failed' || connect.error ? <p role="alert" className="text-red">{errorText(job?.error || connect.error?.message)}</p> : null}
    {id === 'youtube' && p.needs.includes('google-key') ? <p>Download the Google OAuth Desktop app client JSON to Downloads. See docs/connect-youtube.md.</p> : null}
    {id === 'youtube' && p.madeForKids === null ? <p>Set the channel’s madeForKids declaration before publishing.</p> : null}
    {id === 'x' ? <p className="text-sm text-ink-3">X posts publish immediately with your account’s visibility. Compatibility target: 140 seconds, 512 MiB, H.264 MP4. API access and charges depend on your developer account. See docs/connect-x.md.</p> : null}
    {(id === 'x' || id === 'tiktok') && (needsApp || setup) ? <AppSetup platform={id} onSaved={() => setSetup(false)} /> : null}
  </li>;
}
function AppSetup({ platform, onSaved }: { platform: 'x' | 'tiktok'; onSaved: () => void }) {
  const x = useSaveXApp(), tt = useSaveTikTokApp();
  const [key, setKey] = useState(''), [secret, setSecret] = useState('');
  const [redirect, setRedirect] = useState('http://127.0.0.1:4748/callback');
  const busy = x.isPending || tt.isPending;
  const saved = () => { setKey(''); setSecret(''); onSaved(); };
  return <form className="grid gap-3" autoComplete="off" onSubmit={e => {
    e.preventDefault();
    if (platform === 'x') x.mutate({ clientId: key, clientSecret: secret, redirectUri: redirect }, { onSuccess: saved });
    else tt.mutate({ clientKey: key, clientSecret: secret }, { onSuccess: saved });
  }}>
    {platform === 'x' ? <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
      <li>Open the <a className="text-amber underline" href="https://developer.x.com/" target="_blank" rel="noreferrer">X developer console</a>, select your app, and enable OAuth 2.0 with Read and write permissions.</li>
      <li>A Native App uses a Client ID and PKCE. A confidential Web App also uses its Client secret. Register the exact callback URL shown below.</li>
      <li>Save settings, choose Connect, and approve tweet.read, tweet.write, users.read, media.write and offline.access in X.</li>
    </ol> : <p className="text-sm">Create an app at <a href="https://developers.tiktok.com/apps/" target="_blank" rel="noreferrer" className="text-amber underline">TikTok for Developers</a>. Enable Login Kit, Content Posting API and Display API. Add your account as a sandbox target user. Follow docs/connect-tiktok.md to configure your HTTPS callback and legal pages.</p>}
    <Field label={platform === 'x' ? 'OAuth 2.0 Client ID' : 'Client key'} htmlFor={`${platform}-key`}><input id={`${platform}-key`} className={inputClass} value={key} onChange={e => setKey(e.target.value)} autoComplete="off" required /></Field>
    <Field label={platform === 'x' ? 'Client secret (confidential apps only)' : 'Client secret'} htmlFor={`${platform}-secret`}><input id={`${platform}-secret`} type="password" className={inputClass} value={secret} onChange={e => setSecret(e.target.value)} autoComplete="new-password" /></Field>
    {platform === 'x' ? <Field label="Registered callback URL" htmlFor="x-redirect"><input id="x-redirect" className={inputClass} value={redirect} onChange={e => setRedirect(e.target.value)} required /></Field> : null}
    <p className="text-sm text-ink-3">Settings and tokens are stored in your local secrets directory. Saved secrets remain hidden in this form.</p>
    <Button type="submit" disabled={!key.trim() || (platform === 'tiktok' && !secret.trim()) || busy} busy={busy}>Save app settings</Button>
    {x.error || tt.error ? <p role="alert" className="text-red">{errorText(x.error?.message || tt.error?.message)}</p> : null}
  </form>;
}
