// Transfer the caption as plain text to a phone.
import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Icon } from './Icon';

// The QR encodes the caption itself so phone scanners can copy it directly.
export function captionLink(caption: string, _videoUrl?: string | null) { return caption; }

// one SVG path for the dark modules: crisp at any size, no canvas, nothing to clean up
function qrPath(text: string) {
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return { d, n };
}

export function PhoneCaption({ caption, videoUrl }: { caption: string; videoUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const link = useMemo(() => (caption ? captionLink(caption, videoUrl) : ''), [caption, videoUrl]);
  const qr = useMemo(() => { try { return open && link ? qrPath(link) : null; } catch { return null; } }, [open, link]);
  if (!caption) return null;
  return (
    <div className="grid gap-3">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex items-center gap-1.5 justify-self-start text-[0.88rem] font-medium text-ink-2 underline decoration-ink-3/60 underline-offset-4 hover:text-ink">
        <Icon name="link" size={14} /> {open ? 'Hide caption QR' : 'Copy caption to your phone (QR)'}
      </button>
      {open && !qr ? <p className="text-sm text-ink-3">This caption is too large for a QR code. Use Copy caption and your preferred transfer method.</p> : null}
      {open && qr ? (
        <div className="flex flex-wrap items-center gap-5">
          <svg viewBox={`-2 -2 ${qr.n + 4} ${qr.n + 4}`} width={168} height={168} role="img" aria-label="Caption QR code" className="rounded-md bg-white" shapeRendering="crispEdges">
            <path d={qr.d} fill="#111" />
          </svg>
          <ol className="grid max-w-xs list-decimal gap-1 pl-5 text-[0.9rem] text-ink-2">
            <li>Scan with your phone’s camera or a QR reader.</li>
            <li>Copy the decoded text, then open TikTok.</li>
            <li>Open the inbox draft, paste the caption, and post.</li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
