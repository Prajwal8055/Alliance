import Link from 'next/link';
import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { Topbar } from './topbar';

export const metadata: Metadata = { title: 'Advisors', robots: { index: false } };

export default async function AdminHome() {
  const { supabase, role, user } = await requireStaff(['admin', 'manager']);
  const [{ data: advisors }, { data: reviews }] = await Promise.all([
    supabase.from('advisors').select('id, slug, full_name, designation, deals_closed, leads_handled, is_active').order('full_name'),
    supabase.from('reviews').select('advisor_id, rating').eq('is_hidden', false),
  ]);
  const ratings = new Map<string, number[]>();
  for (const r of reviews ?? []) ratings.set(r.advisor_id, [...(ratings.get(r.advisor_id) ?? []), r.rating]);

  return (
    <>
      <Topbar role={role} email={user.email} />
      <main className="wrap-wide stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>Advisor cards</h1>
          <Link className="btn" href="/admin/advisors/new">+ New advisor</Link>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Name</th><th>Status</th><th>Deals</th><th>Leads</th><th>Conversion</th><th>Rating</th></tr></thead>
            <tbody>
              {(advisors ?? []).map((a) => {
                const rs = ratings.get(a.id) ?? [];
                const avg = rs.length ? (rs.reduce((s, n) => s + n, 0) / rs.length).toFixed(1) : '—';
                return (
                  <tr key={a.id}>
                    <td><Link href={`/admin/advisors/${a.id}`}><strong>{a.full_name}</strong></Link><br /><span className="small muted">{a.designation}</span></td>
                    <td><span className={`badge ${a.is_active ? 'badge-ok' : 'badge-bad'}`}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>{a.deals_closed}</td>
                    <td>{a.leads_handled}</td>
                    <td>{a.leads_handled ? `${((a.deals_closed / a.leads_handled) * 100).toFixed(1)}%` : '—'}</td>
                    <td>{avg} <span className="small muted">({rs.length})</span></td>
                  </tr>
                );
              })}
              {!advisors?.length && <tr><td colSpan={6} className="muted">No advisors yet. Create the first card.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
