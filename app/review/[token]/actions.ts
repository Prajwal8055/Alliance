'use server';
import { publicClient } from '@/lib/supabase/server';
import { text } from '@/lib/format';

export type ReviewState = { ok: boolean; error?: string };

export async function submitReview(token: string, _prev: ReviewState, form: FormData): Promise<ReviewState> {
  const rating = Number(form.get('rating'));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: 'Please choose a star rating.' };
  const comment = text(form.get('comment'), 1000);

  // The database function checks the token, marks it used and stores the review in one transaction.
  const { error } = await publicClient().rpc('submit_review', { p_token: token, p_rating: rating, p_comment: comment });
  if (error) {
    return { ok: false, error: error.code === 'P0001' ? error.message : 'Something went wrong. Please try again.' };
  }
  return { ok: true };
}
