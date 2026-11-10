'use server';
import { redirect } from 'next/navigation';
import { staffClient, siteUrl } from '@/lib/supabase/server';
import { text } from '@/lib/format';

export type LoginState = { sent: boolean; error?: string };

export async function sendLoginLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = text(form.get('email'), 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { sent: false, error: 'Please enter a valid email.' };

  const supabase = await staffClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Only people an admin has invited can log in; nobody can sign themselves up.
    options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });
  // Rate limiting is the only error we surface; anything else gets the same reply,
  // so the form never reveals which emails belong to staff.
  if (error?.status === 429) return { sent: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
  return { sent: true };
}

export async function signOut() {
  const supabase = await staffClient();
  await supabase.auth.signOut();
  redirect('/login');
}
