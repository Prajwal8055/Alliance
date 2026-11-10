import type { Metadata } from 'next';
import { connection } from 'next/server';
import { publicClient } from '@/lib/supabase/server';
import { ReviewForm } from './review-form';

export const metadata: Metadata = { title: 'Rate your advisor', robots: { index: false } };

type Props = { params: Promise<{ token: string }> };

export default async function ReviewPage({ params }: Props) {
  await connection();
  const { token } = await params;
  const { data } = await publicClient().rpc('get_review_invite', { p_token: token });
  const invite = (data?.[0] ?? { status: 'invalid' }) as { status: string; advisor_name?: string; customer_name?: string };

  return (
    <main className="wrap">
      <img className="brand" src="/logo.png" alt="Alliance Square" />
      <section className="card">
        {invite.status === 'valid' ? (
          <>
            <h1>How was your experience with {invite.advisor_name}?</h1>
            <p className="muted">Hi {invite.customer_name?.split(' ')[0]}, your honest feedback helps other families choose with confidence.
              Your review will show your first name and initial only.</p>
            <ReviewForm token={token} />
          </>
        ) : (
          <>
            <h1>This review link can&apos;t be used</h1>
            <p className="muted">
              {invite.status === 'used' ? 'A review has already been submitted with this link. Thank you!'
                : invite.status === 'expired' ? 'This link has expired. Please ask Alliance Square for a new one.'
                : 'This link is not valid. Please check that you opened the full link you were sent.'}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
