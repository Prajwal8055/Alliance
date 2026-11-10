import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { staffClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/format';

// Target of the login email: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const next = safeNextPath(params.get('next'));

  if (tokenHash && (type === 'email' || type === 'magiclink' || type === 'invite')) {
    const supabase = await staffClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL('/login?error=link', request.url));
}
