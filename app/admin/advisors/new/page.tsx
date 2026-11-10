import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { Topbar } from '../../topbar';
import { AdvisorForm } from '../../forms';

export const metadata: Metadata = { title: 'New advisor', robots: { index: false } };

export default async function NewAdvisor() {
  const { role, user } = await requireStaff(['admin', 'manager']);
  return (
    <>
      <Topbar role={role} email={user.email} />
      <main className="wrap stack">
        <h1>New advisor card</h1>
        <p className="muted">You can add a photo after creating the card.</p>
        <AdvisorForm />
      </main>
    </>
  );
}
