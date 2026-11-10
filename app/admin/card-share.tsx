import { qrDataUrl } from '@/lib/qr';
import { siteUrl } from '@/lib/supabase/server';

export async function CardShare({ slug, name, active }: { slug: string; name: string; active: boolean }) {
  const url = `${siteUrl()}/advisor/${slug}`;
  const qr = await qrDataUrl(url);
  return (
    <section className="card stack center" aria-labelledby="share-heading">
      <h2 id="share-heading">Card link and QR</h2>
      {!active && <p className="error">This card is inactive, so customers who scan it are told this person no longer works here.</p>}
      <img src={qr} alt={`QR code for ${name}'s verified card`} width={220} height={220} style={{ margin: '0 auto' }} />
      <p className="small" style={{ wordBreak: 'break-all' }}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <a className="btn btn-ghost btn-sm" href={qr} download={`${slug}-qr.png`}>Download QR (PNG)</a>
        <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`My verified Alliance Square profile: ${url}`)}`}
           target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
      </div>
      <p className="hint">Use it on visiting cards, email signatures, WhatsApp status and site-office standees.</p>
    </section>
  );
}
