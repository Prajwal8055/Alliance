import 'server-only';
import { publicClient } from './supabase/server';

export type PublicCard = {
  slug: string;
  full_name: string;
  designation: string;
  photo_path: string | null;
  is_active: boolean;
  whatsapp: string | null;
  deals_closed: number | null;
  avg_rating: number | null;
  review_count: number | null;
};

export type PublicReview = { rating: number; comment: string | null; created_at: string; customer_display: string };

export async function getCard(slug: string): Promise<PublicCard | null> {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const { data, error } = await publicClient()
    .from('public_advisor_cards').select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error('Could not load advisor card');
  return data as PublicCard | null;
}

export async function getReviews(slug: string): Promise<PublicReview[]> {
  const { data, error } = await publicClient()
    .from('public_reviews')
    .select('rating, comment, created_at, customer_display')
    .eq('slug', slug)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error('Could not load reviews');
  return data as PublicReview[];
}
