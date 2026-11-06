// TikTok, per post. Draft: the video waits in the app inbox. Direct: it goes straight to the profile, and TikTok's Direct
// Post rules apply (docs/connect-tiktok.md): the account's own nickname shown, its current privacy options with none
// picked, every interaction off until the user turns it on, the commercial-content disclosure, and the consent line.
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { errorText } from '../lib/words';
import { inputClass } from '../ui/controls';

export interface TikTokChoices {
  mode: 'draft' | 'direct';
  privacy: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  disclose: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
  aigc: boolean;
}

export const TIKTOK_START: TikTokChoices = {
  mode: 'draft', privacy: '', allowComment: false, allowDuet: false, allowStitch: false, disclose: false, yourBrand: false, brandedContent: false, aigc: false,
};

const PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Mutual followers',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me',
};

export const useTikTokCreator = (channel: string, enabled: boolean) => useQuery({
  queryKey: ['tiktok-creator', channel], enabled, staleTime: 0, gcTime: 60_000, retry: false,
  queryFn: ({ signal }) => api.tiktokCreator(channel, signal),
});

// why the Publish button stays off (null = ready)
export function tiktokBlock(c: TikTokChoices, info: { privacy: string[]; maxSeconds: number | null } | undefined, seconds: number | null): string | null {
  if (c.mode === 'draft') return null;
  if (!info) return 'Waiting for this account’s TikTok settings.';
  if (!c.privacy) return 'Choose who can see the TikTok video.';
  if (c.disclose && !c.yourBrand && !c.brandedContent) return 'Choose whether this content promotes your business, another business, or both.';
  if (c.disclose && c.brandedContent && c.privacy === 'SELF_ONLY') return 'Branded content requires a compatible public visibility setting.';
  if (info.maxSeconds && seconds && seconds > info.maxSeconds) return `This TikTok account accepts videos up to ${info.maxSeconds} s; this video is ${Math.round(seconds)} s.`;
  return null;
}

export function TikTokPost({ channel, value, onChange, seconds }: { channel: string; value: TikTokChoices; onChange: (v: TikTokChoices) => void; seconds: number | null }) {
  const direct = value.mode === 'direct';
  const info = useTikTokCreator(channel, direct);
  const set = (patch: Partial<TikTokChoices>) => onChange({ ...value, ...patch });
  const d = info.data;
  const block = tiktokBlock(value, d, seconds);
  const label = value.disclose && value.brandedContent ? 'Your video will carry the Paid partnership label.' : value.disclose && value.yourBrand ? 'Your video will carry the Promotional content label.' : null;

  return (
    <fieldset className="grid gap-4 rounded-md border border-rule bg-flap p-4">
      <legend className="label px-1">TikTok</legend>
      <div className="grid gap-[3px] sm:grid-cols-2" role="radiogroup" aria-label="TikTok delivery mode">
        {([['draft', 'Draft', 'sent to your inbox; finish in the app'], ['direct', 'Post directly', 'publish to the profile with the caption']] as const).map(([id, t, sub]) => (
          <label key={id} className={`flap-row grid cursor-pointer gap-0.5 px-4 py-3 hover:brightness-125 ${value.mode === id ? 'ring-1 ring-amber' : ''} has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber`}>
            <input type="radio" name="tt-mode" className="sr-only" checked={value.mode === id} onChange={() => set({ mode: id })} />
            <span className={`text-[0.98rem] font-semibold ${value.mode === id ? 'text-amber' : 'text-ink'}`}>{t}</span>
            <span className="text-[0.88rem] text-ink-3">{sub}</span>
          </label>
        ))}
      </div>

      {direct ? (
        info.isLoading ? <p className="text-[0.92rem] text-ink-3">Loading this account’s TikTok settings…</p>
        : info.error ? <p className="text-[0.92rem] text-red">{errorText(info.error.message)}</p>
        : d ? (
          <div className="grid gap-4">
            <p className="flex items-center gap-2 text-[0.95rem] text-ink-2">
              {d.avatar ? <img src={d.avatar} alt="" width={22} height={22} referrerPolicy="no-referrer" className="size-[22px] rounded-full object-cover" /> : null}
              Posting to account <b className="text-ink">{d.nickname ?? d.username}</b>{d.username ? <span className="text-ink-3">@{d.username}</span> : null}
            </p>

            <label className="grid max-w-sm gap-1.5 text-[0.92rem] text-ink-2">
              Who can view
              <select className={inputClass} value={value.privacy} onChange={e => set({ privacy: e.target.value })} required>
                <option value="" disabled>Choose</option>
                {d.privacy.map(p => (
                  <option key={p} value={p} disabled={p === 'SELF_ONLY' && value.disclose && value.brandedContent}
                    title={p === 'SELF_ONLY' && value.disclose && value.brandedContent ? 'Branded content requires a compatible public visibility setting.' : undefined}>
                    {PRIVACY_LABEL[p] ?? p}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-2">
              <span className="text-[0.92rem] text-ink-2">Allow</span>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {([['allowComment', 'Comments', d.commentOff], ['allowDuet', 'Duet', d.duetOff], ['allowStitch', 'Stitch', d.stitchOff]] as const).map(([k, t, off]) => (
                  <label key={k} className={`flex items-center gap-2 text-[0.95rem] ${off ? 'cursor-not-allowed text-ink-3/60' : 'cursor-pointer text-ink'}`} title={off ? 'Disabled in your TikTok settings' : undefined}>
                    <input type="checkbox" className="size-4 accent-[var(--color-amber)]" disabled={off} checked={!off && value[k]} onChange={e => set({ [k]: e.target.checked } as Partial<TikTokChoices>)} />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-[0.95rem] text-ink">
                <input type="checkbox" className="size-4 accent-[var(--color-amber)]" checked={value.disclose} onChange={e => set({ disclose: e.target.checked, ...(e.target.checked ? {} : { yourBrand: false, brandedContent: false }) })} />
                Disclose commercial content
              </label>
              {value.disclose ? (
                <div className="ml-6 grid gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[0.92rem] text-ink-2">
                    <input type="checkbox" className="size-4 accent-[var(--color-amber)]" checked={value.yourBrand} onChange={e => set({ yourBrand: e.target.checked })} />
                    Your brand <span className="text-ink-3">(promotes you or your business)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-[0.92rem] text-ink-2">
                    <input type="checkbox" className="size-4 accent-[var(--color-amber)]" checked={value.brandedContent}
                      onChange={e => set({ brandedContent: e.target.checked, ...(e.target.checked && value.privacy === 'SELF_ONLY' ? { privacy: '' } : {}) })} />
                    Branded content <span className="text-ink-3">(promotes another business)</span>
                  </label>
                  {label ? <p className="text-[0.88rem] text-amber">{label}</p> : null}
                </div>
              ) : null}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[0.95rem] text-ink">
              <input type="checkbox" className="size-4 accent-[var(--color-amber)]" checked={value.aigc} onChange={e => set({ aigc: e.target.checked })} />
              Label as AI generated
            </label>

            <p className="text-[0.88rem] text-ink-3">
              By posting, you agree to TikTok’s{value.disclose && value.brandedContent ? <> <a className="text-ink-2 underline underline-offset-2" href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a> and </> : null}{' '}
              <a className="text-ink-2 underline underline-offset-2" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.
              {' '}TikTok may take several minutes to display the video on your profile.
            </p>
            {block ? <p className="text-[0.88rem] text-amber">{block}</p> : null}
          </div>
        ) : null
      ) : null}
    </fieldset>
  );
}
