import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { Stars } from '@/app/ui';
import { Topbar } from '../admin/topbar';
import { CardShare } from '../admin/card-share';

export const metadata: Metadata = { title: 'My card', robots: { index: false } };

export default async function MyCard() {
  const { supabase, role, user, advisorId } = await requireStaff(['sales']);
  const [{ data: advisor }, { data: reviews }] = await Promise.all([
    supabase.from('advisors').select('*').eq('id', advisorId!).maybeSingle(),
    supabase.from('reviews').select('id, rating, comment, created_at').eq('advisor_id', advisorId!).eq('is_hidden', false)
      .order('created_at', { ascending: false }),
  ]);
  if (!advisor) {
    return <><Topbar role={role} email={user.email} /><main className="wrap"><p>Your card isn&apos;t set up yet. Please ask your manager.</p></main></>;
  }
  const avg = reviews?.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '—';

  return (
    <>
      <Topbar role={role} email={user.email} />
      <main className="wrap stack">
        <h1>Hi {advisor.full_name.split(' ')[0]}</h1>
        <div className="stats">
          <div className="stat"><b>{advisor.deals_closed}</b><span className="small muted">Deals closed</span></div>
          <div className="stat"><b>{avg}</b><span className="small muted">{reviews?.length ?? 0} reviews</span></div>
          <div className="stat"><b>{advisor.leads_handled}</b><span className="small muted">Leads handled (private)</span></div>
          <div className="stat"><b>{advisor.leads_handled ? `${((advisor.deals_closed / advisor.leads_handled) * 100).toFixed(1)}%` : '—'}</b>
            <span className="small muted">Conversion (private)</span></div>
        </div>
        <CardShare slug={advisor.slug} name={advisor.full_name} active={advisor.is_active} />
        <section className="card">
          <h2>Your reviews</h2>
          {(reviews ?? []).map((r) => (
            <article key={r.id} className="review"><Stars rating={r.rating} />{r.comment && <p style={{ margin: '4px 0' }}>{r.comment}</p>}</article>
          ))}
          {!reviews?.length && <p className="muted">No reviews yet. Ask your manager to send review links to happy customers.</p>}
        </section>
        <p className="small muted">Numbers are updated by your manager. Contact them if something looks wrong.</p>
      </main>
    </>
  );
}
