import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { photoUrl } from '@/lib/supabase/server';
import { Stars } from '@/app/ui';
import { Topbar } from '../../topbar';
import { CardShare } from '../../card-share';
import { AdvisorForm, InviteForm, PhotoForm } from '../../forms';
import { revokeInvite, setActive, setReviewHidden } from '../../actions';

export const metadata: Metadata = { title: 'Edit advisor', robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

export default async function EditAdvisor({ params }: Props) {
  const { supabase, role, user } = await requireStaff(['admin', 'manager']);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const { data: advisor } = await supabase.from('advisors').select('*').eq('id', id).maybeSingle();
  if (!advisor) notFound();
  const [{ data: reviews }, { data: invites }] = await Promise.all([
    supabase.from('reviews').select('id, rating, comment, customer_name, is_hidden, created_at').eq('advisor_id', id).order('created_at', { ascending: false }),
    supabase.from('review_invites').select('id, customer_name, created_at, expires_at').eq('advisor_id', id).is('used_at', null)
      .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
  ]);
  const photo = photoUrl(advisor.photo_path);

  return (
    <>
      <Topbar role={role} email={user.email} />
      <main className="wrap-wide stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>{advisor.full_name}</h1>
          <span className={`badge ${advisor.is_active ? 'badge-ok' : 'badge-bad'}`}>{advisor.is_active ? 'Active' : 'Inactive'}</span>
        </div>

        <div className="grid-2">
          <section className="card stack" aria-labelledby="details-heading">
            <h2 id="details-heading">Details and numbers</h2>
            <AdvisorForm advisor={advisor} />
          </section>

          <div className="stack">
            <CardShare slug={advisor.slug} name={advisor.full_name} active={advisor.is_active} />
            <section className="card stack">
              {photo && <img className="avatar" src={photo} alt={`Current photo of ${advisor.full_name}`} />}
              <PhotoForm advisorId={advisor.id} />
            </section>
          </div>
        </div>

        <div className="grid-2">
          <section className="card stack" aria-labelledby="invite-heading">
            <h2 id="invite-heading">Ask a customer for a review</h2>
            <p className="small muted">Send this only to genuine customers after a site visit or booking. Each link can be used once.</p>
            {advisor.is_active ? <InviteForm advisorId={advisor.id} /> : <p className="muted">Reactivate the card to send review links.</p>}
            {!!invites?.length && (
              <>
                <h3>Waiting for a review ({invites.length})</h3>
                {invites.map((inv) => (
                  <div key={inv.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{inv.customer_name} <span className="small muted">· sent {new Date(inv.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</span></span>
                    <form action={revokeInvite.bind(null, advisor.id, inv.id)}><button className="btn btn-ghost btn-sm" type="submit">Cancel link</button></form>
                  </div>
                ))}
              </>
            )}
          </section>

          <section className="card" aria-labelledby="reviews-heading">
            <h2 id="reviews-heading">Reviews ({reviews?.length ?? 0})</h2>
            {role !== 'admin' && <p className="small muted">Only an admin can hide a review. Reviews can&apos;t be edited.</p>}
            {(reviews ?? []).map((r) => (
              <article key={r.id} className="review" style={r.is_hidden ? { opacity: .6 } : undefined}>
                <Stars rating={r.rating} /> {r.is_hidden && <span className="badge badge-bad">Hidden</span>}
                {r.comment && <p style={{ margin: '4px 0' }}>{r.comment}</p>}
                <div className="row small muted" style={{ justifyContent: 'space-between' }}>
                  <span>{r.customer_name} · {new Date(r.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                  {role === 'admin' && (
                    <form action={setReviewHidden.bind(null, advisor.id, r.id, !r.is_hidden)}>
                      <button className="btn btn-ghost btn-sm" type="submit">{r.is_hidden ? 'Show' : 'Hide'}</button>
                    </form>
                  )}
                </div>
              </article>
            ))}
            {!reviews?.length && <p className="muted">No reviews yet.</p>}
          </section>
        </div>

        <section className="dark stack" aria-labelledby="status-heading">
          <h2 id="status-heading">Card status</h2>
          {advisor.is_active ? (
            <>
              <p>If {advisor.full_name.split(' ')[0]} leaves the company, deactivate right away. Anyone scanning an old QR code will see &quot;No longer with Alliance Square&quot;.</p>
              <form action={setActive.bind(null, advisor.id, false)}><button className="btn btn-danger" type="submit">Deactivate card</button></form>
            </>
          ) : (
            <form action={setActive.bind(null, advisor.id, true)}><button className="btn" type="submit">Reactivate card</button></form>
          )}
        </section>
      </main>
    </>
  );
}
