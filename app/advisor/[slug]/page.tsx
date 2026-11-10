import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getCard, getReviews } from '@/lib/cards';
import { photoUrl, siteUrl } from '@/lib/supabase/server';
import { formatPhone, whatsappLink } from '@/lib/format';
import { Stars } from '@/app/ui';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const card = await getCard((await params).slug);
  if (!card) return { title: 'Advisor not found' };
  return {
    title: card.is_active ? `${card.full_name}, Verified Advisor` : 'Advisor no longer with Alliance Square',
    robots: card.is_active ? undefined : { index: false },
  };
}

export default async function AdvisorCard({ params }: Props) {
  await connection(); // always render live, so a deactivated card is never served from cache
  const { slug } = await params;
  const card = await getCard(slug);
  if (!card) notFound();

  const firstName = card.full_name.split(' ')[0];
  const photo = photoUrl(card.photo_path);
  const checkedAt = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const host = new URL(siteUrl()).host;

  return (
    <main className="wrap">
      <a href="https://www.alliancesquare.com"><img className="brand" src="/logo.png" alt="Alliance Square — Property Management & Consultants" /></a>

      <section className="card center" aria-labelledby="advisor-name">
        {photo
          ? <img className="avatar" src={photo} alt={`Photo of ${card.full_name}`} />
          : <div className="avatar avatar-fallback" aria-hidden="true">{firstName[0]}</div>}
        <h1 id="advisor-name">{card.full_name}</h1>
        <p className="muted" style={{ marginTop: 0 }}>{card.designation}</p>

        {card.is_active ? (
          <>
            <p className="badge badge-ok" role="status">✓ Verified Alliance Square advisor</p>
            <p className="small muted">Checked live on {checkedAt} IST</p>

            <div className="stats">
              <div className="stat">
                <b>{card.deals_closed ? card.deals_closed : 'New'}</b>
                <span className="small muted">{card.deals_closed ? 'Deals closed' : 'to the team'}</span>
              </div>
              <div className="stat">
                {card.review_count ? (
                  <>
                    <b>{Number(card.avg_rating).toFixed(1)} <span className="stars" aria-hidden="true">★</span></b>
                    <span className="small muted">{card.review_count} verified review{card.review_count === 1 ? '' : 's'}</span>
                  </>
                ) : (
                  <><b>—</b><span className="small muted">No reviews yet</span></>
                )}
              </div>
            </div>

            {card.whatsapp && (
              <div className="stack">
                <a className="btn btn-block"
                   href={whatsappLink(card.whatsapp, `Hi ${firstName}, I found your verified Alliance Square profile and would like to know more.`)}
                   target="_blank" rel="noopener noreferrer">
                  Chat on WhatsApp
                </a>
                <a className="btn btn-ghost btn-block" href={`tel:+${card.whatsapp}`}>
                  Call {formatPhone(card.whatsapp)}
                </a>
              </div>
            )}
          </>
        ) : (
          <div role="alert">
            <p className="badge badge-bad">✕ No longer with Alliance Square</p>
            <p>This person is <strong>not</strong> authorised to act for Alliance Square. Please do not make payments
              or share documents with them. Contact us via <a href="https://www.alliancesquare.com">alliancesquare.com</a>.</p>
          </div>
        )}
      </section>

      {card.is_active && <Reviews slug={slug} />}

      <p className="small muted center" style={{ marginTop: 24 }}>
        This is an official Alliance Square verification page. Genuine cards always open on <strong>{host}</strong>.
        Alliance Square never asks for payments into personal accounts.
      </p>
    </main>
  );
}

async function Reviews({ slug }: { slug: string }) {
  const reviews = await getReviews(slug);
  if (!reviews.length) return null;
  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">What customers say</h2>
      <p className="small muted">Only customers sent a personal review link by Alliance Square can post a review.</p>
      {reviews.map((r, i) => (
        <article className="review" key={i}>
          <Stars rating={r.rating} />
          {r.comment && <p style={{ margin: '4px 0' }}>{r.comment}</p>}
          <p className="small muted" style={{ margin: 0 }}>
            {r.customer_display} · Verified customer · {new Date(r.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
          </p>
        </article>
      ))}
    </section>
  );
}
