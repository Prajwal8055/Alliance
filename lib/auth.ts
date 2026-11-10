import 'server-only';
import { redirect } from 'next/navigation';
import { staffClient } from './supabase/server';

export type Role = 'admin' | 'manager' | 'sales';

/**
 * Verifies the session with Supabase (getUser, not the unverified cookie) and the
 * staff role. Redirects instead of rendering when not allowed. RLS in the database
 * enforces the same rules again, so this is a UX guard, not the only check.
 */
export async function requireStaff(allowed: Role[] = ['admin', 'manager', 'sales']) {
  const supabase = await staffClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, advisor_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) redirect('/login?error=no-access');
  const role = profile.role as Role;
  if (!allowed.includes(role)) redirect(role === 'sales' ? '/me' : '/admin');

  return { supabase, user, role, advisorId: profile.advisor_id as string | null };
}
