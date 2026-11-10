import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { Topbar } from '../topbar';
import { TeamForm } from '../forms';

export const metadata: Metadata = { title: 'Team access', robots: { index: false } };

export default async function TeamPage() {
  const { supabase, role, user } = await requireStaff(['admin']);
  const [{ data: staff }, { data: advisors }] = await Promise.all([
    supabase.rpc('list_staff'),
    supabase.from('advisors').select('id, full_name').eq('is_active', true).order('full_name'),
  ]);

  return (
    <>
      <Topbar role={role} email={user.email} />
      <main className="wrap-wide stack">
        <h1>Team access</h1>
        <div className="grid-2">
          <section className="card stack">
            <h2>Give or change access</h2>
            <p className="small muted">First invite the person in Supabase (Authentication → Users → Invite user). Then choose their access here.</p>
            <TeamForm advisors={advisors ?? []} />
          </section>
          <section className="card table-scroll">
            <h2>Everyone with a login</h2>
            <table className="table">
              <thead><tr><th>Email</th><th>Access</th><th>Card</th></tr></thead>
              <tbody>
                {(staff ?? []).map((s: { user_id: string; email: string; role: string | null; advisor_name: string | null }) => (
                  <tr key={s.user_id}><td>{s.email}</td><td>{s.role ?? <span className="muted">none</span>}</td><td>{s.advisor_name ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    </>
  );
}
