import Link from 'next/link';
import { signOut } from '@/app/login/actions';
import type { Role } from '@/lib/auth';

export function Topbar({ role, email }: { role: Role; email?: string }) {
  return (
    <header className="topbar">
      <Link href={role === 'sales' ? '/me' : '/admin'}><img src="/logo.png" alt="Alliance Square home" /></Link>
      <nav className="row small" aria-label="Staff">
        {role !== 'sales' && <Link href="/admin">Advisors</Link>}
        {role === 'admin' && <Link href="/admin/team">Team access</Link>}
        <span className="muted">{email} ({role})</span>
        <form action={signOut}><button className="btn btn-ghost btn-sm" type="submit">Sign out</button></form>
      </nav>
    </header>
  );
}
